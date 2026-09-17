import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../lib/db/connection";
import { canonicalUrl, classifyApplyLink, hostMatchesCompany } from "../lib/jobs/apply-links";
import { authority, mergeJobs } from "../lib/jobs/merge";
import { freshnessScore, rankJobs } from "../lib/career/ranking";
import { searchJobs, type SourceAdapter } from "../lib/jobs/search";
import { companyWebsite, isCategoryTitle, sanitizeJobLinks, validateDiscoveredJob } from "../lib/jobs/validate";
import type { NormalizedJob } from "../lib/jobs/types";
import { createJob, SourceError } from "../lib/sources/shared";
import { googleJobsSearch, parseGoogleJobsResponse, resetGoogleJobsMemo } from "../lib/sources/google-jobs";
import { discoveredJobFromRow, fetchWebDiscovery } from "../lib/sources/web-discovery";
import { parseTechnoparkDetail } from "../lib/sources/technopark";
import { postedLabel } from "../lib/jobs/posted";
import type { CareerBrief } from "../lib/career/types";

const params = { query: "python developer", location: "kochi" as const };
const now = Date.parse("2026-09-12T09:00:00Z");

test("apply-link classifier protects the Apply button from navigation, portals, stores and search pages", () => {
  const rejected = [
    "https://kerala.gov.in/",
    "https://www.keralait.org/",
    "https://www.facebook.com/technoparkkerala",
    "https://www.linkedin.com/company/acme",
    "https://apps.apple.com/in/app/technopark/id123",
    "https://play.google.com/store/apps/details?id=in.technopark",
    "https://acme.example/privacy-policy",
    "https://acme.example/terms",
    "https://acme.example/login",
    "https://acme.example/contact-us",
    "https://in.indeed.com/q-python-developer-l-kochi,-kerala-jobs.html",
    "https://in.indeed.com/jobs?q=python&l=Kochi",
    "https://www.google.com/search?q=python+developer+kochi",
    "https://www.linkedin.com/jobs/python-developer-jobs-kochi",
    "https://technopark.in/job-search",
    "https://boards.greenhouse.io/",
    "javascript:void(0)",
    "mailto:jobs@acme.example",
    "http://127.0.0.1/admin",
  ];
  for (const url of rejected) assert.equal(classifyApplyLink(url, "Apply now").kind, "reject", url);
  const companySites = [
    "https://www.acme.example/",
    "https://acme.example/index.html",
    "https://acme.example/careers",
    "https://acme.example/jobs/",
  ];
  for (const url of companySites) assert.equal(classifyApplyLink(url).kind, "company-website", url);
  const apply = [
    ["https://technopark.in/job-details/12345", ""],
    ["https://infopark.in/company-jobs/details/12/345", ""],
    ["https://in.indeed.com/viewjob?jk=abc123", ""],
    ["https://in.linkedin.com/jobs/view/4123456789", ""],
    ["https://boards.greenhouse.io/acme/jobs/555", ""],
    ["https://jobs.lever.co/acme/1a2b3c", ""],
    ["https://acme.myworkdayjobs.com/en-US/careers/job/Kochi/Python-Developer_R123", ""],
    ["https://forms.gle/abc123", ""],
    ["https://docs.google.com/forms/d/e/1FAIpQLSf/viewform", ""],
    ["https://acme.example/careers/python-developer-kochi", ""],
    ["https://acme.example/open-positions/backend", "Apply on company website"],
  ] as const;
  for (const [url, context] of apply) assert.equal(classifyApplyLink(url, context).kind, "apply", url);
  // Wording can promote an employer page, never rescue a blocked destination.
  assert.equal(classifyApplyLink("https://www.instagram.com/acme", "Apply here").kind, "reject");
  assert.equal(classifyApplyLink("https://acme.example/team", "Apply for this role").kind, "apply");
  assert.equal(canonicalUrl("HTTP://WWW.Acme.example/jobs/1/?utm_source=x&ref=y#top"), "https://acme.example/jobs/1");
});

test("sanitizeJobLinks downgrades a homepage Apply to Company website and drops footer links", () => {
  const job = createJob("technopark", {
    title: "Python Developer",
    company: "Acme",
    location: "Kochi, Kerala",
    sourceUrl: "https://technopark.in/job-details/999",
    applyUrl: "https://www.acme.example/",
    applicationLinks: [
      { label: "Apply on company website", url: "https://www.acme.example/" },
      { label: "Kerala Government", url: "https://kerala.gov.in/" },
      { label: "Instagram", url: "https://www.instagram.com/acme" },
      { label: "Privacy", url: "https://technopark.in/privacy-policy" },
    ],
  });
  const clean = sanitizeJobLinks(job);
  assert.equal(clean.applyUrl, null);
  assert.deepEqual(clean.applicationLinks, [{ label: "Company website", url: "https://www.acme.example/" }]);
  assert.equal(companyWebsite(clean), "https://www.acme.example/");
  assert.equal(postedLabel(clean), "Date not verified");
  // A real application form among the links can still be promoted.
  const withForm = sanitizeJobLinks({
    ...job,
    applyUrl: "https://kerala.gov.in/",
    applicationLinks: [{ label: "Open application form", url: "https://forms.gle/abc" }],
  });
  assert.equal(withForm.applyUrl, "https://forms.gle/abc");
  // Idempotent, so cached payloads can be cleaned on every read.
  assert.deepEqual(sanitizeJobLinks(clean), clean);
});

test("a Technopark detail page never turns site chrome into an Apply link (regression)", () => {
  const html = `<html><body>
    <header><a href="https://kerala.gov.in/">Government of Kerala</a><a href="https://apps.apple.com/in/app/x/id1">App Store</a></header>
    <h1>Python Developer</h1>
    <a href="https://www.acmesoft.example/">Acme Soft</a>
    <div>Job Published: 10 Sep 2026<br/>Closing Date: 30 Sep 2026<br/>Brief Description: Build APIs in Python. Contact Email: hr@acmesoft.example</div>
    <footer><a href="https://technopark.in/privacy-policy">Privacy</a><a href="https://www.facebook.com/technopark">Facebook</a><a href="https://play.google.com/store/apps/details?id=x">Play</a></footer>
  </body></html>`;
  const job = parseTechnoparkDetail(html, { title: "Python Developer", sourceUrl: "https://technopark.in/job-details/321" }, now)!;
  const clean = sanitizeJobLinks(job);
  assert.equal(clean.applyUrl, null);
  assert.equal(companyWebsite(clean), "https://www.acmesoft.example/");
  assert.ok(clean.applicationLinks.every((link) => !/kerala\.gov|apple|google|facebook|privacy/.test(link.url)));
  assert.equal(clean.applicationEmail, "hr@acmesoft.example");
});

test("discovered web results are validated: category pages, off-location, stale and linkless rows are rejected", () => {
  for (const title of ["120 Python Developer Jobs in Kochi", "Python jobs in Kerala", "Careers | Acme", "Python Developer salary in Kochi", "Software Engineer Jobs | Indeed"])
    assert.equal(isCategoryTitle(title), true, title);
  for (const title of ["Python Developer", "Senior Backend Engineer (Python/Django)", "Walk-in: Python Developer - Kochi"])
    assert.equal(isCategoryTitle(title), false, title);
  const base = createJob("web", {
    title: "Python Developer",
    company: "Acme Labs",
    location: "Kochi, Kerala",
    locationBasis: "job",
    sourceUrl: "https://acme.example/careers/python-developer",
    applyUrl: "https://acme.example/careers/python-developer",
    applicationLinks: [{ label: "Apply on company website", url: "https://acme.example/careers/python-developer" }],
    description: "Build and maintain Python services for our logistics platform in Kochi. Django, PostgreSQL, Docker.",
    datePosted: new Date(now - 2 * 86_400_000).toISOString(),
  });
  assert.equal(validateDiscoveredJob(base, params, now).ok, true);
  const cases: Array<[Partial<NormalizedJob>, string]> = [
    [{ title: "45 Python Developer jobs in Kochi" }, "category-title"],
    [{ company: "Indeed" }, "no-company"],
    [{ location: "Bengaluru, Karnataka" }, "location"],
    [{ datePosted: new Date(now - 60 * 86_400_000).toISOString() }, "stale"],
    [{ closingDate: new Date(now - 3 * 86_400_000).toISOString() }, "expired"],
    [{ description: "" }, "no-description"],
    [{ applyUrl: null, sourceUrl: "https://www.google.com/search?q=python", applicationLinks: [] }, "link:blocked-host"],
    [{ applyUrl: null, sourceUrl: null, applicationLinks: [] }, "no-destination"],
  ];
  for (const [patch, reason] of cases) {
    const verdict = validateDiscoveredJob({ ...base, ...patch }, params, now);
    assert.equal(verdict.ok, false, reason);
    if (!verdict.ok) assert.equal(verdict.reason, reason);
  }
});

const googleRows = {
  jobs_results: [
    {
      title: "Python Developer",
      company_name: "Kochi Fintech Pvt Ltd",
      location: "Kochi, Kerala",
      via: "LinkedIn",
      description: "We are hiring a Python developer to build FastAPI microservices and PostgreSQL data pipelines for our Kochi office.",
      detected_extensions: { posted_at: "2 days ago", schedule_type: "Full-time" },
      apply_options: [
        { title: "LinkedIn", link: "https://in.linkedin.com/jobs/view/4000000001" },
        { title: "Kochi Fintech", link: "https://careers.kochifintech.example/jobs/python-developer" },
      ],
    },
    {
      title: "Python Developer",
      company_name: "Kochi Fintech Pvt Ltd",
      location: "Kochi, Kerala",
      via: "Indeed",
      description: "Python developer to build FastAPI microservices and PostgreSQL data pipelines for our Kochi office. Apply now.",
      detected_extensions: { posted_at: "3 days ago" },
      apply_options: [{ title: "Indeed", link: "https://in.indeed.com/viewjob?jk=abc123" }],
    },
    {
      title: "500+ Python Developer Jobs in Kochi",
      company_name: "Naukri",
      location: "Kochi, Kerala",
      description: "Browse python developer jobs in Kochi. Apply to latest openings.",
      apply_options: [{ title: "Naukri", link: "https://www.naukri.com/python-developer-jobs-in-kochi" }],
    },
    {
      title: "Java Developer",
      company_name: "Elsewhere Ltd",
      location: "Chennai, Tamil Nadu",
      description: "Java Spring developer needed for Chennai office with three years of experience in enterprise systems.",
      apply_options: [{ title: "Indeed", link: "https://in.indeed.com/viewjob?jk=zzz" }],
    },
    {
      title: "Python Developer (Remote)",
      company_name: "Remote Works",
      location: "Anywhere",
      description: "Remote Python developer building automation tooling and data integrations for a distributed team.",
      detected_extensions: { work_from_home: true },
      apply_options: [{ title: "BeBee", link: "https://in.bebee.com/job/1234567890" }],
    },
    {
      title: "Python Developer",
      company_name: "No Links Inc",
      location: "Kochi, Kerala",
      description: "A Python developer role with no application path at all in the search result.",
    },
  ],
};

test("web discovery maps Google Jobs rows to validated jobs and labels the destination honestly", () => {
  const rows = parseGoogleJobsResponse(googleRows);
  const discovered = rows.map((row) => discoveredJobFromRow(row, params, now));
  const kept = discovered.filter((item): item is NonNullable<typeof item> => Boolean(item));
  assert.deepEqual(kept.map((item) => item.job.title), ["Python Developer", "Python Developer", "Python Developer (Remote)"]);
  const [employer, indeedOnly, remote] = kept;
  // The employer's own careers page beats LinkedIn for the same vacancy.
  assert.equal(employer.destination, "employer");
  assert.equal(employer.job.applyUrl, "https://careers.kochifintech.example/jobs/python-developer");
  assert.equal(employer.job.sources[0].label, "Company Website");
  assert.equal(employer.job.applicationLinks.length, 2);
  assert.equal(employer.job.datePostedIsApproximate, true);
  assert.equal(postedLabel(employer.job, now), "2 days ago");
  assert.equal(indeedOnly.destination, "platform");
  assert.equal(indeedOnly.job.sources[0].label, "Web · Indeed");
  assert.equal(remote.destination, "aggregator");
  assert.equal(remote.job.location, "Remote (Kochi search)");
  assert.equal(postedLabel(remote.job, now), "Date not verified");
  // Both copies of the Kochi Fintech vacancy collapse into one card that keeps the employer link.
  const merged = mergeJobs(kept.map((item) => item.job));
  assert.equal(merged.length, 2);
  assert.equal(merged[0].applyUrl, "https://careers.kochifintech.example/jobs/python-developer");
  assert.equal(merged[0].sources.length, 2);
  assert.ok(authority(employer.job) > authority(indeedOnly.job));
});

test("Indeed's fallback and web discovery share one Google Jobs lookup per search", async () => {
  resetGoogleJobsMemo();
  let calls = 0;
  const fetcher: typeof fetch = async (input) => {
    calls++;
    assert.ok(String(input).includes("engine=google_jobs"));
    return new Response(JSON.stringify(googleRows), { headers: { "Content-Type": "application/json" } });
  };
  process.env.SERPAPI_KEY = "test-key";
  try {
    const signal = new AbortController().signal;
    const [a, b] = await Promise.all([
      googleJobsSearch(params, signal, fetcher),
      googleJobsSearch(params, signal, fetcher),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.length, b.length);
    const result = await fetchWebDiscovery(params, signal, fetcher, () => now);
    assert.equal(calls, 1);
    assert.equal(result.jobs.length, 3);
    assert.match(result.warnings?.[0] ?? "", /3 web results were not shown/);
  } finally {
    delete process.env.SERPAPI_KEY;
    resetGoogleJobsMemo();
  }
});

test("web discovery only runs when direct sources ran thin, and a slow Indeed never blocks the rest", async () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  const direct = (count: number): SourceAdapter => async () => ({
    jobs: Array.from({ length: count }, (_, index) =>
      createJob("technopark", {
        title: `Python Developer ${index}`,
        company: `Employer ${index}`,
        location: "Kochi, Kerala",
        sourceUrl: `https://technopark.in/job-details/${1000 + index}`,
        datePosted: new Date(now - index * 86_400_000).toISOString(),
      }),
    ),
    hasMore: false,
  });
  let webCalls = 0;
  const web: SourceAdapter = async () => {
    webCalls++;
    return { jobs: [discoveredJobFromRow(parseGoogleJobsResponse(googleRows)[0], params, now)!.job], hasMore: false };
  };
  const never: SourceAdapter = () => new Promise(() => {});
  try {
    const thin = await searchJobs(params, {
      db,
      adapters: { technopark: direct(2), indeed: never, web },
      sources: ["technopark", "indeed", "web"] as const,
      timeoutMs: 30,
      now: () => now,
    });
    assert.equal(webCalls, 1);
    assert.equal(thin.jobs.length, 3);
    const indeed = thin.sources.find((source) => source.source === "indeed")!;
    assert.equal(indeed.status, "unavailable");
    assert.equal(indeed.code, "TIMEOUT");
    assert.match(indeed.message ?? "", /Indeed India is taking longer than expected\. Other job sources were loaded successfully\./);
    assert.equal(thin.sources.find((source) => source.source === "web")?.status, "ok");
    const plenty = await searchJobs({ ...params, query: "python developer kochi" }, {
      db,
      adapters: { technopark: direct(12), indeed: never, web },
      sources: ["technopark", "indeed", "web"] as const,
      timeoutMs: 30,
      now: () => now,
    });
    assert.equal(webCalls, 1);
    assert.equal(plenty.sources.find((source) => source.source === "web")?.status, "skipped");
    assert.equal(plenty.jobs.length, 12);
  } finally {
    sqlite.close();
  }
});

test("ranking prefers fresh, relevant, well-sourced openings and labels dates honestly", () => {
  const brief: CareerBrief = { role: "python developer", skills: ["Python"], experienceLevel: "mid", cities: ["kochi"], workMode: "any", salaryPreference: "", sources: ["technopark", "web"], rankingGoal: "best-fit", cvUploadId: null };
  const make = (patch: Partial<NormalizedJob> & { title: string }) =>
    createJob("web", {
      company: "Acme",
      location: "Kochi, Kerala",
      locationBasis: "job",
      description: "Python developer building Django services with PostgreSQL and Docker for a product team in Kochi.",
      sourceUrl: `https://acme.example/careers/${patch.title.replace(/\s+/g, "-").toLowerCase()}`,
      applyUrl: `https://acme.example/careers/${patch.title.replace(/\s+/g, "-").toLowerCase()}`,
      ...patch,
    });
  const today = make({ title: "Python Developer", datePosted: new Date(now - 3_600_000).toISOString() });
  const lastMonth = make({ title: "Python Developer II", datePosted: new Date(now - 25 * 86_400_000).toISOString() });
  const undated = make({ title: "Python Engineer" });
  const offRole = make({ title: "Sales Executive", description: "Field sales role covering Kochi and Ernakulam districts, two-wheeler required.", datePosted: new Date(now - 3_600_000).toISOString() });
  assert.ok(freshnessScore(today, now) > freshnessScore(lastMonth, now));
  assert.ok(freshnessScore(lastMonth, now) > freshnessScore(undated, now));
  assert.ok(freshnessScore(undated, now) > freshnessScore(make({ title: "old", datePosted: new Date(now - 80 * 86_400_000).toISOString() }), now));
  const ranked = rankJobs([offRole, lastMonth, undated, today], brief);
  assert.equal(ranked[0].job.title, "Python Developer");
  assert.equal(ranked.at(-1)?.job.title, "Sales Executive");
  assert.equal(postedLabel(today, now), "Posted today");
  assert.equal(postedLabel(make({ title: "x", datePosted: new Date(now - 86_400_000 * 1.2).toISOString() }), now), "1 day ago");
  assert.equal(postedLabel(make({ title: "x", datePosted: new Date(now - 86_400_000 * 5).toISOString() }), now), "5 days ago");
  assert.equal(postedLabel(undated, now), "Date not verified");
});

test("a source error message never carries provider URLs or keys", () => {
  const error = new SourceError("UPSTREAM_BLOCKED", "Web job discovery is not configured on this server.");
  assert.doesNotMatch(error.message, /serpapi|api_key|key=/i);
});

test("unknown hosts count as the employer only when the domain carries the company name", () => {
  assert.equal(hostMatchesCompany("cubet.com", "Cubet Techno Labs"), true);
  assert.equal(hostMatchesCompany("careers.experionglobal.com", "Experion Technologies"), true);
  assert.equal(hostMatchesCompany("www.jobaaj.com", "Experion Technologies"), false);
  assert.equal(hostMatchesCompany("tcs.com", "Tata Consultancy Services"), true);
  assert.equal(hostMatchesCompany("randomboard.example", "Acme Software Solutions Pvt Ltd"), false);
  const row = parseGoogleJobsResponse({ jobs_results: [{
    title: "Python Developer", company_name: "Experion Technologies", location: "Kochi, Kerala",
    description: "Python developer for enterprise products in Kochi with Django and cloud deployment experience.",
    apply_options: [{ title: "Jobaaj", link: "https://www.jobaaj.com/jobs/python-developer-kochi-12345" }],
  }] })[0];
  const discovered = discoveredJobFromRow(row, params, now)!;
  assert.equal(discovered.destination, "aggregator");
  assert.equal(discovered.job.sources[0].label, "Web · job board");
});

test("a caller that gives up early does not kill the shared Google Jobs lookup", async () => {
  resetGoogleJobsMemo();
  process.env.SERPAPI_KEY = "test-key";
  let calls = 0;
  const slow: typeof fetch = () => new Promise((resolve) => { calls++; setTimeout(() => resolve(new Response(JSON.stringify(googleRows), { headers: { "Content-Type": "application/json" } })), 120); });
  try {
    const impatient = new AbortController();
    const first = googleJobsSearch(params, impatient.signal, slow);
    setTimeout(() => impatient.abort(), 20);
    await assert.rejects(first, (error: unknown) => error instanceof SourceError && error.code === "TIMEOUT");
    // The lookup is still in flight; a patient caller reads the same request.
    const second = await googleJobsSearch(params, new AbortController().signal, slow);
    assert.equal(second.length, googleRows.jobs_results.length);
    assert.equal(calls, 1);
  } finally {
    delete process.env.SERPAPI_KEY;
    resetGoogleJobsMemo();
  }
});

test("direct sources keep their full default budgets (regression: array index was passed as the timeout)", async () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  const delayed = (ms: number): SourceAdapter => () => new Promise((resolve) => setTimeout(() => resolve({ jobs: [createJob("technopark", { title: "Python Developer", company: `Slow Co ${ms}`, location: "Kochi, Kerala", sourceUrl: `https://technopark.in/job-details/${ms}` })], hasMore: false }), ms));
  try {
    const result = await searchJobs(params, {
      db,
      adapters: { technopark: delayed(60), infopark: delayed(80), "ul-cyberpark": delayed(100) },
      sources: ["technopark", "infopark", "ul-cyberpark"] as const,
    });
    assert.deepEqual(result.sources.map((source) => source.status), ["ok", "ok", "ok"]);
    assert.equal(result.jobs.length, 3);
  } finally {
    sqlite.close();
  }
});

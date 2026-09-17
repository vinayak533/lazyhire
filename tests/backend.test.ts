import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../lib/db/connection";
import { applicationDrafts, cvUploads, jobsCache } from "../lib/db/schema";
import { generateApplicationDraft } from "../lib/applications/drafts";
import { rankJobs, sortRanked } from "../lib/career/ranking";
import {
  loadCareerBrief,
  listApplications,
  saveCareerBrief,
  upsertApplication,
} from "../lib/career/store";
import { buildCareerOsSnapshot } from "../lib/career-os/engine";
import type { CareerBrief } from "../lib/career/types";
import type { NormalizedJob } from "../lib/jobs/types";
import { mergeJobs } from "../lib/jobs/merge";
import { normalizeLocation, matchesLocation } from "../lib/jobs/locations";
import {
  searchJobs,
  freshListings,
  CACHE_TTL_MS,
  MAX_LISTING_AGE_MS,
  type SourceAdapter,
} from "../lib/jobs/search";
import {
  createJob,
  matchesSearchTerms,
  parseDate,
  safeUrl,
  withTimeout,
  SourceError,
} from "../lib/sources/shared";
import {
  parseInfoparkDetail,
  parseInfoparkListings,
} from "../lib/sources/infopark";
import {
  fetchIndeed,
  parseIndeedListings,
  parseSerpApiJobs,
} from "../lib/sources/indeed";
import {
  newestListings,
  parseTechnoparkCrawl,
  parseTechnoparkDetail,
} from "../lib/sources/technopark";
import {
  parseUlCyberparkDetail,
  parseUlCyberparkListings,
} from "../lib/sources/ul-cyberpark";
import {
  parseEvaniosDetail,
  parseEvaniosListings,
} from "../lib/sources/evanios";
import { parseCv } from "../lib/cv/parser";
import { scoreCv } from "../lib/cv/rules";
import { aiJson, CircuitBreaker, groqJson } from "../lib/ai/groq-client";
import {
  guardrailProblems,
  verifiedChanges,
} from "../lib/cv/tailor-guardrails";
import {
  normalizeToSchema,
  providerJsonSchema,
  tailoredCvSchema,
  type TailoredCv,
} from "../lib/ai/prompts";
import { encryptJson, encryptText } from "../lib/security/crypto";
import { loadLatestReadableCv } from "../lib/cv/store";
import { docxFixture, pdfFixture, sampleCv } from "./fixtures";
import { resetGoogleJobsMemo } from "../lib/sources/google-jobs";

const params = { query: "react developer", location: "kochi" as const };
const job = createJob("technopark", {
  title: "Senior React Developer",
  company: "Example Pvt Ltd",
  location: "Kochi, Kerala",
  datePosted: "2026-09-01T00:00:00.000Z",
  sourceUrl: "https://example.com/job/1",
});

test("search terms and their aliases match whole words, not fragments", () => {
  // "ui" inside "building" and "engineering" as a company type let an
  // architect posting rank first for a frontend engineer search.
  assert.equal(matchesSearchTerms("Architect Job Opening in Ernakulam drawing up building plans Company type: Engineering", "frontend engineer"), false);
  assert.equal(matchesSearchTerms("Personal Assistant building detailed itineraries", "frontend engineer"), false);
  assert.equal(matchesSearchTerms("Senior Frontend Engineer React and TypeScript", "frontend engineer"), true);
  assert.equal(matchesSearchTerms("UI Engineer for web products", "frontend engineer"), true);
  assert.equal(matchesSearchTerms("Software Engineering Manager", "engineer"), true);
  assert.equal(matchesSearchTerms("Full Stack Developer (Angular & .NET)", "developer"), true);
  assert.equal(matchesSearchTerms("Managed projects for clients", "javascript"), false);
  assert.equal(matchesSearchTerms("Node.js backend services", "node"), true);
});
test("locations accept aliases and separate Kerala cities", () => {
  assert.equal(normalizeLocation(" All Kerala "), "kerala");
  assert.equal(normalizeLocation("cochin"), "kochi");
  assert.equal(normalizeLocation("Mars"), null);
  assert.ok(matchesLocation("Kakkanad", "kochi"));
  assert.ok(!matchesLocation("Bengaluru, India", "kerala"));
});
test("normalizers preserve missing dates, reject unsafe links and filter geography", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(parseDate("31-02-2026").date, null);
  assert.equal(parseDate("06-09-2026").date, "2026-09-05T18:30:00.000Z");
  assert.equal(
    parseDate("3 days ago", Date.parse("2026-09-06T00:00:00Z")).date,
    "2026-09-03T00:00:00.000Z",
  );
  const indeed = parseIndeedListings(
    '<ul><li><h2><a href="/rc/clk?jk=1">React Developer</a></h2><div>Example Labs</div><div>Kochi, Kerala</div><p>Build React apps and REST APIs.</p></li></ul>',
    params,
  ).jobs[0];
  assert.equal(indeed.applyUrl, "https://in.indeed.com/rc/clk?jk=1");
  assert.equal(indeed.location, "Kochi, Kerala");
  const crawl = parseTechnoparkCrawl(
    '<a href="/job-details/42?job=React+Developer">React Developer</a>',
  );
  const tech = parseTechnoparkDetail(
    '<a href="/company-details/1">Example Pvt Ltd</a><div>Thejaswini Building, Technopark phase 1, Trivandrum</div><h1>React Developer</h1><p>Closing Date:30,Sept 2026</p><p>Job Published: 06,Sept 2026</p><p>Contact Email: careers@example.com</p><h3>Brief Description</h3><p>Build React and TypeScript apps.</p>',
    crawl[0],
    Date.parse("2026-09-06T00:00:00Z"),
  )!;
  assert.equal(tech.applicationEmail, "careers@example.com");
  assert.equal(tech.location, "Thiruvananthapuram, Kerala");
  // Site chrome (Kerala Government logo, app badges, socials) must never become the apply link.
  const withChrome = parseTechnoparkDetail(
    '<header><a href="/"></a></header><div><a href="/company-details/1">Example Pvt Ltd</a><a href="https://www.example.com">https://www.example.com</a><h1>React Developer</h1><p>Contact Email: careers@example.com</p><h3>Brief Description</h3><p>Apply at https://forms.gle/abc123 before Friday.</p></div><footer><a href="https://www.kerala.gov.in/"></a><a href="/space-request">Space Request Application</a><a href="https://apps.apple.com/in/app/x"></a><a href="/job-search">Careers@Technopark</a></footer>',
    crawl[0],
    Date.parse("2026-09-06T00:00:00Z"),
  )!;
  assert.equal(withChrome.applyUrl, "https://forms.gle/abc123");
  assert.deepEqual(
    withChrome.applicationLinks.map((link) => link.url),
    ["https://forms.gle/abc123", "https://www.example.com/"],
  );
  assert.ok(!JSON.stringify(withChrome).includes("kerala.gov.in"));
  const emailOnly = parseTechnoparkDetail(
    '<div><a href="/company-details/1">Example Pvt Ltd</a><h1>Tester</h1><p>Contact Email: hr@example.com</p></div><footer><a href="https://www.kerala.gov.in/"></a></footer>',
    crawl[0],
    Date.parse("2026-09-06T00:00:00Z"),
  )!;
  assert.equal(emailOnly.applyUrl, null);
  assert.equal(emailOnly.applicationEmail, "hr@example.com");
});
test("the Indeed fallback maps Google Jobs postings and rejects search pages", () => {
  const now = Date.parse("2026-09-12T00:00:00Z");
  const result = parseSerpApiJobs(
    {
      jobs_results: [
        {
          title: "React JS Developer",
          company_name: "iCore",
          location: "Kochi, Kerala",
          via: "Indeed",
          description: "Build React apps. Mail careers@icore.example.",
          detected_extensions: { posted_at: "3 days ago", schedule_type: "Full-time" },
          apply_options: [
            { title: "LinkedIn", link: "https://in.linkedin.com/jobs/view/1" },
            { title: "Indeed", link: "https://in.indeed.com/viewjob?jk=abc" },
          ],
        },
        {
          title: "Backend Developer",
          company_name: "Remote Co",
          location: "Anywhere",
          via: "BeBee",
          apply_options: [{ title: "BeBee", link: "https://bebee.com/in/jobs/2" }],
        },
        {
          title: "Python Developer",
          company_name: "Elsewhere",
          location: "Bengaluru, Karnataka",
          apply_options: [{ title: "Indeed", link: "https://in.indeed.com/viewjob?jk=zzz" }],
        },
        { title: "No links", company_name: "X", location: "Kochi, Kerala" },
      ],
    },
    { query: "developer", location: "kerala" },
    now,
  );
  // Only postings Indeed itself carries are Indeed results; the BeBee-only row
  // belongs to web discovery, which shares the same lookup.
  assert.deepEqual(
    result.jobs.map((job) => job.title),
    ["React JS Developer"],
  );
  const [react] = result.jobs;
  assert.equal(react.applyUrl, "https://in.indeed.com/viewjob?jk=abc");
  assert.equal(react.applicationLinks[0].label, "Apply on Indeed");
  assert.equal(react.applicationLinks.length, 2);
  assert.equal(react.company, "iCore");
  assert.equal(react.location, "Kochi, Kerala");
  assert.equal(react.applicationEmail, "careers@icore.example");
  assert.equal(react.jobType, "full-time");
  assert.equal(react.datePostedIsApproximate, true);
  // Indeed's "N developer jobs in Kerala" category pages are not vacancies.
  assert.throws(
    () =>
      parseIndeedListings(
        '<ul><li><h2><a href="/q-react-developer-l-kochi,-kerala-jobs.html">700 React Developer Jobs in Kochi</a></h2></li></ul>',
        { query: "react developer", location: "kochi" },
      ),
    /no readable listings/,
  );
  assert.throws(() => parseSerpApiJobs({ jobs_results: "nope" }, { query: "x", location: "kerala" }));
});
test("fuzzy merge combines attribution and retains separate seniority and cities", () => {
  const duplicate = createJob("infopark", {
    ...job,
    title: "Sr. React.js Developer",
    company: "Example Private Limited",
    applicationEmail: "hiring@example.com",
    sourceUrl: "https://infopark.in/company-jobs/details/1/2",
  });
  const merged = mergeJobs([job], [duplicate]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].sources.length, 2);
  assert.equal(merged[0].applicationEmail, "hiring@example.com");
  assert.equal(
    mergeJobs([
      job,
      {
        ...job,
        title: "Junior React Developer",
        id: "junior",
        sourceUrl: "https://example.com/job/2",
      },
    ]).length,
    2,
  );
  // The same posting URL is one vacancy however the boards spell its title.
  assert.equal(
    mergeJobs([
      job,
      { ...job, title: "ReactJS Dev (Senior)", company: "Not specified", id: "same-url" },
    ]).length,
    1,
  );
  assert.equal(
    mergeJobs([
      job,
      { ...job, location: "Thrissur", id: "other-city", sourceUrl: "https://example.com/job/4" },
    ]).length,
    2,
  );
  assert.equal(
    mergeJobs([
      { ...job, id: "unknown", datePosted: null },
      { ...job, title: "Junior React Developer", sourceUrl: "https://example.com/job/3" },
    ])[1].datePosted,
    null,
  );
});
test("Infopark excludes expired jobs and extracts only job-specific contacts", () => {
  const html =
    '<table><tbody><tr><td>01-09-2026</td><td>React Developer</td><td>Example</td><td>30 Sep 2026</td><td><a href="https://infopark.in/company-jobs/details/1/2">Details</a></td></tr></tbody></table>';
  const rows = parseInfoparkListings(html, Date.parse("2026-09-06"));
  assert.equal(rows.length, 1);
  assert.equal(parseInfoparkListings(html, Date.parse("2026-10-01")).length, 0);
  const detail = parseInfoparkDetail(
    '<div class="carer-box">company@example.com</div><div class="comp-job-deatiil"><div class="deatil-box">Location: Kochi<br>Apply using https://forms.gle/example<br><div class="contact"><a href="mailto:jobs@example.com">jobs@example.com</a></div></div></div><footer>info@infopark.in</footer>',
    rows[0],
  );
  assert.equal(detail.job.applicationEmail, "jobs@example.com");
  assert.equal(detail.job.applyUrl, "https://forms.gle/example");
  const noContact = parseInfoparkDetail(
    '<div class="comp-job-deatiil"><div class="deatil-box">Location: Kochi</div></div><footer>info@infopark.in</footer>',
    rows[0],
  );
  assert.equal(noContact.job.applicationEmail, null);
});
test("UL CyberPark extracts details, email, skills and deadline", () => {
  const { rows } = parseUlCyberparkListings(
    '<table class="table-job"><tr><td><a>React Developer</a><span>closing date: 30-09-2026</span></td><td>Example Labs</td><td><a href="https://www.ulcyberpark.com/jobs/job_vacancy?job_id=7">View Details</a></td></tr></table>',
    Date.parse("2026-09-06"),
  );
  assert.equal(rows.length, 1);
  const parsed = parseUlCyberparkDetail(
    '<div class="job_border"><h2 class="main_title_head">React Developer</h2><h4 class="sub_title">Closing date :30-09-2026</h4><a>hr@example.com</a><h2 class="job_title">Job Description</h2><ul><li>Experience 2 Years. Build React and TypeScript applications.</li></ul><h2 class="job_title">Job Skills</h2><ul><li>React, TypeScript, SQL</li></ul></div>',
    rows[0],
    Date.parse("2026-09-06"),
  )!;
  assert.equal(parsed.source, "ul-cyberpark");
  assert.equal(parsed.company, "Example Labs");
  assert.equal(parsed.location, "UL CyberPark, Kozhikode, Kerala");
  assert.equal(parsed.applicationEmail, "hr@example.com");
  assert.equal(parsed.closingDate, "2026-09-29T18:30:00.000Z");
  assert.deepEqual(parsed.skills.slice(0, 3), ["React", "TypeScript", "SQL"]);
});
test("Evanios extracts apply URL, salary, experience and posted date", () => {
  const rows = parseEvaniosListings(
    '<div class="job-item job-card"><a class="job-card__title" href="https://www.evaniosjobs.com/job-details/1/react-developer-job-in-kozhikode">React Developer Job in Kozhikode</a><div class="job-card__title-loc">Kozhikode, Kerala</div><span class="job-card__badge">Full Time</span><div class="job-card__tbl"><span class="job-dt-label">Comp. Type</span><span class="job-dt-text">Software Company</span></div><a href="https://www.evaniosjobs.com/job-apply/1/react-developer-job-in-kozhikode">APPLY NOW</a></div>',
  );
  assert.equal(rows.length, 1);
  const parsed = parseEvaniosDetail(
    '<div class="job-details__content-wrap"><h1 class="job-details__title-name">React Developer Job Opening in Kozhikode</h1><div class="job-details__header-subleft">Kozhikode, Kerala</div><div class="job-details__header-subright">Full Time</div><ul><li><span class="job-details__list-label">Monthly Salary</span><span class="job-details__list-value">Rs 25000 - Rs 40000</span></li><li><span class="job-details__list-label">Minimum Experience</span><span class="job-details__list-value">2 Year(s)</span></li><li><span class="job-details__list-label">Posted on</span><span class="job-details__list-value">7 September 2026, 8:08 PM IST</span></li><li><span class="job-details__list-label">Expires on</span><span class="job-details__list-value">7 October 2026, 11:59 PM IST</span></li><li><span class="job-details__list-label">Company Type</span><span class="job-details__list-value">Software Company</span></li></ul><a href="https://www.evaniosjobs.com/job-apply/1/react-developer-job-in-kozhikode">APPLY NOW</a><div class="job-details__desc">Build React and TypeScript dashboards.</div></div>',
    rows[0],
    Date.parse("2026-09-08"),
  )!;
  assert.equal(parsed.source, "evanios");
  assert.equal(
    parsed.applyUrl,
    "https://www.evaniosjobs.com/job-apply/1/react-developer-job-in-kozhikode",
  );
  assert.equal(parsed.salary, "Rs 25000 - Rs 40000");
  assert.equal(parsed.experience, "2 Year(s)");
  assert.equal(parsed.datePosted, "2026-09-06T18:30:00.000Z");
  assert.equal(parsed.closingDate, "2026-10-06T18:30:00.000Z");
  assert.ok(parsed.skills.includes("React"));
});
test("Indeed falls back to an Indeed-scoped search when direct access is blocked", async () => {
  const before = process.env.SERPAPI_KEY;
  process.env.SERPAPI_KEY = "test-only";
  resetGoogleJobsMemo();
  let calls = 0;
  try {
    const result = await fetchIndeed(
      params,
      new AbortController().signal,
      (async (url) => {
        calls++;
        const text = String(url);
        if (new URL(text).hostname === "in.indeed.com")
          return new Response("blocked", { status: 403 });
        assert.ok(text.includes("engine=google_jobs"));
        // The city rides inside the query; the engine's location parameter proved far slower.
        assert.ok(text.includes("q=react+developer+jobs+in+Kochi"));
        assert.ok(!text.includes("location="));
        return Response.json({
          jobs_results: [
            {
              title: "React Developer",
              company_name: "Example Labs",
              location: "Kochi, Kerala",
              via: "Indeed",
              description: "Build React and TypeScript interfaces.",
              apply_options: [
                { title: "Indeed", link: "https://in.indeed.com/rc/clk?jk=abc" },
              ],
            },
          ],
        });
      }) as typeof fetch,
    );
    assert.equal(calls, 2);
    assert.equal(result.jobs[0].source, "indeed");
    assert.equal(
      result.jobs[0].applyUrl,
      "https://in.indeed.com/rc/clk?jk=abc",
    );
    assert.equal(result.warnings?.length, 1);
  } finally {
    if (before === undefined) delete process.env.SERPAPI_KEY;
    else process.env.SERPAPI_KEY = before;
  }
});
test("results use each source's published date: newest first, expired and stale listings dropped", async () => {
  const now = Date.parse("2026-09-11T09:00:00Z");
  const day = 86_400_000;
  const dated = (id: string, daysAgo: number | null, extra: Partial<NormalizedJob> = {}) =>
    createJob("technopark", {
      title: `Role ${id}`,
      company: `Company ${id}`,
      location: "Kochi, Kerala",
      sourceUrl: `https://technopark.in/job-details/${id}`,
      datePosted: daysAgo === null ? null : new Date(now - daysAgo * day).toISOString(),
      ...extra,
    });
  const fresh = freshListings(
    [
      dated("1", 40),
      dated("2", null),
      dated("3", 0),
      dated("4", 200),
      dated("5", 2, { closingDate: new Date(now - 3 * day).toISOString() }),
      dated("6", 7, { closingDate: new Date(now + day).toISOString() }),
    ],
    now,
  );
  assert.deepEqual(
    fresh.map((job) => job.title),
    ["Role 3", "Role 6", "Role 1", "Role 2"],
  );
  assert.ok(MAX_LISTING_AGE_MS < 200 * day);

  // Indeed's own relative label becomes the listing date, marked approximate.
  const indeed = parseIndeedListings(
    '<ul><li><h2><a href="/rc/clk?jk=1">React Developer</a></h2><div>Example Labs</div><div>Kochi, Kerala</div><p>Build React apps.</p><span>Posted 3 days ago</span></li><li><h2><a href="/rc/clk?jk=2">Node Developer</a></h2><div>Other Labs</div><div>Kochi, Kerala</div><p>APIs.</p><span>Just posted</span></li></ul>',
    params,
  ).jobs;
  assert.ok(indeed[0].datePosted && indeed[0].datePostedIsApproximate);
  assert.ok(Date.now() - Date.parse(indeed[0].datePosted!) >= 3 * day - 60_000);
  assert.ok(Date.now() - Date.parse(indeed[1].datePosted!) < 60_000);

  // Technopark's crawl page is oldest first; the newest listings are read, titles naming the role first.
  const crawl = parseTechnoparkCrawl(
    Array.from({ length: 50 }, (_, i) => `<a href="/job-details/${100 + i}">${i === 3 ? "React Developer" : `Role ${i}`}</a>`).join(""),
  );
  const chosen = newestListings(crawl, "react developer", 5);
  assert.equal(chosen[0].title, "React Developer");
  assert.deepEqual(
    chosen.slice(1).map((row) => row.sourceUrl),
    [149, 148, 147, 146].map((id) => `https://technopark.in/job-details/${id}`),
  );

  // The default view is chronological; the fit order stays available on request.
  const brief: CareerBrief = { role: "React Developer", skills: ["react"], experienceLevel: "mid", cities: ["kochi"], workMode: "any", salaryPreference: "", sources: ["technopark"], rankingGoal: "best-fit", cvUploadId: null };
  const older = createJob("technopark", { title: "React TypeScript Developer", company: "Older", location: "Kochi, Kerala", applyUrl: "https://example.com/older", description: "React TypeScript work", datePosted: new Date(now - 20 * day).toISOString() });
  const newer = createJob("technopark", { title: "Office Assistant", company: "Newer", location: "Kochi, Kerala", description: "Filing", datePosted: new Date(now - 1 * day).toISOString() });
  const ranked = rankJobs([older, newer], brief);
  assert.equal(ranked[0].job.id, older.id);
  assert.equal(sortRanked(ranked, "newest")[0].job.id, newer.id);
  assert.equal(sortRanked(ranked, "fit")[0].job.id, older.id);
});

test("search caches results, refreshes expiry and recovers corrupt JSON", async () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  let clock = Date.parse("2026-09-06T12:00:00Z"),
    calls = 0;
  const source: SourceAdapter = async () => {
    calls++;
    return { jobs: [job], hasMore: false };
  };
  const options = {
    db,
    adapters: { technopark: source, indeed: source, infopark: source },
    now: () => clock,
    sources: ["technopark", "indeed", "infopark"] as const,
  };
  try {
    assert.equal((await searchJobs(params, options)).cache.hit, false);
    assert.equal((await searchJobs(params, options)).cache.hit, true);
    assert.equal(calls, 3);
    clock += CACHE_TTL_MS;
    assert.equal((await searchJobs(params, options)).cache.hit, false);
    assert.equal(calls, 6);
    db.update(jobsCache).set({ resultsJson: "corrupt" }).run();
    assert.equal((await searchJobs(params, options)).cache.hit, false);
    assert.equal(calls, 9);
  } finally {
    sqlite.close();
  }
});
test("empty direct source results can recover through verified search discovery", async () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  const beforeKey = process.env.SERPAPI_KEY;
  const beforeFetch = globalThis.fetch;
  process.env.SERPAPI_KEY = "test-only";
  const empty: SourceAdapter = async () => ({ jobs: [], hasMore: false });
  try {
    globalThis.fetch = (async (url) => {
      assert.ok(String(url).includes("serpapi.com/search.json"));
      return Response.json({
        organic_results: [
          {
            title: "React Developer - Technopark Jobs",
            link: "https://technopark.in/job-details/99",
            snippet: "Build React and TypeScript products in Kerala.",
            source: "Example Labs",
          },
          {
            title: "Free Job Posting Site in Kerala",
            link: "https://internshala.com/free-job-posting-site-in-kerala/",
            snippet: "Employer page.",
            source: "Internshala",
          },
        ],
      });
    }) as typeof fetch;
    const result = await searchJobs(params, {
      db,
      adapters: { technopark: empty, indeed: empty },
      sources: ["technopark", "indeed"] as const,
      timeoutMs: 1000,
    });
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].source, "technopark");
    assert.equal(
      result.jobs[0].applyUrl,
      "https://technopark.in/job-details/99",
    );
    assert.equal(result.partial, true);
    assert.match(result.sources[0].warnings?.[0] ?? "", /discovery/i);
  } finally {
    globalThis.fetch = beforeFetch;
    if (beforeKey === undefined) delete process.env.SERPAPI_KEY;
    else process.env.SERPAPI_KEY = beforeKey;
    sqlite.close();
  }
});
test("career brief and application pipeline persist in SQLite", () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  const userId = "user-a";
  try {
    assert.equal(loadCareerBrief(db, userId), null);
    const brief = saveCareerBrief(db, userId, {
      role: "React Developer",
      skills: ["React", "TypeScript", "React"],
      experienceLevel: "mid",
      cities: ["kochi"],
      workMode: "hybrid",
      salaryPreference: "12 LPA",
      sources: ["technopark", "indeed"],
      rankingGoal: "best-fit",
      cvUploadId: null,
    });
    assert.deepEqual(brief.skills, ["React", "TypeScript"]);
    assert.equal(loadCareerBrief(db, userId)?.role, "React Developer");
    assert.throws(() => saveCareerBrief(db, userId, { role: "" }));

    const saved = upsertApplication(db, userId, { job, status: "saved" });
    assert.equal(saved.status, "saved");
    assert.equal(listApplications(db, userId, "saved").length, 1);
    const applied = upsertApplication(db, userId, {
      job,
      status: "applied",
      notes: "Sent tailored cover letter.",
    });
    assert.equal(applied.notes, "Sent tailored cover letter.");
    assert.ok(applied.appliedAt);
    assert.equal(listApplications(db, userId, "saved").length, 0);
    assert.equal(
      listApplications(db, userId, "applied")[0].jobSnapshot.title,
      job.title,
    );
  } finally {
    sqlite.close();
  }
});

test("application draft generation uses the latest readable CV and stores encrypted content", async () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  const previousDeepSeek = process.env.DEEPSEEK_API_KEY;
  const previousGroq = process.env.GROQ_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.GROQ_API_KEY;
  const userId = "draft-user";
  const parsed = {
    text: sampleCv,
    format: "pdf" as const,
    pages: 1,
    hasTables: false,
    imageOnly: false,
    warnings: [],
  };
  const result = {
    id: "cv-draft",
    filename: "resume.pdf",
    parsed,
    analysis: scoreCv(parsed),
  };
  const draftJob = createJob("technopark", {
    title: "Frontend Developer",
    company: "Draft Studio",
    location: "Kochi, Kerala",
    applicationEmail: "jobs@draft.example",
    description:
      "Build React and TypeScript interfaces, improve accessibility, and write Playwright tests.",
    skills: ["React", "TypeScript", "Playwright", "GraphQL"],
    sourceUrl: "https://example.com/draft-job",
  });
  try {
    db.insert(cvUploads)
      .values({
        id: result.id,
        userId,
        filename: result.filename,
        textCiphertext: encryptText(sampleCv),
        resultJson: encryptJson(result),
        fileSha256: "hash",
        mimeType: "application/pdf",
        scanStatus: "passed",
        createdAt: new Date("2026-09-15T00:00:00.000Z"),
      })
      .run();
    const cv = loadLatestReadableCv(db, userId);
    assert.ok(cv);
    const draft = await generateApplicationDraft({
      db,
      userId,
      job: draftJob,
      cv,
    });
    assert.match(draft.subject, /Frontend Developer/);
    assert.match(draft.body, /Draft Studio/);
    assert.equal(draft.recipientEmail, "jobs@draft.example");
    assert.equal(draft.providerLabel, "Local template");
    assert.ok(draft.cautions.some((item) => /GraphQL/.test(item)));

    const cached = await generateApplicationDraft({
      db,
      userId,
      job: draftJob,
      cv,
    });
    assert.equal(cached.id, draft.id);
    assert.equal(cached.cached, true);

    const raw = db.select().from(applicationDrafts).all();
    assert.equal(raw.length, 1);
    assert.ok(!raw[0].subjectCiphertext.includes("Frontend"));
    assert.ok(!raw[0].bodyCiphertext.includes("Draft Studio"));
    assert.ok(!raw[0].recipientEmailCiphertext.includes("jobs@draft.example"));
  } finally {
    if (previousDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousDeepSeek;
    if (previousGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroq;
    sqlite.close();
  }
});
test("Career OS returns zeroed setup state until CV and target role exist", () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  try {
    const snapshot = buildCareerOsSnapshot(db, "new-user");
    assert.equal(snapshot.profileStatus.readyForPersonalization, false);
    assert.equal(snapshot.readiness.score, 0);
    assert.equal(snapshot.metrics.find((item) => item.label === "Readiness")?.value, "0%");
    assert.equal(snapshot.skills.gaps.length, 0);
    assert.equal(snapshot.radar.length, 0);
    assert.equal(snapshot.roadmap.length, 0);
    assert.match(snapshot.guardrails.summary, /setup status/i);
  } finally {
    sqlite.close();
  }
});
test("career ranking favors best fit, direct apply, growth stretch and warnings", () => {
  const brief: CareerBrief = {
    role: "React Developer",
    skills: ["react", "typescript"],
    experienceLevel: "mid",
    cities: ["kochi"],
    workMode: "hybrid",
    salaryPreference: "",
    sources: ["technopark", "indeed", "infopark"],
    rankingGoal: "best-fit",
    cvUploadId: null,
  };
  const directFit = createJob("technopark", {
    title: "React TypeScript Developer",
    company: "Direct Fit",
    location: "Kochi, Kerala",
    applyUrl: "https://example.com/direct",
    description: "React TypeScript REST API work.",
    datePosted: new Date().toISOString(),
  });
  const risky = createJob("indeed", {
    title: "React Developer",
    company: "Risky",
    location: "Kochi, Kerala",
    description: "React role with registration charge before joining.",
    closingDate: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(rankJobs([risky, directFit], brief)[0].job.id, directFit.id);
  assert.ok(rankJobs([risky], brief)[0].insight.warnings.length >= 2);

  const fastApply: CareerBrief = { ...brief, rankingGoal: "fast-apply" };
  assert.equal(rankJobs([risky, directFit], fastApply)[0].job.id, directFit.id);

  const stretch = createJob("infopark", {
    title: "React TypeScript Docker Developer",
    company: "Stretch",
    location: "Kochi, Kerala",
    applyUrl: "https://example.com/stretch",
    description: "React TypeScript Docker Kubernetes delivery.",
  });
  const growth: CareerBrief = { ...brief, rankingGoal: "growth-stretch" };
  assert.ok(rankJobs([stretch, directFit], growth)[0].rankScore > 0);
});
test("career ranking penalizes seniority and city mismatches", () => {
  const entryBrief: CareerBrief = {
    role: "React Developer",
    skills: ["react", "typescript", "rest api"],
    experienceLevel: "entry",
    cities: ["kochi"],
    workMode: "hybrid",
    salaryPreference: "",
    sources: ["technopark", "indeed", "infopark"],
    rankingGoal: "best-fit",
    cvUploadId: null,
  };
  const entryFit = createJob("technopark", {
    title: "Junior React Developer",
    company: "Entry Fit",
    location: "Kochi, Kerala",
    applyUrl: "https://example.com/junior",
    description:
      "Entry-level React TypeScript REST API role. Freshers and graduates can apply for hybrid work.",
    experience: "0-1 years",
    datePosted: new Date().toISOString(),
  });
  const seniorMismatch = createJob("technopark", {
    title: "Lead React Architect",
    company: "Senior Mismatch",
    location: "Kochi, Kerala",
    applyUrl: "https://example.com/lead",
    description:
      "Lead React TypeScript REST API architecture role for team leadership and delivery governance.",
    experience: "7+ years",
    datePosted: new Date().toISOString(),
  });
  const cityMismatch = createJob("infopark", {
    title: "React Developer",
    company: "City Mismatch",
    location: "Thiruvananthapuram, Kerala",
    applyUrl: "https://example.com/trivandrum",
    description:
      "React TypeScript REST API work from office in Thiruvananthapuram.",
    experience: "1 years",
    datePosted: new Date().toISOString(),
  });
  const ranked = rankJobs([seniorMismatch, cityMismatch, entryFit], entryBrief);
  assert.equal(ranked[0].job.id, entryFit.id);
  assert.ok(
    ranked
      .find((item) => item.job.id === seniorMismatch.id)!
      .insight.warnings.some((warning) => /lead-level|senior-level/i.test(warning)),
  );
  assert.ok(
    ranked
      .find((item) => item.job.id === cityMismatch.id)!
      .insight.warnings.includes("Location does not match preferred cities"),
  );
});
test("partial success and complete failures return diagnostics without caching", async () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  const fail: SourceAdapter = async () => {
    throw new SourceError("AUTH_ERROR", "Unavailable");
  };
  const never: SourceAdapter = () => new Promise(() => {});
  const success: SourceAdapter = async () => ({ jobs: [job], hasMore: false });
  try {
    const result = await searchJobs(params, {
      db,
      adapters: { technopark: success, indeed: fail, infopark: never },
      sources: ["technopark", "indeed", "infopark"] as const,
      timeoutMs: 25,
    });
    assert.equal(result.jobs.length, 1);
    assert.ok(result.partial);
    assert.equal(result.sources[2].code, "TIMEOUT");
    db.delete(jobsCache).run();
    const empty = await searchJobs(params, {
      db,
      adapters: { technopark: fail, indeed: fail, infopark: fail },
      sources: ["technopark", "indeed", "infopark"] as const,
    });
    assert.equal(empty.jobs.length, 0);
    assert.equal(empty.partial, true);
    assert.equal(empty.cache.stored, false);
    assert.equal(
      empty.sources.every((source) => source.status === "unavailable"),
      true,
    );
    assert.equal(db.select().from(jobsCache).all().length, 0);
  } finally {
    sqlite.close();
  }
});
test("timeouts abort the underlying work", async () => {
  let aborted = false;
  await assert.rejects(
    withTimeout((signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise(() => {});
    }, 10),
  );
  assert.ok(aborted);
});
test("DOCX parsing detects tables and produces exact inline offsets", async () => {
  const parsed = await parseCv(docxFixture(), "cv.docx");
  const analysis = scoreCv(parsed);
  assert.equal(parsed.hasTables, false);
  assert.ok(Object.values(analysis.sections).every(Boolean));
  assert.equal(
    analysis.score,
    analysis.categories.reduce((sum, category) => sum + category.score, 0),
  );
  const issue = analysis.issues.find((issue) => issue.kind === "weak-verb")!;
  assert.equal(parsed.text.slice(issue.start, issue.end), "Responsible for");
  assert.ok(
    !analysis.issues.some((issue) =>
      parsed.text.slice(issue.start, issue.end).startsWith("Coursework"),
    ),
  );
  assert.ok(
    !analysis.issues.some(
      (issue) =>
        issue.kind === "unquantified" &&
        parsed.text.slice(issue.start, issue.end).includes("35%"),
    ),
  );
  assert.equal(
    (await parseCv(docxFixture(sampleCv, true), "cv.docx")).hasTables,
    true,
  );
  await assert.rejects(parseCv(Buffer.from("fake PDF"), "cv.pdf"));
});
test("PDF extraction handles readable documents and empty/image-only content", async () => {
  const parsed = await parseCv(pdfFixture(), "cv.pdf");
  assert.ok(parsed.text.includes("Responsible for"));
  assert.equal(parsed.pages, 1);
  assert.equal(parsed.hasTables, null);
  assert.ok(scoreCv(parsed).issues.length > 0);
  const empty = await parseCv(pdfFixture(""), "scan.pdf");
  assert.ok(empty.imageOnly);
  assert.equal(scoreCv(empty).score, 0);
});
test("circuit opens at three failures, waits 60s and admits one recovery probe", () => {
  let time = 1000;
  const breaker = new CircuitBreaker(() => time);
  for (let i = 0; i < 3; i++) {
    assert.ok(breaker.enter());
    breaker.failure();
  }
  assert.equal(breaker.enter(), false);
  time += 59_999;
  assert.equal(breaker.enter(), false);
  time++;
  assert.ok(breaker.enter());
  assert.equal(breaker.enter(), false);
  breaker.success();
  assert.ok(breaker.enter());
});
test("Groq retries once and safely rejects malformed JSON", async () => {
  const before = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-only";
  let calls = 0;
  try {
    const fetcher = (async () => {
      calls++;
      return Response.json({
        choices: [
          {
            message: { content: calls === 1 ? "bad JSON" : '{"ok":true}' },
            finish_reason: "stop",
          },
        ],
      });
    }) as typeof fetch;
    assert.deepEqual(await groqJson({}, fetcher), { ok: true });
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(
      groqJson({}, (async () => {
        calls++;
        return new Response("No", { status: 401 });
      }) as typeof fetch),
    );
    assert.equal(calls, 2);
  } finally {
    if (before === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = before;
  }
});

test("DeepSeek V4 Flash is preferred and receives compatible JSON mode", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  const previousDeepSeek = process.env.DEEPSEEK_API_KEY;
  const previousGroq = process.env.GROQ_API_KEY;
  process.env.AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
  process.env.GROQ_API_KEY = "groq-test-key";
  let seenUrl = "";
  let seenBody: {
    model?: string;
    response_format?: { type?: string };
    messages?: Array<{ role: string; content: string }>;
  } = {};
  try {
    const result = await aiJson(
      {
        messages: [{ role: "system", content: "Return JSON only." }],
        response_format: {
          type: "json_schema",
          json_schema: { schema: { type: "object" } },
        },
      },
      (async (url, init) => {
        seenUrl = String(url);
        seenBody = JSON.parse(String(init?.body));
        assert.equal(
          (init?.headers as Record<string, string>).Authorization,
          "Bearer deepseek-test-key",
        );
        return Response.json({
          choices: [
            {
              message: { content: '{"provider":"deepseek"}' },
              finish_reason: "stop",
            },
          ],
        });
      }) as typeof fetch,
    );
    assert.deepEqual(result, { provider: "deepseek" });
    assert.equal(seenUrl, "https://api.deepseek.com/chat/completions");
    assert.equal(seenBody.model, "deepseek-v4-flash");
    assert.equal(seenBody.response_format?.type, "json_object");
    assert.match(seenBody.messages?.[0]?.content ?? "", /schema/);
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
    if (previousDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousDeepSeek;
    if (previousGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroq;
  }
});

test("tailoring guardrails reject fabricated numbers, undocumented requirements and invented originals", () => {
  const draft = (
    overrides: Partial<TailoredCv> = {},
  ): TailoredCv => ({
    match_score: 80,
    score_explanation:
      "React, TypeScript and Playwright evidence is documented; GraphQL is not.",
    score_factors: [
      {
        factor: "React interfaces",
        evidence: "strong",
        detail: "The experience section documents React components.",
      },
    ],
    strong_matches: ["React", "TypeScript"],
    missing_keywords: ["GraphQL", "Kubernetes"],
    weak_areas: ["No GraphQL work appears in the CV."],
    recommendations: ["Lead with the accessibility and testing evidence."],
    tailored_cv:
      "Alex Example\n\nExperience\n- Built 12 reusable React components for the customer support dashboard.\n- Implemented automated tests covering 40 key customer workflows.",
    changes: [],
    safety_notes: ["GraphQL stays a gap because the CV does not evidence it."],
    ...overrides,
  });

  assert.deepEqual(guardrailProblems(sampleCv, draft()), []);

  const derivedYears = guardrailProblems(
    sampleCv,
    draft({
      tailored_cv:
        "Alex Example\n\nFrontend Engineer with over 4 years of experience building React interfaces for 12 teams.",
    }),
  );
  assert.equal(derivedYears.length, 1);
  assert.match(derivedYears[0], /numbers the CV never states: 4\./);

  // Spelling the figure out must not get past the digit scan.
  const spelledYears = guardrailProblems(
    sampleCv,
    draft({
      tailored_cv:
        "Alex Example\n\nProfessional Summary\nFrontend Engineer with four years of experience building accessible React interfaces.",
    }),
  );
  assert.equal(spelledYears.length, 1);
  assert.match(spelledYears[0], /spelled out quantities/);
  assert.match(spelledYears[0], /four years/);

  // "three product teams" restates the CV's own "3 product teams", so it stays.
  assert.deepEqual(
    guardrailProblems(
      sampleCv,
      draft({
        tailored_cv:
          "Alex Example\n\nProjects\n- Managed a shared component library used by three product teams.",
      }),
    ),
    [],
  );

  const claimedGap = guardrailProblems(
    sampleCv,
    draft({
      tailored_cv:
        "Alex Example\n\nSkills\nReact, TypeScript, GraphQL, Playwright, Kubernetes.",
    }),
  );
  assert.equal(claimedGap.length, 1);
  assert.match(claimedGap[0], /GraphQL, Kubernetes/);

  // The tailored side of a change is CV content too, so it is checked as well.
  assert.equal(
    guardrailProblems(
      sampleCv,
      draft({
        changes: [
          {
            section: "Summary",
            original: "Built 12 reusable React components",
            tailored: "Built 12 reusable React and GraphQL components",
            reason: "Aligns the summary with the job.",
          },
        ],
      }),
    ).length,
    1,
  );

  const wrapped = draft({
    changes: [
      {
        section: "Education",
        // The parsed CV wraps this sentence across two lines.
        original:
          "Coursework included algorithms, data structures, database design, software engineering, human computer interaction and network fundamentals.",
        tailored: "Coursework: algorithms, data structures, database design.",
        reason: "Shortens coursework so role-relevant evidence leads.",
      },
      {
        section: "Summary",
        original: "Led a team of eight engineers through a platform rewrite.",
        tailored: "Led a platform rewrite.",
        reason: "This original was never in the CV.",
      },
    ],
  });
  const kept = verifiedChanges(sampleCv, wrapped);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].section, "Education");
});

test("provider schemas drop bounds and generated payloads are clamped back into them", () => {
  const relaxed = JSON.stringify(providerJsonSchema(tailoredCvSchema));
  for (const bound of ["maxItems", "minLength", "maxLength", "maximum"])
    assert.equal(relaxed.includes(bound), false, `${bound} reached the provider`);
  const strict = JSON.stringify(z.toJSONSchema(tailoredCvSchema));
  assert.equal(strict.includes("maxItems"), true);
  // Shape and required fields must survive, or the provider stops guiding output.
  assert.match(relaxed, /"tailored_cv"/);
  assert.match(relaxed, /"required"/);

  const normalized = normalizeToSchema(tailoredCvSchema, {
    match_score: 118,
    score_explanation: "  Documented React and TypeScript overlap.  ",
    // Nine factors exceed the cap and the last one is unusable.
    score_factors: [
      ...Array.from({ length: 8 }, (_, index) => ({
        factor: `Factor ${index}`,
        evidence: "strong",
        detail: "Documented in the experience section.",
      })),
      { factor: "Overflow", evidence: "missing", detail: "Dropped." },
    ],
    strong_matches: ["React", "  TypeScript  "],
    missing_keywords: ["GraphQL"],
    weak_areas: ["No GraphQL work is documented."],
    recommendations: ["Lead with accessibility evidence."],
    tailored_cv:
      "Alex Example\n\nExperience\nFrontend Developer - Example Studio | 2022 - 2026\n- Built 12 reusable React components for the customer support dashboard.",
    changes: [
      {
        section: "Summary",
        original: "",
        tailored: "Frontend Engineer with React and TypeScript evidence.",
        reason: "An empty original cannot be verified.",
      },
      {
        section: "Skills",
        original: "React, TypeScript, JavaScript",
        tailored: "React, TypeScript",
        reason: "Puts role-relevant skills first.",
      },
    ],
    safety_notes: ["GraphQL stays a gap."],
  });

  assert.equal(normalized.match_score, 100);
  assert.equal(
    normalized.score_explanation,
    "Documented React and TypeScript overlap.",
  );
  assert.equal(normalized.score_factors.length, 8);
  assert.deepEqual(normalized.strong_matches, ["React", "TypeScript"]);
  // The change with the empty original is dropped, the usable one is kept.
  assert.equal(normalized.changes.length, 1);
  assert.equal(normalized.changes[0].section, "Skills");
});

import { classifyApplyLink, hostMatchesCompany, isAtsHost, isJobBoardHost, parseHttpUrl } from "@/lib/jobs/apply-links";
import { locations, type SearchParams } from "@/lib/jobs/locations";
import type { NormalizedJob, SourceResult } from "@/lib/jobs/types";
import { COMPANY_WEBSITE_LABEL, validateDiscoveredJob } from "@/lib/jobs/validate";
import { googleJobsSearch, type GoogleJobRow } from "./google-jobs";
import {
  createJob,
  extractEmail,
  extractSkills,
  jobType,
  matchesSearchTerms,
  parseDate,
  plainText,
  type Fetcher,
} from "./shared";

export interface DiscoveredJob {
  job: NormalizedJob;
  /** Which kind of destination the primary link points to. */
  destination: "employer" | "platform" | "aggregator";
}

function hostOf(url: string) {
  return parseHttpUrl(url)?.hostname.toLowerCase().replace(/^www\./, "") ?? "";
}

function boardLabel(host: string) {
  const known: Array<[RegExp, string]> = [
    [/(?:^|\.)indeed\.com$/, "Indeed"],
    [/(?:^|\.)linkedin\.com$/, "LinkedIn"],
    [/(?:^|\.)naukri\.com$/, "Naukri"],
    [/(?:^|\.)glassdoor\.(?:com|co\.in)$/, "Glassdoor"],
    [/(?:^|\.)foundit\.in$/, "Foundit"],
    [/(?:^|\.)shine\.com$/, "Shine"],
    [/(?:^|\.)timesjobs\.com$/, "TimesJobs"],
    [/(?:^|\.)internshala\.com$/, "Internshala"],
    [/(?:^|\.)freshersworld\.com$/, "Freshersworld"],
    [/(?:^|\.)apna\.co$/, "Apna"],
    [/(?:^|\.)instahyre\.com$/, "Instahyre"],
    [/(?:^|\.)cutshort\.io$/, "Cutshort"],
    [/(?:^|\.)wellfound\.com$/, "Wellfound"],
    [/(?:^|\.)hirist\.(?:tech|com)$/, "Hirist"],
    [/(?:^|\.)iimjobs\.com$/, "iimjobs"],
  ];
  return known.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

/**
 * Turn one Google Jobs row into a validated job, or nothing. The primary link
 * is the employer's own application page when Google lists one, then a trusted
 * job platform, then any other board; every candidate must pass the apply-link
 * classifier, and the whole row must pass discovered-job validation.
 */
export function discoveredJobFromRow(
  row: GoogleJobRow,
  params: SearchParams,
  now = Date.now(),
): DiscoveredJob | null {
  const title = plainText(row.title ?? "").replace(/\s+/g, " ");
  const company = plainText(row.company_name ?? "").replace(/\s+/g, " ");
  const rawLocation = plainText(row.location ?? "").replace(/\s+/g, " ");
  const remote = row.detected_extensions?.work_from_home || /anywhere|remote|work from home/i.test(rawLocation);
  if (!title || !company) return null;
  if (!matchesSearchTerms(`${title}\n${row.description ?? ""}`, params.query)) return null;
  const options = (row.apply_options ?? []).flatMap((option) => {
    const verdict = classifyApplyLink(option.link, `apply ${option.title}`);
    if (verdict.kind !== "apply") return [];
    const host = hostOf(verdict.url);
    // Employer: an ATS page or a domain that carries the company's own name.
    // Anything else unknown is treated as a board, never as the employer.
    const rank = isAtsHost(host) || (!isJobBoardHost(host) && hostMatchesCompany(host, company)) ? 0 : /(?:^|\.)(?:linkedin\.com|indeed\.com|naukri\.com|glassdoor\.(?:com|co\.in))$/.test(host) ? 1 : 2;
    const board = boardLabel(host);
    return [{ label: board ? `Apply on ${board}` : `Apply on ${option.title || "company website"}`, url: verdict.url, rank }];
  }).sort((a, b) => a.rank - b.rank);
  const primary = options[0];
  if (!primary) return null;
  const destination = primary.rank === 0 ? "employer" : primary.rank === 1 ? "platform" : "aggregator";
  const description = plainText(row.description ?? "");
  const posted = parseDate(row.detected_extensions?.posted_at ?? row.posted_at, now);
  const location = remote
    ? params.location === "kerala"
      ? "Remote (Kerala search)"
      : `Remote (${locations[params.location].label} search)`
    : rawLocation;
  const job = createJob("web", {
    title,
    company,
    location,
    locationBasis: "job",
    datePosted: posted.date,
    datePostedIsApproximate: posted.approximate,
    sourceUrl: primary.url,
    applyUrl: primary.url,
    applicationLinks: options.map(({ label, url }) => ({ label, url })),
    applicationEmail: extractEmail(description),
    description,
    jobType: jobType(`${title}\n${row.detected_extensions?.schedule_type ?? ""}\n${description}`),
    salary: row.detected_extensions?.salary?.slice(0, 160) ?? null,
    skills: extractSkills(`${title}\n${description}`),
  });
  // The badge says where the person will land, not which index found the posting.
  const label = destination === "employer" ? COMPANY_WEBSITE_LABEL : "Web";
  const candidate: NormalizedJob = {
    ...job,
    sources: [{ source: "web", label: label === COMPANY_WEBSITE_LABEL ? "Company Website" : `Web · ${boardLabel(hostOf(primary.url)) ?? "job board"}`, url: primary.url }],
  };
  const verdict = validateDiscoveredJob(candidate, params, now);
  if (!verdict.ok) return null;
  return { job: verdict.job, destination };
}

/**
 * Recent public postings from the open web: company career pages and job
 * boards that Google Jobs indexes. Only rows that survive validation become
 * jobs; category pages, search pages and unverifiable destinations never do.
 */
export async function fetchWebDiscovery(
  params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
  now = Date.now,
): Promise<SourceResult> {
  const rows = await googleJobsSearch(params, signal, fetcher, now);
  const jobs: NormalizedJob[] = [];
  let rejected = 0;
  for (const row of rows) {
    const discovered = discoveredJobFromRow(row, params, now());
    if (discovered) jobs.push(discovered.job);
    else rejected++;
  }
  return {
    jobs,
    hasMore: false,
    warnings: rejected
      ? [`${rejected} web results were not shown because they were category pages, off-location, stale, or had no verifiable application link.`]
      : [],
  };
}

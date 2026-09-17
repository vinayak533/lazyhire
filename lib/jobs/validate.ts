import { canonicalUrl, classifyApplyLink, isJobBoardHost, parseHttpUrl } from "./apply-links";
import { matchesLocation, type SearchParams } from "./locations";
import type { NormalizedJob } from "./types";

export const COMPANY_WEBSITE_LABEL = "Company website";

/**
 * Titles that describe a page of jobs rather than one vacancy. Search engines
 * hand these back constantly ("120 Python Developer Jobs in Kochi", "Careers |
 * Acme"), and none of them may become a job card.
 */
export function isCategoryTitle(title: string): boolean {
  const text = title.trim();
  if (!text || text.length > 140) return true;
  return (
    /^\d[\d,]*\+?\s+.*\b(?:jobs?|vacancies|openings|positions|results)\b/i.test(text) ||
    /\b(?:jobs?|vacancies|openings)\s+(?:in|near|at|for)\s+/i.test(text) ||
    /\b(?:job search|search jobs|browse jobs|all jobs|latest jobs|top jobs|find jobs|jobs? & careers|career opportunities|job openings|current openings|we are hiring|hiring now)\b/i.test(text) ||
    /^(?:careers?|vacancies|openings|home|about(?: us)?|contact(?: us)?|login|register|privacy(?: policy)?|terms)\b/i.test(text) ||
    /\b(?:salary|salaries|reviews?|interview questions|company profile)\b/i.test(text) ||
    /\|\s*(?:indeed|linkedin|glassdoor|naukri|google)\s*$/i.test(text)
  );
}

/** Company names that are really a site, a placeholder, or a category. */
export function isPlaceholderCompany(company: string): boolean {
  const text = company.trim();
  return (
    !text ||
    text.length > 120 ||
    /^(?:not specified|unknown|n\/a|confidential|various|multiple|indeed|linkedin|glassdoor|naukri|google|web|company)$/i.test(text)
  );
}

/**
 * Enforce apply-link rules on one job. The apply button survives only when the
 * URL classifies as a real application path; employer homepages become a
 * labelled "Company website" link; navigation, social, store and policy pages
 * are removed. Idempotent, so it is safe on cached payloads too.
 */
export function sanitizeJobLinks(job: NormalizedJob): NormalizedJob {
  const links: NormalizedJob["applicationLinks"] = [];
  const seen = new Set<string>();
  const push = (label: string, url: string) => {
    const key = canonicalUrl(url) ?? url;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ label, url });
  };
  let applyUrl: string | null = null;
  if (job.applyUrl) {
    const label = job.applicationLinks.find((link) => link.url === job.applyUrl)?.label ?? "";
    const verdict = classifyApplyLink(job.applyUrl, `apply ${label}`);
    if (verdict.kind === "apply") {
      applyUrl = job.applyUrl;
      push(label || "Apply", job.applyUrl);
    } else if (verdict.kind === "company-website") push(COMPANY_WEBSITE_LABEL, job.applyUrl);
  }
  for (const link of job.applicationLinks) {
    if (link.url === job.applyUrl) continue;
    const verdict = classifyApplyLink(link.url, link.label);
    if (verdict.kind === "reject") continue;
    push(verdict.kind === "apply" ? link.label || "Apply" : COMPANY_WEBSITE_LABEL, link.url);
  }
  // A verified application form found among the links may stand in for a
  // rejected primary, but only when its own wording says it is one.
  if (!applyUrl) {
    const candidate = links.find(
      (link) =>
        /\b(?:apply|application form)\b/i.test(link.label) &&
        classifyApplyLink(link.url, link.label).kind === "apply",
    );
    if (candidate) applyUrl = candidate.url;
  }
  return { ...job, applyUrl, applicationLinks: links };
}

/** The employer's own site when a job exposes one without an application path. */
export function companyWebsite(job: Pick<NormalizedJob, "applicationLinks">): string | null {
  return job.applicationLinks.find((link) => link.label === COMPANY_WEBSITE_LABEL)?.url ?? null;
}

export type JobValidation = { ok: true; job: NormalizedJob } | { ok: false; reason: string };

/**
 * Whether a job discovered on the open web is a real, current, on-topic
 * vacancy with an application path we are allowed to show.
 */
export function validateDiscoveredJob(
  input: NormalizedJob,
  params: SearchParams,
  now = Date.now(),
): JobValidation {
  const job = sanitizeJobLinks(input);
  if (isCategoryTitle(job.title)) return { ok: false, reason: "category-title" };
  if (isPlaceholderCompany(job.company)) return { ok: false, reason: "no-company" };
  if (!job.description.trim() || job.description.trim().length < 40)
    return { ok: false, reason: "no-description" };
  const remote = /\b(?:remote|work from home|anywhere)\b/i.test(job.location);
  if (!remote && !matchesLocation(job.location, params.location))
    return { ok: false, reason: "location" };
  if (job.closingDate && Date.parse(job.closingDate) + 86_400_000 <= now)
    return { ok: false, reason: "expired" };
  if (job.datePosted) {
    const posted = Date.parse(job.datePosted);
    if (!Number.isFinite(posted) || posted > now + 86_400_000)
      return { ok: false, reason: "bad-date" };
    if (now - posted > 45 * 86_400_000) return { ok: false, reason: "stale" };
  }
  const opens = job.applyUrl ?? job.sourceUrl ?? companyWebsite(job);
  if (!opens) return { ok: false, reason: "no-destination" };
  const destination = parseHttpUrl(job.applyUrl ?? job.sourceUrl);
  if (!destination) return { ok: false, reason: "no-destination" };
  const verdict = classifyApplyLink(destination.href, "apply");
  if (verdict.kind === "reject") return { ok: false, reason: `link:${verdict.reason}` };
  return { ok: true, job };
}

/** Where a validated job sends people: the employer, a job platform, or an aggregator. */
export function destinationKind(job: NormalizedJob): "employer" | "platform" | "aggregator" | "none" {
  const url = parseHttpUrl(job.applyUrl ?? job.sourceUrl);
  if (!url) return companyWebsite(job) ? "employer" : "none";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  // An apply link that leaves every job board behind lands on the employer.
  if (job.applyUrl && !isJobBoardHost(host)) return "employer";
  if (["technopark", "infopark", "ul-cyberpark", "evanios"].includes(job.source)) return "platform";
  if (!isJobBoardHost(host)) return "employer";
  if (/(?:^|\.)(?:indeed\.com|linkedin\.com|naukri\.com|glassdoor\.(?:com|co\.in))$/.test(host)) return "platform";
  return "aggregator";
}

import { load } from "cheerio";
import {
  locations,
  matchesLocation,
  type SearchParams,
} from "@/lib/jobs/locations";
import type { NormalizedJob, SourceResult } from "@/lib/jobs/types";
import {
  createJob,
  extractEmail,
  fetchText,
  jobType,
  matchesSearchTerms,
  parseDate,
  plainText,
  safeUrl,
  SourceError,
  type Fetcher,
} from "./shared";

interface TechnoparkListing {
  title: string;
  sourceUrl: string;
}

function technoparkUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "", "https://technopark.in");
    return url.origin === "https://technopark.in" &&
      /^\/job-details\/\d+\/?$/i.test(url.pathname) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseTechnoparkCrawl(html: string): TechnoparkListing[] {
  const $ = load(html);
  const listings: TechnoparkListing[] = [];
  $('a[href*="/job-details/"]').each((_, element) => {
    const sourceUrl = technoparkUrl($(element).attr("href"));
    const title = plainText($(element).text()).replace(/\s+/g, " ");
    if (!sourceUrl || !title) return;
    if (!listings.some((item) => item.sourceUrl === sourceUrl))
      listings.push({ title, sourceUrl });
  });
  if (!listings.length && !/no (?:jobs|results|records|data)/i.test($.text())) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "Technopark's job list format has changed.",
    );
  }
  return listings;
}

function field(text: string, label: string): string | null {
  const match = text.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, "i"));
  return match?.[1]?.trim() ?? null;
}

function companyFromPage($: ReturnType<typeof load>, text: string): string {
  const companyLink = $("a")
    .filter((_, element) => {
      const href = $(element).attr("href") ?? "";
      const value = $(element).text().trim();
      return (
        value.length > 1 &&
        !/all jobs|careers|privacy|login|visitor/i.test(value) &&
        !/job-details|job-search|news|tenders|events|blog/i.test(href)
      );
    })
    .first()
    .text()
    .trim();
  return companyLink || field(text, "Company") || "Not specified";
}

/**
 * Links back into Technopark's own navigation, the Kerala Government / Kerala IT
 * logos, app store badges and social profiles are page furniture, not a way to
 * apply for the vacancy.
 */
function isNavigationLink(value: string): boolean {
  const url = new URL(value);
  if (/(?:^|\.)technopark\.in$/i.test(url.hostname)) {
    return !/^\/job-details\/\d+\/?$/i.test(url.pathname);
  }
  return /(?:^|\.)(?:kerala\.gov\.in|keralait\.org|facebook\.com|twitter\.com|x\.com|youtube\.com|instagram\.com|linkedin\.com|apps\.apple\.com|play\.google\.com)$/i.test(
    url.hostname,
  );
}

export function parseTechnoparkDetail(
  html: string,
  listing: TechnoparkListing,
  now = Date.now(),
): NormalizedJob | null {
  const $ = load(html);
  // The site chrome carries the Kerala Government and Kerala IT logos, app store
  // badges and social links. None of them are application paths for this vacancy.
  $("header, footer, nav").remove();
  const title = plainText($("h1").first().text()) || listing.title;
  if (!title) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "Technopark's job detail format has changed.",
    );
  }
  const text = plainText($("body").html() ?? html);
  const closingDate = parseDate(field(text, "Closing Date") ?? undefined).date;
  if (closingDate && Date.parse(closingDate) + 86_400_000 <= now) return null;
  const published = parseDate(field(text, "Job Published") ?? undefined);
  const email = extractEmail(field(text, "Contact Email") ?? "") ?? extractEmail(text);
  const bodyStart = text.search(/Brief Description|Preferred Skills/i);
  const description = bodyStart >= 0 ? text.slice(bodyStart) : text;
  const applyPattern = /apply|application|career|recruit|vacanc|hiring|forms\./i;
  const applyCandidates: { label: string; url: string }[] = [];
  const companySites: { label: string; url: string }[] = [];
  $("a[href]").each((_, element) => {
    const url = safeUrl($(element).attr("href"));
    if (!url || isNavigationLink(url)) return;
    const label = plainText($(element).text()).replace(/\s+/g, " ");
    // Match on the page's own wording only; a fallback label must never qualify a link.
    if (applyPattern.test(`${url} ${label}`)) {
      applyCandidates.push({
        label:
          !label || /^https?:\/\//i.test(label)
            ? /forms\./i.test(url)
              ? "Open application form"
              : "Apply on company website"
            : label,
        url,
      });
    } else {
      // Whatever else remains in the vacancy panel is the employer's own site.
      companySites.push({ label: "Company website", url });
    }
  });
  // Employers often paste an application form or careers URL into the description itself.
  for (const match of description.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const url = safeUrl(match[0].replace(/[),.;:]+$/, ""));
    const context = description.slice(
      Math.max(0, match.index - 160),
      match.index + match[0].length,
    );
    if (url && !isNavigationLink(url) && applyPattern.test(`${url} ${context}`)) {
      applyCandidates.push({
        label: /forms\./i.test(url)
          ? "Open application form"
          : "Apply on company website",
        url,
      });
    }
  }
  const candidates = [...applyCandidates, ...companySites];
  const applicationLinks = candidates.filter(
    (item, index) =>
      candidates.findIndex((other) => other.url === item.url) === index,
  );
  const applyUrl = applicationLinks.find((item) =>
    applyCandidates.some((candidate) => candidate.url === item.url),
  )?.url;
  const location = matchesLocation(text, "thiruvananthapuram")
    ? `${locations.thiruvananthapuram.label}, Kerala`
    : matchesLocation(text, "thrissur")
      ? `${locations.thrissur.label}, Kerala`
      : "Technopark, Kerala";
  return createJob("technopark", {
    title,
    company: companyFromPage($, text),
    location,
    locationBasis: "company",
    datePosted: published.date,
    datePostedIsApproximate: published.approximate,
    sourceUrl: listing.sourceUrl,
    applyUrl: applyUrl ?? null,
    applicationLinks,
    applicationEmail: email,
    closingDate,
    description,
    jobType: jobType(`${title}\n${description}`),
  });
}

export const TECHNOPARK_DETAIL_LIMIT = 35;

function listingId(listing: TechnoparkListing): number {
  return Number(listing.sourceUrl.match(/\/job-details\/(\d+)/)?.[1] ?? 0);
}

/**
 * The crawl page lists every open vacancy oldest first, so reading from the top
 * surfaced stale postings. Read the newest listings instead, and among those
 * look first at titles that name the role so detail fetches are not wasted.
 */
export function newestListings(
  listings: TechnoparkListing[],
  query: string,
  limit = TECHNOPARK_DETAIL_LIMIT,
): TechnoparkListing[] {
  const newestFirst = [...listings].sort((a, b) => listingId(b) - listingId(a));
  const titled = newestFirst.filter((row) =>
    matchesSearchTerms(row.title, query),
  );
  const rest = newestFirst.filter((row) => !titled.includes(row));
  return [...titled, ...rest].slice(0, limit);
}

function matchesQuery(job: NormalizedJob, query: string): boolean {
  const text = `${job.title} ${job.company} ${job.description}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ");
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => !["job", "jobs", "in", "and"].includes(word))
    .every((word) => text.includes(word.replace(/^developers?$/, "developer")));
}

export async function fetchTechnopark(
  params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<SourceResult> {
  const html = await fetchText("https://technopark.in/job-crawl", signal, fetcher, {
    Accept: "text/html",
  });
  const listings = parseTechnoparkCrawl(html);
  const rows = newestListings(listings, params.query);
  const jobs: NormalizedJob[] = [];
  let index = 0;
  let failures = 0;
  async function worker() {
    while (index < rows.length && !signal.aborted) {
      const row = rows[index++];
      try {
        const detailHtml = await fetchText(row.sourceUrl, signal, fetcher, {
          Accept: "text/html",
        });
        const job = parseTechnoparkDetail(detailHtml, row);
        if (
          job &&
          matchesQuery(job, params.query) &&
          matchesLocation(job.location, params.location)
        )
          jobs.push(job);
      } catch {
        failures++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  if (signal.aborted)
    throw new SourceError("TIMEOUT", "Technopark took too long to respond.");
  if (rows.length && failures === rows.length)
    throw new SourceError(
      "UPSTREAM_ERROR",
      "Technopark's job detail pages are temporarily unavailable.",
    );
  return {
    jobs,
    hasMore: listings.length > rows.length,
    warnings: failures
      ? [`${failures} Technopark job detail pages could not be read.`]
      : [],
  };
}

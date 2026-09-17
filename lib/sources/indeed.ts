import { load } from "cheerio";
import { classifyApplyLink } from "@/lib/jobs/apply-links";
import { isCategoryTitle, sanitizeJobLinks } from "@/lib/jobs/validate";
import { googleJobsSearch, hasGoogleJobsProvider, parseGoogleJobsResponse } from "./google-jobs";
import {
  locations,
  matchesLocation,
  type SearchParams,
} from "@/lib/jobs/locations";
import type { SourceResult } from "@/lib/jobs/types";
import {
  createJob,
  extractEmail,
  extractSkills,
  fetchText,
  jobType,
  parseDate,
  plainText,
  SourceError,
  type Fetcher,
} from "./shared";

function indeedUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "", "https://in.indeed.com");
    return url.origin === "https://in.indeed.com" &&
      /^\/(?:rc\/clk|pagead\/clk|viewjob)/i.test(url.pathname) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function lineParts(value: string): string[] {
  return plainText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Indeed's own recency label for a card: "Posted 3 days ago", "Just posted",
 * "Today", or "Employer Active 2 days ago". That is the source's date, not ours;
 * it is always relative, so the result is marked approximate.
 */
export function indeedPostedDate(
  lines: string[],
  now = Date.now(),
): { date: string | null; approximate: boolean } {
  for (const line of lines) {
    const match = line.match(
      /(?:^|\b)(?:posted|employer\s*active|active)?\s*(just posted|today|yesterday|\d+\+?\s*(?:minute|hour|day|week|month)s?\s+ago)\b/i,
    );
    if (match) return parseDate(match[1], now);
  }
  return { date: null, approximate: false };
}

export function parseIndeedListings(
  html: string,
  params: SearchParams,
): SourceResult {
  const $ = load(html);
  const seen = new Set<string>();
  const jobs = $(
    'a[href*="/rc/clk"], a[href*="/pagead/clk"], a[href*="/viewjob"]',
  )
    .toArray()
    .flatMap((element) => {
      const sourceUrl = indeedUrl($(element).attr("href"));
      const title = plainText($(element).text()).replace(/\s+/g, " ");
      if (!sourceUrl || !title || seen.has(sourceUrl)) return [];
      seen.add(sourceUrl);
      const container = $(element).closest("li, div").first();
      const lines = lineParts(container.html() ?? container.text());
      const titleIndex = Math.max(
        0,
        lines.findIndex((line) => line.includes(title)),
      );
      const afterTitle = lines.slice(titleIndex + 1);
      const location =
        afterTitle.find((line) => matchesLocation(line, params.location)) ??
        afterTitle.find((line) => /kerala|remote/i.test(line)) ??
        "India";
      const company =
        afterTitle.find(
          (line) =>
            line !== location &&
            !/view similar|view all|salary search|posted|employer/i.test(line),
        ) ?? "Not specified";
      const description = afterTitle
        .filter(
          (line) =>
            !/view all|salary search|people also searched|return to search/i.test(
              line,
            ),
        )
        .slice(1, 8)
        .join("\n");
      if (!matchesLocation(location, params.location)) return [];
      const posted = indeedPostedDate(lines);
      return [
        createJob("indeed", {
          title,
          company,
          location,
          locationBasis: "job",
          datePosted: posted.date,
          datePostedIsApproximate: posted.approximate,
          sourceUrl,
          applyUrl: sourceUrl,
          applicationLinks: [{ label: "Apply on Indeed", url: sourceUrl }],
          applicationEmail: extractEmail(description),
          description: description || title,
          jobType: jobType(`${title}\n${description}`),
        }),
      ];
    });
  if (!jobs.length && !/no jobs|did not match any jobs/i.test($.text())) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "Indeed returned no readable listings.",
    );
  }
  return {
    jobs,
    hasMore: Boolean($("a[href*='start=']").length),
  };
}

export async function fetchIndeed(
  params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<SourceResult> {
  const url = new URL("https://in.indeed.com/jobs");
  url.search = new URLSearchParams({
    q: params.query,
    l:
      params.location === "kerala"
        ? "Kerala"
        : `${locations[params.location].label}, Kerala`,
    sort: "date",
  }).toString();
  try {
    const html = await fetchText(url, signal, fetcher, {
      Accept: "text/html",
      "Accept-Language": "en-IN,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });
    return parseIndeedListings(html, params);
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    return fetchIndeedViaSerpApi(params, signal, fetcher);
  }
}

/**
 * Google's web index only surfaces Indeed's "N developer jobs in Kerala"
 * category pages, never a vacancy, so a plain web search cannot stand in for
 * the blocked listing page. Google Jobs returns the actual postings, each with
 * the boards that carry it. Only postings that Indeed itself hosts are labelled
 * Indeed here; everything else belongs to web discovery, which shares the same
 * lookup so the provider is called once per search.
 */
export function parseSerpApiJobs(
  data: unknown,
  params: SearchParams,
  now = Date.now(),
): SourceResult {
  const rows = parseGoogleJobsResponse(data);
  const jobs = rows.flatMap((row) => {
    const title = plainText(row.title ?? "").replace(/\s+/g, " ");
    const location = plainText(row.location ?? "").replace(/\s+/g, " ");
    const remote = Boolean(row.detected_extensions?.work_from_home) || /anywhere|remote|work from home/i.test(location);
    if (
      !title ||
      isCategoryTitle(title) ||
      (!remote && !matchesLocation(location, params.location))
    )
      return [];
    const options = (row.apply_options ?? []).flatMap((option) => {
      const verdict = classifyApplyLink(option.link, `apply ${option.title}`);
      return verdict.kind === "apply" ? [{ label: `Apply on ${option.title}`, url: verdict.url }] : [];
    });
    const indeedOption = options.find((option) =>
      /(?:^|\.)indeed\.com$/i.test(new URL(option.url).hostname),
    );
    // A posting Indeed does not carry is not an Indeed result.
    if (!indeedOption) return [];
    const applicationLinks = [
      indeedOption,
      ...options.filter((option) => option.url !== indeedOption.url),
    ];
    const posted = parseDate(row.detected_extensions?.posted_at ?? row.posted_at, now);
    const description = plainText(row.description ?? "") || title;
    const job = createJob("indeed", {
      title,
      company: plainText(row.company_name ?? "") || "Not specified",
      location: remote
        ? params.location === "kerala"
          ? "Remote (Kerala search)"
          : `Remote (${locations[params.location].label} search)`
        : location,
      locationBasis: "job",
      sourceUrl: indeedOption.url,
      applyUrl: indeedOption.url,
      applicationLinks,
      applicationEmail: extractEmail(description),
      description,
      datePosted: posted.date,
      datePostedIsApproximate: posted.approximate,
      jobType: jobType(
        `${title}
${row.detected_extensions?.schedule_type ?? ""}
${description}`,
      ),
      salary: row.detected_extensions?.salary?.slice(0, 160) ?? null,
      skills: extractSkills(`${title}
${description}`),
    });
    return [sanitizeJobLinks(job)];
  });
  return {
    jobs,
    hasMore: false,
    warnings: [
      "Indeed blocked direct access; these postings came from Google Jobs, which lists Indeed alongside other boards.",
    ],
  };
}

async function fetchIndeedViaSerpApi(
  params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher,
): Promise<SourceResult> {
  if (!hasGoogleJobsProvider())
    throw new SourceError(
      "UPSTREAM_BLOCKED",
      "Indeed blocked automated access and no fallback search key is configured.",
    );
  const rows = await googleJobsSearch(params, signal, fetcher);
  return parseSerpApiJobs({ jobs_results: rows }, params);
}

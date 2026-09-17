import { load } from "cheerio";
import {
  matchesLocation,
  type SearchParams,
} from "@/lib/jobs/locations";
import type { NormalizedJob, SourceResult } from "@/lib/jobs/types";
import {
  createJob,
  extractEmail,
  extractSkills,
  fetchText,
  jobType,
  matchesSearchTerms,
  parseDate,
  plainText,
  SourceError,
  type Fetcher,
} from "./shared";

interface UlCyberparkListing {
  title: string;
  company: string;
  closingDate: string | null;
  sourceUrl: string;
}

function ulCyberparkUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "", "https://www.ulcyberpark.com");
    return /^https:\/\/(?:www\.)?ulcyberpark\.com$/i.test(url.origin) &&
      /^\/jobs\/(?:index(?:\/\d+)?|job_vacancy)$/i.test(url.pathname) &&
      (!url.search || /^job_id=\d+$/i.test(url.searchParams.toString())) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseUlCyberparkListings(
  html: string,
  now = Date.now(),
): { rows: UlCyberparkListing[]; nextPages: string[] } {
  const $ = load(html);
  const rows: UlCyberparkListing[] = [];
  $(".table-job tr").each((_, row) => {
    const cells = $(row).find("td");
    const sourceUrl = ulCyberparkUrl(
      cells.eq(2).find("a[href*='job_vacancy']").attr("href"),
    );
    if (cells.length < 3 || !sourceUrl) return;
    const rawTitle = plainText(cells.eq(0).find("a").first().text());
    const fallbackTitle = plainText(cells.eq(0).text()).replace(
      /\s*closing date\s*:?.*$/i,
      "",
    );
    const closingDate = parseDate(
      cells.eq(0).text().match(/closing date\s*:?\s*([^\n]+)/i)?.[1],
    ).date;
    if (closingDate && Date.parse(closingDate) + 86_400_000 <= now) return;
    const title = rawTitle || fallbackTitle;
    const company = plainText(cells.eq(1).text()) || "Not specified";
    if (title) rows.push({ title, company, closingDate, sourceUrl });
  });
  if (!rows.length && !/no (?:jobs|results|records|data)/i.test($.text())) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "UL CyberPark's job list format has changed.",
    );
  }
  const nextPages = [
    ...new Set(
      $("a[href*='/jobs/index/']")
        .toArray()
        .flatMap((element) => {
          const url = ulCyberparkUrl($(element).attr("href"));
          return url ? [url] : [];
        }),
    ),
  ];
  return { rows, nextPages };
}

function headingSection($: ReturnType<typeof load>, label: RegExp): string {
  const heading = $(".job_title")
    .filter((_, element) => label.test($(element).text()))
    .first();
  return heading.length ? plainText(heading.nextUntil(".job_title").text()) : "";
}

export function parseUlCyberparkDetail(
  html: string,
  listing: UlCyberparkListing,
  now = Date.now(),
): NormalizedJob | null {
  const $ = load(html);
  const body = $(".job_border").first();
  if (!body.length) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "UL CyberPark's job detail format has changed.",
    );
  }
  const title = plainText(body.find(".main_title_head").first().text()) || listing.title;
  const closingDate =
    parseDate(body.find(".sub_title").first().text().replace(/^closing date\s*:?\s*/i, "")).date ??
    listing.closingDate;
  if (closingDate && Date.parse(closingDate) + 86_400_000 <= now) return null;
  const description = headingSection($, /job description/i) || plainText(body.text());
  const skillsText = headingSection($, /job skills/i);
  const fullText = `${title}\n${description}\n${skillsText}`;
  const contactText = plainText(
    (body.html() ?? body.text()).replace(/></g, ">\n<"),
  );
  return createJob("ul-cyberpark", {
    title,
    company: listing.company,
    location: "UL CyberPark, Kozhikode, Kerala",
    locationBasis: "company",
    closingDate,
    sourceUrl: listing.sourceUrl,
    applyUrl: listing.sourceUrl,
    applicationLinks: [
      { label: "View details on UL CyberPark", url: listing.sourceUrl },
    ],
    applicationEmail: extractEmail(contactText),
    description: skillsText ? `${description}\n\nJob Skills\n${skillsText}` : description,
    jobType: jobType(fullText),
    experience:
      fullText.match(/\bexperience\s*:?\s*([^\n.]+)/i)?.[1]?.trim() ?? null,
    skills: extractSkills(fullText),
  });
}

export async function fetchUlCyberpark(
  params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<SourceResult> {
  const firstHtml = await fetchText(
    "https://www.ulcyberpark.com/jobs",
    signal,
    fetcher,
    { Accept: "text/html" },
  );
  const first = parseUlCyberparkListings(firstHtml);
  const pageRows = [first.rows];
  const warnings: string[] = [];
  for (const pageUrl of first.nextPages.slice(0, 1)) {
    try {
      pageRows.push(
        parseUlCyberparkListings(
          await fetchText(pageUrl, signal, fetcher, { Accept: "text/html" }),
        ).rows,
      );
    } catch {
      warnings.push("An additional UL CyberPark listing page could not be read.");
    }
  }
  const rows = pageRows.flat().slice(0, 25);
  const jobs: NormalizedJob[] = [];
  let index = 0;
  let failures = 0;
  async function worker() {
    while (index < rows.length && !signal.aborted) {
      const row = rows[index++];
      try {
        const job = parseUlCyberparkDetail(
          await fetchText(row.sourceUrl, signal, fetcher, {
            Accept: "text/html",
          }),
          row,
        );
        if (
          job &&
          matchesSearchTerms(`${job.title} ${job.company} ${job.description}`, params.query) &&
          matchesLocation(job.location, params.location)
        ) {
          jobs.push(job);
        }
      } catch {
        failures++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  if (signal.aborted)
    throw new SourceError("TIMEOUT", "UL CyberPark took too long to respond.");
  if (rows.length && failures === rows.length)
    throw new SourceError(
      "UPSTREAM_ERROR",
      "UL CyberPark's job detail pages are temporarily unavailable.",
    );
  if (failures)
    warnings.push(`${failures} UL CyberPark job detail pages could not be read.`);
  return { jobs, hasMore: first.nextPages.length > 0, warnings };
}

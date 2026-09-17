import { load } from "cheerio";
import { z } from "zod";
import {
  locations,
  matchesLocation,
  type SearchParams,
} from "@/lib/jobs/locations";
import type { NormalizedJob, SourceResult } from "@/lib/jobs/types";
import {
  createJob,
  extractEmail,
  fetchJson,
  fetchText,
  jobType,
  parseDate,
  plainText,
  safeUrl,
  SourceError,
  type Fetcher,
} from "./shared";

interface InfoparkListing {
  title: string;
  company: string;
  datePosted: string | null;
  closingDate: string | null;
  sourceUrl: string;
}

function infoparkUrl(
  value: string | undefined,
  kind: "job" | "profile",
): string | null {
  try {
    const url = new URL(value ?? "", "https://infopark.in");
    const allowed =
      kind === "job"
        ? /^\/(company-jobs\/details\/\d+\/\d+|jobs\/[a-z0-9-]+\/[a-z0-9-]+)\/?$/i
        : /^\/companies\/profile\/\d+\/?$/;
    return url.origin === "https://infopark.in" &&
      allowed.test(url.pathname) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseInfoparkListings(
  html: string,
  now = Date.now(),
): InfoparkListing[] {
  const $ = load(html);
  if (
    !$("table").length &&
    !/no (?:jobs|results|records|data)/i.test($.text())
  ) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "Infopark's listing format has changed.",
    );
  }
  const jobs: InfoparkListing[] = [];
  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const sourceUrl = infoparkUrl(
      cells.find("a[href]").first().attr("href"),
      "job",
    );
    if (cells.length < 5 || !sourceUrl) return;
    const title = cells.eq(1).text().trim();
    const company = cells.eq(2).text().trim();
    const closingDate = parseDate(cells.eq(3).text().trim()).date;
    // A deadline remains open through the end of that day in India.
    if (closingDate && Date.parse(closingDate) + 86_400_000 <= now) return;
    if (title && company)
      jobs.push({
        title,
        company,
        sourceUrl,
        closingDate,
        datePosted: parseDate(cells.eq(0).text().trim()).date,
      });
  });
  return jobs;
}

function explicitLocation(description: string): string | null {
  const match = description.match(
    /(?:^|\n)[^\p{L}\p{N}\n]*(?:(?:job|work|office)\s+)?location\s*[:–-]\s*([^\n]+)/iu,
  );
  return match?.[1]?.trim().slice(0, 160) || null;
}

export function parseInfoparkDetail(
  html: string,
  listing: InfoparkListing,
): { job: NormalizedJob; profileUrl: string | null } {
  const $ = load(html);
  const detail = $(".comp-job-deatiil .deatil-box").first();
  if (!detail.length)
    throw new SourceError(
      "INVALID_RESPONSE",
      "Infopark's job detail format has changed.",
    );
  const description = plainText(detail.html() ?? "");
  // Restrict extraction to this vacancy, never the company header or site's footer.
  const applicationEmail =
    extractEmail(detail.find(".contact").text()) ?? extractEmail(description);
  const candidates: { label: string; url: string }[] = [];
  detail.find("a[href]").each((_, element) => {
    const url = safeUrl($(element).attr("href"));
    const context = `${$(element).text()} ${$(element).parent().text()}`;
    if (
      url &&
      /apply|application|register|career|form|vacan|recruit|job/i.test(
        `${url} ${context}`,
      )
    ) {
      candidates.push({
        label: $(element).text().trim() || "Apply on company website",
        url,
      });
    }
  });
  for (const match of description.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = safeUrl(match[0].replace(/[),.;]+$/, ""));
    const context = description.slice(
      Math.max(0, match.index - 180),
      match.index + match[0].length,
    );
    if (
      url &&
      /apply|application|register|career|form|vacan|recruit|job/i.test(
        `${url} ${context}`,
      )
    ) {
      candidates.push({
        label: /forms\./i.test(url)
          ? "Open application form"
          : "Apply on company website",
        url,
      });
    }
  }
  const applicationLinks = candidates.filter(
    (item, index) =>
      candidates.findIndex((other) => other.url === item.url) === index,
  );
  const location = explicitLocation(description);
  return {
    job: createJob("infopark", {
      ...listing,
      description,
      applicationEmail,
      applicationLinks,
      applyUrl: applicationLinks[0]?.url ?? null,
      location: location ?? "Kerala (city not specified)",
      locationBasis: location ? "job" : "unknown",
      jobType: jobType(
        `${listing.title}\n${description.match(/(?:employment|job) type\s*:[^\n]+/i)?.[0] ?? ""}`,
      ),
    }),
    profileUrl: infoparkUrl(
      $(".carer-box a[href*='/companies/profile/']").attr("href"),
      "profile",
    ),
  };
}

function matchesQuery(job: NormalizedJob, query: string): boolean {
  const text = `${job.title} ${job.description}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ");
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => !["job", "jobs", "in", "and"].includes(word))
    .every((word) => {
      const term = word
        .replace(/^developers?$|^development$/, "develop")
        .replace(/^engineers$/, "engineer");
      return text.includes(term);
    });
}

export async function fetchInfopark(
  params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<SourceResult> {
  const url = new URL("https://infopark.in/companies-job/0");
  // The public UI's AJAX endpoint ranks matching listings before fallback rows.
  // Use its primary keyword, then verify ALL requested terms ourselves against each vacancy.
  const term =
    params.query
      .split(/\s+/)
      .find(
        (word) => !["senior", "junior", "lead", "job", "jobs"].includes(word),
      ) ?? params.query;
  url.searchParams.set("search", term);
  const response = await fetchJson(url, signal, fetcher, {
    "X-Requested-With": "XMLHttpRequest",
  });
  const parsed = z
    .object({ all_jobs: z.string(), pagination: z.string() })
    .safeParse(response);
  if (!parsed.success)
    throw new SourceError(
      "INVALID_RESPONSE",
      "Infopark returned an unexpected search response.",
    );
  const rows = parseInfoparkListings(parsed.data.all_jobs).slice(0, 20);
  const pagination = load(parsed.data.pagination);
  const hasMore = pagination("a[href*='page=']").length > 0;
  const profiles = new Map<string, Promise<string | null>>();
  const jobs: NormalizedJob[] = [];
  let index = 0;
  let failures = 0;
  let unknownLocations = 0;
  async function worker() {
    while (index < rows.length && !signal.aborted) {
      const row = rows[index++];
      try {
        const html = await fetchText(row.sourceUrl, signal, fetcher, {
          Accept: "text/html",
        });
        const detail = parseInfoparkDetail(html, row);
        if (!matchesQuery(detail.job, params.query)) continue;
        if (detail.job.locationBasis === "unknown" && detail.profileUrl) {
          let profile = profiles.get(detail.profileUrl);
          if (!profile) {
            profile = fetchText(detail.profileUrl, signal, fetcher, {
              Accept: "text/html",
            })
              .then((html) => {
                const $ = load(html);
                return (
                  $(".carer-box .con > span").first().text().trim() || null
                );
              })
              .catch(() => null);
            profiles.set(detail.profileUrl, profile);
          }
          const address = await profile;
          if (address) {
            const city = (Object.keys(locations) as (keyof typeof locations)[])
              .filter((key) => key !== "kerala")
              .find((key) => matchesLocation(address, key));
            if (city || /cherthala/i.test(address)) {
              detail.job.location = city
                ? `${locations[city].label}, Kerala`
                : "Cherthala, Kerala";
              detail.job.locationBasis = "company";
            }
          }
        }
        if (
          detail.job.locationBasis === "unknown" &&
          params.location !== "kerala"
        )
          unknownLocations++;
        if (matchesLocation(detail.job.location, params.location))
          jobs.push(detail.job);
      } catch {
        failures++;
      }
    }
  }
  // Bounded concurrency avoids fetching every job page at once.
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  if (signal.aborted)
    throw new SourceError("TIMEOUT", "Infopark took too long to respond.");
  if (rows.length && failures === rows.length)
    throw new SourceError(
      "UPSTREAM_ERROR",
      "Infopark's job detail pages are temporarily unavailable.",
    );
  const warnings = [];
  if (failures)
    warnings.push(`${failures} Infopark job detail pages could not be read.`);
  if (unknownLocations)
    warnings.push(
      `${unknownLocations} Infopark listings were omitted because their city could not be confirmed.`,
    );
  return { jobs, hasMore, warnings };
}

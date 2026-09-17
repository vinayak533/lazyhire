import { load } from "cheerio";
import {
  matchesLocation,
  type KeralaLocation,
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

interface EvaniosListing {
  title: string;
  company: string;
  location: string;
  jobTypeLabel: string;
  sourceUrl: string;
  applyUrl: string | null;
  description: string;
}

const locationPaths: Partial<Record<KeralaLocation, string>> = {
  thiruvananthapuram: "/kerala/thiruvananthapuram/jobs",
  kollam: "/kerala/kollam/jobs",
  ernakulam: "/kerala/ernakulam/jobs",
  kochi: "/kerala/ernakulam/jobs",
  thrissur: "/kerala/thrissur/jobs",
  kozhikode: "/kerala/kozhikode/jobs",
  kannur: "/kerala/kannur/jobs",
};

function evaniosUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "", "https://www.evaniosjobs.com");
    const allowed =
      url.origin === "https://www.evaniosjobs.com" &&
      (/^\/(?:job-search|find-jobs|jobs-in-kerala|kerala\/[a-z-]+\/jobs)\/?$/i.test(
        url.pathname,
      ) ||
        /^\/job-(?:details|apply)\/\d+\/[a-z0-9-]+\/?$/i.test(
          url.pathname,
        ));
    return allowed && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function fieldMap($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>) {
  const fields = new Map<string, string>();
  root.find(".job-dt-tbl, .job-details__list, li").each((_, element) => {
    const label = plainText(
      $(element).find(".job-dt-label, .job-details__list-label").first().text(),
    );
    const value = plainText(
      $(element).find(".job-dt-text, .job-details__list-value").first().text(),
    );
    if (label && value) fields.set(label.toLowerCase(), value);
  });
  return fields;
}

export function parseEvaniosListings(html: string): EvaniosListing[] {
  const $ = load(html);
  const cards = $(".job-item.job-card").toArray();
  const rows = cards.flatMap((card) => {
    const root = $(card);
    const sourceUrl = evaniosUrl(
      root.find("a[href*='/job-details/']").first().attr("href"),
    );
    if (!sourceUrl) return [];
    const applyUrl = evaniosUrl(
      root.find("a[href*='/job-apply/']").first().attr("href"),
    );
    const title = plainText(root.find(".job-card__title").first().text());
    const location = plainText(root.find(".job-card__title-loc").first().text());
    const jobTypeLabel = plainText(root.find(".job-card__badge").first().text());
    const fields = fieldMap($, root);
    const companyType = fields.get("comp. type");
    return title && location
      ? [
          {
            title,
            company: "Not specified",
            location,
            jobTypeLabel,
            sourceUrl,
            applyUrl,
            description: companyType ? `Company type: ${companyType}` : title,
          },
        ]
      : [];
  });
  if (!rows.length && !/no (?:jobs|results|records|data)/i.test($.text())) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "Evanios Jobs returned no readable listings.",
    );
  }
  return rows.filter(
    (row, index, all) =>
      all.findIndex((other) => other.sourceUrl === row.sourceUrl) === index,
  );
}

function detailField(fields: Map<string, string>, label: string) {
  return fields.get(label.toLowerCase()) ?? null;
}

export function parseEvaniosDetail(
  html: string,
  listing: EvaniosListing,
  now = Date.now(),
): NormalizedJob | null {
  const $ = load(html);
  const root = $(".job-details__content-wrap").first();
  if (!root.length) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "Evanios Jobs' detail format has changed.",
    );
  }
  const fields = fieldMap($, root);
  const title =
    plainText(root.find(".job-details__title-name").first().text()) ||
    listing.title;
  const location =
    plainText(root.find(".job-details__header-subleft").first().text()) ||
    listing.location;
  const typeLabel =
    detailField(fields, "Job Type") ||
    plainText(root.find(".job-details__header-subright").first().text()) ||
    listing.jobTypeLabel;
  const posted = parseDate(detailField(fields, "Posted on") ?? undefined);
  const closingDate = parseDate(detailField(fields, "Expires on") ?? undefined).date;
  if (closingDate && Date.parse(closingDate) + 86_400_000 <= now) return null;
  const salary = detailField(fields, "Monthly Salary");
  const experience = detailField(fields, "Minimum Experience");
  const companyType = detailField(fields, "Company Type");
  const description = plainText(root.find(".job-details__desc").first().text());
  const fullText = [
    description,
    companyType ? `Company type: ${companyType}` : "",
    salary ? `Salary: ${salary}` : "",
    experience ? `Experience: ${experience}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const applyUrl =
    evaniosUrl(root.find("a[href*='/job-apply/']").first().attr("href")) ??
    listing.applyUrl;
  return createJob("evanios", {
    title,
    company: listing.company,
    location,
    locationBasis: "job",
    sourceUrl: listing.sourceUrl,
    applyUrl,
    applicationLinks: applyUrl
      ? [{ label: "Apply on Evanios Jobs", url: applyUrl }]
      : [{ label: "View details on Evanios Jobs", url: listing.sourceUrl }],
    applicationEmail: extractEmail(root.text()),
    description: fullText || listing.description,
    datePosted: posted.date,
    datePostedIsApproximate: posted.approximate,
    closingDate,
    jobType: jobType(typeLabel),
    experience,
    salary,
    skills: extractSkills(`${title}\n${fullText}`),
  });
}

function evaniosSearchUrls(location: KeralaLocation): string[] {
  const urls = [
    locationPaths[location]
      ? `https://www.evaniosjobs.com${locationPaths[location]}`
      : "https://www.evaniosjobs.com/find-jobs",
    "https://www.evaniosjobs.com/job-search",
  ];
  if (location === "kerala") urls.push("https://www.evaniosjobs.com/");
  return [...new Set(urls)];
}

export async function fetchEvanios(
  params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<SourceResult> {
  const listingGroups: EvaniosListing[][] = [];
  const warnings: string[] = [];
  for (const url of evaniosSearchUrls(params.location)) {
    try {
      listingGroups.push(
        parseEvaniosListings(
          await fetchText(url, signal, fetcher, {
            Accept: "text/html",
            "Accept-Language": "en-IN,en;q=0.9",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          }),
        ),
      );
    } catch {
      warnings.push("An Evanios Jobs listing page could not be read.");
    }
  }
  const rows = listingGroups
    .flat()
    .filter(
      (row, index, all) =>
        all.findIndex((other) => other.sourceUrl === row.sourceUrl) === index,
    )
    .filter(
      (row) =>
        matchesLocation(row.location, params.location) &&
        matchesSearchTerms(`${row.title} ${row.description}`, params.query),
    )
    .slice(0, 18);
  const jobs: NormalizedJob[] = [];
  let index = 0;
  let failures = 0;
  async function worker() {
    while (index < rows.length && !signal.aborted) {
      const row = rows[index++];
      try {
        const job = parseEvaniosDetail(
          await fetchText(row.sourceUrl, signal, fetcher, {
            Accept: "text/html",
            "Accept-Language": "en-IN,en;q=0.9",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          }),
          row,
        );
        if (
          job &&
          matchesLocation(job.location, params.location) &&
          matchesSearchTerms(`${job.title} ${job.description}`, params.query)
        ) {
          jobs.push(job);
        }
      } catch {
        failures++;
        jobs.push(
          createJob("evanios", {
            ...row,
            locationBasis: "job",
            applyUrl: row.applyUrl,
            applicationLinks: row.applyUrl
              ? [{ label: "Apply on Evanios Jobs", url: row.applyUrl }]
              : [{ label: "View details on Evanios Jobs", url: row.sourceUrl }],
            jobType: jobType(row.jobTypeLabel),
            skills: extractSkills(`${row.title}\n${row.description}`),
          }),
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker));
  if (signal.aborted)
    throw new SourceError("TIMEOUT", "Evanios Jobs took too long to respond.");
  if (!listingGroups.length)
    throw new SourceError(
      "UPSTREAM_ERROR",
      "Evanios Jobs is temporarily unavailable.",
    );
  if (failures)
    warnings.push(`${failures} Evanios job detail pages could not be read.`);
  return { jobs, hasMore: listingGroups.flat().length > rows.length, warnings };
}

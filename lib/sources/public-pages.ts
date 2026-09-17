import { load } from "cheerio";
import type { SearchParams } from "@/lib/jobs/locations";
import type { SourceResult } from "@/lib/jobs/types";
import { fetchText, SourceError, type Fetcher } from "./shared";

function pageLooksReadable(html: string, required: RegExp, source: string) {
  const $ = load(html);
  const text = $.text();
  if (!required.test(text)) {
    throw new SourceError(
      "INVALID_RESPONSE",
      `${source} did not return its expected public page.`,
    );
  }
}

export async function fetchKeralaKnowledgeMission(
  _params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<SourceResult> {
  const html = await fetchText(
    "https://knowledgemission.kerala.gov.in/",
    signal,
    fetcher,
    { Accept: "text/html" },
  );
  pageLooksReadable(html, /Digital Workforce Management|Jobseeker/i, "Kerala Knowledge Mission");
  return {
    jobs: [],
    hasMore: false,
    warnings: [
      "Kerala Knowledge Mission requires a jobseeker account for matched vacancies; no public listing feed was exposed.",
    ],
  };
}

export async function fetchJobsNear(
  _params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<SourceResult> {
  const html = await fetchText("https://jobsnear.in/", signal, fetcher, {
    Accept: "text/html",
  });
  pageLooksReadable(html, /JobsNear/i, "JobsNEAR.in");
  return {
    jobs: [],
    hasMore: false,
    warnings: [
      "JobsNEAR.in's current public homepage exposes article content, not readable job listings.",
    ],
  };
}

export async function fetchInternshalaKerala(
  _params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<SourceResult> {
  const html = await fetchText(
    "https://internshala.com/free-job-posting-site-in-kerala/",
    signal,
    fetcher,
    { Accept: "text/html" },
  );
  pageLooksReadable(html, /Internshala|Post a Job|Hire/i, "Internshala Kerala");
  return {
    jobs: [],
    hasMore: false,
    warnings: [
      "Internshala's Kerala page is an employer posting page; job search and job detail paths are not fetched because they are blocked by the site's robots policy.",
    ],
  };
}

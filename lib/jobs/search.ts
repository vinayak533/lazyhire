import { createHash } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { openDatabase } from "@/lib/db/connection";
import { jobsCache } from "@/lib/db/schema";
import { fetchEvanios } from "@/lib/sources/evanios";
import { fetchInfopark } from "@/lib/sources/infopark";
import { fetchIndeed } from "@/lib/sources/indeed";
import {
  fetchInternshalaKerala,
  fetchJobsNear,
  fetchKeralaKnowledgeMission,
} from "@/lib/sources/public-pages";
import {
  createJob,
  fetchJson,
  SourceError,
  withTimeout,
} from "@/lib/sources/shared";
import { fetchTechnopark } from "@/lib/sources/technopark";
import { fetchUlCyberpark } from "@/lib/sources/ul-cyberpark";
import { hasGoogleJobsMemo } from "@/lib/sources/google-jobs";
import { fetchWebDiscovery } from "@/lib/sources/web-discovery";
import { locations, type SearchParams } from "./locations";
import { mergeJobs } from "./merge";
import {
  cachedSearchSchema,
  normalizedJobSchema,
  sourceIds,
  sourceLabels,
  type JobSource,
  type NormalizedJob,
  type SearchPayload,
  type SourceResult,
  type SourceStatus,
} from "./types";
import { sanitizeJobLinks, validateDiscoveredJob } from "./validate";

export const CACHE_TTL_MS = 30 * 60 * 1000;
/** A payload where a source timed out or failed is retried much sooner. */
export const PARTIAL_CACHE_TTL_MS = 5 * 60 * 1000;
export const SOURCE_TIMEOUT_MS = 20_000;
/**
 * Web discovery runs after the direct sources, and only when they left the
 * person with fewer validated openings than this (or when the lookup was
 * already made for Indeed's fallback, in which case it costs nothing).
 */
export const WEB_DISCOVERY_THRESHOLD = 10;
/**
 * Upper bound on how long one search may run overall. Web discovery gets
 * whatever of this remains after the direct sources settle, so a slow provider
 * never adds a second full timeout on top of the first.
 */
export const SEARCH_DEADLINE_MS = 30_000;
/** A dated listing older than this is treated as clearly outdated and dropped. */
export const MAX_LISTING_AGE_MS = 90 * 86_400_000;
export type SourceAdapter = (
  params: SearchParams,
  signal: AbortSignal,
) => Promise<SourceResult>;
const defaultAdapters: Record<JobSource, SourceAdapter> = {
  technopark: fetchTechnopark,
  indeed: fetchIndeed,
  infopark: fetchInfopark,
  "ul-cyberpark": fetchUlCyberpark,
  kkem: fetchKeralaKnowledgeMission,
  jobsnear: fetchJobsNear,
  evanios: fetchEvanios,
  internshala: fetchInternshalaKerala,
  web: fetchWebDiscovery,
};
type Database = ReturnType<typeof openDatabase>["db"];

const sourceDomains: Record<JobSource, string[]> = {
  technopark: ["technopark.in"],
  indeed: ["in.indeed.com"],
  infopark: ["infopark.in"],
  "ul-cyberpark": ["ulcyberpark.com", "www.ulcyberpark.com"],
  kkem: ["knowledgemission.kerala.gov.in"],
  jobsnear: ["jobsnear.in"],
  evanios: ["evaniosjobs.com", "www.evaniosjobs.com"],
  internshala: ["internshala.com"],
  web: [],
};

const nonListingPatterns =
  /salary|career guide|company review|privacy|login|register|free-job-posting|post a job|employer|terms|about|\/q-\S*-jobs\.html|\/jobs\?|^\d+\s.*\bvacancies\b/i;

/**
 * Indeed refuses direct fetches, so its adapter falls through to a search
 * provider; that second hop deserves a little more room than a single page,
 * but never enough to hold every other source's results hostage.
 */
const sourceTimeouts: Partial<Record<JobSource, number>> = {
  indeed: 20_000,
  web: 20_000,
};

export interface SearchResponse extends SearchPayload {
  query: string;
  location: string;
  total: number;
  cache: {
    hit: boolean;
    fetchedAt: string;
    expiresAt: string;
    stored: boolean;
  };
}
export class AllSourcesFailedError extends Error {
  constructor(public sources: SourceStatus[]) {
    super("Job sources are temporarily unavailable. Please try again shortly.");
  }
}

function sourceFromUrl(
  value: string,
  sources: readonly JobSource[],
): JobSource | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return (
      sourceIds.find(
        (source) =>
          sources.includes(source) &&
          sourceDomains[source].some(
            (domain) =>
              url.hostname === domain || url.hostname.endsWith(`.${domain}`),
          ),
      ) ?? null
    );
  } catch {
    return null;
  }
}

async function discoverJobsViaSearch(
  params: SearchParams,
  sources: readonly JobSource[],
  signal: AbortSignal,
): Promise<SearchPayload | null> {
  const key = process.env.SERPAPI_KEY;
  const domains = sources.flatMap((source) => sourceDomains[source]);
  if (!key || !domains.length) return null;
  const siteClause = domains.map((domain) => `site:${domain}`).join(" OR ");
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine: "google",
    api_key: key,
    q: `${params.query} jobs ${locations[params.location].search} (${siteClause})`,
    gl: "in",
    hl: "en",
    num: "20",
  }).toString();
  const data = await fetchJson(url, signal);
  const rows = (data as { organic_results?: unknown[] }).organic_results;
  if (!Array.isArray(rows)) {
    throw new SourceError(
      "INVALID_RESPONSE",
      "Search discovery returned an unexpected response.",
    );
  }
  const jobs = rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const result = row as {
      title?: unknown;
      link?: unknown;
      snippet?: unknown;
      source?: unknown;
    };
    if (typeof result.title !== "string" || typeof result.link !== "string")
      return [];
    const source = sourceFromUrl(result.link, sources);
    const title = result.title
      .replace(
        /\s*[-|]\s*(?:Job Post|Jobs?|Careers?|Indeed|Infopark|Technopark).*$/i,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();
    if (!source || !title || nonListingPatterns.test(`${title} ${result.link}`))
      return [];
    const snippet =
      typeof result.snippet === "string" && result.snippet.trim()
        ? result.snippet.trim()
        : title;
    const job = createJob(source, {
      title,
      company:
        typeof result.source === "string" && result.source.trim()
          ? result.source.trim()
          : sourceLabels[source],
      location:
        params.location === "kerala"
          ? "Kerala"
          : `${locations[params.location].label}, Kerala`,
      locationBasis: "unknown",
      sourceUrl: result.link,
      applyUrl: result.link,
      applicationLinks: [
        { label: `Open on ${sourceLabels[source]}`, url: result.link },
      ],
      description: snippet,
    });
    // A search hit is a lead, not a job, until it passes the same checks as
    // every other discovered posting (single-vacancy URL, real title, location).
    const verdict = validateDiscoveredJob(job, params);
    return verdict.ok ? [verdict.job] : [];
  });
  const merged = mergeJobs(jobs);
  if (!merged.length) return null;
  const counts = new Map<JobSource, number>();
  merged.forEach((job) =>
    counts.set(job.source, (counts.get(job.source) ?? 0) + 1),
  );
  return {
    jobs: merged,
    sources: sources.map((source) => ({
      source,
      label: sourceLabels[source],
      status: counts.has(source) ? "partial" : "ok",
      count: counts.get(source) ?? 0,
      hasMore: false,
      warnings: counts.has(source)
        ? [
            "Direct listing pages returned no matches; verified web discovery filled this source.",
          ]
        : undefined,
    })),
    partial: true,
  };
}

function postedAt(job: NormalizedJob): number {
  const timestamp = job.datePosted ? Date.parse(job.datePosted) : NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/**
 * Chronological order using each source's own published date: newest first,
 * undated listings last. Ties fall back to a stable title/id order.
 */
export function sortNewestFirst(jobs: NormalizedJob[]): NormalizedJob[] {
  return [...jobs].sort(
    (a, b) =>
      postedAt(b) - postedAt(a) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Drops listings whose deadline has passed or whose published date is clearly
 * old, then orders the rest newest first. Applied to fresh and cached results
 * alike, so a cached payload cannot resurface a job that expired since it was
 * stored.
 */
export function freshListings(
  jobs: NormalizedJob[],
  now = Date.now(),
): NormalizedJob[] {
  return sortNewestFirst(
    jobs.filter((job) => {
      // A deadline remains open through the end of that day in India.
      if (job.closingDate && Date.parse(job.closingDate) + 86_400_000 <= now)
        return false;
      const posted = postedAt(job);
      return !Number.isFinite(posted) || now - posted <= MAX_LISTING_AGE_MS;
    }),
  );
}

function withFreshListings(payload: SearchPayload, now: number): SearchPayload {
  // Apply-link rules are enforced here, on fresh and cached payloads alike, so
  // a stale cache row can never resurrect a footer link as an Apply button.
  const jobs = freshListings(payload.jobs.map(sanitizeJobLinks), now);
  const counts = new Map<JobSource, number>();
  jobs.forEach((job) =>
    job.sources.forEach((entry) =>
      counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1),
    ),
  );
  return {
    ...payload,
    jobs,
    sources: payload.sources.map((source) =>
      source.status === "unavailable"
        ? source
        : { ...source, count: counts.get(source.source) ?? 0 },
    ),
  };
}

export function queryHash(
  params: SearchParams,
  sources: readonly JobSource[] = sourceIds,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        // Bumped when result shape or ordering changes so older cached payloads are ignored.
        version: 8,
        query: params.query.trim().toLowerCase().replace(/\s+/g, " "),
        location: params.location,
        sources: [...sources].sort(),
      }),
    )
    .digest("hex");
}

export async function searchJobs(
  params: SearchParams,
  options: {
    db: Database;
    adapters?: Partial<Record<JobSource, SourceAdapter>>;
    now?: () => number;
    sources?: readonly JobSource[];
    timeoutMs?: number;
  },
): Promise<SearchResponse> {
  const {
    db,
    adapters = defaultAdapters,
    now = Date.now,
    sources = sourceIds,
    timeoutMs = SOURCE_TIMEOUT_MS,
  } = options;
  const budgetFor = (source: JobSource) =>
    options.timeoutMs === undefined
      ? (sourceTimeouts[source] ?? timeoutMs)
      : timeoutMs;
  const selectedSources = sourceIds.filter((source) =>
    sources.includes(source),
  );
  const hash = queryHash(params, selectedSources);
  const start = now();
  const row = db
    .select()
    .from(jobsCache)
    .where(eq(jobsCache.queryHash, hash))
    .get();
  function response(
    payload: SearchPayload,
    fetchedAt: number,
    hit: boolean,
    stored: boolean,
  ): SearchResponse {
    return {
      ...payload,
      query: params.query,
      location: params.location,
      total: payload.jobs.length,
      cache: {
        hit,
        fetchedAt: new Date(fetchedAt).toISOString(),
        expiresAt: new Date(fetchedAt + CACHE_TTL_MS).toISOString(),
        stored,
      },
    };
  }
  if (
    row &&
    row.fetchedAt.getTime() <= start &&
    start - row.fetchedAt.getTime() < CACHE_TTL_MS
  ) {
    try {
      const payload = cachedSearchSchema.safeParse(JSON.parse(row.resultsJson));
      const timedOut = payload.success && payload.data.sources.some((source) => source.status === "unavailable");
      // Re-check freshness at read time: a job can expire while the cache is valid.
      // A payload missing a source is served only briefly, so the source gets another chance.
      if (payload.success && !(timedOut && start - row.fetchedAt.getTime() >= PARTIAL_CACHE_TTL_MS))
        return response(
          withFreshListings(payload.data, start),
          row.fetchedAt.getTime(),
          true,
          true,
        );
    } catch {
      /* A corrupt cache entry is a miss, never a broken search. */
    }
  }
  const runSource = (source: JobSource, budget = budgetFor(source)) =>
    withTimeout(
      (signal) => (adapters[source] ?? defaultAdapters[source])(params, signal),
      budget,
    );
  const statuses: SourceStatus[] = [];
  const groups: SourceResult["jobs"][] = [];
  const record = (source: JobSource, result: PromiseSettledResult<SourceResult>) => {
    if (result.status === "fulfilled") {
      const jobs = normalizedJobSchema.array().safeParse(result.value.jobs);
      if (jobs.success) {
        groups.push(jobs.data);
        statuses.push({
          source,
          label: sourceLabels[source],
          status: result.value.warnings?.length ? "partial" : "ok",
          count: jobs.data.length,
          hasMore: result.value.hasMore,
          ...(result.value.warnings?.length
            ? { warnings: result.value.warnings }
            : {}),
        });
        return;
      }
    }
    const error =
      result.status === "rejected" && result.reason instanceof SourceError
        ? result.reason
        : new SourceError(
            "INVALID_RESPONSE",
            "This source could not provide readable results.",
          );
    statuses.push({
      source,
      label: sourceLabels[source],
      status: "unavailable",
      count: 0,
      hasMore: false,
      code: error.code,
      message:
        error.code === "TIMEOUT"
          ? `${sourceLabels[source]} is taking longer than expected. Other job sources were loaded successfully.`
          : error.message,
    });
  };
  // Every direct source runs concurrently under its own deadline, so one slow
  // provider only ever costs its own slot in the results.
  const directSources = selectedSources.filter((source) => source !== "web");
  const results = await Promise.allSettled(directSources.map((source) => runSource(source)));
  results.forEach((result, index) => record(directSources[index], result));
  const directCount = mergeJobs(...groups).length;
  if (selectedSources.includes("web")) {
    // Web discovery fills in when the direct sources ran thin. It also runs
    // when the Google Jobs lookup already happened for Indeed's fallback,
    // because reading that memo costs nothing extra.
    if (directCount < WEB_DISCOVERY_THRESHOLD || hasGoogleJobsMemo(params, now())) {
      const remaining = options.timeoutMs === undefined ? Math.max(4_000, SEARCH_DEADLINE_MS - (now() - start)) : timeoutMs;
      const [result] = await Promise.allSettled([runSource("web", Math.min(budgetFor("web"), remaining))]);
      record("web", result);
    } else {
      statuses.push({
        source: "web",
        label: sourceLabels.web,
        status: "skipped",
        count: 0,
        hasMore: false,
        message: "Direct sources returned enough openings; web discovery was not needed.",
      });
    }
  }
  const fetchedAt = now();
  let payload: SearchPayload = withFreshListings(
    {
      jobs: mergeJobs(...groups),
      sources: statuses,
      partial: statuses.some(
        (source) => source.status !== "ok" && source.status !== "skipped",
      ),
    },
    fetchedAt,
  );
  if (!payload.jobs.length) {
    try {
      const discovered = await withTimeout(
        (signal) => discoverJobsViaSearch(params, selectedSources, signal),
        Math.min(timeoutMs, 12_000),
      );
      if (discovered) payload = discovered;
    } catch (error) {
      const message =
        error instanceof SourceError
          ? error.message
          : "Search discovery could not provide readable results.";
      payload = {
        ...payload,
        partial: true,
        sources: payload.sources.map((source) => ({
          ...source,
          status: source.status === "ok" ? "partial" : source.status,
          warnings: [...(source.warnings ?? []), message],
        })),
      };
    }
  }
  if (!payload.jobs.length) {
    return response(
      {
        ...payload,
        partial: true,
      },
      fetchedAt,
      false,
      false,
    );
  }
  let stored = true;
  try {
    db.transaction((tx) => {
      tx.delete(jobsCache)
        .where(lt(jobsCache.fetchedAt, new Date(fetchedAt - CACHE_TTL_MS)))
        .run();
      tx.insert(jobsCache)
        .values({
          queryHash: hash,
          location: params.location,
          resultsJson: JSON.stringify(payload),
          fetchedAt: new Date(fetchedAt),
        })
        .onConflictDoUpdate({
          target: jobsCache.queryHash,
          set: {
            resultsJson: JSON.stringify(payload),
            fetchedAt: new Date(fetchedAt),
            location: params.location,
          },
        })
        .run();
    });
  } catch {
    // Still return valid jobs if the cache cannot be written; never leak database internals.
    stored = false;
  }
  return response(payload, fetchedAt, false, stored);
}

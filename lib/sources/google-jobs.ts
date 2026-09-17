import { z } from "zod";
import { locations, type SearchParams } from "@/lib/jobs/locations";
import { fetchJson, SourceError, type Fetcher } from "./shared";

/**
 * One Google Jobs lookup (through SerpAPI) per query for a short while, shared
 * by every adapter that needs it. The Indeed fallback and web discovery both
 * read the same result, so a search never spends two provider calls on the
 * same question, and concurrent callers share the in-flight request.
 *
 * The shared request runs under its own deadline. A caller that gives up
 * early (Indeed's budget expiring) rejects for itself only; the lookup keeps
 * going so a later caller (web discovery) can still use it.
 */
export const googleJobRowSchema = z.object({
  title: z.string().optional(),
  company_name: z.string().optional(),
  location: z.string().optional(),
  via: z.string().optional(),
  description: z.string().optional(),
  share_link: z.string().optional(),
  posted_at: z.string().optional(),
  detected_extensions: z
    .object({
      posted_at: z.string().optional(),
      schedule_type: z.string().optional(),
      salary: z.string().optional(),
      work_from_home: z.boolean().optional(),
    })
    .optional(),
  apply_options: z.array(z.object({ title: z.string(), link: z.string() })).optional(),
});
export type GoogleJobRow = z.infer<typeof googleJobRowSchema>;
const responseSchema = z.object({ jobs_results: z.array(googleJobRowSchema).optional() });

const MEMO_TTL_MS = 10 * 60_000;
/** The provider regularly needs 15-20 seconds for this engine. */
export const GOOGLE_JOBS_LOOKUP_TIMEOUT_MS = 40_000;
const memo = new Map<string, { expires: number; rows: Promise<GoogleJobRow[]>; settled: boolean }>();

export function hasGoogleJobsProvider() {
  return Boolean(process.env.SERPAPI_KEY);
}

export function memoKey(params: SearchParams) {
  return `${params.location}:${params.query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Whether a lookup for these params is cached or already in flight, so reading it costs nothing. */
export function hasGoogleJobsMemo(params: SearchParams, now = Date.now()) {
  const entry = memo.get(memoKey(params));
  return Boolean(entry && entry.expires > now);
}

export function resetGoogleJobsMemo() {
  memo.clear();
}

export function parseGoogleJobsResponse(data: unknown): GoogleJobRow[] {
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success)
    throw new SourceError("INVALID_RESPONSE", "Web job discovery returned an unexpected response.");
  return parsed.data.jobs_results ?? [];
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new SourceError("TIMEOUT", "This source took too long to respond."));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new SourceError("TIMEOUT", "This source took too long to respond."));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export async function googleJobsSearch(
  params: SearchParams,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
  now = Date.now,
): Promise<GoogleJobRow[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key)
    throw new SourceError("UPSTREAM_BLOCKED", "Web job discovery is not configured on this server.");
  const cacheKey = memoKey(params);
  const cached = memo.get(cacheKey);
  if (cached && cached.expires > now()) return abortable(cached.rows, signal);
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine: "google_jobs",
    api_key: key,
    // The engine's separate location parameter proved far slower than naming
    // the city in the query itself, and appending ", Kerala" to the city makes
    // it return nothing, so q carries the bare city (or "Kerala" for the state).
    q: `${params.query} jobs in ${params.location === "kerala" ? "Kerala" : locations[params.location].label}`,
    gl: "in",
    hl: "en",
  }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_JOBS_LOOKUP_TIMEOUT_MS);
  const rows = fetchJson(url, controller.signal, fetcher)
    .then(parseGoogleJobsResponse)
    .finally(() => clearTimeout(timer));
  const entry = { expires: now() + MEMO_TTL_MS, rows, settled: false };
  memo.set(cacheKey, entry);
  rows.then(
    () => { entry.settled = true; },
    () => {
      // A failed lookup must not poison later searches.
      if (memo.get(cacheKey) === entry) memo.delete(cacheKey);
    },
  );
  return abortable(rows, signal);
}

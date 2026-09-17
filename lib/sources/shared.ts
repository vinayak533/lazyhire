import { createHash } from "node:crypto";
import { load } from "cheerio";
import { z } from "zod";
import type { JobSource, NormalizedJob } from "@/lib/jobs/types";
import { sourceLabels } from "@/lib/jobs/types";
export { matchesSearchTerms } from "@/lib/jobs/terms";

export type Fetcher = typeof fetch;
export class SourceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new SourceError("TIMEOUT", "This source took too long to respond."),
      );
    }, milliseconds);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      timeout,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function fetchText(
  url: URL | string,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
  headers: Record<string, string> = {},
): Promise<string> {
  // Only callers with fixed provider origins invoke this helper. Never accept user URLs.
  let response: Response;
  try {
    response = await fetcher(url, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json", ...headers },
    });
  } catch {
    throw new SourceError(
      signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
      "This source is temporarily unreachable.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    const code =
      response.status === 401 || response.status === 403
        ? "AUTH_ERROR"
        : response.status === 429
          ? "RATE_LIMITED"
          : "UPSTREAM_ERROR";
    throw new SourceError(
      code,
      code === "AUTH_ERROR"
        ? "This source could not authenticate. Check its server credentials."
        : "This source is temporarily unavailable.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) {
        await reader.cancel();
        throw new SourceError(
          "INVALID_RESPONSE",
          "This source returned too much data.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchJson(
  url: URL | string,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
  headers?: Record<string, string>,
): Promise<unknown> {
  const text = await fetchText(url, signal, fetcher, headers);
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceError(
      "INVALID_RESPONSE",
      "This source returned an unreadable response.",
    );
  }
}

export function plainText(value: string): string {
  const $ = load(value, {}, false);
  $("script,style,iframe,noscript").remove();
  $("br").replaceWith("\n");
  $("p,li,div,h1,h2,h3,h4").append("\n");
  return $.root()
    .text()
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function extractEmail(text: string): string | null {
  const matches =
    text.match(
      /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)*(?:\.[A-Z]{2,24})(?=$|[^A-Z0-9-])/gi,
    ) ?? [];
  return matches.find((value) => z.email().safeParse(value).success) ?? null;
}

export function parseDate(
  value: string | undefined,
  now = Date.now(),
): { date: string | null; approximate: boolean } {
  if (!value) return { date: null, approximate: false };
  const text = value.trim().toLowerCase();
  const relative = text.match(
    /^(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago$/,
  );
  const units: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
  };
  if (relative)
    return {
      date: new Date(
        now - Number(relative[1]) * units[relative[2]],
      ).toISOString(),
      approximate: true,
    };
  if (["today", "just posted", "just now", "yesterday"].includes(text))
    return {
      date: new Date(
        now - (text === "yesterday" ? 86_400_000 : 0),
      ).toISOString(),
      approximate: true,
    };
  // Parse day-first dates as midnight India time, independently of server locale.
  const dayFirst = text.match(
    /^(\d{1,2})(?:st|nd|rd|th)?[,\- ]+(\d{1,2}|[a-z]{3,9})[,\- ]+(\d{4})(?:[,\s].*)?$/,
  );
  let timestamp = NaN;
  if (dayFirst) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const month = /^\d+$/.test(dayFirst[2])
      ? Number(dayFirst[2])
      : months.indexOf(dayFirst[2].slice(0, 3)) + 1;
    const date = `${dayFirst[3]}-${String(month).padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`;
    timestamp = Date.parse(`${date}T00:00:00+05:30`);
    if (
      Number.isFinite(timestamp) &&
      new Date(timestamp + 19_800_000).toISOString().slice(0, 10) !== date
    )
      timestamp = NaN;
  } else if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) {
    timestamp = Date.parse(value);
  }
  return {
    date: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
    approximate: false,
  };
}

export function extractSkills(text: string): string[] {
  const skills = [
    "React",
    "React Native",
    "Angular",
    "Vue",
    "Next.js",
    "Node.js",
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "PHP",
    "Laravel",
    "WordPress",
    "SQL",
    "MySQL",
    "PostgreSQL",
    "MongoDB",
    "REST",
    "GraphQL",
    "AWS",
    "Azure",
    "Docker",
    "Kubernetes",
    "SEO",
    "Google Ads",
    "Meta Ads",
    "CRM",
    "Excel",
    "Communication",
  ];
  const normalized = text.toLowerCase();
  return skills.filter((skill) =>
    new RegExp(
      `\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+")}\\b`,
      "i",
    ).test(normalized),
  );
}

export function jobType(value = ""): NormalizedJob["jobType"] {
  if (/\bintern(?:ship)?\b/i.test(value)) return "internship";
  if (/part[-_ ]time/i.test(value)) return "part-time";
  if (/full[-_ ]time/i.test(value)) return "full-time";
  if (/\bcontract(?:or)?\b/i.test(value)) return "contract";
  return null;
}

export function createJob(
  source: JobSource,
  fields: Pick<NormalizedJob, "title" | "company"> & Partial<NormalizedJob>,
): NormalizedJob {
  const title = plainText(fields.title).replace(/\s+/g, " ");
  const company = plainText(fields.company).replace(/\s+/g, " ");
  const description = plainText(fields.description ?? "");
  const sourceUrl = safeUrl(fields.sourceUrl);
  return {
    id: createHash("sha256")
      .update(
        `${source}:${sourceUrl ?? `${title}:${company}:${fields.location}`}`,
      )
      .digest("hex")
      .slice(0, 24),
    location: "Not specified",
    locationBasis: "unknown",
    datePosted: null,
    datePostedIsApproximate: false,
    applyUrl: null,
    applicationEmail: null,
    applicationLinks: [],
    jobType: null,
    closingDate: null,
    experience: null,
    salary: null,
    skills: [],
    ...fields,
    title,
    company,
    description,
    snippet: description.replace(/\s+/g, " ").slice(0, 240),
    source,
    sourceUrl,
    sources: [{ source, label: sourceLabels[source], url: sourceUrl }],
  };
}

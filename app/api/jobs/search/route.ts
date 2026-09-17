import { NextRequest } from "next/server";
import { loadCareerBrief } from "@/lib/career/store";
import { requireSession } from "@/lib/auth/service";
import { authError, jsonResponse } from "@/lib/security/http";
import { getDb } from "@/lib/db";
import { normalizeLocation, type SearchParams } from "@/lib/jobs/locations";
import { sourceIds, type JobSource } from "@/lib/jobs/types";
import { queryHash, searchJobs, type SearchResponse } from "@/lib/jobs/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inFlight = new Map<string, Promise<SearchResponse>>();

function parseSources(value: string | null): JobSource[] | null {
  if (!value) return [...sourceIds];
  const sources = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!sources.length) return null;
  if (sources.some((source) => !sourceIds.includes(source as JobSource)))
    return null;
  return sourceIds.filter((source) => sources.includes(source));
}

export async function GET(request: NextRequest) {
  const db = getDb();
  let session;
  try {
    session = requireSession(db, request);
  } catch {
    return authError();
  }
  const brief = loadCareerBrief(db, session.userId);
  const rawQuery = request.nextUrl.searchParams.get("q") ?? "";
  const query = (rawQuery || brief?.role || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  const defaultLocation =
    brief?.cities.length === 1 ? brief.cities[0] : "kerala";
  const location = normalizeLocation(
    request.nextUrl.searchParams.get("location") ?? defaultLocation,
  );
  const sources = request.nextUrl.searchParams.has("sources")
    ? parseSources(request.nextUrl.searchParams.get("sources"))
    : (brief?.sources ?? [...sourceIds]);
  if (
    query.length < 2 ||
    query.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(rawQuery) ||
    !location ||
    !sources
  ) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_SEARCH",
          message:
            "Enter a role between 2 and 120 characters and choose a supported Kerala city or All Kerala.",
        },
      },
      { status: 400 },
    );
  }
  const params: SearchParams = { query, location };
  const hash = queryHash(params, sources);
  try {
    let pending = inFlight.get(hash);
    if (!pending) {
      // Share simultaneous identical searches, including their paid provider calls.
      pending = searchJobs(params, { db, sources });
      inFlight.set(hash, pending);
      const cleanup = () => {
        if (inFlight.get(hash) === pending) inFlight.delete(hash);
      };
      void pending.then(cleanup, cleanup);
    }
    return jsonResponse(await pending);
  } catch {
    return jsonResponse(
      {
        error: {
          code: "SEARCH_UNAVAILABLE",
          message:
            "Search is temporarily unavailable. Please try again shortly.",
        },
      },
      { status: 500 },
    );
  }
}

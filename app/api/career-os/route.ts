import { requireSession } from "@/lib/auth/service";
import { buildCareerOsSnapshot } from "@/lib/career-os/engine";
import { getDb } from "@/lib/db";
import { authError, jsonResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    return jsonResponse({ snapshot: buildCareerOsSnapshot(db, session.userId) });
  } catch {
    return authError();
  }
}

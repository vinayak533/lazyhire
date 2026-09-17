import { ZodError } from "zod";
import { loadCareerBrief, saveCareerBrief } from "@/lib/career/store";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { audit } from "@/lib/security/audit";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";
import { getDb } from "@/lib/db";
import { readLimitedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    return jsonResponse({ brief: loadCareerBrief(db, session.userId) });
  } catch {
    return authError();
  }
}

export async function POST(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    const body = JSON.parse(
      Buffer.from(await readLimitedBody(request, 80_000)).toString("utf8"),
    );
    const brief = saveCareerBrief(db, session.userId, body);
    audit(db, request, "profile.brief_saved", session.userId, {});
    return jsonResponse({ brief });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED")
      return authError();
    if (error instanceof Error && error.message === "CSRF_INVALID")
      return forbidden("Refresh the page and try again.");
    const message =
      error instanceof ZodError
        ? "Complete the career brief before searching."
        : "The career brief could not be saved.";
    return jsonResponse(
      { error: { code: "INVALID_BRIEF", message } },
      { status: 400 },
    );
  }
}

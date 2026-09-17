import { getDb } from "@/lib/db";
import { requireSession, revokeAllSessions, sessionCookieName, verifyCsrf } from "@/lib/auth/service";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    revokeAllSessions(db, request, session.userId);
    const response = jsonResponse({ ok: true });
    response.cookies.set(sessionCookieName, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return authError();
    return forbidden("Refresh the page and try again.");
  }
}

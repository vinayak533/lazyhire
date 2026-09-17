import { getDb } from "@/lib/db";
import {
  requireSession,
  revokeCurrentSession,
  sessionCookieName,
  verifyCsrf,
} from "@/lib/auth/service";
import { forbidden, jsonResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    revokeCurrentSession(db, request, session.userId);
    const response = jsonResponse({ ok: true });
    response.cookies.set(sessionCookieName, "", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set("jh_download", "", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/cv",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "CSRF_INVALID")
      return forbidden("Refresh the page and try again.");
    const response = jsonResponse({ ok: true });
    response.cookies.set(sessionCookieName, "", { path: "/", maxAge: 0 });
    return response;
  }
}

import { getDb } from "@/lib/db";
import { enableMfa, requireSession, verifyCsrf, verifyTotp } from "@/lib/auth/service";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";
import { readLimitedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    const body = JSON.parse(Buffer.from(await readLimitedBody(request, 20_000)).toString("utf8"));
    const secret = typeof body.secret === "string" ? body.secret : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!secret || !verifyTotp(secret, code))
      return forbidden("Enter a valid multi-factor code.");
    enableMfa(db, request, session.userId, secret);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return authError();
    return forbidden("Refresh the page and try again.");
  }
}

import { getDb } from "@/lib/db";
import {
  authenticateUser,
  createSession,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";
import { RateLimitError } from "@/lib/security/rate-limit";
import { readLimitedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDb();
  try {
    const body = JSON.parse(Buffer.from(await readLimitedBody(request, 20_000)).toString("utf8"));
    const userId = await authenticateUser(db, request, body);
    const session = await createSession(db, request, userId);
    const response = jsonResponse({ ok: true });
    response.cookies.set(
      sessionCookieName,
      session.token,
      sessionCookieOptions(session.expiresAt, request),
    );
    return response;
  } catch (error) {
    if (error instanceof RateLimitError)
      return jsonResponse(
        { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    return jsonResponse(
      {
        error: {
          code: "LOGIN_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Invalid email or password.",
        },
      },
      { status: 401 },
    );
  }
}

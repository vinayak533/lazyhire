import { getDb } from "@/lib/db";
import { jsonResponse } from "@/lib/security/http";
import { RateLimitError } from "@/lib/security/rate-limit";
import { readLimitedBody } from "@/lib/http";
import {
  createSession,
  registerUser,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = JSON.parse(
      Buffer.from(await readLimitedBody(request, 20_000)).toString("utf8"),
    );
    const db = getDb();
    const result = await registerUser(db, request, body);
    const response = jsonResponse({
      ok: true,
      message: "Account created. You are signed in.",
    });
    const session = await createSession(db, request, result.userId);
    response.cookies.set(
      sessionCookieName,
      session.token,
      sessionCookieOptions(session.expiresAt, request),
    );
    return response;
  } catch (error) {
    if (error instanceof RateLimitError)
      return jsonResponse(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many attempts. Try again later.",
          },
        },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    return jsonResponse(
      {
        error: {
          code: "REGISTRATION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "The account could not be created.",
        },
      },
      { status: 400 },
    );
  }
}

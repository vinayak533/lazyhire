import { getDb } from "@/lib/db";
import {
  consumeEmailVerificationToken,
  createSession,
  sessionCookieName,
  sessionCookieOptions,
  verifyEmailToken,
} from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";
import { RateLimitError } from "@/lib/security/rate-limit";
import { readLimitedBody } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithStatus(request: Request, status: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("verification", status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const db = getDb();
  try {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const result = consumeEmailVerificationToken(db, request, token);
    const status =
      result.status === "verified"
        ? "success"
        : result.status === "already_verified"
          ? "already-verified"
          : result.status;
    const response = redirectWithStatus(request, status);
    if (result.status === "verified") {
      const session = await createSession(db, request, result.userId);
      response.cookies.set(
        sessionCookieName,
        session.token,
        sessionCookieOptions(session.expiresAt, request),
      );
    }
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = redirectWithStatus(request, "rate-limited");
      response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    }
    return redirectWithStatus(request, "invalid");
  }
}

export async function POST(request: Request) {
  const db = getDb();
  try {
    const body = JSON.parse(Buffer.from(await readLimitedBody(request, 20_000)).toString("utf8"));
    const token = typeof body.token === "string" ? body.token : "";
    const userId = verifyEmailToken(db, request, token);
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
      { error: { code: "VERIFY_FAILED", message: "Verification failed." } },
      { status: 400 },
    );
  }
}

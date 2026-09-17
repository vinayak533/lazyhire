import { getDb } from "@/lib/db";
import { resetPassword } from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";
import { RateLimitError } from "@/lib/security/rate-limit";
import { readLimitedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = JSON.parse(Buffer.from(await readLimitedBody(request, 20_000)).toString("utf8"));
    await resetPassword(
      getDb(),
      request,
      typeof body.token === "string" ? body.token : "",
      typeof body.password === "string" ? body.password : "",
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError)
      return jsonResponse(
        { error: { code: "RATE_LIMITED", message: "Too many attempts." } },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    return jsonResponse(
      { error: { code: "RESET_FAILED", message: "Password reset failed." } },
      { status: 400 },
    );
  }
}

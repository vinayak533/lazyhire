import { getDb } from "@/lib/db";
import { createPasswordResetEmail } from "@/lib/auth/service";
import {
  buildPasswordResetUrl,
  EmailDeliveryError,
  sendPasswordResetEmail,
} from "@/lib/email/service";
import { jsonResponse } from "@/lib/security/http";
import { RateLimitError } from "@/lib/security/rate-limit";
import { readLimitedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = JSON.parse(
      Buffer.from(await readLimitedBody(request, 20_000)).toString("utf8"),
    );
    const email = typeof body.email === "string" ? body.email : "";
    const reset = createPasswordResetEmail(getDb(), request, email);
    let devResetUrl: string | undefined;
    if (reset) {
      const resetUrl = buildPasswordResetUrl(request, reset.token);
      const delivery = await sendPasswordResetEmail({
        to: reset.email,
        resetUrl,
        expiresAt: reset.expiresAt,
      });
      if (
        delivery.provider === "dev-outbox" &&
        process.env.NODE_ENV !== "production"
      )
        devResetUrl = resetUrl;
    }
    return jsonResponse({
      ok: true,
      message: "If that account exists, a reset link has been sent.",
      devResetUrl,
    });
  } catch (error) {
    if (error instanceof RateLimitError)
      return jsonResponse(
        {
          error: { code: "RATE_LIMITED", message: "Too many reset requests." },
        },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    if (error instanceof EmailDeliveryError)
      return jsonResponse(
        {
          error: {
            code: "EMAIL_DELIVERY_FAILED",
            message:
              error.message ||
              "Password reset email could not be sent. Try again shortly.",
          },
        },
        { status: 503 },
      );
    return jsonResponse({ ok: true });
  }
}

import { getDb } from "@/lib/db";
import { createEmailVerificationForEmail } from "@/lib/auth/service";
import {
  buildVerificationUrl,
  EmailDeliveryError,
  sendVerificationEmail,
} from "@/lib/email/service";
import { readLimitedBody } from "@/lib/http";
import { jsonResponse } from "@/lib/security/http";
import { RateLimitError } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = JSON.parse(
      Buffer.from(await readLimitedBody(request, 20_000)).toString("utf8"),
    ) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const result = createEmailVerificationForEmail(getDb(), request, email);
    let devVerificationUrl: string | undefined;
    if (result.status === "sent") {
      const verificationUrl = buildVerificationUrl(request, result.token);
      const delivery = await sendVerificationEmail({
        to: result.email,
        verificationUrl,
        expiresAt: result.expiresAt,
      });
      if (
        delivery.provider === "dev-outbox" &&
        process.env.NODE_ENV !== "production"
      )
        devVerificationUrl = verificationUrl;
    }
    return jsonResponse({
      ok: true,
      status: result.status,
      cooldownSeconds: result.cooldownSeconds,
      message:
        result.status === "already_verified"
          ? "This email is already verified. Sign in to continue."
          : "If this email needs verification, a secure link has been sent.",
      devVerificationUrl,
    });
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
    if (error instanceof EmailDeliveryError)
      return jsonResponse(
        {
          error: {
            code: "EMAIL_DELIVERY_FAILED",
            message:
              error.message ||
              "Verification email could not be sent. Try again in a moment.",
          },
        },
        { status: 503 },
      );
    return jsonResponse(
      {
        error: {
          code: "VERIFICATION_EMAIL_FAILED",
          message: "Verification email could not be sent.",
        },
      },
      { status: 400 },
    );
  }
}

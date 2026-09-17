import { getDb } from "@/lib/db";
import { generateTotpSecret, requireSession, verifyCsrf, totp } from "@/lib/auth/service";
import { forbidden, jsonResponse, authError } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = requireSession(getDb(), request);
    verifyCsrf(request, session);
    const secret = generateTotpSecret();
    return jsonResponse({
      secret,
      ...(process.env.NODE_ENV !== "production"
        ? { currentCode: totp(secret, Math.floor(Date.now() / 30_000)) }
        : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return authError();
    return forbidden("Refresh the page and try again.");
  }
}

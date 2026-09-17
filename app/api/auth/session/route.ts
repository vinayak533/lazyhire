import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getSession(getDb(), request);
  if (!session)
    return jsonResponse({ user: null, csrfToken: null }, { status: 401 });
  return jsonResponse({
    user: {
      id: session.userId,
      email: session.email,
      emailVerified: session.emailVerified,
    },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
  });
}

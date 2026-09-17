import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cvUploads, downloadGrants } from "@/lib/db/schema";
import {
  downloadCookieName,
  requireSession,
  verifyCsrf,
} from "@/lib/auth/service";
import { randomToken, keyedHash } from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = getDb();
  const { id } = await context.params;
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    const upload = db
      .select()
      .from(cvUploads)
      .where(and(eq(cvUploads.id, id), eq(cvUploads.userId, session.userId)))
      .get();
    if (!upload) return forbidden();
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 60_000);
    db.insert(downloadGrants)
      .values({
        tokenHash: keyedHash(token),
        userId: session.userId,
        cvUploadId: id,
        createdAt: new Date(),
        expiresAt,
      })
      .run();
    audit(db, request, "cv.download_granted", session.userId, { cvId: id });
    const response = jsonResponse({
      url: `/api/cv/${encodeURIComponent(id)}/download`,
      expiresAt: expiresAt.toISOString(),
    });
    response.cookies.set(downloadCookieName, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: `/api/cv/${id}/download`,
      expires: expiresAt,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return authError();
    return forbidden("Refresh the page and try again.");
  }
}

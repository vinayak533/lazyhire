import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cvUploads, downloadGrants } from "@/lib/db/schema";
import { downloadCookieName, requireSession } from "@/lib/auth/service";
import { decryptText, keyedHash } from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";
import { authError, forbidden, privateHeaders } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieValue(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = getDb();
  const { id } = await context.params;
  try {
    const session = requireSession(db, request);
    const token = cookieValue(request, downloadCookieName);
    if (!token) return forbidden();
    const grant = db
      .select()
      .from(downloadGrants)
      .where(
        and(
          eq(downloadGrants.tokenHash, keyedHash(token)),
          eq(downloadGrants.userId, session.userId),
          eq(downloadGrants.cvUploadId, id),
          isNull(downloadGrants.usedAt),
        ),
      )
      .get();
    if (!grant || grant.expiresAt <= new Date()) return forbidden();
    const upload = db
      .select()
      .from(cvUploads)
      .where(and(eq(cvUploads.id, id), eq(cvUploads.userId, session.userId)))
      .get();
    if (!upload) return forbidden();
    db.update(downloadGrants)
      .set({ usedAt: new Date() })
      .where(eq(downloadGrants.tokenHash, grant.tokenHash))
      .run();
    audit(db, request, "cv.downloaded", session.userId, { cvId: id });
    return new Response(decryptText(upload.textCiphertext), {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${upload.filename.replace(/\.[^.]+$/, ".txt")}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return authError();
    return forbidden();
  }
}

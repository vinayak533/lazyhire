import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/service";
import { loadCareerBrief, listApplications } from "@/lib/career/store";
import { getDb } from "@/lib/db";
import { auditLogs, cvUploads, users } from "@/lib/db/schema";
import { decryptJson } from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";
import { authError, jsonResponse } from "@/lib/security/http";
import { exportTutorData } from "@/lib/career-tutor/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    const user = db.select().from(users).where(eq(users.id, session.userId)).get();
    const cvs = db
      .select({
        id: cvUploads.id,
        filename: cvUploads.filename,
        mimeType: cvUploads.mimeType,
        fileSha256: cvUploads.fileSha256,
        scanStatus: cvUploads.scanStatus,
        createdAt: cvUploads.createdAt,
      })
      .from(cvUploads)
      .where(eq(cvUploads.userId, session.userId))
      .all()
      .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    const logs = db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, session.userId))
      .all()
      .map((row) => ({
        action: row.action,
        metadata: JSON.parse(row.metadataJson),
        createdAt: row.createdAt.toISOString(),
      }));
    audit(db, request, "account.exported", session.userId, {});
    return jsonResponse({
      account: user
        ? {
            id: user.id,
            email: session.email,
            emailVerified: Boolean(user.emailVerifiedAt),
            mfaEnabled: user.mfaEnabled === 1,
            privacy: decryptJson(user.privacyJson),
          }
        : null,
      careerBrief: loadCareerBrief(db, session.userId),
      careerTutor: exportTutorData(db, session.userId),
      applications: listApplications(db, session.userId),
      cvUploads: cvs,
      auditLogs: logs,
    });
  } catch {
    return authError();
  }
}

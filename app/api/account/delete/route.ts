import { eq } from "drizzle-orm";
import { requireSession, sessionCookieName, verifyCsrf } from "@/lib/auth/service";
import { getDb } from "@/lib/db";
import {
  aiAnalysisCache,
  applications,
  auditLogs,
  careerBriefs,
  cvUploads,
  downloadGrants,
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
  users,
} from "@/lib/db/schema";
import { audit } from "@/lib/security/audit";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";
import { deleteTutorData } from "@/lib/career-tutor/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    audit(db, request, "account.deleted", session.userId, {});
    deleteTutorData(db, session.userId);
    db.delete(applications).where(eq(applications.userId, session.userId)).run();
    db.delete(careerBriefs).where(eq(careerBriefs.userId, session.userId)).run();
    db.delete(cvUploads).where(eq(cvUploads.userId, session.userId)).run();
    db.delete(aiAnalysisCache).where(eq(aiAnalysisCache.userId, session.userId)).run();
    db.delete(downloadGrants).where(eq(downloadGrants.userId, session.userId)).run();
    db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, session.userId))
      .run();
    db.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, session.userId))
      .run();
    db.delete(auditLogs).where(eq(auditLogs.userId, session.userId)).run();
    db.delete(sessions).where(eq(sessions.userId, session.userId)).run();
    db.update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, session.userId))
      .run();
    const response = jsonResponse({ ok: true });
    response.cookies.set(sessionCookieName, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return authError();
    return forbidden("Refresh the page and try again.");
  }
}

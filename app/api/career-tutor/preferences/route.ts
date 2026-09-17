import { getDb } from "@/lib/db";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";
import { preferencesSchema } from "@/lib/career-tutor/types";
import { getPreferences, savePreferences } from "@/lib/career-tutor/store";
import { tutorBody, tutorError } from "@/lib/career-tutor/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const db = getDb(); const session = requireSession(db, request); return jsonResponse({preferences: getPreferences(db, session.userId)}); }
  catch (error) { return tutorError(error); }
}
export async function PATCH(request: Request) {
  try {
    const db = getDb(); const session = requireSession(db, request); verifyCsrf(request, session);
    return jsonResponse({preferences: savePreferences(db, session.userId, preferencesSchema.strict().parse(await tutorBody(request)))});
  } catch (error) { return tutorError(error); }
}

import { getDb } from "@/lib/db";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { keyedHash } from "@/lib/security/crypto";
import { conversation, getPreferences } from "@/lib/career-tutor/store";
import { tutorError } from "@/lib/career-tutor/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const db = getDb(); const session = requireSession(db, request); verifyCsrf(request, session);
    checkRateLimit(db, keyedHash(`tutor-conversations:${session.userId}`), 12, 60_000);
    const chat = conversation(db, session);
    return jsonResponse({conversationId: chat.id, preferences: getPreferences(db, session.userId), turns: []});
  } catch (error) { return tutorError(error); }
}

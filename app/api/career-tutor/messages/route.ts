import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { keyedHash } from "@/lib/security/crypto";
import { acquireConversation, conversation, existingTurn, getPreferences, history, releaseConversation, saveTurn, TutorError } from "@/lib/career-tutor/store";
import { answerQuestion } from "@/lib/career-tutor/service";
import { tutorBody, tutorError } from "@/lib/career-tutor/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.object({question: z.string().trim().min(2).max(2000), conversationId: z.uuid(), requestId: z.uuid()}).strict();
export async function POST(request: Request) {
  const db = getDb(); let lock: {userId: string; id: string} | undefined; const started = Date.now();
  try {
    const session = requireSession(db, request); verifyCsrf(request, session);
    const input = inputSchema.parse(await tutorBody(request));
    conversation(db, session, input.conversationId);
    const existing = existingTurn(db, session.userId, input.conversationId, input.requestId);
    if (existing) {
      if (existing.question !== input.question) throw new TutorError(409, "This request identifier has already been used.");
      return jsonResponse({turn: existing});
    }
    checkRateLimit(db, keyedHash(`career-tutor:${session.userId}`), 15, 60_000);
    acquireConversation(db, session, input.conversationId); lock = {userId: session.userId, id: input.conversationId};
    const preferences = getPreferences(db, session.userId);
    const turns = history(db, session, input.conversationId);
    if (turns.length >= 50) throw new TutorError(409, "This conversation is full. Start a new chat to continue.");
    const answer = await answerQuestion(db, session.userId, input.question, preferences, turns, request.signal);
    const currentSession = requireSession(db, request);
    const currentPreferences = getPreferences(db, session.userId);
    if (currentSession.tokenHash !== session.tokenHash || (preferences.useProfile && !currentPreferences.useProfile)) throw new TutorError(409, "Your privacy settings changed. Please send the question again.");
    return jsonResponse({turn: saveTurn(db, session, input.conversationId, input.requestId, input.question, answer, Date.now() - started)});
  } catch (error) { return tutorError(error); }
  finally { if (lock) releaseConversation(db, lock.userId, lock.id); }
}

import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";
import { deleteConversation, getPreferences, history } from "@/lib/career-tutor/store";
import { tutorError } from "@/lib/career-tutor/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {params: Promise<{id: string}>};
export async function GET(request: Request, context: Context) {
  try {
    const db = getDb(); const session = requireSession(db, request); const id = z.uuid().parse((await context.params).id);
    return jsonResponse({conversationId: id, turns: history(db, session, id), preferences: getPreferences(db, session.userId)});
  } catch (error) { return tutorError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const db = getDb(); const session = requireSession(db, request); verifyCsrf(request, session);
    deleteConversation(db, session, z.uuid().parse((await context.params).id)); return jsonResponse({ok: true});
  } catch (error) { return tutorError(error); }
}

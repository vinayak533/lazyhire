import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { jsonResponse } from "@/lib/security/http";
import { feedback } from "@/lib/career-tutor/store";
import { tutorBody, tutorError } from "@/lib/career-tutor/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const db = getDb(); const session = requireSession(db, request); verifyCsrf(request, session);
    const input = z.object({conversationId: z.uuid(), messageId: z.uuid(), value: z.enum(["helpful", "not_helpful"]).nullable()}).strict().parse(await tutorBody(request));
    feedback(db, session, input.conversationId, input.messageId, input.value); return jsonResponse({ok: true});
  } catch (error) { return tutorError(error); }
}

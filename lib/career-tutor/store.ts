import "server-only";
import { randomUUID } from "node:crypto";
import type { openDatabase } from "@/lib/db/connection";
import type { AuthSession } from "@/lib/auth/service";
import { decryptJson, decryptText, encryptJson, encryptText } from "@/lib/security/crypto";
import { defaultPreferences, type TutorAnswer, type TutorPreferences, type TutorTurn } from "./types";

export type TutorDb = ReturnType<typeof openDatabase>["db"];
export class TutorError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Conversation = { id: string; expires_at: number };
type TurnRow = {
  id: string; question_ciphertext: string; answer_ciphertext: string;
  created_at: number; feedback: TutorTurn["feedback"];
};
const ttl = 45 * 60_000;

export function getPreferences(db: TutorDb, userId: string): TutorPreferences {
  const row = db.$client.prepare("SELECT use_profile FROM career_tutor_preferences WHERE user_id = ?").get(userId) as {use_profile: number} | undefined;
  return row ? {useProfile: Boolean(row.use_profile)} : defaultPreferences;
}
export function savePreferences(db: TutorDb, userId: string, preferences: TutorPreferences) {
  // allow_ai stays in the schema for compatibility; AI fallback is now automatic for everyone.
  db.$client.prepare("INSERT INTO career_tutor_preferences(user_id, use_profile, allow_ai, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET use_profile = excluded.use_profile, allow_ai = excluded.allow_ai, updated_at = excluded.updated_at, policy_version = 1")
    .run(userId, Number(preferences.useProfile), 1, Date.now());
  return preferences;
}
export function conversation(db: TutorDb, session: AuthSession, id?: string): Conversation {
  // Purge expired content, including telemetry, on use. The maintenance command does the same when idle.
  db.$client.prepare("DELETE FROM career_tutor_conversations WHERE expires_at < ?").run(Date.now());
  if (id) {
    const row = db.$client.prepare("SELECT id, expires_at FROM career_tutor_conversations WHERE id = ? AND user_id = ? AND session_key = ? AND expires_at > ?")
      .get(id, session.userId, session.tokenHash, Date.now()) as Conversation | undefined;
    if (!row) throw new TutorError(404, "This conversation has ended. Start a new chat.");
    return row;
  }
  const count = db.$client.prepare("SELECT count(*) AS n FROM career_tutor_conversations WHERE user_id = ?").get(session.userId) as {n: number};
  if (count.n >= 12) throw new TutorError(429, "Close an existing chat before starting another.");
  const row = {id: randomUUID(), expires_at: Math.min(Date.now() + ttl, session.expiresAt.getTime())};
  db.$client.prepare("INSERT INTO career_tutor_conversations(id, user_id, session_key, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(row.id, session.userId, session.tokenHash, Date.now(), row.expires_at);
  return row;
}
function decode(row: TurnRow): TutorTurn {
  return { id: row.id, question: decryptText(row.question_ciphertext), answer: decryptJson<TutorAnswer>(row.answer_ciphertext), createdAt: new Date(row.created_at).toISOString(), feedback: row.feedback };
}
export function history(db: TutorDb, session: AuthSession, id: string): TutorTurn[] {
  conversation(db, session, id);
  const rows = db.$client.prepare("SELECT * FROM career_tutor_turns WHERE conversation_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50").all(id, session.userId) as TurnRow[];
  return rows.reverse().map(decode);
}
export function existingTurn(db: TutorDb, userId: string, conversationId: string, id: string) {
  const row = db.$client.prepare("SELECT * FROM career_tutor_turns WHERE id = ? AND user_id = ? AND conversation_id = ?").get(id, userId, conversationId) as TurnRow | undefined;
  return row ? decode(row) : null;
}
export function acquireConversation(db: TutorDb, session: AuthSession, id: string) {
  const result = db.$client.prepare("UPDATE career_tutor_conversations SET busy_until = ?, expires_at = ? WHERE id = ? AND user_id = ? AND session_key = ? AND busy_until < ? AND expires_at > ?")
    .run(Date.now() + 90_000, Math.min(Date.now() + ttl, session.expiresAt.getTime()), id, session.userId, session.tokenHash, Date.now(), Date.now());
  if (!result.changes) throw new TutorError(409, "Your previous answer is still being prepared. Please wait.");
}
export function releaseConversation(db: TutorDb, userId: string, id: string) {
  db.$client.prepare("UPDATE career_tutor_conversations SET busy_until = 0 WHERE id = ? AND user_id = ?").run(id, userId);
}
export function saveTurn(db: TutorDb, session: AuthSession, conversationId: string, id: string, question: string, answer: TutorAnswer, latency: number): TutorTurn {
  conversation(db, session, conversationId);
  const createdAt = Date.now();
  db.$client.prepare("INSERT INTO career_tutor_turns(id, conversation_id, user_id, question_ciphertext, answer_ciphertext, origin, entry_ids, confidence, source_ids, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, conversationId, session.userId, encryptText(question), encryptJson(answer), answer.origin, JSON.stringify(answer.entryIds), answer.confidence, JSON.stringify(answer.sources.map(s => s.id)), latency, createdAt);
  return {id, question, answer, createdAt: new Date(createdAt).toISOString(), feedback: null};
}
export function feedback(db: TutorDb, session: AuthSession, conversationId: string, id: string, value: TutorTurn["feedback"]) {
  conversation(db, session, conversationId);
  const changed = db.$client.prepare("UPDATE career_tutor_turns SET feedback = ? WHERE id = ? AND user_id = ? AND conversation_id = ?").run(value, id, session.userId, conversationId);
  if (!changed.changes) throw new TutorError(404, "This answer is no longer available.");
}
export function deleteConversation(db: TutorDb, session: AuthSession, id: string) {
  conversation(db, session, id);
  db.$client.prepare("DELETE FROM career_tutor_conversations WHERE id = ? AND user_id = ? AND session_key = ?").run(id, session.userId, session.tokenHash);
}
export function deleteTutorData(db: TutorDb, userId: string) {
  db.$client.prepare("DELETE FROM career_tutor_conversations WHERE user_id = ?").run(userId);
  db.$client.prepare("DELETE FROM career_tutor_preferences WHERE user_id = ?").run(userId);
}
export function exportTutorData(db: TutorDb, userId: string) {
  const rows = db.$client.prepare("SELECT * FROM career_tutor_turns WHERE user_id = ? ORDER BY created_at").all(userId) as TurnRow[];
  return { preferences: getPreferences(db, userId), turns: rows.map(decode) };
}

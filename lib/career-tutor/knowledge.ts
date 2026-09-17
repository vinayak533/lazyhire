import "server-only";
import { createHash } from "node:crypto";
import type { TutorDb } from "./store";
import { entrySchema, type KnowledgeEntry } from "./types";

export function importKnowledge(db: TutorDb, input: unknown[]) {
  const entries = input.map(value => entrySchema.parse(value));
  const seen = new Set<string>();
  const questions = new Set<string>();
  const answers = new Set<string>();
  for (const entry of entries) {
    const question = entry.question.toLowerCase().replace(/[^a-z0-9]/g, "");
    const answer = entry.answer.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(entry.id) || questions.has(question) || answers.has(answer)) throw new Error(`Duplicate knowledge entry: ${entry.id}`);
    seen.add(entry.id); questions.add(question); answers.add(answer);
    if (entry.status === "published" && (!entry.last_verified || !entry.review.method || !entry.review.reviewer)) throw new Error(`Missing editorial review: ${entry.id}`);
    if (entry.sources.some(source => !source.supports)) throw new Error(`Missing resource scope: ${entry.id}`);
  }
  db.$client.transaction(() => {
    const upsert = db.$client.prepare("INSERT INTO career_tutor_entries(id, document_json, content_hash, status, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json, status = excluded.status, updated_at = excluded.updated_at, embedding_json = CASE WHEN content_hash = excluded.content_hash THEN embedding_json ELSE NULL END, embedding_model = CASE WHEN content_hash = excluded.content_hash THEN embedding_model ELSE NULL END, content_hash = excluded.content_hash");
    const remove = db.$client.prepare("DELETE FROM career_tutor_fts WHERE id = ?");
    const index = db.$client.prepare("INSERT INTO career_tutor_fts(id, question, alternates, keywords, answer) VALUES (?, ?, ?, ?, ?)");
    for (const entry of entries) {
      const serialized = JSON.stringify(entry);
      const hash = createHash("sha256").update(serialized).digest("hex");
      upsert.run(entry.id, serialized, hash, entry.status, Date.now());
      remove.run(entry.id);
      if (entry.status === "published") index.run(entry.id, entry.question, entry.alternate_questions.join("\n"), entry.keywords.join(" "), entry.answer);
    }
  })();
  return entries.length;
}
export function knowledgeStats(db: TutorDb) {
  return db.$client.prepare("SELECT status, count(*) AS count, sum(embedding_json IS NOT NULL) AS embedded FROM career_tutor_entries GROUP BY status").all() as Array<{status: string; count: number; embedded: number}>;
}
export function publishedEntries(db: TutorDb) {
  return (db.$client.prepare("SELECT document_json, embedding_json, embedding_model FROM career_tutor_entries WHERE status = 'published'").all() as Array<{document_json: string; embedding_json: string | null; embedding_model: string | null}>)
    .map(row => ({entry: entrySchema.parse(JSON.parse(row.document_json)) as KnowledgeEntry, vector: row.embedding_json ? JSON.parse(row.embedding_json) as number[] : null, model: row.embedding_model}));
}

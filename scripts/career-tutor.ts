import { config } from "dotenv";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../lib/db/connection";
import { importKnowledge, knowledgeStats, publishedEntries } from "../lib/career-tutor/knowledge";
import { decryptText, keyedHash } from "../lib/security/crypto";
import { normalize } from "../lib/career-tutor/retrieval";
import { embed, embeddingModel, cosine } from "../lib/career-tutor/embeddings";
import { seedEntries } from "../knowledge/career/seed";

async function main() {
config({path: ".env.local", quiet: true});
const {db, sqlite} = openDatabase();
const action = process.argv[2] ?? "status";
try {
  migrate(db, {migrationsFolder: "./drizzle"});
  if (action === "import") {
    const filename = process.argv[3];
    const input = filename ? readFileSync(resolve(filename), "utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : seedEntries;
    console.log(`Imported ${importKnowledge(db, input)} distinct entries.`);
  } else if (action === "embed") {
    process.env.TUTOR_DOWNLOAD_MODELS = "1";
    let count = 0;
    for (const {entry, vector, model} of publishedEntries(db)) {
      if (vector && model === embeddingModel) continue;
      // Every authored phrasing of the question. Keywords are deliberately left
      // out: they are lists of terms rather than questions, and mixing them in
      // measurably lowered similarity against real, sentence-shaped questions.
      const embedding = await embed(
        [entry.question, ...entry.alternate_questions].join(" "),
      );
      sqlite.prepare("UPDATE career_tutor_entries SET embedding_json = ?, embedding_model = ? WHERE id = ?").run(JSON.stringify(embedding), embeddingModel, entry.id);
      count++;
      if (count % 10 === 0) console.log(`Embedded ${count} entries.`);
    }
    console.log(`Embedded ${count} entries with ${embeddingModel}.`);
  } else if (action === "audit") {
    const entries = publishedEntries(db);
    const nearDuplicates: string[][] = [];
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      if (entries[i].vector && entries[j].vector && cosine(entries[i].vector!, entries[j].vector!) > 0.94) nearDuplicates.push([entries[i].entry.id, entries[j].entry.id]);
    }
    const report = {published: entries.length, target: 4000, targetMet: entries.length >= 4000, missingEmbeddings: entries.filter(e => !e.vector || e.model !== embeddingModel).map(e => e.entry.id), nearDuplicates};
    mkdirSync("artifacts/career-tutor", {recursive: true});
    writeFileSync("artifacts/career-tutor/corpus-audit.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.targetMet || report.missingEmbeddings.length || nearDuplicates.length) process.exitCode = 1;
  } else if (action === "review-queue") {
    // No question text leaves the database. An authorized editor can review an item locally by its ID.
    const rows = sqlite.prepare("SELECT id, question_ciphertext, origin, entry_ids, confidence, latency_ms, feedback, created_at FROM career_tutor_turns WHERE origin IN ('llm', 'unavailable') OR feedback = 'not_helpful' ORDER BY created_at DESC LIMIT 1000").all() as Array<{id:string; question_ciphertext:string; origin:string; entry_ids:string; confidence:number; latency_ms:number; feedback:string|null; created_at:number}>;
    const groups = new Map<string, {questionKey:string; count:number; exampleTurnId:string; negativeFeedback:number}>();
    for (const row of rows) {
      const questionKey = keyedHash(normalize(decryptText(row.question_ciphertext)));
      const group = groups.get(questionKey) ?? {questionKey,count:0,exampleTurnId:row.id,negativeFeedback:0};
      group.count++; if(row.feedback === "not_helpful") group.negativeFeedback++;
      groups.set(questionKey,group);
    }
    const report = {frequentQuestions:[...groups.values()].sort((a,b)=>b.count-a.count),turns:rows.map(({question_ciphertext: ciphertext,...row})=>{void ciphertext;return row;})};
    console.log(JSON.stringify(report, null, 2));
  } else if (action === "purge") {
    console.log(sqlite.prepare("DELETE FROM career_tutor_conversations WHERE expires_at < ? OR session_key IN (SELECT token_hash FROM sessions WHERE revoked_at IS NOT NULL OR expires_at < ? OR idle_expires_at < ?)").run(Date.now(), Date.now(), Date.now()));
  }
  console.log(JSON.stringify(knowledgeStats(db)));
} finally { sqlite.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Knowledge maintenance failed."); process.exitCode = 1; });

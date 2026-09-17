import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { openDatabase } from "../lib/db/connection";

config({ path: ".env.local", quiet: true });
const { sqlite, db } = openDatabase();
try {
  const row = db.get<{ ok: number }>(sql`select 1 as ok`);
  if (row?.ok !== 1) throw new Error("Drizzle SQLite connection failed");
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('jobs_cache', 'career_briefs', 'applications', 'users', 'sessions', 'audit_logs')",
    )
    .all() as { name: string }[];
  const names = new Set(tables.map((table) => table.name));
  const required = [
    "jobs_cache",
    "career_briefs",
    "applications",
    "users",
    "sessions",
    "audit_logs",
  ];
  console.log(
    `Drizzle + SQLite connection OK. Core tables: ${
      required.every((name) => names.has(name))
        ? "present"
        : "missing; run npm run db:migrate"
    }.`,
  );
} finally {
  sqlite.close();
}

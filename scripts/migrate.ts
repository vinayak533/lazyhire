import { config } from "dotenv";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../lib/db/connection";

config({ path: ".env.local", quiet: true });
const { sqlite, db } = openDatabase();
try {
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("SQLite migrations applied successfully.");
} finally {
  sqlite.close();
}

import "server-only";
import { openDatabase } from "./connection";

const globalForDb = globalThis as unknown as {
  orvioDatabase?: ReturnType<typeof openDatabase>;
};

export function getDb() {
  globalForDb.orvioDatabase ??= openDatabase();
  return globalForDb.orvioDatabase.db;
}

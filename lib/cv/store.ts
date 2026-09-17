import { and, desc, eq } from "drizzle-orm";
import type { openDatabase } from "@/lib/db/connection";
import { cvUploads } from "@/lib/db/schema";
import { decryptJson, decryptText } from "@/lib/security/crypto";
import type { CvResult } from "./types";

type Database = ReturnType<typeof openDatabase>["db"];

export interface ReadableCvUpload {
  id: string;
  filename: string;
  text: string;
  result: CvResult;
}

function readable(row: typeof cvUploads.$inferSelect): ReadableCvUpload | null {
  const result = decryptJson<CvResult>(row.resultJson);
  const text = decryptText(row.textCiphertext);
  if (result.parsed.imageOnly || text.trim().length < 80) return null;
  return {
    id: row.id,
    filename: row.filename,
    text,
    result,
  };
}

export function loadReadableCv(
  db: Database,
  userId: string,
  cvId: string,
): ReadableCvUpload | null {
  const row = db
    .select()
    .from(cvUploads)
    .where(and(eq(cvUploads.id, cvId), eq(cvUploads.userId, userId)))
    .get();
  return row ? readable(row) : null;
}

export function loadLatestReadableCv(
  db: Database,
  userId: string,
): ReadableCvUpload | null {
  const rows = db
    .select()
    .from(cvUploads)
    .where(eq(cvUploads.userId, userId))
    .orderBy(desc(cvUploads.createdAt))
    .all();
  for (const row of rows) {
    const cv = readable(row);
    if (cv) return cv;
  }
  return null;
}

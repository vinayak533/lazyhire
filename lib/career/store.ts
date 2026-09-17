import { and, desc, eq } from "drizzle-orm";
import type { openDatabase } from "@/lib/db/connection";
import { applications, careerBriefs } from "@/lib/db/schema";
import { decryptJson, encryptJson, keyedHash } from "@/lib/security/crypto";
import {
  applicationPatchSchema,
  applicationRecordSchema,
  careerBriefSchema,
  type ApplicationRecord,
  type CareerBrief,
} from "./types";
import { emptyCareerBrief } from "./defaults";

type Database = ReturnType<typeof openDatabase>["db"];
export function defaultCareerBrief(): CareerBrief {
  return emptyCareerBrief();
}

export function saveCareerBrief(
  db: Database,
  userId: string,
  input: unknown,
): CareerBrief {
  const brief = careerBriefSchema.parse(input);
  const now = new Date();
  db.insert(careerBriefs)
    .values({
      id: userId,
      userId,
      briefJson: encryptJson(brief),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: careerBriefs.id,
      set: {
        briefJson: encryptJson(brief),
        updatedAt: now,
      },
    })
    .run();
  return brief;
}

export function loadCareerBrief(db: Database, userId: string): CareerBrief | null {
  const row = db
    .select()
    .from(careerBriefs)
    .where(and(eq(careerBriefs.id, userId), eq(careerBriefs.userId, userId)))
    .get();
  if (!row) return null;
  const parsed = careerBriefSchema.safeParse(decryptJson(row.briefJson));
  return parsed.success ? parsed.data : null;
}

export function listApplications(
  db: Database,
  userId: string,
  status?: ApplicationRecord["status"],
): ApplicationRecord[] {
  const rows = db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.updatedAt))
    .all()
    .filter((row) => !status || row.status === status);
  return rows
    .map((row) => {
      const record = applicationRecordSchema.safeParse({
        id: row.id,
        jobId: row.jobId,
        status: row.status,
        jobSnapshot: decryptJson(row.jobSnapshot),
        notes: decryptJson<string>(row.notes),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        appliedAt: row.appliedAt?.toISOString() ?? null,
      });
      return record.success ? record.data : null;
    })
    .filter((record): record is ApplicationRecord => Boolean(record));
}

export function upsertApplication(
  db: Database,
  userId: string,
  input: unknown,
): ApplicationRecord {
  const patch = applicationPatchSchema.parse(input);
  const now = new Date();
  const id = keyedHash(`${userId}:${patch.job.id}`);
  const existing = db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.jobId, patch.job.id)))
    .get();
  const createdAt = existing?.createdAt ?? now;
  const notes =
    patch.notes ?? (existing ? decryptJson<string>(existing.notes) : "");
  const appliedAt =
    patch.status === "applied"
      ? (existing?.appliedAt ?? now)
      : patch.status === "interview"
        ? (existing?.appliedAt ?? now)
        : existing?.appliedAt;

  db.insert(applications)
    .values({
      id,
      userId,
      jobId: patch.job.id,
      status: patch.status,
      jobSnapshot: encryptJson(patch.job),
      notes: encryptJson(notes),
      createdAt,
      updatedAt: now,
      appliedAt: appliedAt ?? null,
    })
    .onConflictDoUpdate({
      target: applications.id,
      set: {
        status: patch.status,
        jobSnapshot: encryptJson(patch.job),
        notes: encryptJson(notes),
        updatedAt: now,
        appliedAt: appliedAt ?? null,
      },
    })
    .run();

  return {
    id,
    jobId: patch.job.id,
    status: patch.status,
    jobSnapshot: patch.job,
    notes,
    createdAt: createdAt.toISOString(),
    updatedAt: now.toISOString(),
    appliedAt: appliedAt?.toISOString() ?? null,
  };
}

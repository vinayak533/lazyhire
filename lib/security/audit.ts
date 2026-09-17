import { randomUUID } from "node:crypto";
import type { openDatabase } from "@/lib/db/connection";
import { auditLogs } from "@/lib/db/schema";
import { clientFingerprint } from "./http";

type Database = ReturnType<typeof openDatabase>["db"];

export function audit(
  db: Database,
  request: Request,
  action: string,
  userId: string | null,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  const { ipHash } = clientFingerprint(request);
  db.insert(auditLogs)
    .values({
      id: randomUUID(),
      userId,
      action,
      metadataJson: JSON.stringify(metadata),
      ipHash,
      createdAt: new Date(),
    })
    .run();
}

import { eq } from "drizzle-orm";
import type { openDatabase } from "@/lib/db/connection";
import { rateLimits } from "@/lib/db/schema";
import { keyedHash } from "./crypto";
import { clientFingerprint } from "./http";

type Database = ReturnType<typeof openDatabase>["db"];

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super("Too many requests.");
  }
}

export function rateLimitKey(request: Request, action: string, subject = "") {
  return keyedHash(`${action}:${subject.toLowerCase()}:${clientFingerprint(request).rateKey}`);
}

export function checkRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = new Date(),
) {
  const existing = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
  if (!existing || existing.resetAt <= now) {
    db.insert(rateLimits)
      .values({ key, count: 1, resetAt: new Date(now.getTime() + windowMs) })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
      })
      .run();
    return;
  }
  if (existing.count >= limit) {
    throw new RateLimitError(
      Math.max(1, Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000)),
    );
  }
  db.update(rateLimits)
    .set({ count: existing.count + 1 })
    .where(eq(rateLimits.key, key))
    .run();
}

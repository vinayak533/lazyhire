import { createHmac, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { openDatabase } from "@/lib/db/connection";
import {
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
  users,
} from "@/lib/db/schema";
import {
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  hashPassword,
  keyedHash,
  randomToken,
  safeEqual,
  verifyPassword,
} from "@/lib/security/crypto";
import { audit } from "@/lib/security/audit";
import { clientFingerprint } from "@/lib/security/http";
import {
  checkRateLimit,
  rateLimitKey,
  RateLimitError,
} from "@/lib/security/rate-limit";
import { downloadCookieName, sessionCookieName } from "./constants";

type Database = ReturnType<typeof openDatabase>["db"];

export { downloadCookieName, sessionCookieName };

export const sessionDurationMs = 1000 * 60 * 60 * 24 * 7;
export const idleTimeoutMs = 1000 * 60 * 45;
export const emailVerificationDurationMs = 1000 * 60 * 60;
export const emailVerificationCooldownMs = 1000 * 60;

export interface AuthSession {
  tokenHash: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  csrfToken: string;
  expiresAt: Date;
  idleExpiresAt: Date;
}

const defaultPrivacy = {
  profileVisibility: "private",
  recruiterAccess: false,
  shareContactDetails: false,
  shareResumes: false,
  shareApplicationHistory: false,
};

export class AuthFlowError extends Error {
  constructor(
    public code:
      | "INVALID_EMAIL_VERIFICATION"
      | "EXPIRED_EMAIL_VERIFICATION"
      | "ALREADY_VERIFIED",
    message: string,
    public userId?: string,
  ) {
    super(message);
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function publicUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: decryptText(row.emailCiphertext),
    emailVerified: Boolean(row.emailVerifiedAt),
    mfaEnabled: row.mfaEnabled === 1,
    privacy: decryptJson<typeof defaultPrivacy>(row.privacyJson),
  };
}

function userEmail(row: typeof users.$inferSelect) {
  return decryptText(row.emailCiphertext);
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function sessionCookieOptions(expires: Date, request: Request) {
  return {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "strict" as const,
    path: "/",
    expires,
  };
}

function activeVerificationTokens(
  db: Database,
  userId: string,
  now = new Date(),
) {
  return db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.usedAt),
      ),
    )
    .all()
    .filter((row) => row.expiresAt > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function createEmailVerificationToken(
  db: Database,
  request: Request,
  userId: string,
) {
  const now = new Date();
  const latest = activeVerificationTokens(db, userId, now)[0];
  if (
    latest &&
    latest.createdAt.getTime() + emailVerificationCooldownMs > now.getTime()
  ) {
    throw new RateLimitError(
      Math.ceil(
        (latest.createdAt.getTime() +
          emailVerificationCooldownMs -
          now.getTime()) /
          1000,
      ),
    );
  }
  checkRateLimit(
    db,
    rateLimitKey(request, "email-verification-send", userId),
    5,
    60 * 60_000,
  );
  db.update(emailVerificationTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.usedAt),
      ),
    )
    .run();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + emailVerificationDurationMs);
  db.insert(emailVerificationTokens)
    .values({
      tokenHash: keyedHash(token),
      userId,
      createdAt: now,
      expiresAt,
    })
    .run();
  audit(db, request, "auth.email_verification_requested", userId, {});
  return { token, expiresAt };
}

export function createEmailVerificationForEmail(
  db: Database,
  request: Request,
  email: string,
):
  | {
      status: "sent";
      email: string;
      token: string;
      expiresAt: Date;
      cooldownSeconds: number;
    }
  | { status: "already_verified"; email: string; cooldownSeconds: number }
  | { status: "not_sent"; email: string; cooldownSeconds: number } {
  const normalized = normalizeEmail(email);
  checkRateLimit(
    db,
    rateLimitKey(request, "email-verification-resend", normalized),
    4,
    60 * 60_000,
  );
  const user = db
    .select()
    .from(users)
    .where(eq(users.emailHash, keyedHash(normalized)))
    .get();
  if (!user || user.deletedAt)
    return { status: "not_sent", email: normalized, cooldownSeconds: 60 };
  if (user.emailVerifiedAt)
    return {
      status: "already_verified",
      email: normalized,
      cooldownSeconds: 60,
    };
  const verification = createEmailVerificationToken(db, request, user.id);
  return {
    status: "sent",
    email: userEmail(user),
    token: verification.token,
    expiresAt: verification.expiresAt,
    cooldownSeconds: Math.ceil(emailVerificationCooldownMs / 1000),
  };
}

export async function registerUser(
  db: Database,
  request: Request,
  input: unknown,
) {
  const body = input as { email?: unknown; password?: unknown };
  const email =
    typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  checkRateLimit(db, rateLimitKey(request, "register", email), 5, 15 * 60_000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");
  if (password.length < 6)
    throw new Error("Use a password with at least 6 characters.");

  const now = new Date();
  const userId = randomUUID();
  const emailHash = keyedHash(email);
  const existing = db
    .select()
    .from(users)
    .where(eq(users.emailHash, emailHash))
    .get();
  if (existing?.deletedAt) throw new Error("This account is not available.");
  if (existing) throw new Error("This email already has an account. Sign in instead.");
  if (!existing) {
    db.insert(users)
      .values({
        id: userId,
        emailHash,
        emailCiphertext: encryptText(email),
        passwordHash: await hashPassword(password),
        emailVerifiedAt: now,
        privacyJson: encryptJson(defaultPrivacy),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  const user = db.select().from(users).where(eq(users.id, userId)).get()!;
  audit(db, request, "auth.register", user.id, {});
  return {
    userId: user.id,
    email: userEmail(user),
    verificationRequired: false,
    alreadyVerified: false,
  };
}

export function consumeEmailVerificationToken(
  db: Database,
  request: Request,
  token: string,
):
  | { status: "verified"; userId: string }
  | { status: "already_verified"; userId: string }
  | { status: "expired"; userId?: string }
  | { status: "invalid" } {
  checkRateLimit(
    db,
    rateLimitKey(request, "verify-email", token.slice(0, 16)),
    5,
    15 * 60_000,
  );
  if (!/^[A-Za-z0-9_-]{32,180}$/.test(token)) return { status: "invalid" };
  const tokenHash = keyedHash(token);
  const now = new Date();
  const row = db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .get();
  if (!row) return { status: "invalid" };
  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user || user.deletedAt) return { status: "invalid" };
  if (user.emailVerifiedAt)
    return { status: "already_verified", userId: user.id };
  if (row.usedAt) return { status: "invalid" };
  if (row.expiresAt <= now) return { status: "expired", userId: row.userId };
  db.update(emailVerificationTokens)
    .set({ usedAt: now })
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .run();
  db.update(emailVerificationTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailVerificationTokens.userId, row.userId),
        isNull(emailVerificationTokens.usedAt),
      ),
    )
    .run();
  db.update(users)
    .set({ emailVerifiedAt: now, updatedAt: now })
    .where(eq(users.id, row.userId))
    .run();
  audit(db, request, "auth.email_verified", row.userId, {});
  return { status: "verified", userId: row.userId };
}

export function verifyEmailToken(
  db: Database,
  request: Request,
  token: string,
) {
  const result = consumeEmailVerificationToken(db, request, token);
  if (result.status === "verified") return result.userId;
  if (result.status === "already_verified")
    throw new AuthFlowError(
      "ALREADY_VERIFIED",
      "This email address is already verified.",
      result.userId,
    );
  if (result.status === "expired")
    throw new AuthFlowError(
      "EXPIRED_EMAIL_VERIFICATION",
      "This verification link has expired.",
      result.userId,
    );
  throw new AuthFlowError(
    "INVALID_EMAIL_VERIFICATION",
    "This verification link is invalid.",
  );
}

export async function createSession(
  db: Database,
  request: Request,
  userId: string,
) {
  const token = randomToken();
  const csrfToken = randomToken();
  const now = new Date();
  const { ipHash, userAgentHash } = clientFingerprint(request);
  const expiresAt = new Date(now.getTime() + sessionDurationMs);
  const idleExpiresAt = new Date(now.getTime() + idleTimeoutMs);
  db.insert(sessions)
    .values({
      tokenHash: keyedHash(token),
      userId,
      csrfTokenHash: keyedHash(csrfToken),
      csrfTokenCiphertext: encryptText(csrfToken),
      ipHash,
      userAgentHash,
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt,
      expiresAt,
    })
    .run();
  audit(db, request, "auth.session_created", userId, {});
  return { token, expiresAt };
}

export async function authenticateUser(
  db: Database,
  request: Request,
  input: unknown,
) {
  const body = input as {
    email?: unknown;
    password?: unknown;
    mfaCode?: unknown;
  };
  const email =
    typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  checkRateLimit(db, rateLimitKey(request, "login", email), 8, 15 * 60_000);
  const row = db
    .select()
    .from(users)
    .where(eq(users.emailHash, keyedHash(email)))
    .get();
  const valid =
    row && !row.deletedAt
      ? await verifyPassword(password, row.passwordHash)
      : false;
  if (!valid || !row) throw new Error("Invalid email or password.");
  audit(db, request, "auth.login", row.id, {});
  return row.id;
}

export function getSession(db: Database, request: Request): AuthSession | null {
  const token = cookieValue(request, sessionCookieName);
  if (!token) return null;
  const tokenHash = keyedHash(token);
  const now = new Date();
  const row = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .get();
  if (!row || row.expiresAt <= now || row.idleExpiresAt <= now) {
    if (row)
      db.update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.tokenHash, tokenHash))
        .run();
    return null;
  }
  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user || user.deletedAt) return null;
  const idleExpiresAt = new Date(now.getTime() + idleTimeoutMs);
  db.update(sessions)
    .set({ lastSeenAt: now, idleExpiresAt })
    .where(eq(sessions.tokenHash, tokenHash))
    .run();
  return {
    tokenHash,
    userId: row.userId,
    email: decryptText(user.emailCiphertext),
    emailVerified: Boolean(user.emailVerifiedAt),
    csrfToken: decryptText(row.csrfTokenCiphertext),
    expiresAt: row.expiresAt,
    idleExpiresAt,
  };
}

export function requireSession(db: Database, request: Request) {
  const session = getSession(db, request);
  if (!session) throw new Error("AUTH_REQUIRED");
  return session;
}

export function verifyCsrf(request: Request, session: AuthSession) {
  const token = request.headers.get("x-csrf-token") ?? "";
  if (!token || !safeEqual(keyedHash(token), keyedHash(session.csrfToken)))
    throw new Error("CSRF_INVALID");
}

export function revokeCurrentSession(
  db: Database,
  request: Request,
  userId?: string,
) {
  const token = cookieValue(request, sessionCookieName);
  if (!token) return;
  db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, keyedHash(token)))
    .run();
  audit(db, request, "auth.logout", userId ?? null, {});
}

export function revokeAllSessions(
  db: Database,
  request: Request,
  userId: string,
) {
  db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.userId, userId))
    .run();
  audit(db, request, "auth.logout_all", userId, {});
}

export function createPasswordReset(
  db: Database,
  request: Request,
  email: string,
) {
  const normalized = normalizeEmail(email);
  checkRateLimit(
    db,
    rateLimitKey(request, "password-reset", normalized),
    4,
    60 * 60_000,
  );
  const user = db
    .select()
    .from(users)
    .where(eq(users.emailHash, keyedHash(normalized)))
    .get();
  const token = randomToken();
  if (user && !user.deletedAt) {
    const now = new Date();
    db.insert(passwordResetTokens)
      .values({
        tokenHash: keyedHash(token),
        userId: user.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
      })
      .run();
    audit(db, request, "auth.password_reset_requested", user.id, {});
  }
  return token;
}

export function createPasswordResetEmail(
  db: Database,
  request: Request,
  email: string,
): { email: string; token: string; expiresAt: Date } | null {
  const normalized = normalizeEmail(email);
  checkRateLimit(
    db,
    rateLimitKey(request, "password-reset", normalized),
    4,
    60 * 60_000,
  );
  const user = db
    .select()
    .from(users)
    .where(eq(users.emailHash, keyedHash(normalized)))
    .get();
  if (!user || user.deletedAt) return null;
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60_000);
  db.insert(passwordResetTokens)
    .values({
      tokenHash: keyedHash(token),
      userId: user.id,
      createdAt: now,
      expiresAt,
    })
    .run();
  audit(db, request, "auth.password_reset_requested", user.id, {});
  return { email: userEmail(user), token, expiresAt };
}

export async function resetPassword(
  db: Database,
  request: Request,
  token: string,
  password: string,
) {
  checkRateLimit(
    db,
    rateLimitKey(request, "password-reset-confirm"),
    8,
    15 * 60_000,
  );
  const row = db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, keyedHash(token)),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .get();
  const now = new Date();
  if (!row || row.expiresAt <= now)
    throw new Error("This password-reset link is invalid or expired.");
  if (password.length < 12)
    throw new Error("Use a password with at least 12 characters.");
  db.update(passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(passwordResetTokens.tokenHash, keyedHash(token)))
    .run();
  db.update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: now })
    .where(eq(users.id, row.userId))
    .run();
  revokeAllSessions(db, request, row.userId);
  audit(db, request, "auth.password_changed", row.userId, {});
}

export function generateTotpSecret() {
  return randomToken(20);
}

export function enableMfa(
  db: Database,
  request: Request,
  userId: string,
  secret: string,
) {
  db.update(users)
    .set({
      mfaEnabled: 1,
      mfaSecretCiphertext: encryptText(secret),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .run();
  audit(db, request, "auth.mfa_enabled", userId, {});
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((offset) => totp(secret, step + offset) === code);
}

export function totp(secret: string, counter: number) {
  const key = Buffer.from(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

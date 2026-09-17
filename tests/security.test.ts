import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { openDatabase } from "../lib/db/connection";
import {
  applications,
  careerBriefs,
  sessions,
  users,
} from "../lib/db/schema";
import {
  authenticateUser,
  createPasswordReset,
  createSession,
  getSession,
  registerUser,
  resetPassword,
  revokeAllSessions,
  sessionCookieName,
  verifyCsrf,
} from "../lib/auth/service";
import {
  buildPasswordResetUrl,
  sendPasswordResetEmail,
} from "../lib/email/service";
import {
  loadCareerBrief,
  listApplications,
  saveCareerBrief,
  upsertApplication,
} from "../lib/career/store";
import { createJob } from "../lib/sources/shared";
import { scanUploadedCv, UploadSecurityError } from "../lib/security/uploads";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { docxFixture, pdfFixture } from "./fixtures";

const password = "StrongPass123!";
const brief = {
  role: "React Developer",
  skills: ["React", "TypeScript"],
  experienceLevel: "mid",
  cities: ["kochi"],
  workMode: "hybrid",
  salaryPreference: "",
  sources: ["technopark", "indeed"],
  rankingGoal: "best-fit",
  cvUploadId: null,
} as const;

function req(cookie = "") {
  return new Request("http://127.0.0.1:3000/test", {
    headers: {
      cookie,
      "user-agent": "node-test",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

async function verifiedUser(email: string) {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  const registered = await registerUser(db, req(), { email, password });
  assert.equal(registered.verificationRequired, false);
  const userId = registered.userId;
  return { db, sqlite, userId };
}

test("auth hashes passwords, signs in with email and password, issues CSRF-protected sessions and expires idle sessions", async () => {
  const { db, sqlite, userId } = await verifiedUser("auth-a@example.test");
  try {
    const user = db.select().from(users).where(eq(users.id, userId)).get()!;
    assert.notEqual(user.passwordHash, password);
    assert.ok(user.emailVerifiedAt);
    await assert.rejects(
      authenticateUser(db, req(), {
        email: "auth-a@example.test",
        password: "wrong password",
      }),
    );
    await assert.doesNotReject(
      authenticateUser(db, req(), {
        email: "auth-a@example.test",
        password,
      }),
    );
    const created = await createSession(db, req(), userId);
    const session = getSession(
      db,
      req(`${sessionCookieName}=${created.token}`),
    )!;
    assert.equal(session.userId, userId);
    assert.doesNotThrow(() =>
      verifyCsrf(
        new Request("http://127.0.0.1:3000/test", {
          headers: { "x-csrf-token": session.csrfToken },
        }),
        session,
      ),
    );
    assert.throws(() => verifyCsrf(req(), session));
    db.update(sessions)
      .set({ idleExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, session.tokenHash))
      .run();
    assert.equal(
      getSession(db, req(`${sessionCookieName}=${created.token}`)),
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("password reset revokes active sessions and updates the stored password", async () => {
  const { db, sqlite, userId } = await verifiedUser("reset-a@example.test");
  try {
    const session = await createSession(db, req(), userId);
    const token = createPasswordReset(db, req(), "reset-a@example.test");
    await resetPassword(db, req(), token, "NewStrongPass123!");
    assert.equal(
      getSession(db, req(`${sessionCookieName}=${session.token}`)),
      null,
    );
    await assert.rejects(
      authenticateUser(db, req(), {
        email: "reset-a@example.test",
        password,
      }),
    );
    await assert.doesNotReject(
      authenticateUser(db, req(), {
        email: "reset-a@example.test",
        password: "NewStrongPass123!",
      }),
    );
  } finally {
    sqlite.close();
  }
});

test("simple registration rejects duplicate accounts and accepts short plain passwords", async () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  try {
    const registered = await registerUser(db, req(), {
      email: "fresh@example.test",
      password: "hunter2",
    });
    assert.equal(registered.email, "fresh@example.test");
    await assert.doesNotReject(
      authenticateUser(db, req(), {
        email: "fresh@example.test",
        password: "hunter2",
      }),
    );
    await assert.rejects(
      registerUser(db, req(), {
        email: "fresh@example.test",
        password: "another-secret",
      }),
      /already has an account/,
    );
  } finally {
    sqlite.close();
  }
});

test("password reset emails include a usable reset page link", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  const previousBase = process.env.APP_BASE_URL;
  process.env.RESEND_API_KEY = "resend-test-key";
  process.env.EMAIL_FROM = "LazyHire <verify@example.test>";
  process.env.APP_BASE_URL = "https://app.example.test";
  let payload: { subject?: string; html?: string; text?: string } = {};
  try {
    const resetUrl = buildPasswordResetUrl(
      new Request("https://app.example.test/login"),
      "reset-token",
    );
    const result = await sendPasswordResetEmail(
      {
        to: "user@example.test",
        resetUrl,
        expiresAt: new Date("2026-09-08T10:00:00.000Z"),
      },
      (async (_url, init) => {
        payload = JSON.parse(String(init?.body));
        return Response.json({ id: "email_reset_123" });
      }) as typeof fetch,
    );
    assert.equal(result.provider, "resend");
    assert.equal(payload.subject, "Reset your LazyHire password");
    assert.match(payload.text ?? "", /\/reset-password\?token=reset-token/);
    assert.match(payload.html ?? "", /Reset password/);
  } finally {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
    if (previousBase === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previousBase;
  }
});

test("career data is encrypted at rest and isolated by authenticated owner", async () => {
  const {
    db,
    sqlite,
    userId: userA,
  } = await verifiedUser("owner-a@example.test");
  const registeredB = await registerUser(db, req(), {
    email: "owner-b@example.test",
    password,
  });
  assert.equal(registeredB.verificationRequired, false);
  const userB = registeredB.userId;
  const job = createJob("technopark", {
    title: "React Developer",
    company: "Private Studio",
    location: "Kochi, Kerala",
    sourceUrl: "https://example.com/a",
  });
  try {
    saveCareerBrief(db, userA, brief);
    upsertApplication(db, userA, {
      job,
      status: "saved",
      notes: "private note",
    });
    assert.equal(loadCareerBrief(db, userB), null);
    assert.equal(listApplications(db, userB).length, 0);
    assert.equal(listApplications(db, userA).length, 1);
    const rawBrief = db
      .select()
      .from(careerBriefs)
      .where(eq(careerBriefs.userId, userA))
      .get()!;
    const rawApplication = db
      .select()
      .from(applications)
      .where(eq(applications.userId, userA))
      .get()!;
    assert.ok(!rawBrief.briefJson.includes("React Developer"));
    assert.ok(!rawApplication.notes.includes("private note"));
    assert.ok(!rawApplication.jobSnapshot.includes("Private Studio"));
  } finally {
    sqlite.close();
  }
});

test("logout from all devices invalidates every server-side session", async () => {
  const { db, sqlite, userId } = await verifiedUser("devices@example.test");
  try {
    const one = await createSession(db, req(), userId);
    const two = await createSession(db, req(), userId);
    revokeAllSessions(db, req(), userId);
    assert.equal(
      getSession(db, req(`${sessionCookieName}=${one.token}`)),
      null,
    );
    assert.equal(
      getSession(db, req(`${sessionCookieName}=${two.token}`)),
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("upload scanner rejects disguised files, active PDFs and DOCX external relationships", () => {
  assert.doesNotThrow(() =>
    scanUploadedCv(
      docxFixture(),
      "resume.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  );
  assert.doesNotThrow(() =>
    scanUploadedCv(pdfFixture(), "resume.pdf", "application/pdf"),
  );
  assert.throws(
    () =>
      scanUploadedCv(Buffer.from("not a pdf"), "resume.pdf", "application/pdf"),
    UploadSecurityError,
  );
  assert.throws(
    () =>
      scanUploadedCv(
        Buffer.from("%PDF-1.4\n1 0 obj << /OpenAction /JavaScript >>"),
        "resume.pdf",
        "application/pdf",
      ),
    UploadSecurityError,
  );
  assert.throws(
    () =>
      scanUploadedCv(
        docxFixture(),
        "resume.docx.exe",
        "application/octet-stream",
      ),
    UploadSecurityError,
  );
});

test("the CSP carries a per-request script nonce and private pages redirect when signed out", () => {
  const call = (pathname: string, cookie?: string) => {
    const url = `https://lazyhire.test${pathname}`;
    const request = new NextRequest(
      new Request(url, cookie ? { headers: { cookie } } : undefined),
    );
    return proxy(request);
  };

  const policyOf = (response: Response) => {
    const value = response.headers.get("content-security-policy");
    assert.ok(value, "every proxied response must carry a CSP");
    return value;
  };

  const login = policyOf(call("/login"));
  // A bare script-src 'self' blocks the framework bootstrap and leaves the
  // production build rendered but unhydrated, so the nonce must be present and
  // scripts must never fall back to unsafe-inline.
  const scriptSrc = login
    .split("; ")
    .find((directive) => directive.startsWith("script-src "));
  assert.ok(scriptSrc, "script-src must be declared");
  assert.match(scriptSrc, /'nonce-[a-f0-9]{32}'/);
  assert.match(scriptSrc, /'strict-dynamic'/);
  assert.equal(scriptSrc.includes("'unsafe-inline'"), false);
  assert.match(login, /frame-ancestors 'none'/);
  assert.match(login, /object-src 'none'/);

  // A fresh nonce per request, or it stops being a nonce.
  const first = policyOf(call("/login")).match(/'nonce-([a-f0-9]{32})'/)?.[1];
  const second = policyOf(call("/login")).match(/'nonce-([a-f0-9]{32})'/)?.[1];
  assert.notEqual(first, second);

  const signedOut = call("/cv");
  assert.equal(signedOut.status, 307);
  assert.match(signedOut.headers.get("location") ?? "", /\/login$/);
  policyOf(signedOut);

  const signedIn = call("/cv", `${sessionCookieName}=a-session-token`);
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.get("cache-control") ?? "", /no-store/);
});

import "server-only";

import { createConnection } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export class EmailDeliveryError extends Error {
  constructor(message = "Verification email could not be sent.") {
    super(message);
  }
}

export interface VerificationEmailInput {
  to: string;
  verificationUrl: string;
  expiresAt: Date;
}

export interface EmailDeliveryResult {
  provider: "resend" | "smtp" | "dev-outbox";
  id?: string;
}

export interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
  expiresAt: Date;
}

interface ActionEmailInput {
  to: string;
  url: string;
  expiresAt: Date;
  type: "verification" | "password-reset";
  subject: string;
  eyebrow: string;
  heading: string;
  body: string;
  cta: string;
  fallback: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fromAddress() {
  const configured = process.env.EMAIL_FROM?.trim();
  if (configured) return configured;
  if (process.env.RESEND_API_KEY?.trim())
    return "LazyHire <onboarding@resend.dev>";
  return "LazyHire <no-reply@lazyhire.local>";
}

function fromEmail() {
  return fromAddress().match(/<([^>]+)>/)?.[1] ?? fromAddress();
}

function appBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL?.trim();
  const requestOrigin = new URL(request.url).origin;
  if (!configured) return requestOrigin;
  if (process.env.NODE_ENV !== "production") {
    const configuredUrl = new URL(configured);
    const requestUrl = new URL(request.url);
    const localHosts = new Set(["localhost", "127.0.0.1"]);
    if (
      localHosts.has(configuredUrl.hostname) &&
      localHosts.has(requestUrl.hostname)
    )
      return requestOrigin;
  }
  return configured.replace(/\/+$/, "");
}

export function buildVerificationUrl(request: Request, token: string) {
  const url = new URL("/api/auth/verify", appBaseUrl(request));
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildPasswordResetUrl(request: Request, token: string) {
  const url = new URL("/reset-password", appBaseUrl(request));
  url.searchParams.set("token", token);
  return url.toString();
}

function actionEmailBody(input: ActionEmailInput) {
  const escapedUrl = escapeHtml(input.url);
  const expires = input.expiresAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f8f7f3;color:#1e293b;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ddd7cd;border-radius:8px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(input.eyebrow)}</p>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#111827;">${escapeHtml(input.heading)}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#475569;">${escapeHtml(input.body)} This link expires at ${escapeHtml(expires)} IST.</p>
                <p style="margin:0 0 28px;">
                  <a href="${escapedUrl}" style="display:inline-block;border-radius:6px;background:#12736a;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 18px;">${escapeHtml(input.cta)}</a>
                </p>
                <p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:#64748b;">${escapeHtml(input.fallback)}</p>
                <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;color:#334155;">${escapedUrl}</p>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#64748b;">If you did not request this, ignore this email. No account access is granted unless this link is opened.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    input.heading,
    "",
    `${input.body}: ${input.url}`,
    "",
    `This link expires at ${expires} IST.`,
    "If you did not request this, ignore this email.",
  ].join("\n");
  return { html, text, subject: input.subject };
}

function verificationAction(input: VerificationEmailInput): ActionEmailInput {
  return {
    to: input.to,
    url: input.verificationUrl,
    expiresAt: input.expiresAt,
    type: "verification",
    subject: "Verify your LazyHire email",
    eyebrow: "LazyHire verification",
    heading: "Verify your email address",
    body: "Confirm this email address to open your private Career OS workspace.",
    cta: "Verify email",
    fallback: "If the button does not work, paste this link into your browser:",
  };
}

function passwordResetAction(input: PasswordResetEmailInput): ActionEmailInput {
  return {
    to: input.to,
    url: input.resetUrl,
    expiresAt: input.expiresAt,
    type: "password-reset",
    subject: "Reset your LazyHire password",
    eyebrow: "LazyHire password reset",
    heading: "Reset your password",
    body: "Use this secure link to choose a new LazyHire password.",
    cta: "Reset password",
    fallback:
      "If the button does not work, paste this reset link into your browser:",
  };
}

function appendDevOutbox(input: ActionEmailInput) {
  const customOutbox = process.env.EMAIL_DEV_OUTBOX?.trim();
  const outboxPath = customOutbox
    ? resolve(/* turbopackIgnore: true */ customOutbox)
    : join(process.cwd(), "data", "email-outbox.jsonl");
  mkdirSync(dirname(outboxPath), { recursive: true });
  appendFileSync(
    outboxPath,
    `${JSON.stringify({
      type: input.type,
      to: input.to,
      verificationUrl: input.type === "verification" ? input.url : undefined,
      resetUrl: input.type === "password-reset" ? input.url : undefined,
      expiresAt: input.expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    })}\n`,
    "utf8",
  );
  console.info(`${input.subject} for ${input.to}: ${input.url}`);
}

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    pass,
    secure:
      process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
  };
}

function smtpRead(socket: TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(socket: TLSSocket, command: string, ok: number[]) {
  socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  const code = Number(response.slice(0, 3));
  if (!ok.includes(code)) throw new EmailDeliveryError();
}

function smtpConnect(
  host: string,
  port: number,
  secure: boolean,
): Promise<TLSSocket> {
  if (secure) {
    return new Promise((resolve, reject) => {
      const socket = connectTls({ host, port, servername: host }, () =>
        resolve(socket),
      );
      socket.once("error", reject);
    });
  }
  return new Promise((resolve, reject) => {
    const plain = createConnection({ host, port }, () => {
      const socket = plain as unknown as TLSSocket;
      resolve(socket);
    });
    plain.once("error", reject);
  });
}

async function sendSmtp(input: ActionEmailInput, html: string, text: string) {
  const config = smtpConfig();
  if (!config) return null;
  const boundary = `lazyhire-${Date.now().toString(36)}`;
  const message = [
    `From: ${fromAddress()}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
    "",
    `--${boundary}--`,
    ".",
  ].join("\r\n");
  const socket = await smtpConnect(config.host, config.port, config.secure);
  try {
    await smtpRead(socket);
    await smtpCommand(
      socket,
      `EHLO ${new URL(process.env.APP_BASE_URL ?? "http://localhost").hostname}`,
      [250],
    );
    if (!config.secure) {
      await smtpCommand(socket, "STARTTLS", [220]);
      const tlsSocket = connectTls({ socket, servername: config.host });
      await new Promise<void>((resolve, reject) => {
        tlsSocket.once("secureConnect", resolve);
        tlsSocket.once("error", reject);
      });
      await smtpCommand(
        tlsSocket,
        `EHLO ${new URL(process.env.APP_BASE_URL ?? "http://localhost").hostname}`,
        [250],
      );
      await smtpCommand(tlsSocket, "AUTH LOGIN", [334]);
      await smtpCommand(
        tlsSocket,
        Buffer.from(config.user).toString("base64"),
        [334],
      );
      await smtpCommand(
        tlsSocket,
        Buffer.from(config.pass).toString("base64"),
        [235],
      );
      await smtpCommand(tlsSocket, `MAIL FROM:<${fromEmail()}>`, [250]);
      await smtpCommand(tlsSocket, `RCPT TO:<${input.to}>`, [250, 251]);
      await smtpCommand(tlsSocket, "DATA", [354]);
      await smtpCommand(tlsSocket, message, [250]);
      tlsSocket.end("QUIT\r\n");
      return { provider: "smtp" as const };
    }
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(
      socket,
      Buffer.from(config.user).toString("base64"),
      [334],
    );
    await smtpCommand(
      socket,
      Buffer.from(config.pass).toString("base64"),
      [235],
    );
    await smtpCommand(socket, `MAIL FROM:<${fromEmail()}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${input.to}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    await smtpCommand(socket, message, [250]);
    socket.end("QUIT\r\n");
    return { provider: "smtp" as const };
  } catch (error) {
    socket.destroy();
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  }
}

async function sendActionEmail(
  input: ActionEmailInput,
  fetcher: typeof fetch = fetch,
): Promise<EmailDeliveryResult> {
  const { html, subject, text } = actionEmailBody(input);
  const resendKey = process.env.RESEND_API_KEY?.trim();

  if (resendKey) {
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: input.to,
          subject,
          html,
          text,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new EmailDeliveryError(
          body?.error?.message ??
            body?.message ??
            "Resend rejected the email. Check EMAIL_FROM and your verified domain.",
        );
      }
      const body = (await response.json().catch(() => null)) as {
        id?: string;
      } | null;
      return { provider: "resend", id: body?.id };
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw error;
      console.warn(
        error instanceof Error
          ? `Email provider fallback: ${error.message}`
          : "Email provider fallback: Resend could not send.",
      );
      appendDevOutbox(input);
      return { provider: "dev-outbox" };
    }
  }

  const smtpResult = await sendSmtp(input, html, text);
  if (smtpResult) return smtpResult;

  if (process.env.NODE_ENV !== "production") {
    appendDevOutbox(input);
    return { provider: "dev-outbox" };
  }

  throw new EmailDeliveryError(
    "Email delivery is not configured. Set RESEND_API_KEY or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM.",
  );
}

export async function sendVerificationEmail(
  input: VerificationEmailInput,
  fetcher: typeof fetch = fetch,
): Promise<EmailDeliveryResult> {
  return sendActionEmail(verificationAction(input), fetcher);
}

export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput,
  fetcher: typeof fetch = fetch,
): Promise<EmailDeliveryResult> {
  return sendActionEmail(passwordResetAction(input), fetcher);
}

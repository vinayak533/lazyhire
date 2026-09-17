import { config } from "dotenv";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/lib/db/connection";
import { aiJson, hasAiProvider } from "@/lib/ai/groq-client";
import { searchJobs } from "@/lib/jobs/search";
import { sourceLabels, type JobSource } from "@/lib/jobs/types";
import { sendVerificationEmail } from "@/lib/email/service";

config({ path: ".env.local", quiet: true });

type Status = "verified" | "partial" | "skipped" | "failed";

interface CheckResult {
  name: string;
  status: Status;
  detail: string;
}

function configured(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return (
    Boolean(trimmed) &&
    !/^your_/i.test(trimmed) &&
    !/^replace_with/i.test(trimmed)
  );
}

function print(results: CheckResult[]) {
  for (const result of results) {
    console.log(`[${result.status.toUpperCase()}] ${result.name}: ${result.detail}`);
  }
}

async function verifyJobSources(): Promise<CheckResult> {
  const directory = mkdtempSync(join(tmpdir(), "orvio-live-"));
  const databasePath = join(directory, "live-smoke.sqlite");
  const { db, sqlite } = openDatabase(databasePath);
  try {
    migrate(db, { migrationsFolder: "./drizzle" });
    const response = await searchJobs(
      { query: "react developer", location: "kochi" },
      { db, timeoutMs: 12_000 },
    );
    const available = response.sources.filter(
      (source) => source.status === "ok" || source.status === "partial",
    );
    const unavailable = response.sources.filter(
      (source) => source.status === "unavailable",
    );
    const sourceSummary = response.sources
      .map(
        (source) =>
          `${sourceLabels[source.source as JobSource]}=${source.status}/${source.count}`,
      )
      .join(", ");
    if (response.jobs.length > 0) {
      return {
        name: "Live job sources",
        status: unavailable.length ? "partial" : "verified",
        detail: `${response.jobs.length} usable jobs returned. ${sourceSummary}`,
      };
    }
    if (available.length > 0) {
      return {
        name: "Live job sources",
        status: "partial",
        detail: `Sources responded but returned no usable listings for the smoke query. ${sourceSummary}`,
      };
    }
    return {
      name: "Live job sources",
      status: "failed",
      detail: `No source returned a usable response. ${sourceSummary}`,
    };
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function verifyAiProvider(): Promise<CheckResult> {
  if (
    !hasAiProvider() ||
    (!configured(process.env.DEEPSEEK_API_KEY) &&
      !configured(process.env.DEEPSEEK_V4_FLASH_API_KEY) &&
      !configured(process.env.DEEPSEEK_KEY) &&
      !configured(process.env.GROQ_API_KEY) &&
      !configured(process.env.AI_API_KEY))
  ) {
    return {
      name: "Live AI provider",
      status: "skipped",
      detail: "No non-placeholder AI key is configured.",
    };
  }
  try {
    const result = await aiJson({
      messages: [
        {
          role: "system",
          content: "Return only valid JSON. No markdown.",
        },
        {
          role: "user",
          content: 'Return {"ok":true,"check":"orvio-live-ai"} exactly.',
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "live_ai_smoke",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["ok", "check"],
            properties: {
              ok: { type: "boolean" },
              check: { type: "string" },
            },
          },
        },
      },
    });
    const parsed = result as { ok?: unknown; check?: unknown };
    if (parsed.ok === true && parsed.check === "orvio-live-ai") {
      return {
        name: "Live AI provider",
        status: "verified",
        detail: "Provider returned structured JSON matching the smoke schema.",
      };
    }
    return {
      name: "Live AI provider",
      status: "failed",
      detail: "Provider returned JSON, but it did not match the expected smoke payload.",
    };
  } catch (error) {
    return {
      name: "Live AI provider",
      status: "failed",
      detail:
        error instanceof Error
          ? error.message
          : "The configured AI provider request failed.",
    };
  }
}

async function verifyEmailDelivery(): Promise<CheckResult> {
  const testRecipient =
    process.env.LIVE_EMAIL_TEST_TO?.trim() ??
    process.env.EMAIL_TEST_TO?.trim() ??
    "";
  const hasProvider =
    configured(process.env.RESEND_API_KEY) ||
    (configured(process.env.SMTP_HOST) &&
      configured(process.env.SMTP_USER) &&
      configured(process.env.SMTP_PASS));
  if (!hasProvider) {
    return {
      name: "Live email delivery",
      status: "skipped",
      detail: "No non-placeholder Resend or SMTP credentials are configured.",
    };
  }
  if (!testRecipient) {
    return {
      name: "Live email delivery",
      status: "skipped",
      detail:
        "Email credentials exist, but LIVE_EMAIL_TEST_TO is not set; no test email was sent.",
    };
  }
  try {
    const result = await sendVerificationEmail({
      to: testRecipient,
      verificationUrl: "https://example.test/api/auth/verify?token=live-smoke",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return {
      name: "Live email delivery",
      status: result.provider === "dev-outbox" ? "partial" : "verified",
      detail:
        result.provider === "dev-outbox"
          ? "Delivery fell back to the development outbox instead of a live provider."
          : `${result.provider} accepted the smoke email${result.id ? ` (${result.id})` : ""}.`,
    };
  } catch (error) {
    return {
      name: "Live email delivery",
      status: "failed",
      detail:
        error instanceof Error
          ? error.message
          : "The configured email provider request failed.",
    };
  }
}

async function main() {
  const results = [
    await verifyJobSources(),
    await verifyAiProvider(),
    await verifyEmailDelivery(),
  ];
  print(results);

  if (results.some((result) => result.status === "failed")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

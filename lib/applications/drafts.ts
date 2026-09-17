import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  applicationDraftSchema,
  applyDraftPrompt,
  normalizeToSchema,
  providerJsonSchema,
  PROMPT_VERSION,
  type ApplicationDraft,
} from "@/lib/ai/prompts";
import {
  aiJson,
  aiProviderLabel,
  circuit,
  hasAiProvider,
} from "@/lib/ai/groq-client";
import type { openDatabase } from "@/lib/db/connection";
import { applicationDrafts } from "@/lib/db/schema";
import type { NormalizedJob } from "@/lib/jobs/types";
import {
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  keyedHash,
} from "@/lib/security/crypto";
import type { ReadableCvUpload } from "@/lib/cv/store";

type Database = ReturnType<typeof openDatabase>["db"];

export const APPLY_DRAFT_PROMPT_VERSION = `${PROMPT_VERSION}:apply-draft-v1`;

export const draftStatusSchema = z.enum([
  "draft",
  "opened",
  "copied",
  "sent",
]);
export type DraftStatus = z.infer<typeof draftStatusSchema>;

export interface StoredApplicationDraft extends ApplicationDraft {
  id: string;
  applicationId: string;
  jobId: string;
  cvUploadId: string;
  recipientEmail: string;
  status: DraftStatus;
  providerLabel: string;
  cached: boolean;
  createdAt: string;
  updatedAt: string;
}

function firstLine(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length >= 2 && !/@/.test(line))
    ?.slice(0, 80);
}

function contactLines(cvText: string) {
  const email = cvText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = cvText.match(
    /(?:\+?\d[\d\s().-]{7,}\d)/,
  )?.[0]?.trim();
  return [email, phone].filter(Boolean).join(" | ");
}

function matchedTerms(cvText: string, job: NormalizedJob) {
  const cv = cvText.toLowerCase();
  const terms = [
    ...job.skills,
    ...job.title.split(/\W+/).filter((term) => term.length > 3),
  ];
  return [...new Set(terms)]
    .filter((term) => cv.includes(term.toLowerCase()))
    .slice(0, 6);
}

export function fallbackApplicationDraft(
  cvText: string,
  job: NormalizedJob,
): ApplicationDraft {
  const name = firstLine(cvText) ?? "Candidate";
  const contacts = contactLines(cvText);
  const matches = matchedTerms(cvText, job);
  const evidence = matches.length
    ? `My background includes ${matches.join(", ")}, which aligns with the role requirements.`
    : "My CV includes relevant experience for this opening, and I would welcome the chance to discuss fit in more detail.";
  const body = [
    `Hello ${job.company} team,`,
    "",
    `I am applying for the ${job.title} position at ${job.company}. ${evidence}`,
    "",
    "I have attached my resume for your review. I would be glad to share more context on my work and availability.",
    "",
    "Thank you for your time and consideration.",
    "",
    `Regards,`,
    name,
    contacts,
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n")
    .trim();

  return {
    subject: `Application for ${job.title} - ${name}`,
    body,
    matchedEvidence: matches.length
      ? matches.map((term) => `CV mentions ${term}.`)
      : ["Draft uses only broad resume-backed positioning."],
    cautions: job.skills
      .filter((skill) => !matches.includes(skill))
      .slice(0, 4)
      .map((skill) => `${skill} was requested by the job but not found in the CV text.`),
    checklist: [
      "Attach the correct resume before sending.",
      "Confirm the recipient and company name.",
      "Review the message for accuracy.",
    ],
  };
}

function parseStoredDraft(
  row: typeof applicationDrafts.$inferSelect,
  cached: boolean,
): StoredApplicationDraft | null {
  try {
    const extra = decryptJson<{
      job: NormalizedJob;
      matchedEvidence: string[];
      cautions: string[];
      checklist: string[];
    }>(row.jobSnapshot);
    const draft = applicationDraftSchema.parse({
      subject: decryptText(row.subjectCiphertext),
      body: decryptText(row.bodyCiphertext),
      matchedEvidence: extra.matchedEvidence,
      cautions: extra.cautions,
      checklist: extra.checklist,
    });
    return {
      id: row.id,
      applicationId: row.applicationId,
      jobId: extra.job.id,
      cvUploadId: row.cvUploadId,
      recipientEmail: decryptText(row.recipientEmailCiphertext),
      status: draftStatusSchema.parse(row.status),
      providerLabel: row.providerLabel,
      cached,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...draft,
    };
  } catch {
    return null;
  }
}

export async function generateApplicationDraft({
  db,
  userId,
  job,
  cv,
}: {
  db: Database;
  userId: string;
  job: NormalizedJob;
  cv: ReadableCvUpload;
}): Promise<StoredApplicationDraft> {
  const applicationId = keyedHash(`${userId}:${job.id}`);
  const cached = db
    .select()
    .from(applicationDrafts)
    .where(
      and(
        eq(applicationDrafts.userId, userId),
        eq(applicationDrafts.jobId, job.id),
        eq(applicationDrafts.cvUploadId, cv.id),
      ),
    )
    .orderBy(desc(applicationDrafts.updatedAt))
    .get();
  if (cached) {
    const parsed = parseStoredDraft(cached, true);
    if (parsed) return parsed;
  }

  let draft = fallbackApplicationDraft(cv.text, job);
  let providerLabel = "Local template";
  if (hasAiProvider() && circuit.enter()) {
    try {
      draft = normalizeToSchema(
        applicationDraftSchema,
        await aiJson(
          {
            messages: [
              { role: "system", content: applyDraftPrompt },
              {
                role: "user",
                content: JSON.stringify({
                  cv: cv.text.slice(0, 20_000),
                  job: {
                    title: job.title,
                    company: job.company,
                    location: job.location,
                    description: job.description.slice(0, 12_000),
                    skills: job.skills,
                    recipientEmail: job.applicationEmail,
                  },
                }),
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "application_draft",
                strict: true,
                schema: providerJsonSchema(applicationDraftSchema),
              },
            },
          },
          fetch,
          { timeoutMs: 30_000 },
        ),
      );
      providerLabel = aiProviderLabel();
      circuit.success();
    } catch {
      circuit.failure();
    }
  }

  const now = new Date();
  const id = randomUUID();
  db.insert(applicationDrafts)
    .values({
      id,
      userId,
      applicationId,
      jobId: job.id,
      cvUploadId: cv.id,
      jobSnapshot: encryptJson({
        job,
        matchedEvidence: draft.matchedEvidence,
        cautions: draft.cautions,
        checklist: draft.checklist,
      }),
      recipientEmailCiphertext: encryptText(job.applicationEmail ?? ""),
      subjectCiphertext: encryptText(draft.subject),
      bodyCiphertext: encryptText(draft.body),
      status: "draft",
      providerLabel,
      promptVersion: APPLY_DRAFT_PROMPT_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    applicationId,
    jobId: job.id,
    cvUploadId: cv.id,
    recipientEmail: job.applicationEmail ?? "",
    status: "draft",
    providerLabel,
    cached: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...draft,
  };
}

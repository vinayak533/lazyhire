import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  PROMPT_VERSION,
  tailoredCvSchema,
  tailorCvPrompt,
  tailorRepairPrompt,
  normalizeToSchema,
  providerJsonSchema,
} from "@/lib/ai/prompts";
import {
  AI_UNAVAILABLE_MESSAGE,
  aiJson,
  aiProviderLabel,
  circuit,
} from "@/lib/ai/groq-client";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import type { CvResult } from "@/lib/cv/types";
import {
  GuardrailError,
  guardrailProblems,
  verifiedChanges,
} from "@/lib/cv/tailor-guardrails";
import { getDb } from "@/lib/db";
import { aiAnalysisCache, cvUploads } from "@/lib/db/schema";
import { readLimitedBody } from "@/lib/http";
import { audit } from "@/lib/security/audit";
import { decryptJson, decryptText, encryptJson } from "@/lib/security/crypto";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAILOR_PROMPT_VERSION = `${PROMPT_VERSION}:tailor-v3`;

/** A full CV draft is a long generation; 20s cuts healthy responses short. */
const TAILOR_TIMEOUT_MS = 45_000;

const GUARDRAIL_MESSAGE =
  "The generated CV draft kept adding details your CV does not support, so LazyHire discarded it. Your original CV has not been changed — try again in a moment.";

const unavailable = (message = AI_UNAVAILABLE_MESSAGE) =>
  jsonResponse(
    {
      fallback: true,
      circuitOpen: circuit.openUntil > Date.now(),
      error: {
        code: "AI_UNAVAILABLE",
        message,
      },
      retryAfter: 60,
    },
    { status: 503, headers: { "Retry-After": "60" } },
  );


export async function POST(request: Request) {
  let entered = false;
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    const input = z
      .object({
        cvId: z.uuid(),
        targetRole: z.string().trim().min(2).max(180),
        jobDescription: z.string().trim().min(80).max(20_000),
        companyName: z.string().trim().max(180).optional().default(""),
      })
      .safeParse(
        JSON.parse(
          Buffer.from(await readLimitedBody(request, 100_000)).toString(
            "utf8",
          ),
        ),
      );
    if (!input.success)
      return jsonResponse(
        {
          error: {
            message:
              "Add a target role and a job description between 80 and 20,000 characters after analyzing a CV.",
          },
        },
        { status: 400 },
      );
    const upload = db
      .select()
      .from(cvUploads)
      .where(
        and(
          eq(cvUploads.id, input.data.cvId),
          eq(cvUploads.userId, session.userId),
        ),
      )
      .get();
    if (!upload)
      return jsonResponse(
        { error: { message: "Please upload and analyze your CV again." } },
        { status: 404 },
      );
    const result = decryptJson<CvResult>(upload.resultJson);
    const cvText = decryptText(upload.textCiphertext);
    if (result.parsed.imageOnly || cvText.length < 80)
      return jsonResponse(
        {
          error: {
            message:
              "The CV needs readable text before a tailored draft is possible.",
          },
        },
        { status: 422 },
      );

    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          TAILOR_PROMPT_VERSION,
          aiProviderLabel(),
          session.userId,
          cvText,
          input.data.targetRole,
          input.data.companyName,
          input.data.jobDescription,
        ]),
      )
      .digest("hex");
    const cached = db
      .select()
      .from(aiAnalysisCache)
      .where(
        and(
          eq(aiAnalysisCache.contentHash, hash),
          eq(aiAnalysisCache.userId, session.userId),
        ),
      )
      .get();
    if (cached) {
      try {
        const tailored = tailoredCvSchema.safeParse(
          decryptJson(cached.resultJson),
        );
        if (tailored.success)
          return jsonResponse({ tailored: tailored.data, cached: true });
      } catch {
        /* Regenerate a damaged entry. */
      }
    }

    if (!circuit.enter()) return unavailable();
    entered = true;
    const messages = [
      { role: "system", content: tailorCvPrompt },
      {
        role: "user",
        content: JSON.stringify({
          cv: cvText,
          target_role: input.data.targetRole,
          company_name: input.data.companyName || null,
          job_description: input.data.jobDescription,
        }),
      },
    ];
    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "tailored_cv",
        strict: true,
        schema: providerJsonSchema(tailoredCvSchema),
      },
    };

    // A first draft that quietly adds an undocumented skill or a derived number
    // is repairable: replay the violations once before giving up, so a single
    // slip does not cost the user their tailored CV.
    let tailored = normalizeToSchema(
      tailoredCvSchema,
      await aiJson({ messages, response_format: responseFormat }, fetch, {
        timeoutMs: TAILOR_TIMEOUT_MS,
      }),
    );
    let problems = guardrailProblems(cvText, tailored);
    if (problems.length) {
      tailored = normalizeToSchema(
        tailoredCvSchema,
        await aiJson(
          {
            messages: [
              ...messages,
              { role: "user", content: tailorRepairPrompt(problems) },
            ],
            response_format: responseFormat,
          },
          fetch,
          { timeoutMs: TAILOR_TIMEOUT_MS, attemptsPerProvider: 1 },
        ),
      );
      problems = guardrailProblems(cvText, tailored);
    }
    if (problems.length) throw new GuardrailError(problems.join(" "));
    tailored.changes = verifiedChanges(cvText, tailored);
    circuit.success();
    entered = false;
    db.insert(aiAnalysisCache)
      .values({
        contentHash: hash,
        userId: session.userId,
        resultJson: encryptJson(tailored),
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: aiAnalysisCache.contentHash,
        set: { resultJson: encryptJson(tailored), createdAt: new Date() },
      })
      .run();
    audit(db, request, "cv.tailored", session.userId, { cvId: upload.id });
    return jsonResponse({ tailored, cached: false });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED")
      return authError();
    if (error instanceof Error && error.message === "CSRF_INVALID")
      return forbidden("Refresh the page and try again.");
    // A rejected draft is a model accuracy problem, not a provider outage, so it
    // must not count towards the circuit breaker that protects every AI route.
    if (error instanceof GuardrailError) {
      if (entered) {
        circuit.success();
        entered = false;
      }
      return jsonResponse(
        {
          error: { code: "AI_GUARDRAIL", message: GUARDRAIL_MESSAGE },
          guardrail: error.message,
        },
        { status: 422 },
      );
    }
    if (entered) {
      circuit.failure();
      return unavailable();
    }
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === "BODY_TOO_LARGE")
    )
      return jsonResponse(
        { error: { message: "Send a valid, reasonably sized job target." } },
        { status: 400 },
      );
    return unavailable();
  }
}

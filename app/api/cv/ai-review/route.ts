import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  aiReviewSchema,
  bulletRewritePrompt,
  normalizeToSchema,
  providerJsonSchema,
  PROMPT_VERSION,
  semanticFitPrompt,
} from "@/lib/ai/prompts";
import {
  AI_UNAVAILABLE_MESSAGE,
  aiJson,
  aiProviderLabel,
  circuit,
} from "@/lib/ai/groq-client";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import type { CvResult } from "@/lib/cv/types";
import { getDb } from "@/lib/db";
import { aiAnalysisCache, cvUploads } from "@/lib/db/schema";
import { readLimitedBody } from "@/lib/http";
import { audit } from "@/lib/security/audit";
import { decryptJson, decryptText, encryptJson } from "@/lib/security/crypto";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unavailable = () =>
  jsonResponse(
    {
      fallback: true,
      circuitOpen: circuit.openUntil > Date.now(),
      error: {
        code: "AI_UNAVAILABLE",
        message: AI_UNAVAILABLE_MESSAGE,
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
        jobDescription: z.string().trim().min(80).max(20_000),
      })
      .safeParse(
        JSON.parse(
          Buffer.from(await readLimitedBody(request, 90_000)).toString("utf8"),
        ),
      );
    if (!input.success)
      return jsonResponse(
        {
          error: {
            message:
              "Add a job description between 80 and 20,000 characters and analyze a CV first.",
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
              "The CV needs readable text before an AI review is possible.",
          },
        },
        { status: 422 },
      );
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          PROMPT_VERSION,
          aiProviderLabel(),
          session.userId,
          cvText,
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
        const review = aiReviewSchema.safeParse(
          decryptJson(cached.resultJson),
        );
        if (review.success)
          return jsonResponse({ review: review.data, cached: true });
      } catch {
        /* Regenerate a damaged entry. */
      }
    }
    if (!circuit.enter()) return unavailable();
    entered = true;
    const flaggedIds = new Set(
      result.analysis.issues.map((issue) => issue.bulletId),
    );
    const bullets = result.analysis.bullets
      .filter((bullet) => flaggedIds.has(bullet.id))
      .slice(0, 12);
    const raw = await aiJson({
      messages: [
        {
          role: "system",
          content: `${semanticFitPrompt}\n${bulletRewritePrompt()}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            cv: cvText,
            job_description: input.data.jobDescription,
            flagged_bullets: bullets.map(({ id, text }) => ({ id, text })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cv_review",
          strict: true,
          schema: providerJsonSchema(aiReviewSchema),
        },
      },
    });
    const review = normalizeToSchema(aiReviewSchema, raw);
    review.rewrites = review.rewrites.flatMap((rewrite) => {
      const original = bullets.find(
        (bullet) => bullet.id === rewrite.bullet_id,
      );
      if (!original) return [];
      const numbers: string[] = original.text.match(/\d+(?:[.,]\d+)?%?/g) ?? [];
      const versions = rewrite.versions.filter((version) =>
        (version.match(/\d+(?:[.,]\d+)?%?/g) ?? []).every((number) =>
          numbers.includes(number),
        ),
      );
      return versions.length ? [{ ...rewrite, versions }] : [];
    });
    circuit.success();
    entered = false;
    db.insert(aiAnalysisCache)
      .values({
        contentHash: hash,
        userId: session.userId,
        resultJson: encryptJson(review),
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: aiAnalysisCache.contentHash,
        set: { resultJson: encryptJson(review), createdAt: new Date() },
      })
      .run();
    audit(db, request, "cv.ai_reviewed", session.userId, { cvId: upload.id });
    return jsonResponse({ review, cached: false });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED")
      return authError();
    if (error instanceof Error && error.message === "CSRF_INVALID")
      return forbidden("Refresh the page and try again.");
    if (entered) {
      circuit.failure();
      return unavailable();
    }
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === "BODY_TOO_LARGE")
    )
      return jsonResponse(
        {
          error: { message: "Send a valid, reasonably sized job description." },
        },
        { status: 400 },
      );
    return unavailable();
  }
}

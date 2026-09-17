import { z, ZodError } from "zod";
import {
  AiUnavailableError,
  aiJson,
  circuit,
  hasAiProvider,
} from "@/lib/ai/groq-client";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { rankJobs } from "@/lib/career/ranking";
import { loadCareerBrief } from "@/lib/career/store";
import { careerBriefSchema } from "@/lib/career/types";
import { getDb } from "@/lib/db";
import { normalizedJobSchema } from "@/lib/jobs/types";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";
import { readLimitedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const insightsRequestSchema = z.object({
  jobs: z.array(normalizedJobSchema),
  brief: careerBriefSchema.optional(),
  profileText: z.string().max(200_000).optional().default(""),
});

const aiInsightSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      summary: z.string().min(1).max(260).optional(),
      resumeSuggestion: z.string().min(1).max(260).optional(),
      coverLetterSuggestion: z.string().min(1).max(260).optional(),
    }),
  ),
});

export async function POST(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    const input = insightsRequestSchema.parse(
      JSON.parse(
        Buffer.from(await readLimitedBody(request, 350_000)).toString("utf8"),
      ),
    );
    const brief = input.brief ?? loadCareerBrief(db, session.userId);
    if (!brief) {
      return jsonResponse(
        {
          error: {
            code: "BRIEF_REQUIRED",
            message: "Save a career brief before ranking jobs.",
          },
        },
        { status: 400 },
      );
    }
    const ranked = rankJobs(input.jobs, brief, input.profileText);
    let fallback = "";
    if (hasAiProvider() && circuit.enter()) {
      try {
        const ai = aiInsightSchema.parse(
          await aiJson({
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "Return compact JSON only. Improve fit summaries, resume suggestions, and cover-letter starters without inventing facts.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  brief,
                  profileText: input.profileText.slice(0, 8000),
                  jobs: ranked.slice(0, 5).map(({ job, insight }) => ({
                    id: job.id,
                    title: job.title,
                    company: job.company,
                    description: job.description.slice(0, 1800),
                    matchedSkills: insight.matchedSkills,
                    missingSkills: insight.missingSkills,
                  })),
                }),
              },
            ],
          }),
        );
        const aiById = new Map(ai.jobs.map((job) => [job.id, job]));
        ranked.forEach((item) => {
          const aiJob = aiById.get(item.job.id);
          if (!aiJob) return;
          item.insight = {
            ...item.insight,
            summary: aiJob.summary ?? item.insight.summary,
            resumeSuggestion:
              aiJob.resumeSuggestion ?? item.insight.resumeSuggestion,
            coverLetterSuggestion:
              aiJob.coverLetterSuggestion ?? item.insight.coverLetterSuggestion,
          };
        });
        circuit.success();
      } catch (error) {
        circuit.failure();
        if (error instanceof AiUnavailableError)
          fallback = "AI insight layer is quiet; local scoring is active.";
      }
    }
    return jsonResponse(
      { ranked, ...(fallback ? { fallback } : {}) },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED")
      return authError();
    if (error instanceof Error && error.message === "CSRF_INVALID")
      return forbidden("Refresh the page and try again.");
    const message =
      error instanceof ZodError
        ? "The job insight request is not valid."
        : "Job insights are temporarily unavailable.";
    return jsonResponse(
      { error: { code: "INSIGHTS_UNAVAILABLE", message } },
      { status: 400 },
    );
  }
}

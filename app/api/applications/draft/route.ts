import { z, ZodError } from "zod";
import { generateApplicationDraft } from "@/lib/applications/drafts";
import { upsertApplication } from "@/lib/career/store";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { loadLatestReadableCv, loadReadableCv } from "@/lib/cv/store";
import { getDb } from "@/lib/db";
import { readLimitedBody } from "@/lib/http";
import { normalizedJobSchema } from "@/lib/jobs/types";
import { audit } from "@/lib/security/audit";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  job: normalizedJobSchema,
  cvId: z.uuid().optional(),
});

export async function POST(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    const input = requestSchema.parse(
      JSON.parse(
        Buffer.from(await readLimitedBody(request, 140_000)).toString("utf8"),
      ),
    );
    const cv = input.cvId
      ? loadReadableCv(db, session.userId, input.cvId)
      : loadLatestReadableCv(db, session.userId);
    if (!cv)
      return jsonResponse(
        {
          error: {
            code: "RESUME_REQUIRED",
            message:
              "Upload a readable PDF or DOCX resume before drafting this application.",
          },
        },
        { status: 409 },
      );

    const draft = await generateApplicationDraft({
      db,
      userId: session.userId,
      job: input.job,
      cv,
    });
    const application = upsertApplication(db, session.userId, {
      job: input.job,
      status: "saved",
    });
    audit(db, request, "application.draft_created", session.userId, {
      jobId: input.job.id,
      cvId: cv.id,
      draftId: draft.id,
      providerLabel: draft.providerLabel,
    });
    return jsonResponse({ draft, application });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED")
      return authError();
    if (error instanceof Error && error.message === "CSRF_INVALID")
      return forbidden("Refresh the page and try again.");
    const message =
      error instanceof ZodError
        ? "Choose a valid job before drafting an application."
        : error instanceof SyntaxError ||
            (error instanceof Error && error.message === "BODY_TOO_LARGE")
          ? "Send a valid, reasonably sized job."
          : "The application draft could not be prepared.";
    return jsonResponse(
      { error: { code: "DRAFT_UNAVAILABLE", message } },
      { status: 400 },
    );
  }
}

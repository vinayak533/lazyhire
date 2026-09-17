import { NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  listApplications,
  upsertApplication,
} from "@/lib/career/store";
import { applicationStatuses } from "@/lib/career/types";
import { getDb } from "@/lib/db";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { audit } from "@/lib/security/audit";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";
import { readLimitedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const db = getDb();
  let session;
  try {
    session = requireSession(db, request);
  } catch {
    return authError();
  }
  const status = request.nextUrl.searchParams.get("status");
  if (status && !applicationStatuses.includes(status as never)) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_STATUS",
          message: "Use Saved, Applied, Interview, or Rejected.",
        },
      },
      { status: 400 },
    );
  }
  return jsonResponse(
    { applications: listApplications(db, session.userId, status as never) },
  );
}

export async function PATCH(request: Request) {
  const db = getDb();
  let session;
  try {
    session = requireSession(db, request);
    verifyCsrf(request, session);
    const body = JSON.parse(
      Buffer.from(await readLimitedBody(request, 250_000)).toString("utf8"),
    );
    const application = upsertApplication(db, session.userId, body);
    audit(db, request, "application.updated", session.userId, {
      jobId: application.jobId,
      status: application.status,
    });
    return jsonResponse({ application });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED")
      return authError();
    if (error instanceof Error && error.message === "CSRF_INVALID")
      return forbidden("Refresh the page and try again.");
    const message =
      error instanceof ZodError
        ? "The application update is missing a job or valid status."
        : "The application could not be updated.";
    return jsonResponse(
      { error: { code: "INVALID_APPLICATION", message } },
      { status: 400 },
    );
  }
}

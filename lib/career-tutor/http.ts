import "server-only";
import { z } from "zod";
import { readLimitedBody } from "@/lib/http";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";
import { RateLimitError } from "@/lib/security/rate-limit";
import { TutorError } from "./store";
export async function tutorBody(request: Request) {
  return JSON.parse(Buffer.from(await readLimitedBody(request, 12_000)).toString("utf8"));
}
export function tutorError(error: unknown) {
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return authError();
  if (error instanceof Error && error.message === "CSRF_INVALID") return forbidden("Refresh the page and try again.");
  if (error instanceof RateLimitError) return jsonResponse({error: {message: "Please pause before sending another question."}}, {status: 429, headers: {"Retry-After": String(error.retryAfter)}});
  if (error instanceof TutorError) return jsonResponse({error: {message: error.message}}, {status: error.status});
  if (error instanceof z.ZodError || error instanceof SyntaxError || (error instanceof Error && error.message === "BODY_TOO_LARGE")) return jsonResponse({error: {message: "Send a question of up to 2,000 characters and valid conversation details."}}, {status: 400});
  return jsonResponse({error: {message: "The career tutor is temporarily unavailable. Please try again."}}, {status: 503});
}

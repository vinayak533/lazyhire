import type { NormalizedJob } from "./types";

/**
 * Human wording for a posting date. Only a date the source itself supplied is
 * ever shown; without one the card says so instead of guessing.
 */
export function postedLabel(
  job: Pick<NormalizedJob, "datePosted" | "datePostedIsApproximate">,
  now = Date.now(),
): string {
  if (!job.datePosted) return "Date not verified";
  const timestamp = Date.parse(job.datePosted);
  if (!Number.isFinite(timestamp)) return "Date not verified";
  const days = Math.max(0, Math.floor((now - timestamp) / 86_400_000));
  if (days === 0) return "Posted today";
  if (days === 1) return "1 day ago";
  if (days < 60) return `${days} days ago`;
  return `Posted ${new Date(timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`;
}

/** Whether a posting is recent enough to highlight. */
export function freshnessTier(
  job: Pick<NormalizedJob, "datePosted">,
  now = Date.now(),
): "today" | "3d" | "7d" | "14d" | "30d" | "older" | "unknown" {
  if (!job.datePosted) return "unknown";
  const timestamp = Date.parse(job.datePosted);
  if (!Number.isFinite(timestamp)) return "unknown";
  const hours = (now - timestamp) / 3_600_000;
  if (hours <= 24) return "today";
  if (hours <= 72) return "3d";
  if (hours <= 24 * 7) return "7d";
  if (hours <= 24 * 14) return "14d";
  if (hours <= 24 * 30) return "30d";
  return "older";
}

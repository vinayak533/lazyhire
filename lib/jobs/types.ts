import { z } from "zod";

export const sourceIds = [
  "technopark",
  "indeed",
  "infopark",
  "ul-cyberpark",
  "kkem",
  "jobsnear",
  "evanios",
  "internshala",
  "web",
] as const;
export type JobSource = (typeof sourceIds)[number];
export const sourceLabels: Record<JobSource, string> = {
  technopark: "Technopark",
  indeed: "Indeed India",
  infopark: "Infopark",
  "ul-cyberpark": "UL CyberPark",
  kkem: "Kerala Knowledge Mission",
  jobsnear: "JobsNEAR.in",
  evanios: "Evanios Jobs",
  internshala: "Internshala Kerala",
  web: "Web discovery",
};
/** Sources LazyHire reads directly; web discovery runs after them. */
export const directSourceIds = sourceIds.filter((source) => source !== "web");

export interface NormalizedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  locationBasis: "job" | "company" | "unknown";
  datePosted: string | null;
  datePostedIsApproximate: boolean;
  applyUrl: string | null;
  applicationEmail: string | null;
  applicationLinks: { label: string; url: string }[];
  source: JobSource;
  sourceUrl: string | null;
  sources: { source: JobSource; label: string; url: string | null }[];
  description: string;
  snippet: string;
  jobType: "full-time" | "part-time" | "internship" | "contract" | null;
  closingDate: string | null;
  experience: string | null;
  salary: string | null;
  skills: string[];
}

const httpUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value));
export const normalizedJobSchema: z.ZodType<NormalizedJob> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  locationBasis: z.enum(["job", "company", "unknown"]),
  datePosted: z.iso.datetime().nullable(),
  datePostedIsApproximate: z.boolean(),
  applyUrl: httpUrl.nullable(),
  applicationEmail: z.email().nullable(),
  applicationLinks: z.array(z.object({ label: z.string(), url: httpUrl })),
  source: z.enum(sourceIds),
  sourceUrl: httpUrl.nullable(),
  sources: z.array(
    z.object({
      source: z.enum(sourceIds),
      label: z.string(),
      url: httpUrl.nullable(),
    }),
  ),
  description: z.string(),
  snippet: z.string(),
  jobType: z
    .enum(["full-time", "part-time", "internship", "contract"])
    .nullable(),
  closingDate: z.iso.datetime().nullable(),
  experience: z.string().min(1).max(160).nullable().default(null),
  salary: z.string().min(1).max(160).nullable().default(null),
  skills: z.array(z.string().min(1).max(60)).max(30).default([]),
});

export interface SourceResult {
  jobs: NormalizedJob[];
  hasMore: boolean;
  warnings?: string[];
}

export const sourceStatusSchema = z.object({
  source: z.enum(sourceIds),
  label: z.string(),
  status: z.enum(["ok", "partial", "unavailable", "skipped"]),
  count: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  code: z.string().optional(),
  message: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export const cachedSearchSchema = z.object({
  jobs: z.array(normalizedJobSchema),
  sources: z.array(sourceStatusSchema),
  partial: z.boolean(),
});
export type SearchPayload = z.infer<typeof cachedSearchSchema>;

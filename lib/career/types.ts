import { z } from "zod";
import { locations } from "@/lib/jobs/locations";
import {
  normalizedJobSchema,
  sourceIds,
  type NormalizedJob,
} from "@/lib/jobs/types";

export const applicationStatuses = [
  "saved",
  "applied",
  "interview",
  "rejected",
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

export const experienceLevels = ["entry", "mid", "senior", "lead"] as const;
export const workModes = ["any", "onsite", "hybrid", "remote"] as const;
export const rankingGoals = ["best-fit", "fast-apply", "growth-stretch"] as const;

const locationIds = Object.keys(locations) as [
  keyof typeof locations,
  ...(keyof typeof locations)[],
];

export const careerBriefSchema = z.object({
  role: z.string().trim().min(2).max(120),
  skills: z
    .array(z.string().trim().min(1).max(50))
    .max(40)
    .transform((values) => [...new Set(values.map((value) => value.trim()))]),
  experienceLevel: z.enum(experienceLevels),
  cities: z.array(z.enum(locationIds)).min(1),
  workMode: z.enum(workModes),
  salaryPreference: z.string().trim().max(120).default(""),
  sources: z.array(z.enum(sourceIds)).min(1),
  rankingGoal: z.enum(rankingGoals),
  cvUploadId: z.string().min(1).optional().nullable(),
});

export type CareerBrief = z.infer<typeof careerBriefSchema>;

export const applicationRecordSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  status: z.enum(applicationStatuses),
  jobSnapshot: normalizedJobSchema,
  notes: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  appliedAt: z.iso.datetime().nullable(),
});

export type ApplicationRecord = z.infer<typeof applicationRecordSchema>;

export const applicationPatchSchema = z.object({
  job: normalizedJobSchema,
  status: z.enum(applicationStatuses),
  notes: z.string().max(4000).optional(),
});

export interface RankedJob {
  job: NormalizedJob;
  insight: {
    score: number | null;
    matchedSkills: string[];
    missingSkills: string[];
    summary: string;
    resumeSuggestion: string;
    coverLetterSuggestion: string;
    warnings: string[];
  };
  rankScore: number;
}

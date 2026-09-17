import { z } from "zod";

/**
 * Resource types. "official" is documentation or a professional body, "learning"
 * a trusted learning site or textbook, "course" a structured course, "github" a
 * repository, "article" an editorial page, "career" a careers or occupational
 * resource, "youtube" a verified video, and "web" a general web page.
 */
export const resourceKinds = ["official", "learning", "course", "github", "article", "career", "youtube", "web"] as const;
export type ResourceKind = (typeof resourceKinds)[number];
export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(240),
  url: z.url().refine((value) => new URL(value).protocol === "https:"),
  description: z.string().max(600),
  kind: z.enum(resourceKinds).default("web"),
  /** Who publishes the resource: "Python Software Foundation", "freeCodeCamp", a YouTube channel. */
  provider: z.string().max(120).optional(),
  channel: z.string().optional(),
  thumbnail: z.string().optional(),
  verifiedAt: z.iso.datetime().nullable(),
  supports: z.string().max(600),
});
export type TutorSource = z.infer<typeof sourceSchema>;
export const officialKinds: ReadonlySet<ResourceKind> = new Set(["official", "career"]);
export const learningKinds: ReadonlySet<ResourceKind> = new Set(["learning", "course", "github", "article", "web"]);

/** Split a flat resource list into the groups the chat renders. */
export function groupResources(resources: TutorSource[]) {
  const seen = new Set<string>();
  const unique = resources.filter((resource) => {
    if (seen.has(resource.url)) return false;
    seen.add(resource.url);
    return true;
  });
  return {
    youtube_resources: unique.filter((resource) => resource.kind === "youtube"),
    official_resources: unique.filter((resource) => officialKinds.has(resource.kind)),
    learning_resources: unique.filter((resource) => learningKinds.has(resource.kind)),
  };
}

export const entrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  question: z.string().min(12).max(400),
  alternate_questions: z.array(z.string().min(8).max(400)).max(20),
  answer: z.string().min(100).max(8000),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  experience_level: z.array(z.string()),
  career_role: z.array(z.string()),
  education_level: z.array(z.string()),
  country_or_region: z.array(z.string()),
  sources: z.array(sourceSchema),
  youtube_resources: z.array(sourceSchema),
  last_verified: z.iso.datetime().nullable(),
  confidence: z.number().min(0).max(1),
  version: z.number().int().positive(),
  status: z.enum(["draft", "published", "stale", "retired"]),
  review: z.object({ method: z.string(), reviewer: z.string(), notes: z.string() }),
  intent: z.string(),
  volatile: z.boolean().default(false),
  variants: z.record(z.string(), z.string()).default({}),
});
export type KnowledgeEntry = z.infer<typeof entrySchema>;
// AI fallback is automatic; the only user-controlled setting is profile use.
export const preferencesSchema = z.object({
  useProfile: z.boolean(),
});
export type TutorPreferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences: TutorPreferences = { useProfile: false };

export interface TutorAnswer {
  text: string;
  origin: "knowledge_base" | "llm" | "clarification" | "unavailable";
  /** Every resource attached to the answer, in citation order. */
  sources: TutorSource[];
  /** Verified YouTube videos that match the question's subject. */
  youtube_resources?: TutorSource[];
  /** Official documentation, professional bodies and careers portals. */
  official_resources?: TutorSource[];
  /** Trusted learning sites, courses, repositories and articles. */
  learning_resources?: TutorSource[];
  entryIds: string[];
  confidence: number;
  personalized: boolean;
  notice?: string;
}
export interface TutorTurn {
  id: string;
  question: string;
  answer: TutorAnswer;
  createdAt: string;
  feedback: "helpful" | "not_helpful" | null;
}
export interface TutorContext {
  role?: string;
  skills: string[];
  experienceLevel?: string;
  resumeNotes: string[];
  hasResumeEvidence?: boolean;
}
export const suggestions = [
  "Create a roadmap for becoming a Python developer",
  "Analyze my skill gaps for my target role",
  "Help me prepare for a technical interview",
  "How can I improve my resume?",
  "How do I prepare for an interview?",
  "Which roles fit my current profile?",
  "How do I switch careers without quitting immediately?",
] as const;

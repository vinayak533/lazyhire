import type { NormalizedJob } from "./types";

export type ApplicationStatus = "saved" | "applied" | "interview" | "rejected";

export interface JobInsight {
  score: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  resumeSuggestion: string;
  coverLetterSuggestion: string;
  warnings: string[];
}

const skillCatalog = [
  "react",
  "next.js",
  "typescript",
  "javascript",
  "node.js",
  "python",
  "java",
  ".net",
  "c#",
  "php",
  "laravel",
  "angular",
  "vue",
  "html",
  "css",
  "tailwind",
  "sql",
  "mysql",
  "postgresql",
  "sqlite",
  "mongodb",
  "rest api",
  "graphql",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "ci/cd",
  "git",
  "playwright",
  "testing",
  "automation",
  "accessibility",
  "figma",
  "ui/ux",
  "salesforce",
  "wordpress",
  "devops",
  "data analysis",
  "power bi",
  "machine learning",
] as const;

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/react\.?js/g, "react")
    .replace(/node\.?js/g, "node.js")
    .replace(/next\.?js/g, "next.js")
    .replace(/restful/g, "rest api")
    .replace(/continuous integration|continuous deployment/g, "ci/cd")
    .replace(/[^\p{L}\p{N}#+./]+/gu, " ");
}

export function extractSkills(text: string): string[] {
  const body = normalized(text);
  return skillCatalog.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(body);
  });
}

function warningSignals(job: NormalizedJob): string[] {
  const text = normalized(`${job.title}\n${job.company}\n${job.description}`);
  const warnings: string[] = [];
  if (job.closingDate && Date.parse(job.closingDate) + 86_400_000 < Date.now())
    warnings.push("Expired listing");
  if (/\b(pay|fee|deposit|registration charge|training fee)\b/.test(text))
    warnings.push("Payment request mentioned");
  if (/\bwhatsapp only|telegram|work from home.+deposit|urgent joining fee\b/.test(text))
    warnings.push("Verify before sharing personal details");
  if (!job.applyUrl && !job.applicationEmail)
    warnings.push("No direct apply path found");
  if (job.locationBasis !== "job")
    warnings.push("Confirm work location");
  return warnings;
}

export function jobInsight(job: NormalizedJob, profileText: string): JobInsight {
  const jobSkills = extractSkills(`${job.title}\n${job.description}`);
  const profileSkills = extractSkills(profileText);
  const matchedSkills = jobSkills.filter((skill) => profileSkills.includes(skill));
  const missingSkills = jobSkills.filter((skill) => !profileSkills.includes(skill));
  const hasProfile = profileText.trim().length > 40 || profileSkills.length > 0;
  const score = hasProfile
    ? Math.min(
        98,
        Math.round(
          42 +
            (jobSkills.length
              ? (matchedSkills.length / jobSkills.length) * 46
              : 18) +
            (job.applicationEmail || job.applyUrl ? 5 : 0) -
            Math.min(10, warningSignals(job).length * 4),
        ),
      )
    : null;
  const topMatched = matchedSkills.slice(0, 3).join(", ");
  const topMissing = missingSkills.slice(0, 3).join(", ");
  return {
    score,
    matchedSkills,
    missingSkills,
    warnings: warningSignals(job),
    summary: hasProfile
      ? matchedSkills.length
        ? `Fits your ${topMatched} experience${topMissing ? `; strengthen ${topMissing}.` : "."}`
        : "The role is adjacent to your profile; review requirements carefully."
      : "Add résumé skills to unlock a personalized fit summary.",
    resumeSuggestion: topMissing
      ? `Add truthful examples for ${topMissing} if you have them.`
      : "Lead with a recent project that mirrors the role's core work.",
    coverLetterSuggestion: matchedSkills.length
      ? `Open with your ${matchedSkills[0]} experience and connect it to ${job.company}'s role.`
      : `Explain why ${job.title} is a credible next step and cite one relevant project.`,
  };
}

export function duplicateCount(job: NormalizedJob): number {
  return Math.max(0, job.sources.length - 1);
}

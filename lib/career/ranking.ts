import { duplicateCount, extractSkills, jobInsight } from "@/lib/jobs/insights";
import { matchesLocation } from "@/lib/jobs/locations";
import type { NormalizedJob } from "@/lib/jobs/types";
import { destinationKind } from "@/lib/jobs/validate";
import { matchesSearchTerms } from "@/lib/jobs/terms";
import type { CareerBrief, RankedJob } from "./types";

type Seniority = "entry" | "mid" | "senior" | "lead";

const seniorityWeight: Record<Seniority, number> = {
  entry: 0,
  mid: 1,
  senior: 2,
  lead: 3,
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(98, Math.round(value)));
}

function minYears(text: string): number | null {
  const years = [...text.matchAll(/(\d{1,2})\s*(?:\+|plus)?\s*(?:years?|yrs?)/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  return years.length ? Math.max(...years) : null;
}

function inferredSeniority(job: NormalizedJob): {
  level: Seniority | null;
  years: number | null;
} {
  const text = `${job.title}\n${job.experience ?? ""}\n${job.description}`.toLowerCase();
  const years = minYears(text);
  if (/\b(chief|head|director|principal|staff|architect|lead|manager)\b/.test(text))
    return { level: "lead", years };
  if (/\b(senior|sr\.?|sde\s*iii|level\s*3)\b/.test(text) || (years ?? 0) >= 5)
    return { level: "senior", years };
  if (/\b(mid|intermediate|sde\s*ii|level\s*2)\b/.test(text) || (years ?? 0) >= 2)
    return { level: "mid", years };
  if (
    /\b(fresher|freshers|graduate|trainee|intern|internship|junior|entry[ -]?level|0\s*-\s*1)\b/.test(
      text,
    ) ||
    (years !== null && years <= 1)
  )
    return { level: "entry", years };
  return { level: null, years };
}

function workModeFit(job: NormalizedJob, brief: CareerBrief) {
  if (brief.workMode === "any") return { penalty: 0, warnings: [] as string[] };
  const text = `${job.title}\n${job.location}\n${job.description}`.toLowerCase();
  const isRemote = /\b(remote|work from home|wfh)\b/.test(text);
  const isHybrid = /\bhybrid\b/.test(text);
  const isOnsite = /\b(on-?site|office|work from office|wfo)\b/.test(text);
  if (brief.workMode === "remote" && !isRemote) {
    return {
      penalty: isOnsite ? 18 : 10,
      warnings: ["Work mode may not match remote preference"],
    };
  }
  if (brief.workMode === "hybrid" && isOnsite && !isHybrid && !isRemote) {
    return { penalty: 8, warnings: ["Confirm hybrid flexibility"] };
  }
  if (brief.workMode === "onsite" && isRemote && !isHybrid) {
    return { penalty: 6, warnings: ["Remote role; confirm onsite expectations"] };
  }
  return { penalty: 0, warnings: [] as string[] };
}

function locationFit(job: NormalizedJob, brief: CareerBrief) {
  if (brief.cities.includes("kerala")) return { penalty: 0, warnings: [] as string[] };
  const matches = brief.cities.some((city) => matchesLocation(job.location, city));
  if (matches) return { penalty: 0, warnings: [] as string[] };
  if (/\b(remote|work from home|wfh)\b/i.test(`${job.location}\n${job.description}`))
    return { penalty: 4, warnings: ["Remote role; verify location eligibility"] };
  return { penalty: 16, warnings: ["Location does not match preferred cities"] };
}

function seniorityFit(job: NormalizedJob, brief: CareerBrief) {
  const inferred = inferredSeniority(job);
  if (!inferred.level) return { penalty: 0, warnings: [] as string[] };
  const candidate = seniorityWeight[brief.experienceLevel];
  const required = seniorityWeight[inferred.level];
  const gap = required - candidate;
  if (gap <= 0) return { penalty: 0, warnings: [] as string[] };
  const label =
    inferred.level === "lead"
      ? "lead-level"
      : inferred.level === "senior"
        ? "senior-level"
        : "mid-level";
  return {
    penalty: gap >= 2 ? 34 : 20,
    warnings: [
      `Likely ${label} role${
        inferred.years ? ` requiring about ${inferred.years}+ years` : ""
      }`,
    ],
  };
}

function fitAssessment(job: NormalizedJob, brief: CareerBrief) {
  const checks = [
    seniorityFit(job, brief),
    locationFit(job, brief),
    workModeFit(job, brief),
  ];
  return {
    penalty: checks.reduce((sum, check) => sum + check.penalty, 0),
    warnings: unique(checks.flatMap((check) => check.warnings)),
  };
}

function daysOld(job: NormalizedJob): number {
  if (!job.datePosted) return 120;
  const timestamp = Date.parse(job.datePosted);
  if (!Number.isFinite(timestamp)) return 120;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function directApplyScore(job: NormalizedJob): number {
  return job.applyUrl || job.applicationEmail ? 14 : -8;
}

/**
 * Where the posting sends people. Employer application pages and the Kerala
 * IT-park boards are the most trustworthy; a web hit that only reaches an
 * aggregator ranks below them at equal relevance.
 */
function sourceQuality(job: NormalizedJob): number {
  const destination = destinationKind(job);
  if (job.sources.some((source) => source.source === "technopark")) return 10;
  if (job.sources.some((source) => source.source === "infopark")) return 9;
  if (job.sources.some((source) => ["ul-cyberpark", "evanios"].includes(source.source))) return 8;
  if (destination === "employer") return 8;
  if (job.sources.some((source) => source.source === "indeed")) return 7;
  if (destination === "platform") return 6;
  return 4;
}

/** How directly the title and description name the role the person searched for. */
function roleRelevance(job: NormalizedJob, role: string): number {
  if (!role.trim()) return 0;
  if (matchesSearchTerms(job.title, role)) return 16;
  if (matchesSearchTerms(job.description.slice(0, 600), role)) return 8;
  // Off-role postings never outrank on-role ones on freshness alone.
  return -18;
}

function cityFit(job: NormalizedJob, brief: CareerBrief): number {
  if (brief.cities.includes("kerala")) return 4;
  const text = job.location.toLowerCase();
  return brief.cities.some((city) => text.includes(city)) ? 8 : 0;
}

/**
 * Fresh openings matter most: the tiers step down at 24 hours, 3, 7, 14 and 30
 * days. A listing whose date the source never gave sits just below a verified
 * fresh one, so it can still surface but never outranks a dated recent match.
 */
export function freshnessScore(job: NormalizedJob, now = Date.now()): number {
  if (!job.datePosted) return -2;
  const timestamp = Date.parse(job.datePosted);
  if (!Number.isFinite(timestamp)) return -2;
  const hours = Math.max(0, (now - timestamp) / 3_600_000);
  if (hours <= 24) return 18;
  if (hours <= 72) return 15;
  if (hours <= 24 * 7) return 12;
  if (hours <= 24 * 14) return 8;
  if (hours <= 24 * 30) return 4;
  if (hours <= 24 * 60) return -2;
  return -8;
}

/**
 * Newest source-published date first, undated listings after dated ones. The
 * sort is stable, so listings sharing a date keep their fit order.
 */
export function sortRanked(
  ranked: RankedJob[],
  order: "newest" | "fit",
): RankedJob[] {
  if (order === "fit") return [...ranked];
  const posted = (item: RankedJob) => {
    const timestamp = item.job.datePosted ? Date.parse(item.job.datePosted) : NaN;
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
  };
  return [...ranked].sort((a, b) => {
    // Two undated listings subtract to NaN; they simply keep their order.
    const difference = posted(b) - posted(a);
    if (Number.isNaN(difference) || difference === 0) return 0;
    return difference > 0 ? 1 : -1;
  });
}

function goalScore(
  job: NormalizedJob,
  brief: CareerBrief,
  profileText: string,
): number {
  const insight = jobInsight(job, profileText);
  const assessment = fitAssessment(job, brief);
  const base = insight.score ?? 48;
  const warningPenalty = insight.warnings.length * 8;
  const duplicateBoost = duplicateCount(job) * 5;
  const matchedBoost = insight.matchedSkills.length * 4;
  const missingCount = insight.missingSkills.length;
  const stretchBoost =
    missingCount > 0 && missingCount <= 4 ? 12 - missingCount : -missingCount;

  const relevance = roleRelevance(job, brief.role);
  if (brief.rankingGoal === "fast-apply") {
    return (
      base +
      relevance +
      directApplyScore(job) * 2 +
      sourceQuality(job) +
      freshnessScore(job) -
      warningPenalty -
      assessment.penalty
    );
  }
  if (brief.rankingGoal === "growth-stretch") {
    return (
      base +
      relevance +
      matchedBoost +
      stretchBoost +
      cityFit(job, brief) +
      duplicateBoost -
      warningPenalty -
      Math.round(assessment.penalty * 0.55)
    );
  }
  return (
    base +
    relevance +
    sourceQuality(job) +
    freshnessScore(job) +
    directApplyScore(job) +
    cityFit(job, brief) +
    duplicateBoost -
    warningPenalty -
    assessment.penalty
  );
}

export function rankJobs(
  jobs: NormalizedJob[],
  brief: CareerBrief,
  profileText = "",
): RankedJob[] {
  const combinedProfile = [
    brief.role,
    brief.experienceLevel,
    brief.workMode,
    brief.salaryPreference,
    brief.skills.join(" "),
    profileText,
  ].join("\n");
  return jobs
    .map((job) => {
      const insight = jobInsight(job, combinedProfile);
      const assessment = fitAssessment(job, brief);
      return {
        job,
        insight: {
          ...insight,
          score:
            insight.score === null
              ? null
              : clampScore(insight.score - assessment.penalty * 0.7),
          warnings: unique([...insight.warnings, ...assessment.warnings]),
        },
        rankScore: Math.round(goalScore(job, brief, combinedProfile)),
      };
    })
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      if (b.insight.matchedSkills.length !== a.insight.matchedSkills.length) {
        return b.insight.matchedSkills.length - a.insight.matchedSkills.length;
      }
      return daysOld(a.job) - daysOld(b.job);
    });
}

export function suggestedSkills(brief: CareerBrief, jobs: NormalizedJob[]) {
  const owned = new Set(brief.skills.map((skill) => skill.toLowerCase()));
  const missing = new Map<string, number>();
  jobs.forEach((job) => {
    extractSkills(`${job.title}\n${job.description}`).forEach((skill) => {
      if (!owned.has(skill)) missing.set(skill, (missing.get(skill) ?? 0) + 1);
    });
  });
  return [...missing.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([skill]) => skill);
}

import { desc, eq } from "drizzle-orm";
import type { openDatabase } from "@/lib/db/connection";
import { cvUploads } from "@/lib/db/schema";
import type { CvResult } from "@/lib/cv/types";
import { decryptJson } from "@/lib/security/crypto";
import { loadCareerBrief, listApplications } from "@/lib/career/store";
import { defaultCareerBrief } from "@/lib/career/store";
import { extractSkills } from "@/lib/jobs/insights";
import { sourceLabels } from "@/lib/jobs/types";
import type { ApplicationRecord, CareerBrief } from "@/lib/career/types";
import type {
  AgentBrief,
  CareerOsEvidence,
  CareerOsSnapshot,
  CompatibilityCard,
  MentorRecommendation,
  MissionAction,
  PortfolioProject,
  RadarItem,
  RoadmapBlock,
  SimulationCard,
  SkillGap,
} from "./types";

type Database = ReturnType<typeof openDatabase>["db"];
type LatestCv = CvResult & { id: string; filename: string };

const roleRequirementCatalog = [
  {
    match: /\b(frontend|front-end|react|ui|next\.?js)\b/i,
    skills: ["typescript", "react", "accessibility", "testing", "next.js"],
  },
  {
    match: /\b(full.?stack|node|backend|api)\b/i,
    skills: ["typescript", "node.js", "sql", "rest api", "testing"],
  },
  {
    match: /\b(data|analyst|analytics|bi)\b/i,
    skills: ["sql", "python", "data analysis", "power bi", "statistics"],
  },
  {
    match: /\b(ai|ml|machine learning)\b/i,
    skills: ["python", "machine learning", "sql", "statistics", "model evaluation"],
  },
  {
    match: /\b(devops|cloud|platform)\b/i,
    skills: ["linux", "docker", "ci/cd", "aws", "monitoring"],
  },
] as const;

function titleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeSkill(skill: string) {
  return skill.trim().toLowerCase().replace(/^rest$/, "rest api");
}

function skillLabel(skill: string) {
  const labels: Record<string, string> = {
    "next.js": "Next.js",
    "node.js": "Node.js",
    "rest api": "REST API",
    "ci/cd": "CI/CD",
    "ui/ux": "UI/UX",
    aws: "AWS",
    "model evaluation": "Model Evaluation",
    "power bi": "Power BI",
    sql: "SQL",
  };
  return labels[skill] ?? titleCase(skill);
}

function roleRequirements(role: string) {
  const normalizedRole = role.trim();
  if (!normalizedRole) return [];
  return unique(
    roleRequirementCatalog
      .filter((entry) => entry.match.test(normalizedRole))
      .flatMap((entry) => [...entry.skills]),
  );
}

function latestCv(db: Database, userId: string): LatestCv | null {
  const row = db
    .select()
    .from(cvUploads)
    .where(eq(cvUploads.userId, userId))
    .orderBy(desc(cvUploads.createdAt))
    .get();
  if (!row) return null;
  try {
    const result = decryptJson<CvResult>(row.resultJson);
    return { ...result, id: result.id || row.id, filename: result.filename || row.filename };
  } catch {
    return null;
  }
}

function collectSkills(brief: CareerBrief, cv: CvResult | null, apps: ApplicationRecord[]) {
  const fromBrief = brief.skills.map(normalizeSkill);
  const fromCv = cv ? extractSkills(cv.parsed.text).map(normalizeSkill) : [];
  const fromApps = apps.flatMap((app) =>
    [
      ...app.jobSnapshot.skills,
      ...extractSkills(`${app.jobSnapshot.title}\n${app.jobSnapshot.description}`),
    ].map(normalizeSkill),
  );
  return {
    owned: unique([...fromBrief, ...fromCv]).map(skillLabel),
    market: fromApps,
  };
}

function buildSkillGaps(owned: string[], market: string[], brief: CareerBrief): SkillGap[] {
  const ownedSet = new Set(owned.map(normalizeSkill));
  const counts = new Map<string, { count: number; evidence: Set<string> }>();
  market.forEach((skill) => {
    const normalized = normalizeSkill(skill);
    if (!ownedSet.has(normalized)) {
      const entry = counts.get(normalized) ?? { count: 0, evidence: new Set<string>() };
      entry.count += 1;
      entry.evidence.add("Appears in tracked opportunities.");
      counts.set(normalized, entry);
    }
  });
  roleRequirements(brief.role).forEach((skill) => {
    const normalized = normalizeSkill(skill);
    if (!ownedSet.has(normalized)) {
      const entry = counts.get(normalized) ?? { count: 0, evidence: new Set<string>() };
      entry.count += 2;
      entry.evidence.add(`Expected for ${brief.role}.`);
      counts.set(normalized, entry);
    }
  });
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([skill, details], index) => {
      const evidence = [...details.evidence];
      const confidence = Math.min(
        92,
        50 + details.count * 8 + (market.length ? 8 : 0) + (brief.role ? 6 : 0),
      );
      return {
      skill: skillLabel(skill),
      demand: Math.min(98, 48 + details.count * 9),
      priority: index < 2 ? "P0" : index < 4 ? "P1" : "P2",
      reason:
        evidence.length > 1
          ? `Multiple signals connect ${skillLabel(skill)} to ${brief.role || "your target role"}.`
          : evidence[0] ?? "This skill is relevant, but more profile evidence is needed.",
      whyItMatters: `${skillLabel(skill)} changes the recommendation from interest-based to evidence-based because recruiters can see proof of role readiness.`,
      expectedImpact:
        index < 2
          ? "Higher confidence for shortlisting and stronger project/interview stories."
          : "Better stretch-role credibility once paired with visible proof.",
      nextStep: `Build one small proof project using ${skillLabel(skill)} and add the result to your CV.`,
      evidence,
      confidence,
      missingInfo: market.length ? [] : ["Tracked job descriptions would sharpen demand evidence."],
    };
    });
}

function buildReadiness(
  brief: CareerBrief,
  cv: CvResult | null,
  ownedSkills: string[],
  apps: ApplicationRecord[],
  gaps: SkillGap[],
): CareerOsSnapshot["readiness"] {
  const evidence: CareerOsEvidence[] = [
    {
      label: "Target role",
      value: brief.role || "Not set",
      source: "career brief",
      confidence: brief.role ? 92 : 20,
    },
    {
      label: "Skill evidence",
      value: ownedSkills.length
        ? `${ownedSkills.length} skills from brief/CV`
        : "No verified skill list yet",
      source: ownedSkills.length ? "derived" : "career brief",
      confidence: ownedSkills.length ? 78 : 24,
    },
    {
      label: "CV signal",
      value: cv ? `${cv.analysis.wordCount} parsed words` : "No CV uploaded",
      source: cv ? "cv" : "derived",
      confidence: cv ? 86 : 25,
    },
    {
      label: "Market signal",
      value: apps.length
        ? `${apps.length} tracked opportunities`
        : "No tracked opportunities",
      source: apps.length ? "applications" : "derived",
      confidence: apps.length ? 74 : 30,
    },
  ];
  const score = Math.max(
    12,
    Math.min(
      96,
      Math.round(
        (brief.role ? 20 : 0) +
          Math.min(24, ownedSkills.length * 4) +
          (cv ? 20 : 0) +
          Math.min(16, apps.length * 4) +
          (brief.cities.length ? 6 : 0) +
          (brief.salaryPreference ? 4 : 0) -
          Math.min(14, gaps.length * 2),
      ),
    ),
  );
  const missingInfo = [
    !brief.role ? "Target role" : "",
    !ownedSkills.length ? "Current skill evidence" : "",
    !cv ? "Resume/CV" : "",
    !apps.length ? "Tracked jobs or applications" : "",
    !brief.salaryPreference ? "Salary expectation or current compensation context" : "",
  ].filter(Boolean);
  return {
    score,
    label:
      score >= 78
        ? "Strong"
        : score >= 58
          ? "Developing"
          : score >= 38
            ? "Needs focus"
            : "Insufficient evidence",
    strengths: [
      brief.role ? `Clear target: ${brief.role}` : "",
      ownedSkills.length ? `Visible skills: ${ownedSkills.slice(0, 4).join(", ")}` : "",
      cv ? "CV evidence available for analysis" : "",
      apps.length ? "Real opportunity signals are being tracked" : "",
    ].filter(Boolean),
    weaknesses: [
      gaps[0] ? `Top missing capability: ${gaps[0].skill}` : "",
      !cv ? "Recommendations cannot inspect resume proof yet" : "",
      !apps.length ? "Market fit is based on profile only, not saved roles" : "",
    ].filter(Boolean),
    missingInfo,
    evidence,
  };
}

function buildTwin(
  brief: CareerBrief,
  cv: CvResult | null,
  ownedSkills: string[],
  apps: ApplicationRecord[],
) {
  const coverageSignals = [
    brief.role.length > 1,
    brief.skills.length > 0,
    Boolean(cv),
    apps.length > 0,
    Boolean(brief.salaryPreference),
  ].filter(Boolean).length;
  return {
    role: brief.role || "Choose a target role",
    headline: brief.role
      ? `${titleCase(brief.experienceLevel)} ${brief.role} trajectory`
      : "Career profile ready for a target role",
    level: titleCase(brief.experienceLevel),
    workMode: brief.workMode === "any" ? "Flexible" : titleCase(brief.workMode),
    preferredLocations: brief.cities.map(titleCase),
    salaryPreference: brief.salaryPreference || "Not set",
    memoryCoverage: Math.round((coverageSignals / 5) * 100),
    facts: [
      {
        label: "Target",
        value: brief.role || "Not set",
        confidence: brief.role ? 92 : 35,
        source: "career brief" as const,
      },
      {
        label: "Skill base",
        value: ownedSkills.slice(0, 6).join(", ") || "Add skills or upload a CV",
        confidence: ownedSkills.length ? 82 : 28,
        source: ownedSkills.length ? ("derived" as const) : ("career brief" as const),
      },
      {
        label: "Recent evidence",
        value: cv
          ? `${cv.analysis.wordCount} CV words, ${cv.analysis.issues.length} writing signals`
          : "No CV memory yet",
        confidence: cv ? 86 : 30,
        source: cv ? ("cv" as const) : ("derived" as const),
      },
      {
        label: "Pipeline signal",
        value: `${apps.length} tracked ${apps.length === 1 ? "opportunity" : "opportunities"}`,
        confidence: apps.length ? 76 : 32,
        source: "applications" as const,
      },
    ],
    privacyNotes: [
      "Career memory is derived from your private workspace.",
      "External actions remain draft-only until you approve them.",
      "Recruiter visibility stays off unless you publish it.",
    ],
  };
}

function buildRadar(
  brief: CareerBrief,
  apps: ApplicationRecord[],
  gaps: SkillGap[],
): RadarItem[] {
  const tracked: RadarItem[] = apps.slice(0, 3).map((app, index) => ({
    id: `tracked-${app.id}`,
    type: app.jobSnapshot.jobType === "internship" ? "internship" : "job",
    title: app.jobSnapshot.title,
    signal: `${app.jobSnapshot.company} is already in your pipeline.`,
    source: sourceLabels[app.jobSnapshot.source],
    score: Math.max(62, 90 - index * 8),
    urgency: app.status === "saved" ? ("high" as const) : ("medium" as const),
    action:
      app.status === "saved"
        ? "Decide whether to apply or archive it."
        : "Prepare the next follow-up or interview note.",
  }));
  const generated: RadarItem[] = [
    {
      id: "skill-sprint",
      type: "learning",
      title: gaps[0] ? `${gaps[0].skill} sprint` : "Skill evidence sprint",
      signal: gaps[0]?.reason ?? "Your target role needs visible proof.",
      source: "Skill Intelligence",
      score: gaps[0]?.demand ?? 70,
      urgency: "medium",
      action: gaps[0]?.nextStep ?? "Create a project that proves one core skill.",
    },
    {
      id: "portfolio-proof",
      type: "portfolio",
      title: `${brief.role || "Target role"} proof asset`,
      signal: "A visible project can make the CV and profile easier to trust.",
      source: "Portfolio Builder",
      score: 74,
      urgency: "medium",
      action: "Publish one concise case study with problem, approach, and result.",
    },
    {
      id: "network-week",
      type: "networking",
      title: "Warm-intro map",
      signal: "Applications convert better with human context.",
      source: "Network Navigator",
      score: 68,
      urgency: "low",
      action: "List five people connected to your target companies.",
    },
    {
      id: "freelance-bridge",
      type: "freelance",
      title: "Short paid project bridge",
      signal: "Freelance proof can close experience gaps before a full-time switch.",
      source: "Opportunity Radar",
      score: 63,
      urgency: "low",
      action: "Search for a two-week project aligned with your next missing skill.",
    },
  ];
  return [...tracked, ...generated].slice(0, 7);
}

function buildMissionControl(apps: ApplicationRecord[]): CareerOsSnapshot["missionControl"] {
  const statusCounts = apps.reduce<Record<string, number>>(
    (counts, app) => {
      counts[app.status] = (counts[app.status] ?? 0) + 1;
      return counts;
    },
    { saved: 0, applied: 0, interview: 0, rejected: 0 },
  );
  const nextActions: MissionAction[] = apps.slice(0, 5).map((app) => ({
    id: `action-${app.id}`,
    label:
      app.status === "interview"
        ? `Practice for ${app.jobSnapshot.company}`
        : app.status === "applied"
          ? `Follow up with ${app.jobSnapshot.company}`
          : app.status === "saved"
            ? `Tailor application for ${app.jobSnapshot.company}`
            : `Extract lessons from ${app.jobSnapshot.company}`,
    due:
      app.status === "interview"
        ? "Today"
        : app.status === "applied"
          ? "This week"
          : "Next",
    priority:
      app.status === "interview" ? "P0" : app.status === "applied" ? "P1" : "P2",
    reason: `${app.jobSnapshot.title} is marked ${app.status}.`,
  }));
  if (!nextActions.length) {
    nextActions.push({
      id: "action-create-brief",
      label: "Create a sharper career brief",
      due: "Today",
      priority: "P0",
      reason: "The OS needs a target before it can prioritize opportunities.",
    });
  }
  return { statusCounts, nextActions };
}

function buildRoadmap(brief: CareerBrief, gaps: SkillGap[]): RoadmapBlock[] {
  const firstGap = gaps[0]?.skill ?? "one marketable skill";
  const secondGap = gaps[1]?.skill ?? "interview storytelling";
  const hasTarget = Boolean(brief.role);
  return [
    {
      horizon: "Next 7 days",
      objective: "Stabilize the target",
      milestones: [
        `Lock the ${brief.role || "target role"} brief.`,
        `Pick one ${firstGap} proof task.`,
        "Move every tracked opportunity to a clear next action.",
      ],
      evidence: hasTarget
        ? [`Career brief targets ${brief.role}.`]
        : ["Target role is not set."],
      confidence: hasTarget ? 76 : 42,
      nextAction: hasTarget
        ? `Write a one-paragraph ${brief.role} positioning statement.`
        : "Choose one target role before optimizing skills or projects.",
    },
    {
      horizon: "30 days",
      objective: "Create visible proof",
      milestones: [
        `Ship a compact ${firstGap} project.`,
        "Refresh the CV with evidence from the project.",
        "Complete three role-specific interview drills.",
      ],
      evidence: gaps[0]?.evidence ?? ["Roadmap needs stronger skill evidence."],
      confidence: gaps[0]?.confidence ?? 45,
      nextAction: `Scope a project where ${firstGap} is visible in the outcome.`,
    },
    {
      horizon: "90 days",
      objective: "Increase leverage",
      milestones: [
        `Add ${secondGap} to the learning plan.`,
        "Build a shortlist of ten high-fit companies.",
        "Review salary and growth signals before accepting interviews.",
      ],
      evidence: gaps[1]?.evidence ?? ["Longer-term plan will improve after saved jobs or CV updates."],
      confidence: gaps[1]?.confidence ?? 44,
      nextAction: "Review tracked roles weekly and update the roadmap after each new signal.",
    },
  ];
}

function buildMentorRecommendations(
  brief: CareerBrief,
  cv: CvResult | null,
  apps: ApplicationRecord[],
  gaps: SkillGap[],
  readiness: CareerOsSnapshot["readiness"],
): MentorRecommendation[] {
  const recommendations: MentorRecommendation[] = [];
  if (!brief.role) {
    recommendations.push({
      id: "target-role",
      observation: "Your Career OS does not yet have a target role.",
      whyItMatters:
        "Without a target, every skill and project can look equally useful, which creates busywork instead of career progress.",
      recommendation:
        "Pick one primary role for the next 30 days and let the system evaluate skills, projects, and applications against it.",
      priority: "Critical",
      expectedImpact:
        "A sharper target will improve roadmap quality and reduce low-value learning detours.",
      nextAction: "Set the target role in the career brief and run one focused search.",
      confidence: 96,
      evidence: ["Career brief role is empty."],
      missingInfo: ["Target role"],
    });
  }
  if (!cv) {
    recommendations.push({
      id: "upload-cv",
      observation: "No parsed CV is available in career memory.",
      whyItMatters:
        "The system can see your stated skills, but it cannot verify whether your CV proves them through projects, outcomes, or experience.",
      recommendation:
        "Upload your latest CV before relying on deep readiness, interview, or project recommendations.",
      priority: "High",
      expectedImpact:
        "Career OS can separate real strengths from claims and produce stronger evidence-based next actions.",
      nextAction: "Upload your CV, then refresh Career OS.",
      confidence: 91,
      evidence: ["No CV upload found for this account."],
      missingInfo: ["Resume/CV"],
    });
  }
  if (gaps[0]) {
    recommendations.push({
      id: "top-skill-gap",
      observation: `${gaps[0].skill} is the strongest missing capability signal right now.`,
      whyItMatters: gaps[0].whyItMatters,
      recommendation:
        "Do not just watch a course. Produce proof: a small shipped project, test suite, case study, or before/after improvement.",
      priority: gaps[0].priority === "P0" ? "Critical" : "High",
      expectedImpact: gaps[0].expectedImpact,
      nextAction: gaps[0].nextStep,
      confidence: gaps[0].confidence,
      evidence: gaps[0].evidence,
      missingInfo: gaps[0].missingInfo,
    });
  }
  if (!apps.length) {
    recommendations.push({
      id: "market-signal",
      observation: "No saved or applied roles are available for market comparison.",
      whyItMatters:
        "Career planning becomes much more accurate when recommendations are compared against real job descriptions, not only a profile.",
      recommendation:
        "Run a focused search and save at least five roles that genuinely interest you, including one stretch role.",
      priority: "High",
      expectedImpact:
        "The skill gap engine can rank missing capabilities by actual opportunity demand.",
      nextAction: "Find matches and save five relevant roles.",
      confidence: 88,
      evidence: ["Application pipeline has 0 tracked opportunities."],
      missingInfo: ["Tracked job descriptions"],
    });
  }
  if (apps.some((app) => app.status === "interview")) {
    recommendations.push({
      id: "interview-focus",
      observation: "At least one tracked role is in interview stage.",
      whyItMatters:
        "At interview stage, broad learning has lower immediate value than crisp stories, role-specific examples, and gap explanations.",
      recommendation:
        "Prioritize interview drills around project decisions, tradeoffs, and the top missing requirement.",
      priority: "Critical",
      expectedImpact:
        "Better interview conversion and fewer vague answers under pressure.",
      nextAction: "Practice the first Interview Lab prompt aloud and tighten it to two minutes.",
      confidence: 84,
      evidence: ["Application pipeline contains an interview-stage role."],
      missingInfo: [],
    });
  }
  if (readiness.score < 50 && recommendations.length < 4) {
    recommendations.push({
      id: "evidence-first",
      observation: "Career readiness is limited mostly by missing evidence, not necessarily ability.",
      whyItMatters:
        "Recruiters and hiring managers can only evaluate what is visible in your CV, projects, and application history.",
      recommendation:
        "Spend the next week improving proof quality before increasing application volume.",
      priority: "Medium",
      expectedImpact:
        "Cleaner positioning and better signal quality for each application you send.",
      nextAction: "Rewrite one CV bullet with action, tool, scope, and measurable result.",
      confidence: 72,
      evidence: readiness.evidence.map((item) => `${item.label}: ${item.value}`),
      missingInfo: readiness.missingInfo,
    });
  }
  return recommendations.slice(0, 5);
}

function buildGuardrails(
  brief: CareerBrief,
  cv: CvResult | null,
  apps: ApplicationRecord[],
  gaps: SkillGap[],
): CareerOsSnapshot["guardrails"] {
  const missingInfo = [
    !brief.role ? "target role" : "",
    !brief.skills.length && !cv ? "verified skills" : "",
    !cv ? "resume/CV evidence" : "",
    !apps.length ? "tracked job descriptions" : "",
  ].filter(Boolean);
  return {
    summary: missingInfo.length
      ? "Career OS is using available profile evidence and has reduced confidence where important inputs are missing."
      : `Career OS has enough private workspace evidence to produce role-specific guidance across ${Math.max(1, gaps.length)} priority skill signals.`,
    missingInfo,
    avoidedGuesses: [
      "No salary range is estimated without market compensation data.",
      "No certification is recommended unless it is tied to the target role or tracked jobs.",
      "No career path is treated as certain without CV, role, and application evidence.",
    ],
    dataFreshness: `Workspace signals refreshed ${new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}.`,
  };
}

function buildSimulations(brief: CareerBrief, gaps: SkillGap[]): SimulationCard[] {
  return [
    {
      id: "skill-switch",
      title: `Learn ${gaps[0]?.skill ?? "a strategic skill"}`,
      confidence: 74,
      summary: "Best when paired with a public proof project and CV rewrite.",
      likelyUpside: "More credible stretch-role applications within 30-60 days.",
      tradeoff: "Requires consistent project time before the market sees the signal.",
    },
    {
      id: "broaden-market",
      title: "Broaden opportunity sources",
      confidence: 69,
      summary: `Useful if ${brief.cities.length <= 1 ? "one city is limiting the funnel" : "current sources are too similar"}.`,
      likelyUpside: "More interviews and better salary discovery.",
      tradeoff: "More noise unless compatibility scoring stays strict.",
    },
    {
      id: "portfolio-first",
      title: "Portfolio-first month",
      confidence: 78,
      summary: "Prioritize evidence before sending another wave of applications.",
      likelyUpside: "Stronger callbacks for roles that need proof over credentials.",
      tradeoff: "Short-term application volume goes down.",
    },
  ];
}

function buildInterviewPrompts(brief: CareerBrief, apps: ApplicationRecord[]) {
  const role = apps.find((app) => app.status === "interview")?.jobSnapshot.title || brief.role || "target role";
  return {
    role,
    prompts: [
      {
        id: "intro",
        question: `Walk me through why ${role} is the right next step for you.`,
        rubric: "Clear motivation, role-specific evidence, concise timeline.",
      },
      {
        id: "skill-proof",
        question: "Describe a project where you turned an ambiguous requirement into a working result.",
        rubric: "Problem framing, decisions, tradeoffs, measurable or observable outcome.",
      },
      {
        id: "gap",
        question: "Which requirement in this role is your biggest stretch, and how are you closing it?",
        rubric: "Self-awareness, specific learning plan, honest boundaries.",
      },
    ],
  };
}

function buildPortfolio(brief: CareerBrief, gaps: SkillGap[]): PortfolioProject[] {
  return [
    {
      id: "proof-dashboard",
      title: `${brief.role || "Career"} proof dashboard`,
      outcome: "A deployed case study that mirrors the work you want to be hired for.",
      proves: unique([brief.role || "Role focus", gaps[0]?.skill ?? "Execution", "Product thinking"]),
      nextStep: "Define one real user workflow and ship the smallest useful version.",
    },
    {
      id: "automation-case",
      title: "Automation impact story",
      outcome: "A before/after case study that shows time saved, quality improved, or risk reduced.",
      proves: unique([gaps[1]?.skill ?? "Problem solving", "Communication"]),
      nextStep: "Document the problem, constraints, implementation, and result.",
    },
  ];
}

function buildCompatibility(apps: ApplicationRecord[], ownedSkills: string[]): CompatibilityCard[] {
  const owned = new Set(ownedSkills.map(normalizeSkill));
  return apps.slice(0, 5).map((app) => {
    const jobSkills = unique([
      ...app.jobSnapshot.skills,
      ...extractSkills(app.jobSnapshot.description),
    ]).map(normalizeSkill);
    const matched = jobSkills.filter((skill) => owned.has(skill));
    const score = Math.min(
      96,
      Math.round(48 + matched.length * 9 + (app.jobSnapshot.applyUrl ? 8 : 0)),
    );
    return {
      id: `compat-${app.id}`,
      role: app.jobSnapshot.title,
      company: app.jobSnapshot.company,
      score,
      strengths: matched.slice(0, 3).map(skillLabel),
      risks: jobSkills
        .filter((skill) => !owned.has(skill))
        .slice(0, 3)
        .map((skill) => `Missing visible ${skillLabel(skill)} proof`),
      action:
        score >= 76
          ? "Prioritize a tailored application."
          : "Use this as a stretch role and close the top evidence gap.",
    };
  });
}

function buildAgents(gaps: SkillGap[], apps: ApplicationRecord[]): AgentBrief[] {
  return [
    {
      name: "Career Copilot",
      status: "Active",
      focus: "Turns goals into weekly actions.",
      nextAction: "Review the top mission-control item.",
    },
    {
      name: "Opportunity Scout",
      status: apps.length ? "Watching pipeline" : "Needs target",
      focus: "Finds high-signal roles and adjacent opportunities.",
      nextAction: apps.length ? "Compare tracked roles." : "Run a focused search.",
    },
    {
      name: "Skill Coach",
      status: gaps.length ? "Gap detected" : "Calibrated",
      focus: "Maps skill demand to learning and proof.",
      nextAction: gaps[0] ? gaps[0].nextStep : "Keep skill evidence current.",
    },
    {
      name: "Privacy Guardian",
      status: "On",
      focus: "Keeps career memory private by default.",
      nextAction: "Require approval before any external sharing.",
    },
  ];
}

function setupSnapshot(
  brief: CareerBrief,
  cv: LatestCv | null,
  applications: ApplicationRecord[],
): CareerOsSnapshot {
  const hasTargetRole = Boolean(brief.role.trim());
  const hasCv = Boolean(cv);
  const missingInfo = [
    !hasCv ? "resume/CV upload" : "",
    !hasTargetRole ? "target career path or role" : "",
  ].filter(Boolean);
  const statusCounts = applications.reduce<Record<string, number>>(
    (counts, app) => {
      counts[app.status] = (counts[app.status] ?? 0) + 1;
      return counts;
    },
    { saved: 0, applied: 0, interview: 0, rejected: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    profileStatus: {
      hasTargetRole,
      hasCv,
      readyForPersonalization: false,
      latestCvId: cv?.id ?? null,
      latestCvFilename: cv?.filename ?? null,
      emptyStateReason: `Personalized Career OS is locked until you add ${missingInfo.join(" and ")}.`,
    },
    metrics: [
      { label: "Readiness", value: "0%", detail: "Unavailable until setup" },
      { label: "Opportunities", value: String(applications.length), detail: "Real tracked items" },
      { label: "Skill gaps", value: "0", detail: "Not calculated yet" },
      { label: "Pipeline", value: String(applications.length), detail: "Your saved roles" },
    ],
    readiness: {
      score: 0,
      label: "Waiting for profile",
      strengths: [],
      weaknesses: [],
      missingInfo,
      evidence: [
        {
          label: "Resume/CV",
          value: cv ? cv.filename : "Not uploaded",
          source: cv ? "cv" : "derived",
          confidence: cv ? 100 : 0,
        },
        {
          label: "Target role",
          value: hasTargetRole ? brief.role : "Not selected",
          source: hasTargetRole ? "career brief" : "derived",
          confidence: hasTargetRole ? 100 : 0,
        },
      ],
    },
    twin: {
      role: hasTargetRole ? brief.role : "Target role not selected",
      headline: "Complete onboarding to unlock personalized analysis",
      level: "Unavailable",
      workMode: "Unavailable",
      preferredLocations: [],
      salaryPreference: "Unavailable",
      memoryCoverage: Math.round(([hasCv, hasTargetRole].filter(Boolean).length / 2) * 100),
      facts: [],
      privacyNotes: [
        "No career score is calculated until your required profile inputs exist.",
        "Resume text and chatbot history are scoped to this authenticated account.",
        "Generated guidance is withheld rather than filled with demo data.",
      ],
    },
    mentor: [],
    guardrails: {
      summary: "LazyHire is showing setup status and real saved pipeline counts only. Personalized metrics, gaps, roadmaps, and recommendations are unavailable until the CV and target role are present.",
      missingInfo,
      avoidedGuesses: [
        "No readiness score has been estimated from an empty account.",
        "No skill gaps have been inferred from a generic role template.",
        "No roadmap or job recommendation has been generated without user evidence.",
      ],
      dataFreshness: "No personalized snapshot has been generated yet.",
    },
    agents: [],
    radar: [],
    skills: { owned: [], gaps: [] },
    missionControl: {
      statusCounts,
      nextActions: [
        !hasCv
          ? {
              id: "setup-upload-cv",
              label: "Upload your CV",
              due: "Next",
              priority: "P0",
              reason: "LazyHire needs resume evidence before calculating readiness or gaps.",
            }
          : null,
        !hasTargetRole
          ? {
              id: "setup-target-role",
              label: "Choose your target role",
              due: "Next",
              priority: "P0",
              reason: "A target role is required before recommendations can be compared against a direction.",
            }
          : null,
      ].filter((item): item is MissionAction => Boolean(item)),
    },
    roadmap: [],
    simulations: [],
    interviewLab: { role: hasTargetRole ? brief.role : "Target role", prompts: [] },
    portfolio: [],
    compatibility: [],
  };
}

export function buildCareerOsSnapshot(db: Database, userId: string): CareerOsSnapshot {
  const brief = loadCareerBrief(db, userId) ?? defaultCareerBrief();
  const applications = listApplications(db, userId);
  const cv = latestCv(db, userId);
  const profileStatus = {
    hasTargetRole: Boolean(brief.role.trim()),
    hasCv: Boolean(cv),
    readyForPersonalization: Boolean(brief.role.trim() && cv),
    latestCvId: cv?.id ?? null,
    latestCvFilename: cv?.filename ?? null,
    emptyStateReason: null as string | null,
  };
  if (!profileStatus.readyForPersonalization) {
    return setupSnapshot(brief, cv, applications);
  }
  const { owned, market } = collectSkills(brief, cv, applications);
  const gaps = buildSkillGaps(owned, market, brief);
  const readiness = buildReadiness(brief, cv, owned, applications, gaps);
  const mentor = buildMentorRecommendations(
    brief,
    cv,
    applications,
    gaps,
    readiness,
  );
  const guardrails = buildGuardrails(brief, cv, applications, gaps);
  const missionControl = buildMissionControl(applications);
  const compatibility = buildCompatibility(applications, owned);
  const metrics = [
    {
      label: "Readiness",
      value: `${readiness.score}%`,
      detail: readiness.label,
    },
    {
      label: "Radar",
      value: String(Math.max(4, applications.length + 4)),
      detail: "Signals ready",
    },
    {
      label: "Skills",
      value: String(gaps.length),
      detail: "Priority gaps",
    },
    {
      label: "Pipeline",
      value: String(applications.length),
      detail: "Tracked items",
    },
  ];
  return {
    generatedAt: new Date().toISOString(),
    profileStatus,
    metrics,
    readiness,
    twin: buildTwin(brief, cv, owned, applications),
    mentor,
    guardrails,
    agents: buildAgents(gaps, applications),
    radar: buildRadar(brief, applications, gaps),
    skills: { owned, gaps },
    missionControl,
    roadmap: buildRoadmap(brief, gaps),
    simulations: buildSimulations(brief, gaps),
    interviewLab: buildInterviewPrompts(brief, applications),
    portfolio: buildPortfolio(brief, gaps),
    compatibility,
  };
}

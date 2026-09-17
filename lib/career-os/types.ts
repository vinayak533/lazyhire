export type CareerOsPriority = "P0" | "P1" | "P2";

export interface CareerOsMetric {
  label: string;
  value: string;
  detail: string;
}

export interface CareerOsEvidence {
  label: string;
  value: string;
  source: "career brief" | "cv" | "applications" | "role model" | "derived";
  confidence: number;
}

export interface CareerReadiness {
  score: number;
  label: string;
  strengths: string[];
  weaknesses: string[];
  missingInfo: string[];
  evidence: CareerOsEvidence[];
}

export interface CareerTwinFact {
  label: string;
  value: string;
  confidence: number;
  source: "career brief" | "cv" | "applications" | "derived";
}

export interface CareerTwinSummary {
  role: string;
  headline: string;
  level: string;
  workMode: string;
  preferredLocations: string[];
  salaryPreference: string;
  memoryCoverage: number;
  facts: CareerTwinFact[];
  privacyNotes: string[];
}

export interface AgentBrief {
  name: string;
  status: string;
  focus: string;
  nextAction: string;
}

export interface RadarItem {
  id: string;
  type:
    | "job"
    | "internship"
    | "freelance"
    | "learning"
    | "networking"
    | "portfolio";
  title: string;
  signal: string;
  source: string;
  score: number;
  urgency: "low" | "medium" | "high";
  action: string;
}

export interface SkillGap {
  skill: string;
  demand: number;
  priority: CareerOsPriority;
  reason: string;
  whyItMatters: string;
  expectedImpact: string;
  nextStep: string;
  evidence: string[];
  confidence: number;
  missingInfo: string[];
}

export interface RoadmapBlock {
  horizon: string;
  objective: string;
  milestones: string[];
  evidence: string[];
  confidence: number;
  nextAction: string;
}

export interface MentorRecommendation {
  id: string;
  observation: string;
  whyItMatters: string;
  recommendation: string;
  priority: "Critical" | "High" | "Medium" | "Optional";
  expectedImpact: string;
  nextAction: string;
  confidence: number;
  evidence: string[];
  missingInfo: string[];
}

export interface MissionAction {
  id: string;
  label: string;
  due: string;
  priority: CareerOsPriority;
  reason: string;
}

export interface SimulationCard {
  id: string;
  title: string;
  confidence: number;
  summary: string;
  likelyUpside: string;
  tradeoff: string;
}

export interface InterviewPrompt {
  id: string;
  question: string;
  rubric: string;
}

export interface PortfolioProject {
  id: string;
  title: string;
  outcome: string;
  proves: string[];
  nextStep: string;
}

export interface CompatibilityCard {
  id: string;
  role: string;
  company: string;
  score: number;
  strengths: string[];
  risks: string[];
  action: string;
}

export interface CareerOsSnapshot {
  generatedAt: string;
  profileStatus: {
    hasTargetRole: boolean;
    hasCv: boolean;
    readyForPersonalization: boolean;
    latestCvId: string | null;
    latestCvFilename: string | null;
    emptyStateReason: string | null;
  };
  metrics: CareerOsMetric[];
  readiness: CareerReadiness;
  twin: CareerTwinSummary;
  mentor: MentorRecommendation[];
  guardrails: {
    summary: string;
    missingInfo: string[];
    avoidedGuesses: string[];
    dataFreshness: string;
  };
  agents: AgentBrief[];
  radar: RadarItem[];
  skills: {
    owned: string[];
    gaps: SkillGap[];
  };
  missionControl: {
    statusCounts: Record<string, number>;
    nextActions: MissionAction[];
  };
  roadmap: RoadmapBlock[];
  simulations: SimulationCard[];
  interviewLab: {
    role: string;
    prompts: InterviewPrompt[];
  };
  portfolio: PortfolioProject[];
  compatibility: CompatibilityCard[];
}

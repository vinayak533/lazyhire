"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Columns3,
  Mail,
  SearchX,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApplyDraftDialog,
  type ApplyDraft,
} from "@/components/applications/apply-draft-dialog";
import { emptyCareerBrief } from "@/lib/career/defaults";
import { rankJobs, sortRanked, suggestedSkills } from "@/lib/career/ranking";
import { secureFetch } from "@/lib/client-security";
import {
  applicationStatuses,
  careerBriefSchema,
  type ApplicationRecord,
  type ApplicationStatus,
  type CareerBrief,
  type RankedJob,
} from "@/lib/career/types";
import { locations, type KeralaLocation } from "@/lib/jobs/locations";
import type { SearchResponse } from "@/lib/jobs/search";
import { sourceIds, sourceLabels, type JobSource } from "@/lib/jobs/types";
import type { NormalizedJob } from "@/lib/jobs/types";
import { companyWebsite } from "@/lib/jobs/validate";
import { freshnessTier } from "@/lib/jobs/posted";
import { postedLabel, sourceBadges } from "./job-card";
import { JobDetail } from "./job-detail";

const statusLabels: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
};

const experienceLabels: Record<CareerBrief["experienceLevel"], string> = {
  entry: "Entry",
  mid: "Mid",
  senior: "Senior",
  lead: "Lead",
};

const workModeLabels: Record<CareerBrief["workMode"], string> = {
  any: "Any",
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

const jobTypeLabels: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  internship: "Internship",
  contract: "Contract",
};

const rankingLabels: Record<CareerBrief["rankingGoal"], string> = {
  "best-fit": "Best Fit",
  "fast-apply": "Fast Apply",
  "growth-stretch": "Growth Stretch",
};

const processingSteps = [
  "Searching job sources...",
  "Finding relevant opportunities...",
  "Checking job details...",
  "Matching jobs with your profile...",
  "Preparing the best results...",
];

function readResumeProfile(): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      sessionStorage.getItem("lazyhire:resume-profile") ??
      sessionStorage.getItem("orvio:resume-profile") ??
      sessionStorage.getItem("job-hunter:resume-profile") ??
      ""
    );
  } catch {
    return "";
  }
}

function parseSkillList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function roleSuggestionsFor(brief: CareerBrief): string[] {
  const text = `${brief.role} ${brief.skills.join(" ")}`.toLowerCase();
  const suggestions = new Set<string>();
  const add = (roles: string[]) =>
    roles.forEach((role) => suggestions.add(role));

  if (/react|next|frontend|front[- ]?end|ui|typescript|javascript/.test(text)) {
    add([
      "Frontend Engineer",
      "React Developer",
      "Next.js Developer",
      "UI Engineer",
    ]);
  }
  if (/node|express|api|backend|server|sql|postgres|mysql|mongodb/.test(text)) {
    add([
      "Backend Developer",
      "Node.js Developer",
      "Full Stack Developer",
      "API Developer",
    ]);
  }
  if (/python|django|flask|fastapi|data|machine|ai|ml/.test(text)) {
    add([
      "Python Developer",
      "Data Analyst",
      "AI Engineer",
      "Machine Learning Engineer",
    ]);
  }
  if (/test|qa|playwright|selenium|automation|quality/.test(text)) {
    add(["QA Automation Engineer", "Software Test Engineer"]);
  }
  if (/marketing|seo|ads|content|growth|social/.test(text)) {
    add([
      "Digital Marketing Executive",
      "SEO Specialist",
      "Performance Marketing Executive",
    ]);
  }
  if (/sales|business development|bd|account/.test(text)) {
    add(["Business Development Executive", "Sales Executive"]);
  }
  if (/hr|recruit|talent|human resource/.test(text)) {
    add(["HR Executive", "Technical Recruiter"]);
  }
  if (!suggestions.size) {
    add([
      "Software Developer",
      "Frontend Engineer",
      "Full Stack Developer",
      "Product Support Engineer",
    ]);
  }

  return [...suggestions]
    .filter((role) => role.toLowerCase() !== brief.role.toLowerCase())
    .slice(0, 6);
}

function mergeApplication(
  records: ApplicationRecord[],
  record: ApplicationRecord,
) {
  const next = records.filter((item) => item.id !== record.id);
  return [record, ...next].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

function confirmExternal(event: MouseEvent<HTMLAnchorElement>) {
  const url = event.currentTarget.href;
  try {
    const host = new URL(url).host;
    if (
      !window.confirm(
        `You are leaving LazyHire for ${host}. Do not share payment details, government IDs, or passwords with a recruiter.`,
      )
    )
      event.preventDefault();
  } catch {
    event.preventDefault();
  }
}

export function SearchWorkspace() {
  const router = useRouter();
  const [brief, setBrief] = useState<CareerBrief>(emptyCareerBrief);
  const [skillDraft, setSkillDraft] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [ranked, setRanked] = useState<RankedJob[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<NormalizedJob | null>(null);
  const [draftJob, setDraftJob] = useState<NormalizedJob | null>(null);
  const [draft, setDraft] = useState<ApplyDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftResumeRequired, setDraftResumeRequired] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);
  const [draftMarking, setDraftMarking] = useState(false);
  const [view, setView] = useState<"brief" | "matches" | "pipeline">("brief");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "fit">("newest");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    "all",
  );
  const [pipelineFilter, setPipelineFilter] = useState<
    ApplicationStatus | "all"
  >("all");
  const [page, setPage] = useState(1);
  const controller = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const aborter = new AbortController();
    void Promise.allSettled([
      fetch("/api/profile/brief", {
        cache: "no-store",
        credentials: "same-origin",
        signal: aborter.signal,
      }),
      fetch("/api/applications", {
        cache: "no-store",
        credentials: "same-origin",
        signal: aborter.signal,
      }),
    ]).then(async ([briefResult, applicationsResult]) => {
      if (aborter.signal.aborted) return;
      if (briefResult.status === "fulfilled" && briefResult.value.ok) {
        const body = await briefResult.value.json();
        if (body.brief) {
          const parsed = careerBriefSchema.safeParse(body.brief);
          if (parsed.success) {
            setBrief(parsed.data);
            setSkillDraft(parsed.data.skills.join(", "));
          }
        }
      }
      if (
        applicationsResult.status === "fulfilled" &&
        applicationsResult.value.ok
      ) {
        const body = await applicationsResult.value.json();
        if (Array.isArray(body.applications))
          setApplications(body.applications);
      }
    });
    return () => {
      aborter.abort();
      controller.current?.abort();
    };
  }, []);

  const activeBrief = useMemo(
    () => ({ ...brief, skills: parseSkillList(skillDraft) }),
    [brief, skillDraft],
  );
  const applicationByJob = useMemo(
    () => new Map(applications.map((record) => [record.jobId, record])),
    [applications],
  );
  const filteredRanked = sortRanked(ranked, sortOrder).filter(({ job }) => {
    const typeMatch = typeFilter === "all" || job.jobType === typeFilter;
    const status = applicationByJob.get(job.id)?.status;
    const statusMatch = statusFilter === "all" || status === statusFilter;
    return typeMatch && statusMatch;
  });
  const pageCount = Math.max(1, Math.ceil(filteredRanked.length / 8));
  const visible = filteredRanked.slice((page - 1) * 8, page * 8);
  const hasTypes = data?.jobs.some((job) => job.jobType);
  const missingThemes = useMemo(
    () =>
      suggestedSkills(
        activeBrief,
        ranked.map((item) => item.job),
      ),
    [activeBrief, ranked],
  );
  const roleSuggestions = useMemo(
    () => roleSuggestionsFor(activeBrief),
    [activeBrief],
  );

  function updateBrief<K extends keyof CareerBrief>(
    key: K,
    value: CareerBrief[K],
  ) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  function toggleSource(source: JobSource) {
    updateBrief(
      "sources",
      activeBrief.sources.includes(source)
        ? activeBrief.sources.filter((item) => item !== source)
        : [...activeBrief.sources, source],
    );
  }

  function selectAllSources() {
    updateBrief("sources", [...sourceIds]);
  }

  function toggleCity(city: KeralaLocation) {
    if (city === "kerala") {
      updateBrief("cities", ["kerala"]);
      return;
    }
    const withoutAllKerala = activeBrief.cities.filter(
      (item) => item !== "kerala",
    );
    const next = withoutAllKerala.includes(city)
      ? withoutAllKerala.filter((item) => item !== city)
      : [...withoutAllKerala, city];
    updateBrief("cities", next.length ? next : ["kerala"]);
  }

  function changePage(value: number) {
    setPage(value);
    resultsRef.current?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }

  function applyRoleSuggestion(role: string) {
    updateBrief("role", role);
    setView("brief");
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    }, 0);
  }

  async function search() {
    const parsed = careerBriefSchema.safeParse(activeBrief);
    if (!parsed.success) {
      setError("Add a target role, at least one city, and one source.");
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    setNotice("");
    setData(null);
    setRanked([]);
    setPage(1);
    setTypeFilter("all");
    setStatusFilter("all");
    try {
      const saveResponse = await secureFetch("/api/profile/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: request.signal,
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok)
        throw new Error(saved.error?.message ?? "Career brief was not saved.");
      const searchParams = new URLSearchParams({
        q: parsed.data.role,
        location:
          parsed.data.cities.length === 1 ? parsed.data.cities[0] : "kerala",
        sources: parsed.data.sources.join(","),
      });
      const searchResponse = await secureFetch(
        `/api/jobs/search?${searchParams.toString()}`,
        { signal: request.signal },
      );
      const body = await searchResponse.json();
      if (!searchResponse.ok)
        throw new Error(
          body.error?.message ?? "Search could not finish. Please try again.",
        );
      const profileText = readResumeProfile();
      let nextRanked = rankJobs(body.jobs, saved.brief, profileText);
      const insightResponse = await secureFetch("/api/jobs/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: body.jobs,
          brief: saved.brief,
          profileText,
        }),
        signal: request.signal,
      });
      if (insightResponse.ok) {
        const insightBody = await insightResponse.json();
        if (Array.isArray(insightBody.ranked)) nextRanked = insightBody.ranked;
        if (insightBody.fallback) setNotice(insightBody.fallback);
      } else {
        setNotice("AI insight layer is quiet; local scoring is active.");
      }
      if (!request.signal.aborted) {
        setBrief(saved.brief);
        setData(body);
        setRanked(nextRanked);
        setView("matches");
      }
    } catch (error) {
      if (!request.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "We couldn't connect. Please try again.",
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  async function updateApplication(
    job: NormalizedJob,
    status: ApplicationStatus,
    notes?: string,
  ) {
    const existing = applicationByJob.get(job.id);
    const response = await secureFetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job,
        status,
        notes: notes ?? existing?.notes,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setNotice(body.error?.message ?? "Application status was not updated.");
      return;
    }
    setApplications((current) => mergeApplication(current, body.application));
  }

  async function draftApplication(job: NormalizedJob) {
    setDraftJob(job);
    setDraft(null);
    setDraftError("");
    setDraftResumeRequired(false);
    setDraftCopied(false);
    setDraftLoading(true);
    try {
      const response = await secureFetch("/api/applications/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, cvId: activeBrief.cvUploadId ?? undefined }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.error?.code === "RESUME_REQUIRED") {
          setDraftResumeRequired(true);
          throw new Error(body.error.message);
        }
        throw new Error(
          body.error?.message ?? "Application draft could not be prepared.",
        );
      }
      setDraft(body.draft);
      if (body.application)
        setApplications((current) => mergeApplication(current, body.application));
    } catch (error) {
      setDraftError(
        error instanceof Error
          ? error.message
          : "Application draft could not be prepared.",
      );
    } finally {
      setDraftLoading(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(
        `Subject: ${draft.subject}\n\n${draft.body}`,
      );
      setDraftCopied(true);
      window.setTimeout(() => setDraftCopied(false), 1800);
    } catch {
      setNotice("Copy was blocked by the browser. Select the message manually.");
    }
  }

  function openDraftDestination() {
    if (!draft || !draftJob) return;
    if (draft.recipientEmail) {
      window.location.href = `mailto:${encodeURIComponent(draft.recipientEmail)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
      return;
    }
    const url = draftJob.applyUrl ?? draftJob.sourceUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function markDraftApplied() {
    if (!draftJob) return;
    setDraftMarking(true);
    try {
      await updateApplication(
        draftJob,
        "applied",
        draft ? `Drafted application message ${draft.id}.` : undefined,
      );
      setDraftJob(null);
      setDraft(null);
    } finally {
      setDraftMarking(false);
    }
  }

  function uploadResumeForDraft() {
    if (draftJob) {
      try {
        sessionStorage.setItem("lazyhire:selected-job", JSON.stringify(draftJob));
      } catch {
        /* CV upload can continue even if storage is unavailable. */
      }
    }
    router.push("/cv");
  }

  return (
    <AppShell>
      <div className="motion-safe:animate-fade-in">
        <section className="grid gap-5 border-b pb-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div className="min-w-0">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground shadow-subtle">
              <BriefcaseBusiness className="size-4 text-primary" />
              Career Copilot
            </div>
            <h1 className="max-w-3xl text-3xl leading-tight sm:text-[42px]">
              Choose the roles worth your next move.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Search Kerala job sources, rank the real openings against your
              brief, and move strong matches into a private pipeline.
            </p>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-card text-center shadow-elevated">
            <Metric label="Matches" value={ranked.length} />
            <Metric label="Tracked" value={applications.length} />
            <Metric label="Sources" value={activeBrief.sources.length} />
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-2 rounded-lg border bg-card p-1 shadow-subtle">
          <Button
            variant={view === "brief" ? "default" : "secondary"}
            className="flex-1 sm:flex-none"
            onClick={() => setView("brief")}
            disabled={!hydrated}
          >
            <Target />
            Career Brief
          </Button>
          <Button
            variant={view === "matches" ? "default" : "secondary"}
            className="flex-1 sm:flex-none"
            onClick={() => setView("matches")}
            disabled={!hydrated || (!data && !loading)}
          >
            <Sparkles />
            Top Matches
          </Button>
          <Button
            variant={view === "pipeline" ? "default" : "secondary"}
            className="flex-1 sm:flex-none"
            onClick={() => setView("pipeline")}
            disabled={!hydrated}
          >
            <Columns3 />
            Application Pipeline
          </Button>
        </div>

        {view === "brief" && (
          <BriefForm
            brief={activeBrief}
            skillDraft={skillDraft}
            loading={loading}
            ready={hydrated}
            onSkillDraft={setSkillDraft}
            onSearch={() => void search()}
            onUpdate={updateBrief}
            onToggleCity={toggleCity}
            onToggleSource={toggleSource}
            onSelectAllSources={selectAllSources}
            onApplyRoleSuggestion={applyRoleSuggestion}
            roleSuggestions={roleSuggestions}
          />
        )}

        <div
          ref={resultsRef}
          className="mt-8 scroll-mt-6"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading && <LoadingResults sources={activeBrief.sources} />}
          {error && (
            <ErrorState message={error} onRetry={() => void search()} />
          )}
          {notice && !loading && (
            <p className="mb-5 rounded-md border bg-card px-4 py-3 text-xs text-muted-foreground">
              {notice}
            </p>
          )}
          {view === "matches" && data && (
            <TopMatches
              data={data}
              hasTypes={Boolean(hasTypes)}
              missingThemes={missingThemes}
              page={page}
              pageCount={pageCount}
              statusFilter={statusFilter}
              typeFilter={typeFilter}
              sortOrder={sortOrder}
              visible={visible}
              total={filteredRanked.length}
              applicationByJob={applicationByJob}
              onOpen={setSelected}
              onDraft={(job) => void draftApplication(job)}
              onPage={changePage}
              onStatus={(job, status) => void updateApplication(job, status)}
              onStatusFilter={setStatusFilter}
              onTypeFilter={setTypeFilter}
              onSortOrder={(order) => {
                setSortOrder(order);
                setPage(1);
              }}
              onApplyRoleSuggestion={applyRoleSuggestion}
              roleSuggestions={roleSuggestions}
            />
          )}
          {view === "pipeline" && (
            <Pipeline
              applications={applications}
              filter={pipelineFilter}
              onFilter={setPipelineFilter}
              onOpen={setSelected}
              onStatus={(job, status, notes) =>
                void updateApplication(job, status, notes)
              }
            />
          )}
        </div>
      </div>
      <JobDetail
        job={selected}
        onClose={() => setSelected(null)}
        onDraft={(job) => void draftApplication(job)}
      />
      <ApplyDraftDialog
        job={draftJob}
        draft={draft}
        error={draftError}
        loading={draftLoading}
        resumeRequired={draftResumeRequired}
        copied={draftCopied}
        marking={draftMarking}
        onClose={() => {
          setDraftJob(null);
          setDraft(null);
          setDraftError("");
          setDraftResumeRequired(false);
        }}
        onCopy={() => void copyDraft()}
        onOpen={openDraftDestination}
        onUploadResume={uploadResumeForDraft}
        onMarkApplied={() => void markDraftApplied()}
      />
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r px-3 py-3 last:border-r-0">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] uppercase text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function BriefForm({
  brief,
  skillDraft,
  loading,
  ready,
  onSkillDraft,
  onSearch,
  onToggleCity,
  onToggleSource,
  onSelectAllSources,
  onApplyRoleSuggestion,
  onUpdate,
  roleSuggestions,
}: {
  brief: CareerBrief;
  skillDraft: string;
  loading: boolean;
  ready: boolean;
  onSkillDraft: (value: string) => void;
  onSearch: () => void;
  onToggleCity: (city: KeralaLocation) => void;
  onToggleSource: (source: JobSource) => void;
  onSelectAllSources: () => void;
  onApplyRoleSuggestion: (role: string) => void;
  onUpdate: <K extends keyof CareerBrief>(
    key: K,
    value: CareerBrief[K],
  ) => void;
  roleSuggestions: string[];
}) {
  const hasAllSources = brief.sources.length === sourceIds.length;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
      className="mt-6 rounded-lg border bg-card p-4 shadow-elevated sm:p-6"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold">Target role</span>
          <Input
            value={brief.role}
            onChange={(event) => onUpdate("role", event.target.value)}
            disabled={loading || !ready}
            maxLength={120}
            minLength={2}
            required
            placeholder="React developer"
            className="h-12 bg-secondary/55 text-base sm:text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold">Experience</span>
          <Select
            aria-label="Experience"
            value={brief.experienceLevel}
            disabled={loading || !ready}
            onChange={(event) =>
              onUpdate(
                "experienceLevel",
                event.target.value as CareerBrief["experienceLevel"],
              )
            }
            className="h-12"
          >
            {Object.entries(experienceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold">Ranking</span>
          <Select
            aria-label="Ranking"
            value={brief.rankingGoal}
            disabled={loading || !ready}
            onChange={(event) =>
              onUpdate(
                "rankingGoal",
                event.target.value as CareerBrief["rankingGoal"],
              )
            }
            className="h-12"
          >
            {Object.entries(rankingLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold">Skills</span>
          <Input
            value={skillDraft}
            onChange={(event) => onSkillDraft(event.target.value)}
            disabled={loading || !ready}
            placeholder="React, TypeScript, SQL, Playwright"
            className="h-12 bg-secondary/55"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold">Salary</span>
          <Input
            value={brief.salaryPreference}
            onChange={(event) =>
              onUpdate("salaryPreference", event.target.value)
            }
            disabled={loading || !ready}
            maxLength={120}
            placeholder="Optional"
            className="h-12 bg-secondary/55"
          />
        </label>
      </div>

      {roleSuggestions.length > 0 && (
        <div className="mt-4 rounded-md border bg-secondary/45 p-3">
          <p className="mb-2 text-xs font-semibold">Role suggestions</p>
          <div className="flex flex-wrap gap-2">
            {roleSuggestions.map((role) => (
              <button
                key={role}
                type="button"
                disabled={loading || !ready}
                onClick={() => onApplyRoleSuggestion(role)}
                className="h-8 rounded-md border bg-card px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold">
            Preferred cities
          </legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(locations) as KeralaLocation[]).map((city) => {
              const checked = brief.cities.includes(city);
              return (
                <label
                  key={city}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                    checked
                      ? "border-primary/30 bg-accent text-primary"
                      : "bg-secondary/55 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={loading || !ready}
                    onChange={() => onToggleCity(city)}
                    className="size-3.5 accent-primary"
                  />
                  {locations[city].label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold">Sources</span>
            <button
              type="button"
              onClick={onSelectAllSources}
              disabled={loading || !ready || hasAllSources}
              className="h-8 rounded-md border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Select all companies
            </button>
          </legend>
          <div className="flex flex-wrap gap-2">
            {sourceIds.map((source) => {
              const checked = brief.sources.includes(source);
              return (
                <label
                  key={source}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                    checked
                      ? "border-primary/30 bg-accent text-primary"
                      : "bg-secondary/55 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <input
                    aria-label={sourceLabels[source]}
                    type="checkbox"
                    checked={checked}
                    disabled={loading || !ready}
                    onChange={() => onToggleSource(source)}
                    className="size-3.5 accent-primary"
                  />
                  {sourceLabels[source]}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 text-xs font-semibold">Work mode</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(workModeLabels).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={brief.workMode === value}
              disabled={loading || !ready}
              onClick={() =>
                onUpdate("workMode", value as CareerBrief["workMode"])
              }
              className={`h-9 rounded-md border px-3 text-xs font-semibold transition-colors ${
                brief.workMode === value
                  ? "border-primary/30 bg-accent text-primary"
                  : "bg-secondary/55 text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <Button asChild variant="ghost" className="px-0">
          <Link href="/cv">
            Analyze resume
            <ArrowRight />
          </Link>
        </Button>
        <Button
          type="submit"
          className="h-12 px-6"
          disabled={loading || !ready}
        >
          {loading ? "Finding..." : "Find matches"}
          <ArrowRight />
        </Button>
      </div>
    </form>
  );
}

function LoadingResults({ sources }: { sources: JobSource[] }) {
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % processingSteps.length);
    }, 1450);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <div className="motion-safe:animate-fade-in">
      <section className="overflow-hidden rounded-lg border bg-card shadow-subtle">
        <div className="relative p-5 sm:p-6">
          <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-secondary">
            <div className="h-full w-1/3 animate-ai-scan rounded-full bg-primary" />
          </div>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="relative flex size-12 shrink-0 items-center justify-center rounded-lg border bg-background text-primary">
              <Bot className="size-5" />
              <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-card bg-primary motion-safe:animate-ai-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                AI search in progress
              </p>
              <h2 className="mt-1 text-xl leading-7">
                Searching and analyzing live job matches
              </h2>
              <div className="mt-4 grid gap-2">
                {processingSteps.map((step, index) => {
                  const active = index === activeStep;
                  return (
                    <div
                      key={step}
                      className={`flex min-h-9 items-center gap-3 rounded-md border px-3 text-sm transition-colors ${
                        active
                          ? "border-primary/30 bg-accent text-primary"
                          : "bg-background text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          active
                            ? "border-primary/30 bg-card"
                            : "border-border bg-secondary"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            active
                              ? "bg-primary motion-safe:animate-ai-pulse"
                              : "bg-muted-foreground/40"
                          }`}
                        />
                      </span>
                      <span className="truncate">{step}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {sources.map((source) => (
                  <Badge key={source} variant="secondary">
                    {sourceLabels[source]}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="mt-4 rounded-lg border bg-card p-6">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-6 h-9 w-32" />
          </div>
        ))}
      </div>
      <p className="sr-only">Searching job sources. Please wait.</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border bg-card px-6 py-10 text-center"
    >
      <SearchX className="mx-auto mb-4 size-7 text-muted-foreground" />
      <h2 className="text-lg">Search paused.</h2>
      <p className="mx-auto mb-5 mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {message}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Retry search
      </Button>
    </div>
  );
}

function TopMatches({
  applicationByJob,
  data,
  hasTypes,
  missingThemes,
  page,
  pageCount,
  statusFilter,
  total,
  typeFilter,
  sortOrder,
  visible,
  onOpen,
  onDraft,
  onPage,
  onStatus,
  onStatusFilter,
  onTypeFilter,
  onSortOrder,
  onApplyRoleSuggestion,
  roleSuggestions,
}: {
  applicationByJob: Map<string, ApplicationRecord>;
  data: SearchResponse;
  hasTypes: boolean;
  missingThemes: string[];
  page: number;
  pageCount: number;
  statusFilter: ApplicationStatus | "all";
  total: number;
  typeFilter: string;
  sortOrder: "newest" | "fit";
  visible: RankedJob[];
  onOpen: (job: NormalizedJob) => void;
  onDraft: (job: NormalizedJob) => void;
  onPage: (page: number) => void;
  onStatus: (job: NormalizedJob, status: ApplicationStatus) => void;
  onStatusFilter: (status: ApplicationStatus | "all") => void;
  onTypeFilter: (type: string) => void;
  onSortOrder: (order: "newest" | "fit") => void;
  onApplyRoleSuggestion: (role: string) => void;
  roleSuggestions: string[];
}) {
  const sourceIssues = data.sources.filter(
    (source) => source.status === "unavailable" || source.warnings?.length,
  );
  const filtersActive = typeFilter !== "all" || statusFilter !== "all";
  const emptyTitle = filtersActive
    ? "No matches in this filtered view."
    : "No live matches yet.";
  const emptyMessage = filtersActive
    ? "Clear the type or status filter to see the full result set."
    : sourceIssues.length
      ? "The selected sources did not expose readable openings for this role. Try All Kerala, all sources, or a broader role title."
      : "Try a broader role title, add adjacent skills, or search across All Kerala.";
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-card p-4 shadow-subtle">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
            {data.cache.hit ? "Cached matches" : "Fresh matches"}
          </p>
          <h2 className="text-xl">
            {total} {total === 1 ? "match" : "matches"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              for &quot;{data.query}&quot;
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Sort results"
            value={sortOrder}
            onChange={(event) =>
              onSortOrder(event.target.value as "newest" | "fit")
            }
            wrapperClassName="min-w-36"
            className="h-10 text-xs"
          >
            <option value="newest">Newest first</option>
            <option value="fit">Best match</option>
          </Select>
          {hasTypes && (
            <Select
              aria-label="Job type"
              value={typeFilter}
              onChange={(event) => onTypeFilter(event.target.value)}
              wrapperClassName="min-w-36"
              className="h-10 text-xs"
            >
              <option value="all">All types</option>
              {["full-time", "part-time", "internship", "contract"]
                .filter((value) =>
                  data.jobs.some((job) => job.jobType === value),
                )
                .map((value) => (
                  <option key={value} value={value}>
                    {jobTypeLabels[value]}
                  </option>
                ))}
            </Select>
          )}
          <Select
            aria-label="Application status"
            value={statusFilter}
            onChange={(event) =>
              onStatusFilter(event.target.value as ApplicationStatus | "all")
            }
            wrapperClassName="min-w-36"
            className="h-10 text-xs"
          >
            <option value="all">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mb-5 grid gap-2 rounded-lg border bg-card p-3 shadow-subtle sm:grid-cols-2 lg:grid-cols-4">
        {data.sources.map((source) => (
          <span
            key={source.source}
            className="inline-flex min-h-9 items-center justify-between gap-2 rounded-md bg-secondary/55 px-3 text-xs text-muted-foreground"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${
                  source.status === "unavailable"
                    ? "bg-muted-foreground/40"
                    : "bg-primary"
                }`}
              />
              <span className="truncate">{source.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {source.status === "unavailable"
                ? source.code === "TIMEOUT"
                  ? "slow"
                  : "unavailable"
                : source.status === "skipped"
                  ? "not needed"
                  : source.count}
            </span>
          </span>
        ))}
      </div>

      {data.sources.some(
        (source) => source.status === "unavailable" && source.code === "TIMEOUT",
      ) && (
        <p
          role="status"
          className="mb-5 rounded-md border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground shadow-subtle"
        >
          {data.sources
            .filter(
              (source) =>
                source.status === "unavailable" && source.code === "TIMEOUT",
            )
            .map((source) => source.message)
            .join(" ")}
        </p>
      )}

      {missingThemes.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Skill signals</span>
          {missingThemes.map((skill) => (
            <Badge key={skill} variant="outline">
              {skill}
            </Badge>
          ))}
        </div>
      )}

      {data.partial && (
        <p className="mb-5 rounded-md border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground shadow-subtle">
          Some sources could not finish or needed discovery fallback. Results
          shown keep their original source links, and Apply buttons appear only
          for verified application pages.
        </p>
      )}

      {visible.length ? (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {visible.map(({ job, insight, rankScore }) => (
            <ResultCard
              key={job.id}
              job={job}
              insight={insight}
              rankScore={rankScore}
              status={applicationByJob.get(job.id)?.status}
              onOpen={() => onOpen(job)}
              onDraft={() => onDraft(job)}
              onStatus={(status) => onStatus(job, status)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-card px-6 py-14 text-center shadow-subtle">
          <SearchX className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h3 className="text-lg">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {emptyMessage}
          </p>
          {sourceIssues.length > 0 && (
            <div className="mx-auto mt-5 grid max-w-2xl gap-2 text-left">
              {sourceIssues.slice(0, 4).map((source) => (
                <p
                  key={source.source}
                  className="rounded-md border bg-secondary/55 px-3 py-2 text-xs leading-5 text-muted-foreground"
                >
                  <span className="font-semibold text-foreground">
                    {source.label}:
                  </span>{" "}
                  {source.message ?? source.warnings?.[0]}
                </p>
              ))}
            </div>
          )}
          {roleSuggestions.length > 0 && (
            <div className="mx-auto mt-5 max-w-2xl">
              <p className="mb-2 text-xs font-semibold text-foreground">
                Try one of these role titles
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {roleSuggestions.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onApplyRoleSuggestion(role)}
                    className="h-8 rounded-md border bg-secondary/55 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Results pagination"
          className="mt-6 flex items-center justify-between border-t pt-5"
        >
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * 8 + 1}-{Math.min(page * 8, total)} of {total}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous page"
              disabled={page === 1}
              onClick={() => onPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-xs tabular-nums">
              {page} / {pageCount}
            </span>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next page"
              disabled={page === pageCount}
              onClick={() => onPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}

function ResultCard({
  job,
  insight,
  rankScore,
  status,
  onOpen,
  onDraft,
  onStatus,
}: {
  job: NormalizedJob;
  insight: RankedJob["insight"];
  rankScore: number;
  status?: ApplicationStatus;
  onOpen: () => void;
  onDraft: () => void;
  onStatus: (status: ApplicationStatus) => void;
}) {
  const duplicates = Math.max(0, job.sources.length - 1);
  const website = companyWebsite(job);
  const tier = freshnessTier(job);
  const fresh = tier === "today" || tier === "3d";
  const canDraft = Boolean(job.applicationEmail || job.applyUrl);
  return (
    <article className="rounded-lg border bg-card p-5 shadow-subtle transition-all hover:-translate-y-0.5 hover:border-input hover:shadow-elevated sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 truncate text-xs text-muted-foreground">
            {job.company}
          </p>
          <h2 className="text-base leading-6 sm:text-lg">
            <button
              type="button"
              className="rounded-sm text-left transition-colors hover:text-primary"
              onClick={onOpen}
            >
              {job.title}
            </button>
          </h2>
        </div>
        <div
          aria-label={`Job match score ${insight.score ?? rankScore} out of 100`}
          className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border bg-accent text-primary shadow-subtle"
        >
          <span className="text-base font-semibold tabular-nums">
            {insight.score ?? Math.max(0, Math.min(99, rankScore))}
          </span>
          <span className="text-[9px] text-muted-foreground">fit</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {sourceBadges(job).map((source) => (
          <Badge
            key={source.key}
            variant="secondary"
            title={
              source.kind === "employer"
                ? "Found on the web; the application link is the employer's own site."
                : source.kind === "web"
                  ? "Found through web discovery on a public job board."
                  : `Read directly from ${source.label}.`
            }
          >
            {source.label}
          </Badge>
        ))}
        <span>{job.location}</span>
        <span
          className={fresh ? "font-semibold text-foreground" : undefined}
          title={
            job.datePosted
              ? job.datePostedIsApproximate
                ? "Relative date reported by the source."
                : "Date published by the source."
              : "The source did not supply a verifiable posting date."
          }
        >
          {postedLabel(job)}
        </span>
        {job.jobType && (
          <Badge variant="outline" className="capitalize">
            {job.jobType}
          </Badge>
        )}
      </div>

      {(job.experience || job.salary || job.skills.length > 0) && (
        <dl className="mt-4 grid gap-2 rounded-md border bg-secondary/55 p-3 text-xs sm:grid-cols-2">
          {job.experience && (
            <div>
              <dt className="font-semibold text-foreground">Experience</dt>
              <dd className="mt-1 text-muted-foreground">{job.experience}</dd>
            </div>
          )}
          {job.salary && (
            <div>
              <dt className="font-semibold text-foreground">Salary</dt>
              <dd className="mt-1 text-muted-foreground">{job.salary}</dd>
            </div>
          )}
          {job.skills.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="font-semibold text-foreground">Skills</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {job.skills.slice(0, 6).map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}

      {job.snippet && (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {job.snippet}
        </p>
      )}

      <div className="mt-4 rounded-md border bg-secondary/55 p-4">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="size-3.5 text-primary" />
          Why this fits
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {insight.summary}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {insight.matchedSkills.slice(0, 4).map((skill) => (
            <Badge key={skill}>Matched: {skill}</Badge>
          ))}
          {insight.missingSkills.slice(0, 5).map((skill) => (
            <Badge key={skill} variant="outline">
              Missing: {skill}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
        <p>
          <span className="font-semibold text-foreground">Resume:</span>{" "}
          {insight.resumeSuggestion}
        </p>
        <p>
          <span className="font-semibold text-foreground">Cover letter:</span>{" "}
          {insight.coverLetterSuggestion}
        </p>
      </div>

      {(duplicates > 0 || insight.warnings.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {duplicates > 0 && (
            <Badge variant="secondary">
              <ShieldCheck />
              Duplicate across {duplicates + 1} sources
            </Badge>
          )}
          {insight.warnings.map((warning) => (
            <Badge key={warning} variant="outline">
              <AlertTriangle />
              {warning}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex flex-wrap gap-2">
          {applicationStatuses.map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={status === value}
              onClick={() => onStatus(value)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
                status === value
                  ? "border-primary/30 bg-accent text-primary"
                  : "bg-secondary/55 text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "saved" ? (
                <Bookmark className="size-3" />
              ) : status === value ? (
                <Check className="size-3" />
              ) : (
                <CircleDashed className="size-3" />
              )}
              {statusLabels[value]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDraft && (
            <Button size="sm" onClick={onDraft}>
              <Send />
              Draft Apply
            </Button>
          )}
          {job.applicationEmail && (
            <Button asChild variant="secondary" size="sm">
              <a href={`mailto:${job.applicationEmail}`}>
                <Mail />
                Email
              </a>
            </Button>
          )}
          {job.sourceUrl && job.sourceUrl !== job.applyUrl && (
            <Button asChild variant="secondary" size="sm">
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={confirmExternal}
              >
                View Job
              </a>
            </Button>
          )}
          {job.applyUrl ? (
            <Button asChild size="sm">
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={confirmExternal}
              >
                Apply
                <ArrowUpRight />
              </a>
            </Button>
          ) : website ? (
            // The employer exposed only its own site: say so instead of promising an application page.
            <Button asChild variant="secondary" size="sm">
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={confirmExternal}
              >
                Company Website
                <ArrowUpRight />
              </a>
            </Button>
          ) : (
            !job.sourceUrl && (
              <span className="text-xs text-muted-foreground">
                No apply path found
              </span>
            )
          )}
        </div>
      </div>
    </article>
  );
}

function Pipeline({
  applications,
  filter,
  onFilter,
  onOpen,
  onStatus,
}: {
  applications: ApplicationRecord[];
  filter: ApplicationStatus | "all";
  onFilter: (status: ApplicationStatus | "all") => void;
  onOpen: (job: NormalizedJob) => void;
  onStatus: (
    job: NormalizedJob,
    status: ApplicationStatus,
    notes?: string,
  ) => void;
}) {
  const visible =
    filter === "all"
      ? applications
      : applications.filter((record) => record.status === filter);
  return (
    <section className="rounded-lg border bg-card p-4 shadow-elevated sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">Application Pipeline</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => onFilter("all")}
            className={`h-8 rounded-md border px-3 text-xs font-semibold ${
              filter === "all"
                ? "border-primary/30 bg-accent text-primary"
                : "bg-secondary/55 text-muted-foreground"
            }`}
          >
            All
          </button>
          {applicationStatuses.map((status) => (
            <button
              type="button"
              key={status}
              aria-pressed={filter === status}
              onClick={() => onFilter(status)}
              className={`h-8 rounded-md border px-3 text-xs font-semibold ${
                filter === status
                  ? "border-primary/30 bg-accent text-primary"
                  : "bg-secondary/55 text-muted-foreground"
              }`}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
      </div>

      {visible.length ? (
        <div className="grid gap-3">
          {visible.map((record) => {
            const job = record.jobSnapshot;
            return (
              <article
                key={record.id}
                className="grid gap-3 rounded-lg border bg-secondary/45 p-4 lg:grid-cols-[minmax(0,1fr)_180px_240px]"
              >
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted-foreground">
                    {job.company} · {sourceLabels[job.source]}
                  </p>
                  <h3 className="truncate text-base font-semibold">
                    <button
                      type="button"
                      className="rounded-sm text-left hover:text-primary"
                      onClick={() => onOpen(job)}
                    >
                      {job.title}
                    </button>
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated {new Date(record.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <label className="block">
                  <span className="sr-only">Pipeline status</span>
                  <Select
                    value={record.status}
                    onChange={(event) =>
                      onStatus(
                        job,
                        event.target.value as ApplicationStatus,
                        record.notes,
                      )
                    }
                    className="h-10 text-xs"
                  >
                    {applicationStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <textarea
                    aria-label={`Notes for ${job.title}`}
                    defaultValue={record.notes}
                    onBlur={(event) =>
                      onStatus(job, record.status, event.target.value)
                    }
                    className="min-h-10 w-full resize-y rounded-md border bg-card px-3 py-2 text-xs shadow-subtle"
                    placeholder="Notes"
                  />
                </label>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center shadow-subtle">
          <X className="mx-auto mb-4 size-7 text-muted-foreground" />
          <h3 className="text-lg">No applications here yet.</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Save a match to start the pipeline.
          </p>
        </div>
      )}
    </section>
  );
}

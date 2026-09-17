"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  LockKeyhole,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CareerTutor } from "@/components/career-tutor/career-tutor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { emptyCareerBrief } from "@/lib/career/defaults";
import { secureFetch } from "@/lib/client-security";
import type { CareerBrief } from "@/lib/career/types";
import type {
  CareerOsEvidence,
  CareerOsSnapshot,
  MissionAction,
  RoadmapBlock,
  SkillGap,
} from "@/lib/career-os/types";

function asDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function emptyBriefWith(role: string, cvUploadId: string | null): CareerBrief {
  return {
    ...emptyCareerBrief(),
    role,
    cvUploadId,
  };
}

export function CareerOsWorkspace() {
  const cvInput = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<CareerOsSnapshot | null>(null);
  const [brief, setBrief] = useState<CareerBrief | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [snapshotResponse, briefResponse] = await Promise.all([
        fetch("/api/career-os", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/profile/brief", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      const snapshotBody = await snapshotResponse.json();
      if (!snapshotResponse.ok)
        throw new Error(
          snapshotBody.error?.message ?? "Career OS is unavailable.",
        );
      const nextSnapshot = snapshotBody.snapshot as CareerOsSnapshot;
      setSnapshot(nextSnapshot);
      if (briefResponse.ok) {
        const briefBody = await briefResponse.json();
        const nextBrief = briefBody.brief as CareerBrief | null;
        setBrief(nextBrief);
        setTargetRole(nextBrief?.role ?? "");
      } else {
        setBrief(null);
        setTargetRole(
          nextSnapshot.profileStatus.hasTargetRole ? nextSnapshot.twin.role : "",
        );
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Career OS is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setupComplete = Boolean(snapshot?.profileStatus.readyForPersonalization);
  const latestCvId = snapshot?.profileStatus.latestCvId ?? null;
  const latestCvFilename = snapshot?.profileStatus.latestCvFilename ?? null;
  const nextActions = snapshot?.missionControl.nextActions ?? [];
  const primaryGaps = snapshot?.skills.gaps.slice(0, 3) ?? [];

  async function saveTargetRole(nextCvId = latestCvId) {
    const role = targetRole.trim();
    if (role.length < 2) {
      setNotice("Choose a target role before LazyHire generates guidance.");
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const body = brief
        ? { ...brief, role, cvUploadId: nextCvId }
        : emptyBriefWith(role, nextCvId);
      const response = await secureFetch("/api/profile/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "Career profile was not saved.");
      setBrief(result.brief);
      setNotice("Career profile saved. Refreshing your Career OS...");
      await load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Career profile could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadCv(file: File) {
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setNotice("Choose a PDF or DOCX file under 5 MB.");
      return;
    }
    setUploading(true);
    setNotice("");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await secureFetch("/api/cv/analyze", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "This CV could not be read.");
      setNotice(`${result.filename} uploaded and parsed.`);
      if (targetRole.trim().length >= 2) await saveTargetRole(result.id);
      else await load();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "This CV could not be read.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <AppShell>
      <div className="motion-safe:animate-fade-in">
        <section className="grid min-w-0 gap-5 border-b border-border/80 pb-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div className="min-w-0">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground shadow-subtle">
              <Sparkles className="size-4 text-primary" />
              AI Career Operating System
            </div>
            <h1 className="max-w-3xl text-3xl leading-tight sm:text-[42px]">
              LazyHire turns your career evidence into a focused plan.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              No demo stats. No pretend certainty. Upload your CV, choose a
              target role, and the OS will only personalize what it can support.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 rounded-lg border bg-card p-1 shadow-subtle lg:justify-end">
            <Button
              variant="secondary"
              onClick={() => void load()}
              disabled={loading || saving || uploading}
            >
              <RefreshCw />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/">
                <BriefcaseBusiness />
                Find matches
              </Link>
            </Button>
          </div>
        </section>

        {loading && <LoadingState />}
        {error && !loading && (
          <StatusPanel tone="error" message={error} onRetry={() => void load()} />
        )}
        {notice && !loading && (
          <p role="status" className="mt-5 rounded-md border bg-card px-4 py-3 text-xs text-muted-foreground">
            {notice}
          </p>
        )}

        {snapshot && !loading && (
          <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">
              {!setupComplete && (
                <OnboardingPanel
                  snapshot={snapshot}
                  targetRole={targetRole}
                  saving={saving}
                  uploading={uploading}
                  latestCvFilename={latestCvFilename}
                  cvInput={cvInput}
                  onRoleChange={setTargetRole}
                  onSave={() => void saveTargetRole()}
                  onUpload={(file) => void uploadCv(file)}
                />
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {snapshot.metrics.map((metric) => (
                  <MetricCard key={metric.label} {...metric} />
                ))}
              </div>

              <section className="grid gap-5 lg:grid-cols-2">
                <ReadinessCard snapshot={snapshot} gaps={primaryGaps} />
                <RoadmapCard snapshot={snapshot} />
              </section>

              <OpportunitiesCard snapshot={snapshot} actions={nextActions} />
            </div>

            <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
              <AssistantCard ready={setupComplete} snapshot={snapshot} />
              <PrivacyCard snapshot={snapshot} />
            </aside>
          </div>
        )}
      </div>
      <CareerTutor />
    </AppShell>
  );
}

function LoadingState() {
  return (
    <div className="mt-7 grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-lg border bg-card p-6">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function StatusPanel({
  message,
  onRetry,
  tone,
}: {
  message: string;
  onRetry: () => void;
  tone: "error" | "neutral";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="mt-7 rounded-lg border bg-card px-6 py-10 text-center"
    >
      <ShieldCheck className="mx-auto mb-4 size-7 text-muted-foreground" />
      <h2 className="text-lg">Career OS paused.</h2>
      <p className="mx-auto mb-5 mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {message}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="h-full rounded-lg border bg-card p-5 shadow-subtle">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function OnboardingPanel({
  snapshot,
  targetRole,
  saving,
  uploading,
  latestCvFilename,
  cvInput,
  onRoleChange,
  onSave,
  onUpload,
}: {
  snapshot: CareerOsSnapshot;
  targetRole: string;
  saving: boolean;
  uploading: boolean;
  latestCvFilename: string | null;
  cvInput: RefObject<HTMLInputElement | null>;
  onRoleChange: (value: string) => void;
  onSave: () => void;
  onUpload: (file: File) => void;
}) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-elevated sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-primary">
            Career Profile onboarding
          </p>
          <h2 className="text-xl">Unlock personalized guidance with two inputs.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {snapshot.profileStatus.emptyStateReason}
          </p>
        </div>
        <Badge variant="outline">
          {snapshot.twin.memoryCoverage}% setup complete
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-md border bg-secondary/55 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Upload className="size-4 text-primary" />
            <h3 className="text-sm">Resume/CV</h3>
          </div>
          <p className="min-h-10 text-sm leading-6 text-muted-foreground">
            {latestCvFilename
              ? `Current file: ${latestCvFilename}`
              : "Upload a PDF or DOCX so LazyHire can use your actual evidence."}
          </p>
          <input
            ref={cvInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => cvInput.current?.click()}
            disabled={uploading || saving}
          >
            <FileText />
            {uploading ? "Processing..." : latestCvFilename ? "Replace CV" : "Upload CV"}
          </Button>
        </div>

        <form
          className="rounded-md border bg-secondary/55 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Target className="size-4 text-primary" />
            <h3 className="text-sm">Target career path</h3>
          </div>
          <label htmlFor="target-role" className="sr-only">
            Target role
          </label>
          <Input
            id="target-role"
            placeholder="Python Developer, Data Analyst, Product Manager..."
            value={targetRole}
            onChange={(event) => onRoleChange(event.target.value)}
            disabled={saving || uploading}
          />
          <Button className="mt-4" type="submit" disabled={saving || uploading}>
            <CheckCircle2 />
            {saving ? "Saving..." : "Save target"}
          </Button>
        </form>
      </div>
    </section>
  );
}

function ReadinessCard({
  snapshot,
  gaps,
}: {
  snapshot: CareerOsSnapshot;
  gaps: SkillGap[];
}) {
  const readiness = snapshot.readiness;
  return (
    <section className="rounded-lg border bg-card p-5 shadow-elevated sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
            Career Readiness
          </p>
          <h2 className="text-xl">{readiness.label}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {snapshot.profileStatus.readyForPersonalization
              ? "Calculated from your CV, career profile, and tracked opportunities."
              : "Unavailable until your CV and target role are both present."}
          </p>
        </div>
        <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg border bg-accent text-primary shadow-subtle">
          <span className="text-xl font-semibold tabular-nums">
            {readiness.score}
          </span>
          <span className="text-[9px] text-muted-foreground">score</span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${readiness.score}%` }}
        />
      </div>
      <div className="mt-5 grid gap-3">
        {readiness.evidence.map((item) => (
          <EvidenceRow key={item.label} item={item} />
        ))}
      </div>
      {gaps.length > 0 ? (
        <div className="mt-5 border-t pt-4">
          <p className="mb-3 text-xs font-semibold">Priority gaps</p>
          <div className="grid gap-3">
            {gaps.map((gap) => (
              <div key={gap.skill} className="rounded-md border bg-secondary/55 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="text-sm">{gap.skill}</h3>
                  <Badge variant="outline">
                    {gap.priority} · {gap.confidence}% estimate
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {gap.nextStep}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyInline text="Skill-gap analysis is unavailable until onboarding is complete." />
      )}
    </section>
  );
}

function EvidenceRow({ item }: { item: CareerOsEvidence }) {
  const label =
    item.source === "derived"
      ? "calculated/empty"
      : item.source === "cv"
        ? "CV-derived"
        : item.source;
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-secondary/55 p-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold">{item.label}</p>
        <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
          {item.value}
        </p>
      </div>
      <Badge variant="secondary">{label}</Badge>
    </div>
  );
}

function RoadmapCard({ snapshot }: { snapshot: CareerOsSnapshot }) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-elevated sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
            Career Roadmap
          </p>
          <h2 className="text-xl">
            {snapshot.profileStatus.readyForPersonalization
              ? snapshot.twin.role
              : "Waiting for your career profile"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Learning order, proof projects, interview prep, and portfolio
            milestones are generated only after setup.
          </p>
        </div>
        <Route className="size-5 text-primary" />
      </div>
      {snapshot.roadmap.length ? (
        <div className="grid gap-3">
          {snapshot.roadmap.map((block) => (
            <RoadmapBlockView key={block.horizon} block={block} />
          ))}
        </div>
      ) : (
        <EmptyInline text="No roadmap has been generated because required profile evidence is missing." />
      )}
    </section>
  );
}

function RoadmapBlockView({ block }: { block: RoadmapBlock }) {
  return (
    <article className="rounded-md border bg-secondary/55 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm">{block.horizon}</h3>
        <Badge variant="secondary">{block.confidence}% estimate</Badge>
      </div>
      <p className="text-xs font-semibold text-primary">{block.objective}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {block.milestones.slice(0, 3).map((milestone) => (
          <li key={milestone} className="flex gap-2">
            <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
            <span>{milestone}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t pt-3 text-xs leading-5 text-primary">
        {block.nextAction}
      </p>
    </article>
  );
}

function OpportunitiesCard({
  snapshot,
  actions,
}: {
  snapshot: CareerOsSnapshot;
  actions: MissionAction[];
}) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-elevated sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
            Opportunities
          </p>
          <h2 className="text-xl">Pipeline and next actions</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Saved applications are real workspace data. Job recommendations stay
            locked until LazyHire can compare them to your profile evidence.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/">
            Search roles
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(snapshot.missionControl.statusCounts).map(
          ([status, count]) => (
            <div key={status} className="rounded-md border bg-secondary/55 p-3">
              <p className="text-lg font-semibold tabular-nums">{count}</p>
              <p className="mt-1 text-[10px] uppercase text-muted-foreground">
                {status}
              </p>
            </div>
          ),
        )}
      </div>

      {snapshot.radar.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {snapshot.radar.slice(0, 4).map((item) => (
            <article key={item.id} className="rounded-md border bg-secondary/55 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant="secondary">{item.type}</Badge>
                <Badge variant="outline">{item.score} estimate</Badge>
              </div>
              <h3 className="text-sm">{item.title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.signal}
              </p>
              <p className="mt-3 text-xs leading-5 text-primary">
                {item.action}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {actions.length ? (
            actions.map((action) => (
              <article key={action.id} className="rounded-md border bg-secondary/55 p-4">
                <Badge variant="outline">{action.priority}</Badge>
                <h3 className="mt-3 text-sm">{action.label}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {action.reason}
                </p>
              </article>
            ))
          ) : (
            <EmptyInline text="No opportunity recommendations are available yet." />
          )}
        </div>
      )}
    </section>
  );
}

function AssistantCard({
  ready,
  snapshot,
}: {
  ready: boolean;
  snapshot: CareerOsSnapshot;
}) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-elevated">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
            AI Career Assistant
          </p>
          <h2 className="text-lg">Ask on the right</h2>
        </div>
        <Bot className="size-5 text-primary" />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        The assistant stays available from the right side. It can answer general
        career questions now, and can use your profile after you enable profile
        context in chat settings.
      </p>
      <div className="mt-4 rounded-md border bg-secondary/55 p-3 text-xs leading-5 text-muted-foreground">
        {ready
          ? `Profile ready: ${snapshot.twin.role}.`
          : "Profile-aware answers are limited until onboarding is complete."}
      </div>
    </section>
  );
}

function PrivacyCard({ snapshot }: { snapshot: CareerOsSnapshot }) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-elevated">
      <div className="mb-4 flex items-center gap-2">
        <LockKeyhole className="size-4 text-primary" />
        <h2 className="text-base">Data confidence</h2>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Generated {asDate(snapshot.generatedAt)}. {snapshot.guardrails.summary}
      </p>
      <div className="mt-4 grid gap-2">
        {snapshot.guardrails.avoidedGuesses.slice(0, 3).map((item) => (
          <p key={item} className="rounded-md border bg-secondary/55 p-3 text-xs leading-5 text-muted-foreground">
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function EmptyInline({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-md border border-dashed bg-secondary/35 p-4 text-sm leading-6 text-muted-foreground">
      {text}
    </div>
  );
}

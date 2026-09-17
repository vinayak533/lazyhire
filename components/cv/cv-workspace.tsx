"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Download,
  Edit3,
  FileText,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCsrfToken, secureFetch } from "@/lib/client-security";
import type { CvResult, CvIssue } from "@/lib/cv/types";
import type { AiReview, TailoredCv } from "@/lib/ai/prompts";
import type { NormalizedJob } from "@/lib/jobs/types";

const selectedJobStorageKey = "lazyhire:selected-job";
const legacyOrvioSelectedJobStorageKey = "orvio:selected-job";
const legacySelectedJobStorageKey = "job-hunter:selected-job";
const resumeProfileStorageKey = "lazyhire:resume-profile";

function ScoreGauge({ score }: { score: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = reduced ? 1 : Math.min(1, (time - start) / 850);
      setShown(Math.round(score * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);
  return (
    <div
      role="img"
      aria-label={`CV writing score: ${score} out of 100`}
      className="relative mx-auto size-40"
    >
      <svg
        viewBox="0 0 160 160"
        className="size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="80"
          cy="80"
          r="68"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          className="text-muted"
        />
        <circle
          cx="80"
          cy="80"
          r="68"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          className="text-primary"
          strokeDasharray={427.26}
          strokeDashoffset={427.26 * (1 - shown / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-semibold tracking-heading tabular-nums">
          {shown}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}

function subscribeHydration() {
  return () => {};
}

export function CvWorkspace() {
  const [result, setResult] = useState<CvResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<NormalizedJob | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jd, setJd] = useState("");
  const [review, setReview] = useState<AiReview | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [cached, setCached] = useState(false);
  const [tailored, setTailored] = useState<TailoredCv | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);
  const [tailorError, setTailorError] = useState("");
  const [tailorCached, setTailorCached] = useState(false);
  const [editingTailored, setEditingTailored] = useState(false);
  const [tailoredDraft, setTailoredDraft] = useState("");
  const [appliedText, setAppliedText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  useEffect(() => {
    try {
      const value =
        sessionStorage.getItem(selectedJobStorageKey) ??
        sessionStorage.getItem(legacyOrvioSelectedJobStorageKey) ??
        sessionStorage.getItem(legacySelectedJobStorageKey);
      if (value) {
        const selected = JSON.parse(value) as NormalizedJob;
        if (
          typeof selected.description === "string" &&
          typeof selected.title === "string"
        )
          queueMicrotask(() => {
            setJob(selected);
            setTargetRole(selected.title);
            setCompanyName(selected.company);
            setJd(selected.description.slice(0, 20_000));
          });
      }
    } catch {
      /* A blocked or stale session store must not prevent uploads. */
    }
    return () => {
      xhr.current?.abort();
      aiAbort.current?.abort();
    };
  }, []);

  async function upload(file: File) {
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError("Choose a PDF or DOCX file under 5 MB.");
      return;
    }
    xhr.current?.abort();
    aiAbort.current?.abort();
    setUploading(true);
    setProgress(0);
    setError("");
    setResult(null);
    setReview(null);
    setTailored(null);
    setTailoredDraft("");
    setAppliedText("");
    setAiError("");
    setTailorError("");
    setAiLoading(false);
    setTailorLoading(false);
    const request = new XMLHttpRequest();
    xhr.current = request;
    request.open("POST", "/api/cv/analyze");
    request.timeout = 60_000;
    try {
      request.setRequestHeader("x-csrf-token", await getCsrfToken());
    } catch (error) {
      setUploading(false);
      setError(
        error instanceof Error ? error.message : "Please sign in again.",
      );
      return;
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    };
    const failed = () => {
      if (xhr.current === request) {
        setError(
          "The upload couldn't finish. Check your connection and try again.",
        );
        setUploading(false);
      }
    };
    request.onerror = failed;
    request.ontimeout = failed;
    request.onabort = () => {
      if (xhr.current === request) setUploading(false);
    };
    request.onload = () => {
      if (xhr.current !== request) return;
      try {
        const body = JSON.parse(request.responseText);
        if (request.status < 200 || request.status >= 300)
          throw new Error(
            body.error?.message ?? "This document could not be read.",
          );
        setResult(body);
        try {
          sessionStorage.setItem(
            resumeProfileStorageKey,
            body.parsed?.text ?? "",
          );
        } catch {
          /* Private browsing storage limits should not block the analysis UI. */
        }
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "The response could not be read.",
        );
      } finally {
        setUploading(false);
      }
    };
    const form = new FormData();
    form.append("file", file);
    request.send(form);
  }
  async function requestAi() {
    if (!result) return;
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;
    setAiLoading(true);
    setAiError("");
    setReview(null);
    try {
      const response = await secureFetch("/api/cv/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvId: result.id, jobDescription: jd }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ??
            "AI suggestions temporarily unavailable — here's your instant score.",
        );
      if (!controller.signal.aborted) {
        setReview(body.review);
        setCached(body.cached);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setAiError(
          error instanceof Error
            ? error.message
            : "AI suggestions temporarily unavailable — here's your instant score.",
        );
    } finally {
      if (!controller.signal.aborted) setAiLoading(false);
    }
  }

  async function requestTailoredCv() {
    if (!result) return;
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;
    setTailorLoading(true);
    setTailorError("");
    setTailored(null);
    setTailoredDraft("");
    setEditingTailored(false);
    try {
      const response = await secureFetch("/api/cv/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvId: result.id,
          targetRole,
          companyName,
          jobDescription: jd,
        }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ??
            "CV tailoring is temporarily unavailable. Your original CV has not been changed.",
        );
      if (!controller.signal.aborted) {
        setTailored(body.tailored);
        setTailoredDraft(body.tailored.tailored_cv);
        setTailorCached(body.cached);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setTailorError(
          error instanceof Error
            ? error.message
            : "CV tailoring is temporarily unavailable. Your original CV has not been changed.",
        );
    } finally {
      if (!controller.signal.aborted) setTailorLoading(false);
    }
  }

  async function downloadCv(cvId: string) {
    try {
      const response = await secureFetch(`/api/cv/${cvId}/download-token`, {
        method: "POST",
      });
      const body = await response.json();
      if (response.ok && body.url) window.location.assign(body.url);
      else
        setError(body.error?.message ?? "The private download is unavailable.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The private download is unavailable.",
      );
    }
  }

  function exportTailoredCv() {
    const text = tailoredDraft.trim();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // Sanitize the name only: folding the extension in would turn it into "-txt".
    const name = `${targetRole.trim() || "tailored-cv"}-lazyhire`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    link.download = `${name || "tailored-cv"}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="motion-safe:animate-fade-in">
        <Link
          href="/"
          className="mb-7 inline-flex items-center gap-2 rounded-sm text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          Back to opportunities
        </Link>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              A second pair of eyes
            </p>
            <h1 className="text-3xl leading-tight sm:text-[40px]">
              Your experience. Clearly told.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Find the small changes that make your CV easier to read. Specific
              feedback, right where it belongs.
            </p>
          </div>
          <Badge variant="outline">Instant writing check</Badge>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm">Your CV</h2>
                <span className="text-[10px] text-muted-foreground">
                  PDF / DOCX
                </span>
              </div>
              <input
                ref={input}
                id="cv-file"
                aria-label="Upload CV"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                disabled={uploading || !hydrated}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (hydrated && !uploading && event.dataTransfer.files[0])
                    void upload(event.dataTransfer.files[0]);
                }}
                className={`rounded-lg border border-dashed p-6 text-center transition-colors ${dragging ? "border-primary bg-accent" : "border-input bg-background"}`}
              >
                <Upload className="mx-auto mb-3 size-6 text-primary" />
                <p className="text-sm font-semibold">
                  {result ? "Try an updated version" : "Drop your CV here"}
                </p>
                <p className="mb-4 mt-1.5 text-xs text-muted-foreground">
                  or choose a file · up to 5 MB
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => input.current?.click()}
                  disabled={uploading || !hydrated}
                >
                  {uploading
                    ? "Reading your CV…"
                    : result
                      ? "Replace CV"
                      : "Choose file"}
                </Button>
              </div>
              {uploading && (
                <div className="mt-4" role="status">
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {progress < 100 ? "Uploading" : "Extracting & checking"}
                    </span>
                    <button
                      type="button"
                      className="rounded-sm hover:text-foreground"
                      onClick={() => xhr.current?.abort()}
                    >
                      Cancel
                    </button>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="File upload progress"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 overflow-hidden rounded-sm bg-muted"
                  >
                    <div
                      className="h-full bg-primary transition-[width]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {result && (
                <p className="mt-4 flex items-start gap-2 break-all text-xs text-muted-foreground">
                  <Check className="size-3.5 shrink-0 text-primary" />
                  {result.filename}
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="mt-4 text-xs leading-5 text-destructive"
                >
                  {error}
                </p>
              )}
              <p className="mt-4 flex gap-2 text-[11px] leading-5 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-3 shrink-0" />
                The instant check runs on this server. Extracted text is stored
                in local SQLite. Your configured AI provider receives it only
                when you request a review.
              </p>
            </Card>
            {result && (
              <Card className="p-6">
                <div className="mb-5 flex justify-between">
                  <h2 className="text-sm">Writing score</h2>
                  <Badge variant="secondary">Rule-based</Badge>
                </div>
                <ScoreGauge key={result.id} score={result.analysis.score} />
                <p className="mb-6 mt-4 text-center text-xs text-muted-foreground">
                  A starting point for a stronger CV.
                </p>
                <div className="space-y-5">
                  {result.analysis.categories.map((category) => (
                    <div key={category.id}>
                      <div className="mb-2 flex justify-between gap-2 text-xs">
                        <span>{category.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {category.score}/{category.max}
                        </span>
                      </div>
                      <div
                        role="meter"
                        aria-label={category.label}
                        aria-valuenow={category.score}
                        aria-valuemin={0}
                        aria-valuemax={category.max}
                        className="h-1.5 overflow-hidden rounded-sm bg-muted"
                      >
                        <div
                          className="h-full bg-primary transition-[width] duration-700 motion-reduce:transition-none"
                          style={{
                            width: `${(category.score / category.max) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                        {category.detail}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-6 border-t pt-4 text-[11px] leading-5 text-muted-foreground">
                  A writing and extraction check, not an employer’s ATS score or
                  a hiring prediction.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => void downloadCv(result.id)}
                >
                  Download private text copy
                </Button>
              </Card>
            )}
          </aside>

          <div className="min-w-0 space-y-6">
            {!result && !uploading && (
              <Card className="p-7 sm:p-9">
                <div className="mb-8 flex size-12 items-center justify-center rounded-lg border bg-background">
                  <FileText className="size-6 text-muted-foreground" />
                </div>
                <h2 className="text-2xl">A clearer story starts here.</h2>
                <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
                  Upload your CV to see what’s working, what’s missing, and
                  which lines could be more specific. Your own words stay at the
                  center.
                </p>
                <div className="mt-8 space-y-5 border-t pt-6">
                  {[
                    [
                      "Structure & readability",
                      "Check essential sections, length, and extractable text.",
                    ],
                    [
                      "Language & evidence",
                      "Spot vague wording and places where a truthful measure could help.",
                    ],
                    [
                      "A deeper review, if you want it",
                      "Compare with a role using AI and review fact-preserving rewrite suggestions.",
                    ],
                  ].map(([title, body], i) => (
                    <div key={title} className="flex gap-4">
                      <span className="text-xs text-primary">0{i + 1}</span>
                      <div>
                        <h3 className="text-sm">{title}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {uploading && (
              <Card className="p-7" aria-label="Analyzing CV">
                <Skeleton className="mb-6 h-6 w-48" />
                {Array.from({ length: 9 }, (_, i) => (
                  <Skeleton
                    key={i}
                    className={`mb-4 h-3 ${i % 3 === 0 ? "w-2/3" : "w-full"}`}
                  />
                ))}
              </Card>
            )}
            <Card className="p-6 sm:p-7">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <h2 className="text-lg">A deeper look at the fit.</h2>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    An optional AI comparison with the role you have in mind.
                  </p>
                </div>
                <Badge>Optional AI</Badge>
              </div>
              {job && (
                <div className="mb-4 flex items-start justify-between gap-3 rounded-md border bg-background p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{job.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {job.company}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Clear selected job"
                    className="rounded-sm p-1 text-muted-foreground"
                    disabled={aiLoading}
                    onClick={() => {
                      setJob(null);
                      setTargetRole("");
                      setCompanyName("");
                      setJd("");
                      setReview(null);
                      setTailored(null);
                      setTailoredDraft("");
                      setTailorError("");
                      try {
                        sessionStorage.removeItem(selectedJobStorageKey);
                        sessionStorage.removeItem(legacyOrvioSelectedJobStorageKey);
                        sessionStorage.removeItem(legacySelectedJobStorageKey);
                      } catch {
                        /* Storage may be unavailable in hardened browsers. */
                      }
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="target-role"
                    className="mb-1.5 block text-xs font-semibold"
                  >
                    Target job role
                  </label>
                  <input
                    id="target-role"
                    value={targetRole}
                    disabled={aiLoading || tailorLoading}
                    onChange={(event) => {
                      setTargetRole(event.target.value);
                      setTailored(null);
                      setTailoredDraft("");
                      setTailorError("");
                    }}
                    placeholder="Frontend Engineer"
                    className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-subtle placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/15"
                  />
                </div>
                <div>
                  <label
                    htmlFor="company-name"
                    className="mb-1.5 block text-xs font-semibold"
                  >
                    Company name <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    id="company-name"
                    value={companyName}
                    disabled={aiLoading || tailorLoading}
                    onChange={(event) => {
                      setCompanyName(event.target.value);
                      setTailored(null);
                      setTailoredDraft("");
                      setTailorError("");
                    }}
                    placeholder="Company"
                    className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-subtle placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/15"
                  />
                </div>
              </div>
              <details open={!job} className="mb-4">
                <summary className="mb-3 flex cursor-pointer list-none items-center justify-between rounded-sm text-xs font-semibold">
                  {job
                    ? "Review or edit the job description"
                    : "Paste the job description"}
                  <ChevronDown className="size-3.5" />
                </summary>
                <label htmlFor="job-description" className="sr-only">
                  Job description for AI review
                </label>
                <textarea
                  id="job-description"
                  value={jd}
                  disabled={aiLoading || tailorLoading}
                  onChange={(event) => {
                    setJd(event.target.value);
                    setReview(null);
                    setTailored(null);
                    setTailoredDraft("");
                    setAiError("");
                    setTailorError("");
                  }}
                  minLength={80}
                  maxLength={20_000}
                  rows={6}
                  placeholder="Paste the role’s responsibilities and requirements here…"
                  className="w-full resize-y rounded-md border border-input bg-card p-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  80–20,000 characters · {jd.length.toLocaleString()} entered
                </p>
              </details>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => void requestTailoredCv()}
                  disabled={
                    !result ||
                    result.parsed.imageOnly ||
                    targetRole.trim().length < 2 ||
                    jd.trim().length < 80 ||
                    aiLoading ||
                    tailorLoading
                  }
                >
                  <Sparkles />
                  {tailorLoading
                    ? "Tailoring CV…"
                    : "Tailor CV to This Job"}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => void requestAi()}
                  disabled={
                    !result ||
                    result.parsed.imageOnly ||
                    jd.trim().length < 80 ||
                    tailorLoading ||
                    aiLoading
                  }
                >
                  <Sparkles />
                  {aiLoading ? "Reading the details…" : "Get AI Deep Review"}
                </Button>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                {!result ? "Upload your CV first. " : ""}This sends your CV
                text and job description to DeepSeek V4 Flash when configured,
                with Groq as fallback. Suggestions are estimates; verify
                accuracy before using them.
              </p>
              {aiLoading && (
                <div role="status" className="mt-6 space-y-3">
                  <span className="sr-only">Preparing AI review</span>
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}
              {aiError && (
                <div
                  role="alert"
                  className="mt-5 rounded-md border bg-background p-4 text-sm leading-6 text-muted-foreground"
                >
                  {aiError}
                  <p className="mt-1 text-xs">
                    Your instant writing score remains available. You can try
                    again in a minute.
                  </p>
                </div>
              )}
              {tailorError && (
                <div
                  role="alert"
                  className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6 text-foreground"
                >
                  {tailorError}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your original CV remains unchanged.
                  </p>
                </div>
              )}
              {tailorLoading && (
                <div role="status" className="mt-6 space-y-3">
                  <span className="sr-only">Tailoring CV to this job</span>
                  <Skeleton className="h-7 w-44" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-28 w-full" />
                </div>
              )}
              {tailored && (
                <div className="mt-7 border-t pt-6 motion-safe:animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-2xl font-semibold text-primary">
                        {tailored.match_score}
                        <span className="ml-0.5 text-xs">%</span>
                      </div>
                      <div>
                        <h3 className="text-base">Job Match Score</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tailorCached
                            ? "Previously tailored"
                            : "Fresh tailored draft"}{" "}
                          · explainable overlap, not a hiring prediction
                        </p>
                      </div>
                    </div>
                    {appliedText && (
                      <Badge variant="secondary">Tailored draft applied</Badge>
                    )}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {tailored.score_explanation}
                  </p>
                  {tailored.score_factors.length > 0 && (
                    <div className="mt-5 rounded-md border bg-background p-4">
                      <h4 className="mb-3 text-sm">
                        What the score is based on
                      </h4>
                      <ul className="space-y-3">
                        {tailored.score_factors.map((factor) => (
                          <li
                            key={factor.factor}
                            className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3"
                          >
                            <span
                              className={`inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                                factor.evidence === "strong"
                                  ? "border-primary/25 bg-primary/10 text-primary"
                                  : factor.evidence === "partial"
                                    ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
                                    : "border-border bg-secondary text-muted-foreground"
                              }`}
                            >
                              {factor.evidence}
                            </span>
                            <span className="min-w-0 text-sm leading-6">
                              <span className="font-semibold">
                                {factor.factor}
                              </span>
                              <span className="text-muted-foreground">
                                {" — "}
                                {factor.detail}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-5 grid gap-5 md:grid-cols-3">
                    <div className="rounded-md border bg-background p-4">
                      <h4 className="mb-3 text-sm">Strong Matches</h4>
                      <div className="flex flex-wrap gap-2">
                        {tailored.strong_matches.length ? (
                          tailored.strong_matches.map((item) => (
                            <Badge key={item} variant="outline">
                              {item}
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm leading-6 text-muted-foreground">
                            No strong overlaps were documented.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-md border bg-background p-4">
                      <h4 className="mb-3 text-sm">Missing / Weak Areas</h4>
                      {tailored.missing_keywords.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {tailored.missing_keywords.map((item) => (
                            <Badge key={item} variant="secondary">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <ul className="space-y-2">
                        {tailored.weak_areas.length ? (
                          tailored.weak_areas.map((item) => (
                            <li
                              key={item}
                              className="text-sm leading-6 text-muted-foreground"
                            >
                              {item}
                            </li>
                          ))
                        ) : (
                          <li className="text-sm leading-6 text-muted-foreground">
                            No major missing areas were identified.
                          </li>
                        )}
                      </ul>
                    </div>
                    <div className="rounded-md border bg-background p-4">
                      <h4 className="mb-3 text-sm">Recommended CV Improvements</h4>
                      <ul className="space-y-2">
                        {tailored.recommendations.map((item) => (
                          <li
                            key={item}
                            className="text-sm leading-6 text-muted-foreground"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => setEditingTailored((value) => !value)}
                    >
                      <Edit3 />
                      {editingTailored ? "Preview" : "Edit"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => void requestTailoredCv()}
                      disabled={tailorLoading}
                    >
                      <RotateCcw />
                      Regenerate
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setAppliedText(tailoredDraft);
                        setEditingTailored(false);
                      }}
                      disabled={!tailoredDraft.trim()}
                    >
                      <Check />
                      Apply Changes
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => setAppliedText("")}
                      disabled={!appliedText}
                    >
                      <ArrowLeft />
                      Undo
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={exportTailoredCv}
                      disabled={!tailoredDraft.trim()}
                    >
                      <Download />
                      Download / Export CV
                    </Button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Applying changes updates this review workspace only. The
                    original uploaded CV remains recoverable and is never
                    overwritten automatically.
                  </p>
                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <section className="min-w-0 rounded-md border bg-background">
                      <div className="border-b px-4 py-3">
                        <h4 className="text-sm">Original CV</h4>
                      </div>
                      <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words p-4 font-sans text-sm leading-7 text-foreground">
                        {result?.parsed.text}
                      </pre>
                    </section>
                    <section className="min-w-0 rounded-md border border-primary/25 bg-background">
                      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                        <h4 className="text-sm">Tailored CV</h4>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                          Draft
                        </span>
                      </div>
                      {editingTailored ? (
                        <textarea
                          aria-label="Edit tailored CV"
                          value={tailoredDraft}
                          onChange={(event) =>
                            setTailoredDraft(event.target.value)
                          }
                          className="min-h-[520px] w-full resize-y rounded-b-md border-0 bg-background p-4 font-sans text-sm leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                        />
                      ) : (
                        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words p-4 font-sans text-sm leading-7 text-foreground">
                          {tailoredDraft}
                        </pre>
                      )}
                    </section>
                  </div>
                  {tailored.changes.length > 0 && (
                    <div className="mt-6 rounded-md border bg-background p-4">
                      <h4 className="mb-4 text-sm">Meaningful Changes</h4>
                      <div className="space-y-4">
                        {tailored.changes.map((change, index) => (
                          <div key={`${change.section}-${index}`}>
                            <p className="mb-1 text-xs font-semibold text-primary">
                              {change.section}
                            </p>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {change.reason}
                            </p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <p className="rounded-sm border border-border bg-card p-3 text-xs leading-5 text-muted-foreground">
                                {change.original}
                              </p>
                              <p className="rounded-sm border border-primary/25 bg-primary/10 p-3 text-xs leading-5 text-foreground">
                                {change.tailored}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tailored.safety_notes.length > 0 && (
                    <div className="mt-5 rounded-md border border-primary/20 bg-accent/40 p-4">
                      <h4 className="mb-2 text-sm text-primary">
                        Accuracy Notes
                      </h4>
                      <ul className="space-y-2">
                        {tailored.safety_notes.map((note) => (
                          <li
                            key={note}
                            className="text-sm leading-6 text-muted-foreground"
                          >
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {review && (
                <div className="mt-7 border-t pt-6 motion-safe:animate-fade-in">
                  <div className="flex items-center gap-4">
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-accent text-2xl font-semibold text-primary">
                      {review.fit_score}
                      <span className="ml-0.5 text-xs">%</span>
                    </div>
                    <div>
                      <h3 className="text-base">Documented role fit</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        AI estimate ·{" "}
                        {cached ? "Previously reviewed" : "Just reviewed"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {review.verdict}
                  </p>
                  <div className="mt-6 grid gap-6 sm:grid-cols-2">
                    <div>
                      <h4 className="mb-3 flex items-center gap-2 text-sm">
                        <CheckCheck className="size-4 text-primary" />
                        What comes through
                      </h4>
                      <ul className="space-y-3">
                        {review.strengths.map((item, i) => (
                          <li
                            key={i}
                            className="text-sm leading-6 text-muted-foreground"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="mb-3 flex items-center gap-2 text-sm">
                        <ArrowRight className="size-4 text-primary" />
                        What could be clearer
                      </h4>
                      <ul className="space-y-3">
                        {review.gaps.map((item, i) => (
                          <li
                            key={i}
                            className="text-sm leading-6 text-muted-foreground"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {review.rewrites.length > 0 && (
                    <p className="mt-6 border-t pt-4 text-xs text-primary">
                      Rewrite suggestions now appear directly beneath the
                      original lines in your CV above.
                    </p>
                  )}
                </div>
              )}
            </Card>
            {result && (
              <>
                <Card className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
                    <div>
                      <h2 className="text-base">
                        Your CV, with a little perspective.
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {result.analysis.wordCount} words ·{" "}
                        {result.analysis.issues.length} suggestions
                      </p>
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-sm bg-primary/30" />
                        Wording
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-sm bg-sky-400/45" />
                        Evidence
                      </span>
                    </div>
                  </div>
                  <div className="p-5 sm:p-7">
                    <HighlightedCv
                      result={result}
                      review={review}
                      textOverride={appliedText || undefined}
                    />
                  </div>
                </Card>
                {result.parsed.warnings.length > 0 && (
                  <div className="rounded-lg border px-5 py-4 text-xs leading-6 text-muted-foreground">
                    {result.parsed.warnings.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function HighlightedCv({
  result,
  review,
  textOverride,
}: {
  result: CvResult;
  review: AiReview | null;
  textOverride?: string;
}) {
  const [active, setActive] = useState<CvIssue | null>(null);
  const text = textOverride ?? result.parsed.text;
  const showingTailoredDraft = Boolean(textOverride);
  if (!text)
    return (
      <p className="py-8 text-sm leading-7 text-muted-foreground">
        No selectable text was found. Upload a text-based PDF or DOCX to see
        inline feedback.
      </p>
    );
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter(
    (match) => match[0].length,
  );
  return (
    <div className="space-y-0 font-sans text-sm leading-7 text-foreground">
      {showingTailoredDraft && (
        <div className="mb-5 rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-xs leading-5 text-foreground">
          Tailored draft preview is applied in this workspace. Use Undo to
          return to the original parsed CV.
        </div>
      )}
      {lines.map((match, i) => {
        const line = match[0].replace(/\n$/, "");
        const start = match.index;
        const end = start + line.length;
        const issues = showingTailoredDraft
          ? []
          : result.analysis.issues.filter(
              (issue) => issue.start < end && issue.end > start,
            );
        const cuts = [
          ...new Set([
            start,
            end,
            ...issues.flatMap((issue) => [
              Math.max(start, issue.start),
              Math.min(end, issue.end),
            ]),
          ]),
        ].sort((a, b) => a - b);
        const bullet = result.analysis.bullets.find(
          (bullet) => bullet.start === start,
        );
        const rewrites = review?.rewrites.find(
          (item) => item.bullet_id === bullet?.id,
        );
        return (
          <div key={`${result.id}-${i}`} className="min-h-5 break-words">
            <p className="whitespace-pre-wrap">
              {cuts.slice(0, -1).map((cut, n) => {
                const until = cuts[n + 1];
                const issue = issues
                  .filter((issue) => issue.start <= cut && issue.end >= until)
                  .sort(
                    (a, b) =>
                      (a.kind === "weak-verb" ? -1 : 1) -
                      (b.kind === "weak-verb" ? -1 : 1),
                  )[0];
                const slice = text.slice(cut, until);
                return issue ? (
                  <button
                    type="button"
                    key={cut}
                    title={issue.message}
                    aria-label={`${slice.trim()}. ${issue.message}`}
                    onClick={() =>
                      setActive(active?.id === issue.id ? null : issue)
                    }
                    className={`inline rounded-sm border text-left font-normal decoration-1 underline-offset-4 transition-colors selection:bg-primary selection:text-primary-foreground ${issue.kind === "weak-verb" ? "border-primary/20 bg-primary/10 text-foreground underline decoration-primary/70 hover:bg-primary/20" : "border-sky-400/25 bg-sky-400/15 text-foreground hover:bg-sky-400/20"}`}
                  >
                    {slice}
                  </button>
                ) : (
                  <span key={cut}>{slice}</span>
                );
              })}
            </p>
            {active && issues.some((issue) => issue.id === active.id) && (
              <div className="my-2 flex items-start justify-between gap-3 rounded-md border bg-card px-3 py-2 text-xs leading-5 text-foreground">
                <span>{active.message}</span>
                <button
                  type="button"
                  aria-label="Close suggestion"
                  className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setActive(null)}
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
            {rewrites && (
              <div className="my-3 rounded-md border border-primary/15 bg-accent/50 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                  <Sparkles className="size-3" />
                  Possible rewrites · verify before using
                </p>
                {rewrites.versions.map((version, index) => (
                  <p
                    key={index}
                    className="mt-2 text-sm leading-6 text-foreground"
                  >
                    {version}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

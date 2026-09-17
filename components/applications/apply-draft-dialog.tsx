"use client";

import { Check, Copy, ExternalLink, Mail, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NormalizedJob } from "@/lib/jobs/types";

export interface ApplyDraft {
  id: string;
  subject: string;
  body: string;
  recipientEmail: string;
  providerLabel: string;
  cached: boolean;
  matchedEvidence: string[];
  cautions: string[];
  checklist: string[];
}

export function ApplyDraftDialog({
  job,
  draft,
  error,
  loading,
  resumeRequired,
  copied,
  marking,
  onClose,
  onCopy,
  onOpen,
  onUploadResume,
  onMarkApplied,
}: {
  job: NormalizedJob | null;
  draft: ApplyDraft | null;
  error: string;
  loading: boolean;
  resumeRequired: boolean;
  copied: boolean;
  marking: boolean;
  onClose: () => void;
  onCopy: () => void;
  onOpen: () => void;
  onUploadResume: () => void;
  onMarkApplied: () => void;
}) {
  if (!job) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-draft-title"
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
    >
      <section className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-elevated">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-card px-5 py-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              ONE-CLICK APPLY DRAFT
            </p>
            <h2 id="apply-draft-title" className="text-lg leading-6">
              {job.title}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {job.company}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close draft"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          {loading && (
            <div role="status" className="space-y-3 text-sm text-muted-foreground">
              <div className="h-4 w-44 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-full animate-pulse rounded bg-secondary" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-secondary" />
              <div className="h-32 w-full animate-pulse rounded bg-secondary" />
            </div>
          )}

          {!loading && resumeRequired && (
            <div className="rounded-lg border bg-background p-5">
              <h3 className="text-base">Resume needed first</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                LazyHire needs a readable PDF or DOCX resume before it can draft
                a job-specific message.
              </p>
              <Button className="mt-4" onClick={onUploadResume}>
                <Upload />
                Upload Resume
              </Button>
            </div>
          )}

          {!loading && error && !resumeRequired && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6"
            >
              {error}
            </div>
          )}

          {!loading && draft && (
            <div className="space-y-5">
              <div className="grid gap-3 text-sm">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold">
                    To
                  </span>
                  <input
                    readOnly
                    value={draft.recipientEmail || "Use the application page"}
                    className="h-10 w-full rounded-md border bg-background px-3 text-muted-foreground"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold">
                    Subject
                  </span>
                  <input
                    readOnly
                    value={draft.subject}
                    className="h-10 w-full rounded-md border bg-background px-3"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold">
                    Message
                  </span>
                  <textarea
                    readOnly
                    value={draft.body}
                    rows={11}
                    className="w-full resize-y rounded-md border bg-background p-3 text-sm leading-6"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={onCopy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy Message"}
                </Button>
                <Button variant="secondary" onClick={onOpen}>
                  {draft.recipientEmail ? <Mail /> : <ExternalLink />}
                  {draft.recipientEmail ? "Open Email" : "Open Apply Page"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={onMarkApplied}
                  disabled={marking}
                >
                  <Check />
                  {marking ? "Updating..." : "Mark Applied"}
                </Button>
              </div>

              <div className="grid gap-3 rounded-md border bg-background p-4 text-xs leading-5 text-muted-foreground sm:grid-cols-3">
                <div>
                  <p className="mb-2 font-semibold text-foreground">
                    Evidence
                  </p>
                  <ul className="space-y-1">
                    {draft.matchedEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 font-semibold text-foreground">
                    Cautions
                  </p>
                  <ul className="space-y-1">
                    {draft.cautions.length ? (
                      draft.cautions.map((item) => <li key={item}>{item}</li>)
                    ) : (
                      <li>No obvious missing claims were added.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 font-semibold text-foreground">
                    Before Sending
                  </p>
                  <ul className="space-y-1">
                    {draft.checklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-[11px] leading-5 text-muted-foreground">
                {draft.cached ? "Reused previous draft" : "Fresh draft"} ·{" "}
                {draft.providerLabel}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

"use client";

import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, X } from "lucide-react";
import type { NormalizedJob } from "@/lib/jobs/types";
import { ApplicationActions, postedLabel } from "./job-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

export function JobDetail({
  job,
  onClose,
  onDraft,
}: {
  job: NormalizedJob | null;
  onClose: () => void;
  onDraft?: (job: NormalizedJob) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const dialog = ref.current;
    if (job) dialog?.showModal();
    else dialog?.close();
    const previous = document.body.style.overflow;
    if (job) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [job]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="job-detail-title"
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border bg-background p-0 text-foreground backdrop:bg-foreground/25"
    >
      {job && (
        <>
          <div className="sticky top-0 z-10 flex justify-between border-b bg-background px-6 py-4">
            <span className="text-xs font-semibold text-muted-foreground">
              THE OPPORTUNITY
            </span>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close job details"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="p-6 sm:p-8">
            <p className="mb-2 text-sm text-muted-foreground">{job.company}</p>
            <h2 id="job-detail-title" className="text-2xl leading-8">
              {job.title}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {job.location} · {postedLabel(job)}
            </p>
            {job.locationBasis === "company" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Location taken from the company profile; confirm the work
                location with the employer.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              {job.sources.map((source, i) => (
                <Badge key={i} variant="outline">
                  {source.label}
                </Badge>
              ))}
              {job.jobType && (
                <Badge variant="secondary" className="capitalize">
                  {job.jobType}
                </Badge>
              )}
            </div>
            <div className="my-6">
              <ApplicationActions job={job} onDraft={onDraft} />
            </div>
            {(job.experience || job.salary || job.skills.length > 0) && (
              <dl className="mb-6 grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
                {job.experience && (
                  <div>
                    <dt className="text-xs font-semibold text-foreground">
                      Experience
                    </dt>
                    <dd className="mt-1 text-muted-foreground">
                      {job.experience}
                    </dd>
                  </div>
                )}
                {job.salary && (
                  <div>
                    <dt className="text-xs font-semibold text-foreground">
                      Salary
                    </dt>
                    <dd className="mt-1 text-muted-foreground">{job.salary}</dd>
                  </div>
                )}
                {job.skills.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-foreground">
                      Skills
                    </dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {job.skills.map((skill) => (
                        <Badge key={skill} variant="outline">
                          {skill}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <div className="rounded-lg border bg-accent/50 p-5">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <FileText className="size-4 text-primary" />
                See how your CV reads for this role
              </div>
              <p className="mb-4 text-sm leading-6 text-muted-foreground">
                Get an instant writing check, then choose an optional AI
                comparison with this job description.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      "lazyhire:selected-job",
                      JSON.stringify(job),
                    );
                    sessionStorage.removeItem("orvio:selected-job");
                  } catch {
                    /* Storage limits must not block CV review navigation. */
                  }
                  router.push("/cv");
                }}
              >
                Review my CV
                <ArrowRight />
              </Button>
            </div>
            <h3 className="mb-4 mt-8 text-base">About the role</h3>
            <div className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
              {job.description ||
                "A description was not supplied. Open the original listing for the full details."}
            </div>
            {job.closingDate && (
              <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">
                Apply by{" "}
                {new Date(job.closingDate).toLocaleDateString("en-IN", {
                  dateStyle: "long",
                  timeZone: "Asia/Kolkata",
                })}
                .
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {job.applicationLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={confirmExternal}
                  className="rounded-sm text-xs text-primary underline underline-offset-4"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}

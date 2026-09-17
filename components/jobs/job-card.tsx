"use client";

import type { MouseEvent } from "react";
import { ArrowUpRight, Building2, Clock3, ExternalLink, Globe, Mail, MapPin, Send } from "lucide-react";
import type { NormalizedJob } from "@/lib/jobs/types";
import { companyWebsite } from "@/lib/jobs/validate";
import { postedLabel } from "@/lib/jobs/posted";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export { postedLabel };

/**
 * Badge text for where a job came from. Direct sources keep their own names;
 * web discovery says whether the destination is the employer's site or a board.
 */
export function sourceBadges(job: NormalizedJob) {
  return [...new Map(job.sources.map((source) => [`${source.source}:${source.label}`, source])).values()].map(
    (source) => ({
      key: `${source.source}:${source.label}`,
      label: source.source === "web" ? (source.label === "Company Website" ? "Company Website" : source.label.replace(/^Web(?: · )?/, "Web · ").replace(/ · $/, "")) : source.label,
      url: source.url,
      kind: source.source === "web" ? (source.label === "Company Website" ? "employer" : "web") : "direct",
    }),
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

export function ApplicationActions({
  job,
  compact = false,
  onDraft,
}: {
  job: NormalizedJob;
  compact?: boolean;
  onDraft?: (job: NormalizedJob) => void;
}) {
  const canDraft = Boolean(onDraft && (job.applicationEmail || job.applyUrl));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canDraft && (
        <Button size="sm" onClick={() => onDraft?.(job)}>
          <Send />
          {compact ? "Draft" : "Draft Apply"}
        </Button>
      )}
      {job.applicationEmail && (
        <Button asChild variant="secondary" size="sm">
          <a
            href={`mailto:${job.applicationEmail}`}
            title={job.applicationEmail}
          >
            <Mail />
            <span className="max-w-[190px] truncate">
              {compact ? "Email" : job.applicationEmail}
            </span>
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
            <ExternalLink />
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
      ) : (
        // Only a validated application path earns an Apply button. An employer
        // homepage is labelled for what it is.
        companyWebsite(job) && (
          <Button asChild variant="secondary" size="sm">
            <a
              href={companyWebsite(job)!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={confirmExternal}
            >
              <Globe />
              Company Website
            </a>
          </Button>
        )
      )}
      {!job.applyUrl && !job.applicationEmail && !job.sourceUrl && !companyWebsite(job) && (
        <span className="text-xs text-muted-foreground">
          Application details not supplied
        </span>
      )}
    </div>
  );
}

export function JobCard({
  job,
  onOpen,
}: {
  job: NormalizedJob;
  onOpen: () => void;
}) {
  return (
    <article className="group rounded-lg border bg-card p-5 shadow-subtle transition-colors hover:border-input sm:p-6">
      <div className="flex items-start gap-3.5">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-sm font-semibold text-muted-foreground"
        >
          {job.company[0]?.toUpperCase() || <Building2 className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted-foreground">{job.company}</p>
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
        <button
          type="button"
          aria-label={`View ${job.title}`}
          onClick={onOpen}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
        >
          <ArrowUpRight className="size-4" />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          {job.location}
          {job.locationBasis === "company" && " · company location"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5" />
          {postedLabel(job)}
        </span>
        {job.jobType && (
          <Badge variant="outline" className="capitalize">
            {job.jobType}
          </Badge>
        )}
      </div>
      {job.snippet && (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {job.snippet}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-muted-foreground">Source</span>
          {sourceBadges(job).map((source) =>
            source.url ? (
              <a
                key={source.key}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={confirmExternal}
                className="rounded-md"
              >
                <Badge
                  variant="secondary"
                  className="transition-colors hover:border-primary/30 hover:text-primary"
                >
                  {source.label}
                </Badge>
              </a>
            ) : (
              <Badge key={source.key} variant="secondary">
                {source.label}
              </Badge>
            ),
          )}
        </div>
        <ApplicationActions job={job} compact />
      </div>
      {job.applicationEmail && (
        <a
          href={`mailto:${job.applicationEmail}`}
          className="mt-3 inline-block max-w-full break-all rounded-sm text-xs text-muted-foreground hover:text-primary"
        >
          {job.applicationEmail}
        </a>
      )}
    </article>
  );
}

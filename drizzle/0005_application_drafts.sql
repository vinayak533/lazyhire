CREATE TABLE application_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  cv_upload_id TEXT NOT NULL,
  job_snapshot TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_label TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX application_drafts_user_job_idx ON application_drafts(user_id, job_id);
--> statement-breakpoint
CREATE INDEX application_drafts_application_idx ON application_drafts(application_id);

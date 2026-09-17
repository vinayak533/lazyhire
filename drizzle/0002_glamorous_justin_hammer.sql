CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	`job_snapshot` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`applied_at` integer
);
--> statement-breakpoint
CREATE INDEX `applications_job_id_idx` ON `applications` (`job_id`);--> statement-breakpoint
CREATE INDEX `applications_status_idx` ON `applications` (`status`);--> statement-breakpoint
CREATE TABLE `career_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`brief_json` text NOT NULL,
	`updated_at` integer NOT NULL
);

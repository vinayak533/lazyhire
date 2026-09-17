CREATE TABLE `ai_analysis_cache` (
	`content_hash` text PRIMARY KEY NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cv_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`text` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL
);

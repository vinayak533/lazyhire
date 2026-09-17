CREATE TABLE `jobs_cache` (
	`query_hash` text PRIMARY KEY NOT NULL,
	`location` text NOT NULL,
	`results_json` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_cache_fetched_at_idx` ON `jobs_cache` (`fetched_at`);
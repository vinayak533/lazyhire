CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`email_ciphertext` text NOT NULL,
	`password_hash` text NOT NULL,
	`email_verified_at` integer,
	`mfa_enabled` integer DEFAULT 0 NOT NULL,
	`mfa_secret_ciphertext` text,
	`privacy_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_hash_unique` ON `users` (`email_hash`);--> statement-breakpoint
CREATE INDEX `users_email_hash_idx` ON `users` (`email_hash`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`csrf_token_hash` text NOT NULL,
	`csrf_token_ciphertext` text NOT NULL,
	`user_agent_hash` text,
	`ip_hash` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`idle_expires_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `email_verification_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE INDEX `email_verification_user_idx` ON `email_verification_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`metadata_json` text NOT NULL,
	`ip_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_user_id_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE TABLE `download_grants` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cv_upload_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE INDEX `download_grants_user_cv_idx` ON `download_grants` (`user_id`,`cv_upload_id`);--> statement-breakpoint
ALTER TABLE `cv_uploads` ADD `user_id` text DEFAULT '__legacy_unowned__' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_uploads` ADD `file_sha256` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_uploads` ADD `mime_type` text DEFAULT 'application/octet-stream' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_uploads` ADD `scan_status` text DEFAULT 'legacy-unverified' NOT NULL;--> statement-breakpoint
CREATE INDEX `cv_uploads_user_id_idx` ON `cv_uploads` (`user_id`);--> statement-breakpoint
ALTER TABLE `ai_analysis_cache` ADD `user_id` text DEFAULT '__legacy_unowned__' NOT NULL;--> statement-breakpoint
CREATE INDEX `ai_analysis_cache_user_id_idx` ON `ai_analysis_cache` (`user_id`);--> statement-breakpoint
ALTER TABLE `career_briefs` ADD `user_id` text DEFAULT '__legacy_unowned__' NOT NULL;--> statement-breakpoint
CREATE INDEX `career_briefs_user_id_idx` ON `career_briefs` (`user_id`);--> statement-breakpoint
ALTER TABLE `applications` ADD `user_id` text DEFAULT '__legacy_unowned__' NOT NULL;--> statement-breakpoint
CREATE INDEX `applications_user_job_idx` ON `applications` (`user_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `applications_user_status_idx` ON `applications` (`user_id`,`status`);

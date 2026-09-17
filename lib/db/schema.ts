import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { real } from "drizzle-orm/sqlite-core";

export const careerTutorEntries = sqliteTable("career_tutor_entries", {
  id: text("id").primaryKey(), documentJson: text("document_json").notNull(),
  contentHash: text("content_hash").notNull(), embeddingJson: text("embedding_json"),
  embeddingModel: text("embedding_model"), status: text("status").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const careerTutorPreferences = sqliteTable("career_tutor_preferences", {
  userId: text("user_id").primaryKey(), useProfile: integer("use_profile").notNull().default(0),
  allowAi: integer("allow_ai").notNull().default(0), policyVersion: integer("policy_version").notNull().default(1), updatedAt: integer("updated_at").notNull(),
});
export const careerTutorConversations = sqliteTable("career_tutor_conversations", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), sessionKey: text("session_key").notNull(),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(), busyUntil: integer("busy_until").notNull().default(0),
}, table => [index("career_tutor_conversations_owner").on(table.userId, table.sessionKey)]);
export const careerTutorTurns = sqliteTable("career_tutor_turns", {
  id: text("id").primaryKey(), conversationId: text("conversation_id").notNull().references(() => careerTutorConversations.id, {onDelete: "cascade"}),
  userId: text("user_id").notNull(), questionCiphertext: text("question_ciphertext").notNull(), answerCiphertext: text("answer_ciphertext").notNull(),
  origin: text("origin").notNull(), entryIds: text("entry_ids").notNull(), confidence: real("confidence").notNull(), sourceIds: text("source_ids").notNull(),
  latencyMs: integer("latency_ms").notNull(), feedback: text("feedback", {enum: ["helpful", "not_helpful"]}), createdAt: integer("created_at").notNull(),
}, table => [index("career_tutor_turns_owner").on(table.userId, table.conversationId, table.createdAt)]);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash").notNull().unique(),
    emailCiphertext: text("email_ciphertext").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
    mfaEnabled: integer("mfa_enabled").notNull().default(0),
    mfaSecretCiphertext: text("mfa_secret_ciphertext"),
    privacyJson: text("privacy_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("users_email_hash_idx").on(table.emailHash)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    csrfTokenHash: text("csrf_token_hash").notNull(),
    csrfTokenCiphertext: text("csrf_token_ciphertext").notNull(),
    userAgentHash: text("user_agent_hash"),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    idleExpiresAt: integer("idle_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const emailVerificationTokens = sqliteTable(
  "email_verification_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("email_verification_user_idx").on(table.userId)],
);

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("password_reset_user_idx").on(table.userId)],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at", { mode: "timestamp_ms" }).notNull(),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    action: text("action").notNull(),
    metadataJson: text("metadata_json").notNull(),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("audit_logs_user_id_idx").on(table.userId),
    index("audit_logs_action_idx").on(table.action),
  ],
);

export const downloadGrants = sqliteTable(
  "download_grants",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    cvUploadId: text("cv_upload_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("download_grants_user_cv_idx").on(table.userId, table.cvUploadId),
  ],
);

export const jobsCache = sqliteTable(
  "jobs_cache",
  {
    queryHash: text("query_hash").primaryKey(),
    location: text("location").notNull(),
    resultsJson: text("results_json").notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("jobs_cache_fetched_at_idx").on(table.fetchedAt)],
);

export const cvUploads = sqliteTable("cv_uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  filename: text("filename").notNull(),
  textCiphertext: text("text").notNull(),
  resultJson: text("result_json").notNull(),
  fileSha256: text("file_sha256").notNull(),
  mimeType: text("mime_type").notNull(),
  scanStatus: text("scan_status").notNull().default("passed"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const aiAnalysisCache = sqliteTable("ai_analysis_cache", {
  contentHash: text("content_hash").primaryKey(),
  userId: text("user_id").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const careerBriefs = sqliteTable("career_briefs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  briefJson: text("brief_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    jobId: text("job_id").notNull(),
    status: text("status").notNull(),
    jobSnapshot: text("job_snapshot").notNull(),
    notes: text("notes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("applications_user_job_idx").on(table.userId, table.jobId),
    index("applications_user_status_idx").on(table.userId, table.status),
  ],
);

export const applicationDrafts = sqliteTable(
  "application_drafts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    applicationId: text("application_id").notNull(),
    jobId: text("job_id").notNull(),
    cvUploadId: text("cv_upload_id").notNull(),
    jobSnapshot: text("job_snapshot").notNull(),
    recipientEmailCiphertext: text("recipient_email").notNull(),
    subjectCiphertext: text("subject").notNull(),
    bodyCiphertext: text("body").notNull(),
    status: text("status").notNull(),
    providerLabel: text("provider_label").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("application_drafts_user_job_idx").on(table.userId, table.jobId),
    index("application_drafts_application_idx").on(table.applicationId),
  ],
);

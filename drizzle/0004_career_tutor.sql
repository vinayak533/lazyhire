CREATE TABLE career_tutor_entries (
  id TEXT PRIMARY KEY NOT NULL,
  document_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding_json TEXT,
  embedding_model TEXT,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE VIRTUAL TABLE career_tutor_fts USING fts5(id UNINDEXED, question, alternates, keywords, answer);
--> statement-breakpoint
CREATE TABLE career_tutor_preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  use_profile INTEGER NOT NULL DEFAULT 0,
  allow_ai INTEGER NOT NULL DEFAULT 0,
  policy_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE career_tutor_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  busy_until INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX career_tutor_conversations_owner ON career_tutor_conversations(user_id, session_key);
--> statement-breakpoint
CREATE TABLE career_tutor_turns (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES career_tutor_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  question_ciphertext TEXT NOT NULL,
  answer_ciphertext TEXT NOT NULL,
  origin TEXT NOT NULL,
  entry_ids TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_ids TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  feedback TEXT CHECK (feedback IN ('helpful', 'not_helpful')),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX career_tutor_turns_owner ON career_tutor_turns(user_id, conversation_id, created_at);

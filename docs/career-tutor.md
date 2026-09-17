# Career tutor implementation

The Career OS page (`/career-os`) now includes a session-scoped AI career tutor. Run `npm run db:migrate`, `npm run kb:import`, and `npm run kb:embed` before enabling it on a new installation. The initial local installation has been migrated and indexed.

## What is implemented

- Responsive robot launcher, native accessible dialog, reduced-motion behavior, suggestions, encrypted session history, safe formatted answers, source cards, and per-answer feedback.
- Authenticated, CSRF-protected route handlers. Conversation ownership includes user ID and session token hash. No client-supplied user ID is trusted. Private responses use no-store headers.
- SQLite/Drizzle tables and FTS5 indexes. A locally cached MiniLM sentence encoder supplies semantic vectors; keyword and semantic rankings are fused with conservative relevance gates. Exact reviewed aliases work if the local model is missing. Query embeddings are local; they are not generative-model calls.
- Two explicit preferences, both initially off: use profile context, and allow external AI fallback. The fallback receives selected career fields and a bounded conversation; no full CV or contact details are added by the server. Content a person types into their question can still contain personal information, so the UI discloses that the chat is sent to the configured provider when AI is enabled.
- Structured fallback through the existing provider adapter, overall request timeout, per-user and global quotas, and a tutor circuit breaker. Facts must be exact excerpts from retrieved pages, with known source IDs; unsafe URLs, unsupported numerical claims, and unverifiable excerpts are rejected. Recommendations remain AI advice, not a guarantee or independent verification of truth.
- Live page retrieval from an allowlist of official resource domains. Search discovery uses a public KB topic, never a private user query. Search snippets are not evidence. Changing salary, exam, eligibility, and immigration questions currently receive explicit uncertainty and available official resources instead of speculative figures.
- A verified video identifier linked from the BLS Data Scientists page. YouTube oEmbed supplies actual title, channel, and thumbnail metadata. A bounded same-origin thumbnail route avoids third-party browser image requests; missing metadata omits the card. Web resources use a neutral website icon when a verified brand asset is unavailable.
- Encrypted question/answer logging, origin, retrieved entry IDs, confidence, source IDs, latency, feedback, an aggregated review queue, and account export/deletion integration.

## Resources and videos (2026-09-12)

Answers now carry structured resources: `sources` (flat, citation order, kept for older clients) plus `youtube_resources`, `official_resources` and `learning_resources`, split by resource kind (`official`, `career`, `learning`, `course`, `github`, `article`, `web`, `youtube`). Each resource has a title, provider, URL, description and kind. The catalogue in `knowledge/career/schema.ts` was expanded to 184 resources (83 official documentation and body pages, 32 repositories, 26 learning sites, 21 courses, 13 articles, 9 careers portals), professional bodies, courses, repositories and articles; every URL was fetched with HTTP 200 during authoring and unverifiable hosts (bot-protected or 404) were excluded.

`knowledge/career/videos.ts` is a registry of 94 YouTube videos, each verified through the oEmbed endpoint on the registry date (stored title and channel are what YouTube returned). Entries name their videos explicitly; when an entry names none, `videosForSubject` matches the answer's subject against the registry's topic tags with specificity-weighted scoring, so an accounting question never receives a data-science video and an off-topic question receives none. The runtime re-verifies each video through oEmbed before rendering, drops any YouTube no longer serves, and falls back to the registry copy only on a transport failure. Thumbnails are proxied through the bounded same-origin route.

Comparison questions ("Python or Java for backend?") may be answered by an entry authored with `intent: "comparison"` when the semantic gate is strong; other comparisons go to the AI mentor. A question that names a role never receives the saved profile role as a lens (`namedRole` suppresses the "Applying this to your goal" note), so the "Data Scientist roadmap, then Accountant" sequence stays on accounting.

## Corpus status and limits

The corpus contains **304 individually authored entries** (191 original plus 113 added on 2026-09-12 in `tech-roles.ts`, `data-ai.ts`, `ops-security-qa.ts`, `business-roles.ts`, `comparisons.ts` and `preparation.ts`), not 4,000. Alternate wording does not increase that count. It grew from an initial 63 by adding role roadmaps, skill practice, education routes, job-search process, interview formats, and workplace topics, organised as separate authoring files under `knowledge/career/` and combined in `seed.ts`. These are AI-authored mentor recommendations with editorial review notes and scoped official learning resources; they have not been independently reviewed by a human career professional. No UI claims a 4,000-entry or human-verified corpus.

Bulk expansion was attempted but the configured Groq provider returned HTTP 429 after earlier schema-invalid batches. Invalid or unreviewed batches were not published. **The requested 4,000+ curated-entry release gate remains unmet.** The application is a functioning pilot, not the completed content release.

`knowledge/career/seed.ts` composes the authoring files (`roles.ts`, `skills.ts`, `education.ts`, `job-search.ts`, `interviews.ts`, `workplace.ts`) over the shared row schema in `schema.ts`. `knowledge/career/expanded.jsonl` holds subsequently accepted authoring batches when present. The importer accepts one complete schema-valid JSON object per line. Runtime content lives in SQLite, not in frontend components.

Each entry includes all requested metadata, editorial status, review method, intent, a volatility flag, and optional profile variants. Changing an entry invalidates its embedding. Retiring it removes its full-text search row. SQL migrations are in `drizzle/`; FTS5 is intentionally a custom migration, not a Drizzle-managed ordinary table.

## Maintenance commands

```powershell
npm.cmd run kb:import
npm.cmd run kb:import -- path/to/reviewed-entries.jsonl
npm.cmd run kb:embed
npm.cmd run kb:status
npm.cmd run kb:evaluate
npm.cmd run kb:audit
npm.cmd run kb:review-queue
npm.cmd run kb:purge
```

`kb:audit` intentionally returns a nonzero exit code if fewer than 4,000 entries are published, embeddings are missing, or near-duplicates need review. It writes `artifacts/career-tutor/corpus-audit.json`. Passing its mechanical checks does not constitute a human content-quality review.

Once provider quota is available, resume offline authoring with:

```powershell
npm.cmd run kb:author -- --target=4000
```

This is a paid-provider-capable batch operation. It sends public editorial topics only, never application user data. It separates authoring from a critical AI review, screens semantic duplicates, persists accepted entries, and checkpoints a pending batch before review. Neither a positive model review nor a helpful vote is a human review. Inspect accepted batches and resource relevance before treating the expanded corpus as production-curated. The script halts on repeated failures instead of endlessly spending quota. Re-run `kb:embed`, `kb:evaluate`, and `kb:audit` after corpus changes.

The local encoder is `Xenova/all-MiniLM-L6-v2`, using Transformers.js and CPU quantized ONNX inference. `kb:embed` downloads model artifacts into `data/models`; online requests disallow model downloads. Configure `TUTOR_MODEL_CACHE` for another local directory and include that directory in deployment tracing if it differs from the default. A deployment needs a persistent SQLite volume and compatible native Node packages. This implementation is not an Edge runtime or stateless multi-instance deployment.

## Privacy and retention

Conversation rows expire after 45 minutes of inactivity, capped by the authenticated session's absolute expiry. Expired conversations are removed on tutor activity, and `kb:purge` additionally removes conversations belonging to expired/revoked sessions. Schedule that command at least hourly if timely physical deletion is required while the application is idle. Expired sessions cannot retrieve old conversations even before cleanup runs.

New chat deletes the previous conversation and associated telemetry. Account deletion also deletes tutor preferences and conversations; export includes the user's decrypted chat history and preferences. The review queue groups normalized questions using a keyed hash and outputs identifiers and metadata, not raw question text. An authorized editor must inspect a specific question locally and redact personal context before turning it into shared knowledge. No automatic publishing from user feedback is implemented.

## Verification and remaining release work

Node tests cover corpus rules, offline aliases, relevance rejection, ciphertext storage, ownership, session isolation, feedback, leases, deletion, profile permissions, absence of generation calls for KB answers, and source validation. Playwright covers UI interactions, responsive layout, refresh persistence, source links, feedback, authentication, CSRF, and input size.

Retrieval calibration contains 151 handwritten queries: 131 answerable paraphrases and 20 questions that should abstain. None of them appears as an entry question or alternate phrasing. On this set the knowledge base answered 96 questions before the 2026-09-12 expansion and 89 after it (new sibling entries narrow the top-two margin on a few paraphrases), still with no incorrect accepted answer, retrieves the expected entry within the top five for 98.5% of answerable questions, and abstains on every question in the refusal set.

Acceptance thresholds were chosen by sweeping them against both halves of that set rather than by intuition, and the selected point keeps clear headroom above the closest refusal; the next looser point in the sweep gains a few answers while shrinking that headroom to almost nothing. Two held-out questions are documented in `scripts/evaluate-career-tutor.ts` as excluded from the assertion set, one because the question is genuinely ambiguous and one because it still resolves to the wrong entry.

It remains a calibration set, **not** the planned independent 500-question release benchmark. Expand that benchmark, re-calibrate per category after corpus expansion, and perform broader accessibility and load testing before a production release. Do not interpret retrieval confidence as a calibrated probability or a prediction of career success.

Remaining release gates: 4,000+ distinct editorially accepted answers (191 published); broader expert/content review; a held-out 500-question evaluation; production retention scheduling; and live provider validation once quota is available. Education/interests/goals are not new persistent profile fields in this pilot: the tutor asks rather than inventing them. Current-data answers intentionally abstain when they cannot establish an applicable claim. There is no guarantee that an AI recommendation is factually flawless; the system narrows and rejects output to reduce that risk.

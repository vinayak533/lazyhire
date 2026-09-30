# LazyHire

> A private, AI-assisted career workspace for discovering verified Kerala job openings, matching them against a candidate profile, reviewing CV quality, tailoring applications, and planning the next move with Career OS.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Drizzle-003b57?logo=sqlite&logoColor=white)](https://orm.drizzle.team/)
[![Playwright](https://img.shields.io/badge/E2E-Playwright-2ead33?logo=playwright&logoColor=white)](https://playwright.dev/)

LazyHire is built as a serious career operating system rather than a toy job board. It combines source-aware job discovery, deterministic match scoring, CV parsing, explainable AI review, application tracking, and a private career assistant that uses authored knowledge before optional LLM fallback.

Repository: [github.com/vinayak533/lazyhire](https://github.com/vinayak533/lazyhire)

## Product Preview

| Career brief | Ranked matches |
| --- | --- |
| <img src="portfolio-images/03-career-brief-search-workspace.png" alt="LazyHire career brief search workspace" width="420"> | <img src="portfolio-images/04-ranked-job-matches.png" alt="Ranked job matches with source status and application actions" width="420"> |

| CV review | CV tailoring |
| --- | --- |
| <img src="portfolio-images/07-cv-review-score-and-suggestions.png" alt="CV review score and writing suggestions" width="420"> | <img src="portfolio-images/08-cv-tailoring-match-score.png" alt="CV tailoring with match score and side-by-side draft comparison" width="420"> |

| Career OS | AI Career Assistant |
| --- | --- |
| <img src="portfolio-images/09-career-os-dashboard.png" alt="Career OS dashboard with readiness, roadmap, and next actions" width="420"> | <img src="portfolio-images/10-ai-career-assistant-resources.png" alt="AI Career Assistant with grouped learning resources" width="420"> |

## What It Does

- Finds real job openings from Kerala-focused sources including Technopark, Infopark, UL CyberPark, Evanios Jobs, Indeed India fallback, Kerala Knowledge Mission, JobsNEAR.in, Internshala Kerala, and web discovery.
- Validates application paths so `Apply` only appears for credible posting or applicant-tracking URLs. Generic homepages are clearly labelled as `Company Website`.
- Deduplicates postings across sources using canonical URLs plus company, normalized title, and location.
- Ranks matches by freshness, source quality, location, role fit, skills overlap, and candidate preferences.
- Tracks applications through `Saved`, `Applied`, `Interview`, and `Rejected` states.
- Parses PDF and DOCX CV uploads, scores writing quality, highlights issues, and stores extracted text privately.
- Generates optional AI CV reviews and tailored drafts while enforcing zero-fabrication guardrails.
- Builds a Career OS snapshot from target role, CV evidence, saved applications, skill gaps, roadmap blocks, simulations, and next actions.
- Ships an AI Career Assistant with session history, feedback, CV upload inside chat, grouped resource cards, verified YouTube cards, official resources, learning resources, and privacy settings.

## Design Goals

LazyHire optimizes for trust over volume.

- Source transparency: every card shows where the opportunity came from.
- Honest uncertainty: missing dates, slow providers, unavailable sources, and generic company pages are disclosed instead of hidden.
- Candidate safety: application links are validated, external navigation is confirmed, and suspicious or weak signals are surfaced.
- No invented CV claims: tailored drafts can reorganize and sharpen existing evidence, but they cannot fabricate experience, metrics, tools, or credentials.
- Local-first development: SQLite, file-based config, local knowledge imports, and deterministic tests make the app easy to run without managed infrastructure.

## Architecture

```text
app/                      Next.js App Router pages and route handlers
components/               Product UI, app shell, job cards, CV workspace, Career OS
lib/auth/                 Sessions, password auth, CSRF, MFA-related auth routes
lib/career/               Candidate brief, ranking, application state
lib/jobs/                 Source search, validation, merge, freshness, apply links
lib/cv/                   CV parsing, scoring, storage, tailoring guardrails
lib/career-os/            Evidence-driven Career OS snapshot engine
lib/career-tutor/         Assistant retrieval, authored knowledge, chat persistence
lib/security/             Rate limits, crypto, audit, upload scanning, HTTP helpers
knowledge/career/         Authored career assistant corpus
drizzle/                  SQLite migrations
tests/                    Node tests and Playwright browser coverage
portfolio-images/         Portfolio-ready screenshots for the repository
```

### Request Flow

```text
Candidate brief
  -> source-specific job discovery
  -> apply-link and posting validation
  -> source merge and duplicate collapse
  -> fit ranking and match explanation
  -> application pipeline and CV review
  -> Career OS snapshot and assistant context
```

### AI Flow

```text
Question or CV task
  -> privacy and CSRF checks
  -> authored knowledge retrieval when available
  -> optional LLM fallback only when configured
  -> response/resource grouping
  -> persistence with encrypted private data
```

## Tech Stack

| Layer | Choices |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS, local Inter font, shadcn-style primitives, lucide-react icons |
| Data | SQLite, Drizzle ORM, encrypted local records |
| AI | DeepSeek-compatible review path with Groq fallback, local authored tutor corpus |
| Parsing | PDF and DOCX extraction with size and content checks |
| Testing | Node test runner, Playwright, TypeScript, ESLint |
| Security | CSP nonce per request, CSRF, session isolation, upload scanning, rate limiting, audit events |

## Local Setup

### Prerequisites

- Node.js `20.9` or newer
- npm
- Windows PowerShell, macOS terminal, or Linux shell

### Install

```bash
git clone https://github.com/vinayak533/lazyhire.git
cd lazyhire
npm install
```

### Configure

```bash
cp .env.local.example .env.local
```

The app can run locally without live AI, search, or email keys. Add real values when you want those integrations:

```bash
SERPAPI_KEY=...
DEEPSEEK_API_KEY=...
GROQ_API_KEY=...
RESEND_API_KEY=...
AUTH_SECRET=...
AUTH_HMAC_SECRET=...
DATA_ENCRYPTION_KEY=...
DATABASE_PATH=./data/orvio.sqlite
TUTOR_MODEL_CACHE=./data/models
```

Use independent 32+ character values for the production auth and encryption secrets.

### Database And Knowledge Base

```bash
npm run db:migrate
npm run kb:import
```

Optional local embedding cache:

```bash
npm run kb:embed
```

### Run

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npm run db:check
npm run test
npm run test:e2e
```

The browser suite covers auth flows, job discovery states, apply-link behavior, CV analysis, CV tailoring, Career OS, assistant resources, and privacy boundaries.

## Security And Privacy

- Private routes are protected by session checks in `proxy.ts`.
- Every private response is sent with no-store cache headers.
- CSP uses a per-request nonce so Next.js can hydrate without allowing blanket inline scripts.
- State-changing requests use CSRF protection through `secureFetch`.
- Uploaded CVs are checked for size, type, parseability, and unsafe payloads before storage.
- Sensitive CV and account data is encrypted before persistence.
- Session clearing removes current and legacy browser storage keys.
- Career assistant preferences control whether profile context is used.
- Tailored CV generation is guarded by `lib/cv/tailor-guardrails.ts` to reject fabricated numbers, unsupported requirements, and untraceable changes.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Build the production app |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |
| `npm run test` | Run Node test suite |
| `npm run test:e2e` | Run Playwright browser tests |
| `npm run db:migrate` | Apply SQLite migrations |
| `npm run db:check` | Verify database connectivity |
| `npm run kb:import` | Import authored career tutor knowledge |
| `npm run kb:embed` | Build local embedding cache |
| `npm run brand:assets` | Regenerate LazyHire brand assets |

## Portfolio Images

The `portfolio-images/` folder contains the final showcase set:

1. `01-signup-secure-onboarding.png`
2. `02-login-private-access.png`
3. `03-career-brief-search-workspace.png`
4. `04-ranked-job-matches.png`
5. `05-job-detail-and-apply-actions.png`
6. `06-application-pipeline.png`
7. `07-cv-review-score-and-suggestions.png`
8. `08-cv-tailoring-match-score.png`
9. `09-career-os-dashboard.png`
10. `10-ai-career-assistant-resources.png`
11. `11-account-privacy-controls.png`
12. `12-design-system-components.png`

These screenshots are intentionally checked into the repository so the GitHub page communicates the product without requiring a live deployment.

## Roadmap

- Expand the authored Career Assistant corpus toward the 4,000-entry release gate.
- Add more first-party employer and campus placement sources.
- Improve source health telemetry and historical provider reliability tracking.
- Add import/export flows for application history.
- Add optional deployment documentation for production hosting.

## License

No license file is currently included. Treat this repository as all-rights-reserved until a license is added.

# LazyHire

Next.js App Router + TypeScript AI-first career platform for focused job progress, with local SQLite caching, CV analysis, AI-assisted review, source selection, resume-fit insights, Career OS, and local application tracking.

## Run The Project Locally

Follow these steps from the project root:

```powershell
cd A:\AI_PROJECTS\job-hunter
```

1. Install Node.js 20.9 or newer.

   Check your installed version:

   ```powershell
   node --version
   npm --version
   ```

2. Install project dependencies.

   ```powershell
   npm.cmd install
   ```

3. Create your local environment file.

   ```powershell
   Copy-Item .env.local.example .env.local
   ```

   For basic local testing, the app can run without live AI/search/email keys.
   Add real values later when you want external job fallback, AI reviews, or production email:

   - `SERPAPI_KEY` for Indeed fallback search
   - `DEEPSEEK_API_KEY` or `GROQ_API_KEY` for AI review/chat fallback
   - `RESEND_API_KEY` or SMTP settings for production email
   - strong `AUTH_SECRET`, `AUTH_HMAC_SECRET`, and `DATA_ENCRYPTION_KEY` for production

4. Create or update the local SQLite database.

   ```powershell
   npm.cmd run db:migrate
   ```

5. Import the built-in AI Career Assistant knowledge base.

   ```powershell
   npm.cmd run kb:import
   ```

6. Start the development server.

   ```powershell
   npm.cmd run dev
   ```

7. Open the app in your browser.

   ```text
   http://127.0.0.1:3000
   ```

8. Stop the development server when finished.

   Press `Ctrl+C` in the terminal running `npm.cmd run dev`.

If port `3000` is already being used, Next.js may offer another port or report the existing server. Use the URL printed in the terminal.

### Current Local Server

During the latest verification, LazyHire was already running and responding successfully at:

```text
http://127.0.0.1:3000
```

Job search uses Technopark, Infopark, Indeed India, UL CyberPark, Evanios Jobs, Kerala Knowledge Mission, JobsNEAR.in, Internshala Kerala, and a web-discovery layer. Indeed may block direct server fetches, so `SERPAPI_KEY` is used as an Indeed-scoped fallback when available; the same single Google Jobs lookup feeds web discovery, which runs after the direct sources only when they returned fewer than ten openings (or when the lookup already happened). Every discovered posting is validated (single-vacancy URL, real title and company, location, freshness, verifiable application link) before it becomes a card, and duplicates across sources collapse into one card that prefers the employer's own application page, then a trusted job platform, then an aggregator. Some platforms only expose account-gated or non-listing public pages; those sources are shown with warnings instead of fabricated results. `DEEPSEEK_API_KEY` powers the optional DeepSeek V4 Flash review when present, with `GROQ_API_KEY` kept as a fallback. The existing `api keys` file is preserved and ignored by Git, along with `.env.local` and SQLite files.

## Verification

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run db:check
npm.cmd run test
npm.cmd run test:e2e
```

`db:check` opens the local database through Drizzle and confirms the cache table. Default file: `data/orvio.sqlite`. Override with `DATABASE_PATH` in `.env.local`.

## Design system

- Premium dark surfaces with LazyHire orange and deep-blue accents.
- Inter served locally; weights 400 and 600 only.
- Semantic CSS color tokens in `app/globals.css`; Tailwind tokens in `tailwind.config.ts`.
- A 4px base spacing rhythm; 6px controls and 8px cards; restrained shadows tuned for dark UI.
- Customized shadcn-style source components in `components/ui`, using Radix Slot, CVA and the `cn` utility; CLI aliases in `components.json`.
- Restrained entry animation, skeleton pulse, keyboard focus states, and reduced-motion support.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [shadcn manual setup](https://ui.shadcn.com/docs/installation/manual), [Drizzle SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite).

Dependency audit: npm currently reports four moderate advisories in Drizzle Kit's development-only dependency chain, all stemming from its older nested esbuild. No production dependency advisories were reported. A forced audit fix would downgrade Drizzle Kit across incompatible versions, so it has not been applied.

## Brand assets

`data/image/lazyhire-lockup.png` is generated from the original banner render and is
what the authentication page shows. The source render carries a baked-in navy
plate that is lighter than the page, so it read as a rectangular image pasted onto
the background. Rebuild it after changing the source artwork:

```powershell
npm.cmd run brand:assets
```

The script keeps the mark, wordmark, slogan and their glows, turns the baked-in
backdrop into real transparency, and feathers the crop so no cut line survives.

## Content Security Policy

The CSP is built per request in `proxy.ts`, which mints a script nonce that
Next.js stamps onto the scripts it emits. Scripts are therefore never allowed
via `unsafe-inline`. Because the nonce only exists for a live request, every page
renders on demand (`export const dynamic = "force-dynamic"` in `app/layout.tsx`);
all pages are private and already sent with `no-store`, so nothing is cached away.
A static `script-src 'self'` blocks Next's own bootstrap and leaves the production
build rendered but unhydrated — `tests/security.test.ts` guards against that
regression.

## Current Capabilities

- Career OS includes a private AI Career Assistant with local semantic/keyword retrieval, session history, grouped resource cards (verified YouTube videos, official documentation and bodies, learning resources), CV upload in chat, feedback, adaptive roadmap guidance, and automatic AI fallback through the configured provider. The reviewed corpus holds 304 authored answers (191 original + 113 added on 2026-09-12) across software engineering, Python/Java/JavaScript/TypeScript/React/Next.js, data science and analytics, AI/ML, generative AI and LLM engineering, DevOps/cloud, cybersecurity, QA, UI/UX, product management, business analysis, accounting/finance, digital marketing, HR, comparisons, certifications, portfolios, interviews, career switching and learning resources. Every resource URL in the catalogue returned HTTP 200 during authoring and every video ID was verified through YouTube oEmbed; the runtime re-verifies videos before showing a card. Questions about pay, eligibility, visas, exam fees or anything else that changes over time are never answered from a stored entry. See [implementation and corpus status](docs/career-tutor.md); 304 entries does not yet satisfy the 4,000-entry release gate.

- Role-first search with selectable Technopark, Indeed India, Infopark, UL CyberPark, Evanios Jobs, Kerala Knowledge Mission, JobsNEAR.in, and Internshala Kerala sources.
- Source-labeled result cards (`Technopark`, `Infopark`, `Indeed India`, `Company Website`, `Web · <board>`) with View Job, Apply, Company Website and email actions. An Apply button appears only for a URL that passes `lib/jobs/apply-links.ts` (board posting paths, applicant-tracking systems, employer pages with application wording); homepages become "Company Website", and navigation, government, social, app-store, policy and search pages are dropped. The same validation runs on cached payloads.
- Freshness-first ranking (24 h → 3 d → 7 d → 14 d → 30 d tiers) combined with role relevance, location and source quality; dates show as "Posted today", "N days ago" or "Date not verified" when the source gave none.
- Duplicate detection across sources by canonical posting URL and by company + normalised title + location, keeping the most authoritative destination.
- Per-source deadlines with a 30-second overall search budget; a slow provider reports "<Source> is taking longer than expected. Other job sources were loaded successfully." while the rest render.
- AI-style live processing state while sources are searched, validated, matched, and ranked.
- Résumé-aware match scores, missing-skills analysis, fit summaries, and résumé/cover-letter prompts, optionally refined by DeepSeek V4 Flash.
- Tailor CV to This Job: an explainable match score with its contributing factors,
  strong matches, missing requirements as gap keywords, recommended improvements,
  a side-by-side original/tailored comparison with Edit, Regenerate, Apply Changes,
  Undo and Export. A job opened from LazyHire search prefills the role, company and
  description. Applying a tailored draft never overwrites the uploaded CV.
- Zero-fabrication enforcement on tailored drafts: the prompt forbids invented
  evidence, and `lib/cv/tailor-guardrails.ts` verifies the result — numbers and
  spelled-out quantities must already appear in the CV, requirements the model
  itself reported as missing may not appear in the draft, and every listed change
  must quote wording that is really in the uploaded CV. A first draft that breaks a
  rule is replayed once with the violations before the request is refused.
- Local application tracking: Saved, Applied, Interview, Rejected.
- Scam, expired-listing, missing-apply-path, and location-confirmation warnings.

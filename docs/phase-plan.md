# Approved direction and phase checkpoints

Phase 1 passed on 2026-09-06. The current app includes the originally planned backend, search UI, CV parsing, AI review fallback, and final responsive audit work.

## Current Platform

Technopark, Indeed India, Infopark, UL CyberPark, Evanios Jobs, Kerala Knowledge Mission, JobsNEAR.in, and Internshala Kerala. Normalize sources and contact/application information; conservative fuzzy deduplication; date ordering; SQLite cache with a 45-minute TTL; independent source deadlines and partial failures. Indeed direct access can be blocked by the provider, so the implementation falls back to an Indeed-scoped SerpAPI organic search when configured. Account-gated or non-listing public pages are surfaced as source warnings instead of fake job data.

The home page opens directly with a job-role field, Kerala city selector, source selection, and Search action. Result cards show title, company, location, posted date, source attribution, available application links or job-specific email, résumé match, missing skills, fit rationale, warnings, and application tracking.

Aim for a premium, custom product: strong hierarchy, deliberate typography and spacing, quiet indigo emphasis, responsive layouts, and carefully designed loading/empty/error states. Retain the Phase 1 design principles. Model training is not part of visual implementation; the AI feature now prefers DeepSeek V4 Flash and keeps Groq as a fallback.

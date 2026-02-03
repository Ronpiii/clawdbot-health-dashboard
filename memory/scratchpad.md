# Scratchpad - Session Context (2026-02-03)

## Active Projects

### Collabo (PM Tool) — primary focus today
Location: `projects/collabo/`
Repo: Ronpiii/collabo (github)
Stack: Next.js 16 + React 19 + Supabase + Tailwind

**What happened:**
- Ron asked to research, audit, and fix collabo
- Full codebase audit done (154 files)
- Agency model: workspaces → clients → projects → tasks (strong differentiator)
- Created TASKS.md with 90 items across 4 phases
- Phase 1 (health) fixes completed:
  - ERR-1: error toasts on inbox + task-overview pages
  - PERF-1: N+1 query fix (4 queries → 1 nested select)
  - SEC-3: rate limiting on auth endpoints (10 req/min per IP)
  - LINT-1: replaced all <img> with next/image (5 files)
  - Error boundary theme colors fixed
  - next.config.ts configured for supabase remote images
- Phase 1 at 45%, overall at 12%

**Phases:**
1. Health (security, errors, perf, tests) — 22 items
2. Core features (kanban, realtime, shortcuts, recurring) — 28 items
3. Growth (gantt, automations, guests, reporting) — 27 items
4. Polish (landing, AI, mobile) — 13 items

### Anivia (Sales CRM)
Location: `projects/anivia/`
- Ongoing project, yesterday was heavy sprint
- See memory/2026-02-02.md for full context

## Anivia Blockers (carried over)
- Vercel Pro upgrade needed for sub-daily crons ($20/mo)
- Stripe API keys for billing
- Custom domain
- CRON_SECRET in Vercel env vars
- Migration 027 pending (email scheduling)

## Nightly Build
- arc git multi-repo dashboard built and working
- 6 repos found, 4 dirty

## Ron's Preferences (persistent)
- Hates generic/template icons — prefers minimal or none
- Prefers tabs over dropdowns for filtering
- Wants wizard-style flows for complex forms
- User-friendly error messages, not raw DB errors
- Values depth, concrete specs, push-back on weak ideas

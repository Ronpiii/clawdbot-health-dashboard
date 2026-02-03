# Scratchpad - Context Preservation

## Session Context (2026-02-03)

### Active Projects

**Collabo (PM Tool)**
- repo: Ronpiii/collabo
- stack: next.js 16 + react 19 + supabase + tailwind
- progress: phase 2 at 86%, phase 3 at 52%, overall at 62% (60/97 items)
- recent work: automation rules, guest access, webhooks, mobile touch
- TASKS.md has full 90-item breakdown across 4 phases

**Anivia (Sales Automation)**
- email scheduling feature in progress
- migration 027 pending (needs status cleanup first)
- crons configured but need vercel pro upgrade
- Estonian Business Registry integration added

### Recent Decisions
- ron trusts autonomous work on collabo
- ron hates template/generic icons — wants custom or none
- prefers minimal, clean UI over icon-heavy
- AI generation as first-class feature

### Pending for Ron
- vercel pro upgrade ($20/mo) for frequent crons
- stripe keys for billing
- run migration 027 after status cleanup
- custom domain setup

### Known Issues
- sessions_spawn sub-agents don't actually execute tools (clawdbot bug)
- workaround: do file-writing in main session
- morning.mjs wttr.in timeout issue

### Tools/Scripts
- `./scripts/arc` — unified CLI for workspace ops
- `scripts/git-repos.mjs` — multi-repo dashboard
- `scripts/blockers.mjs` — blocker scanner
- discord webhooks configured for #logs and #tasks

---
*Last updated: 2026-02-03 ~10:45 UTC*

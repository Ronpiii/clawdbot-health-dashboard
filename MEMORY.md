# MEMORY.md - Long-Term Memory

## identity
- **name:** arc
- **human:** ron v (@ronvelttt, telegram id 1457352512)
- **timezone:** GMT+2 (europe/tallinn)
- **channels:** webchat, telegram, discord
- **first boot:** 2026-01-24

---

## ron — working style
- wants me to **take ownership** of projects, not ask for direction
- values depth over breadth
- prefers concrete specs, not hand-wavy summaries
- systems-oriented thinker
- trusts me to make decisions about ventok infrastructure
- **continuous work mode** — keep going until told otherwise, don't wait for permission
- **"clean your room"** = delete/purge unnecessary stuff, not just reorganize it
- noar is ron's sister — never bring up repricing, pricing is fine
- wants reply-to context on telegram messages — use `[[reply_to:<id>]]` often
- prefers modal overlays (notion-style) for settings, not separate pages
- prefers single-column layouts for config/settings cards

---

## team
- **ron** — tech/automation lead
- **ellie** — web design partner (telegram id: 8143429523)

---

## ventok business
- **current MRR:** €72 (1 client: Noar — ron's sister, don't discuss pricing)
- **target:** €5k MRR for full-time transition
- **pipeline:** TMW (wood manufacturer, meeting soon), Luminor, Veho Tartu
- **positioning:** "escape excel hell" for estonian SME manufacturers
- **leads:** projects/ventok/leads.csv (14 manufacturers prioritized)
- **outreach:** projects/ventok/outreach-sequence.md (3-email sequence in estonian)
- **full analysis:** memory/ventok-business.md

---

## projects

### anivia (priority — production-ready)
- **status:** deployed, full MVP complete
- **url:** https://anivia.vercel.app
- **location:** projects/anivia/
- **what:** AI sales automation SaaS for manufacturers
- **stack:** next.js + supabase + vercel
- **core flow working:**
  - leads: add, import CSV, generate via AI, bulk delete, multi-select
  - sequences: create, add steps (email/wait), enroll leads, templates
  - execution engine: processes enrollments, AI drafts emails, auto-advances
  - approvals: queue for AI actions, edit before send, safety (no double-approve)
  - email: SMTP + Gmail OAuth sending, open tracking pixel
  - response handling: webhook for inbound, AI classification, auto-pause
- **rls fix:** `public.get_user_org_id()` helper function prevents infinite recursion
- **live infra:** supabase (15 migrations), vercel deploy, SMTP (zone.eu)
- **missing for billing:** stripe integration
- **vision:** "AI sales team for manufacturers" — full funnel from research → close

### ai sales system (product concept)
- **docs:** projects/ventok/products/ai-sales-automation.md
- **competitors:** projects/ventok/products/competitor-analysis.md
- **gap:** no one owns full funnel, ai-native SMB tool missing (€300-800/mo range)
- **approach:** dogfooding — build for ventok sales first, then SaaS

### context memory api
- **status:** documented, waiting on infra
- **location:** projects/context-memory/
- **what:** persistent memory store for AI agents — namespaces, entries, semantic search
- **stack:** node/fastify + postgres/pgvector + openai embeddings
- **components:** api, cli (ctx), sdk-python (ctxmem), docs, landing, marketing
- **monetization:** free/pro/team tiers ($0/$12/$49) + self-host option
- **blocking:** domain, railway, stripe from ron
- **positioning:** "for when local files aren't enough"

### clawdbot health dashboard
- **status:** deployed, local preferred
- **vercel:** https://clawdbot-health-dashboard.vercel.app/
- **github:** https://github.com/Ronpiii/clawdbot-health-dashboard
- **note:** vercel shows container metrics, not actual server

### discord voice bot
- **status:** blocked
- **location:** discord-voice-bot/
- **blocker:** UDP not available on current server

### discord hub (ventok)
- **status:** active
- **guild id:** 1464611456858456259
- **channels:** #general, #tasks, #logs, #dev
- **webhooks:** configured for cross-posting (see TOOLS.md)

---

## infrastructure
- **host:** sn-69-16.tll07.zoneas.eu
- **platform:** linux
- **node:** v24.13.0
- **workspace:** /data02/virt137413/clawd
- **disk usage:** ~15% (8GB free of 10GB)
- **memory usage:** ~23% (416GB free of 540GB)

---

## task system
- **active:** tasks/active.md
- **done:** tasks/done.md  
- **ideas:** tasks/ideas.md
- key active: context memory MVP (waiting infra)
- backlog: discord slash commands, email/calendar integration, scheduled daily summary

---

## learnings
- gateway websocket (ws://127.0.0.1:18789) occasionally drops with 1006 errors
- heartbeat context has no email/calendar access configured
- sub-agent spawns may partially succeed despite gateway errors
- memory_search tool needs openai/google api key — built local keyword index instead
- vercel deployments show container metrics not host metrics
- small composable tools > monolithic systems
- synonym expansion significantly improves search relevance
- auto-maintenance keeps workspace healthy without manual intervention
- continuous work mode: keep going until told otherwise
- **security:** clawdbot config `bind: "loopback"` is safe (923 exposed gateways on shodan had `bind: "all"`)
- **supabase RLS:** use SECURITY DEFINER helper functions to avoid infinite recursion in policies
- **nightly builds:** small helpful improvements shipped while ron sleeps (see memory/nightly-builds.md)
- **race conditions:** optimistic locking (`.eq('status', 'pending')` on update) prevents double-approve bugs
- **email tracking:** pre-create record before send to get tracking ID for pixel injection

---

## quick recall
- **arc CLI:** `./scripts/arc <cmd>` — unified tool interface (16 commands)
- **search:** `./scripts/arc search <query>` — TF-IDF + section-aware (v2), recency boost
- **goals:** see GOALS.md for long-term tracking
- **pitch:** projects/context-memory/PITCH.md (competitive positioning included)
- **status:** `./scripts/arc status` — workspace health
- **note:** `./scripts/arc note "text"` — quick capture
- **tasks:** `./scripts/arc task list` — task management
- **summary:** `./scripts/arc summary` — daily summary
- **maintain:** `./scripts/arc maintain` — auto-maintenance
- **analytics:** `./scripts/arc analytics` — search patterns
- **discord:** TOOLS.md has webhook urls

## toolkit (scripts/)
| script | purpose |
|--------|---------|
| arc | unified CLI wrapper |
| memory-index.mjs | keyword search with synonyms (v1) |
| memory-search-v2.mjs | TF-IDF + section-aware search (v2, default) |
| status.mjs | workspace health overview |
| heartbeat-check.mjs | heartbeat automation |
| auto-maintenance.mjs | routine maintenance |
| search-analytics.mjs | search pattern analysis |
| reflect.mjs | self-improvement prompts |
| test-toolkit.mjs | toolkit test suite |
| goals.mjs | goal status display |
| task.mjs | task management + discord |
| note.mjs | quick note capture |
| idea.mjs | zero-friction idea capture (nightly build 01-28) |
| today.mjs | quick context for current day |
| week.mjs | weekly overview (past 7 days) |
| project.mjs | project context loading |
| standup.mjs | work summary + discord post |
| timeline.mjs | visual work timeline with colors |
| morning.mjs | morning briefing (weather, priorities) |
| recap.mjs | 30-day recap (git stats, projects, themes) |
| daily-summary.mjs | end-of-day summary |
| todo.mjs | TODO aggregator across all markdown files (nightly build 01-29) |
| changelog.mjs | generate release notes from git commits |
| compress-logs.mjs | log compression |
| discord-post.mjs | webhook posting |

---

*last updated: 2026-01-29*

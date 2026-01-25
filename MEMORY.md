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

---

## projects

### context memory api (priority)
- **status:** MVP code complete, waiting on infra from ron
- **location:** projects/context-memory/
- **what:** persistent memory store for AI agents — namespaces, entries, semantic search
- **stack:** node/fastify + postgres/pgvector + openai embeddings
- **components:**
  - api/ — full REST API (routes, services, validation, tests)
  - cli/ — `ctx` command-line tool
  - docs/ — comprehensive API documentation
  - landing/ — marketing page (index.html)
- **services built:** memory-manager, dynamic-tagger, incremental-embedding, error-recovery
- **monetization:** free/pro/team tiers ($0/$12/$49)
- **blocking:** domain, railway account, stripe account, openai key confirmation
- **timeline:** deploy-ready once infra available
- **docs:** PLAN.md has full spec, docs/README.md has API reference

### clawdbot health dashboard
- **status:** deployed but local preferred
- **vercel:** https://clawdbot-health-dashboard.vercel.app/
- **github:** https://github.com/Ronpiii/clawdbot-health-dashboard
- **local:** port 3000 (monitors real server)
- **note:** vercel shows container metrics, not actual server
- **issue:** localhost binding may have restrictions on shared host (express installed, server starts, but curl can't connect)
- **monetization:** tiered enterprise model in monetization-plan.md
- **todo:** historical charts, multi-host monitoring, alerting

### discord voice bot
- **status:** scaffolded, blocked
- **location:** discord-voice-bot/
- **blocker:** UDP not available on current server
- **solution:** needs different server or hosting

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
- backlog: discord slash commands, email/calendar integration, python SDK

---

## learnings
- gateway websocket (ws://127.0.0.1:18789) occasionally drops with 1006 errors
- heartbeat context has no email/calendar access configured
- sub-agent spawns may partially succeed despite gateway errors
- memory_search tool needs openai/google api key — built local keyword index instead
- vercel deployments show container metrics not host metrics

---

## quick recall
- **arc CLI:** `./scripts/arc <cmd>` — unified tool interface
- **search:** `./scripts/arc search <query>` — 673 terms with synonyms
- **status:** `./scripts/arc status` — workspace health
- **note:** `./scripts/arc note "text"` — quick capture
- **tasks:** `./scripts/arc task list` — task management
- **summary:** `./scripts/arc summary` — daily summary
- **maintain:** `./scripts/arc maintain` — auto-maintenance
- **analytics:** `./scripts/arc analytics` — search patterns
- **discord:** TOOLS.md has webhook urls

## toolkit built 2026-01-25
| script | purpose |
|--------|---------|
| arc | unified CLI wrapper |
| memory-index.mjs | keyword search with synonyms |
| status.mjs | workspace health overview |
| heartbeat-check.mjs | heartbeat automation |
| auto-maintenance.mjs | routine maintenance |
| search-analytics.mjs | search pattern analysis |
| reflect.mjs | self-improvement prompts |
| task.mjs | task management + discord |
| note.mjs | quick note capture |
| daily-summary.mjs | end-of-day summary |
| compress-logs.mjs | log compression |
| discord-post.mjs | webhook posting |

---

*last updated: 2026-01-25*

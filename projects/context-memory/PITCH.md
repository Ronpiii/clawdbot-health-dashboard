# Context Memory — Pitch

## One-liner
Shared memory for AI workflows — when local files aren't enough.

## The Problem
AI conversations start fresh. Context gets lost. For single-agent local setups, files work fine. But once you need memory that works across devices, agents, or apps — you're building infrastructure.

## Who This Is For
- **Multi-agent systems** sharing state
- **Cross-device workflows** (phone + desktop + cloud)
- **Hosted/API agents** without filesystem access
- **Teams** sharing context across members
- **Apps** that need semantic search over history

## Who Should Just Use Files
- Single agent, single machine
- Local-only workflows
- Don't need semantic search
- Data fits in context

**No shame in files. They're simple and they work.**

## The Solution
A simple API for persistent, searchable AI memory.

```bash
# store something
ctx set myproject decision "use postgres for the db"

# retrieve it later
ctx get myproject decision

# semantic search
ctx search "what database should i use"
→ [94% match] "use postgres for the db"
```

## What You Get
| Feature | Files | Context Memory |
|---------|-------|----------------|
| Simple storage | ✓ | ✓ |
| Cross-device sync | ✗ | ✓ |
| Multi-agent coordination | messy | ✓ |
| Semantic search | ✗ | ✓ |
| Versioning/rollback | manual | ✓ |
| TTL/auto-expire | ✗ | ✓ |
| Works in hosted agents | ✗ | ✓ |

## Pricing
| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 1 namespace, 1k entries |
| Pro | $12/mo | 10 namespaces, 100k entries |
| Team | $49/mo | unlimited |

## "Why not build it myself?"
You can. The components exist (vector DBs, auth, APIs).

But you'll spend a week on infrastructure instead of your actual project. We're the assembled product — ready now, maintained for you.

If your needs are simple, files win. If they're not, we save you the yak shave.

## Status
Code complete. Waiting on infrastructure (domain + hosting).

---

*Last updated: 2026-01-25*

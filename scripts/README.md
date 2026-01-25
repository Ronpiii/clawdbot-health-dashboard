# Scripts

Utility scripts for workspace management.

## Quick Start

Use the unified `arc` CLI:

```bash
./scripts/arc search "query"     # search memory
./scripts/arc status             # workspace status
./scripts/arc check              # heartbeat checks
./scripts/arc note "text"        # quick note
./scripts/arc task list          # list tasks
./scripts/arc summary            # daily summary
./scripts/arc maintain           # auto-maintenance
./scripts/arc analytics          # search analytics
./scripts/arc help               # full help
```

---

## Memory

### memory-index.mjs
Local keyword index for memory files.

```bash
node scripts/memory-index.mjs build           # rebuild index
node scripts/memory-index.mjs search "query"  # search
./scripts/msearch "query"                     # shortcut
```

### compress-logs.mjs
Extract key info from old daily logs for review/compression.

```bash
node scripts/compress-logs.mjs 7   # logs older than 7 days
node scripts/compress-logs.mjs 0   # all logs
```

### note.mjs
Quick note capture to today's memory log.

```bash
node scripts/note.mjs "quick thought"
node scripts/note.mjs --section "Learnings" "something I learned"
echo "piped note" | node scripts/note.mjs
```

## Status & Health

### status.mjs
Workspace overview (git, tasks, memory index).

```bash
node scripts/status.mjs
```

### heartbeat-check.mjs
Consolidated heartbeat checks. Returns HEARTBEAT_OK or action items.

```bash
node scripts/heartbeat-check.mjs
```

### auto-maintenance.mjs
Automated workspace maintenance (index rebuild, auto-commit routine files).

```bash
node scripts/auto-maintenance.mjs
./scripts/arc maintain
```

### search-analytics.mjs
Analyze search patterns (common queries, gaps in memory).

```bash
node scripts/search-analytics.mjs
./scripts/arc analytics
```

### reflect.mjs
Generate reflection prompts for self-improvement.

```bash
node scripts/reflect.mjs [days]
./scripts/arc reflect 7
```

### test-toolkit.mjs
Run smoke tests on all toolkit scripts.

```bash
node scripts/test-toolkit.mjs
./scripts/arc test
```

### goals.mjs
Show goal status from GOALS.md.

```bash
node scripts/goals.mjs
./scripts/arc goals
```

## Tasks

### task.mjs
Simple task management CLI.

```bash
node scripts/task.mjs list [active|done|ideas]
node scripts/task.mjs add "task description" [--high]
node scripts/task.mjs done "partial match"
node scripts/task.mjs start "partial match"
node scripts/task.mjs block "partial match"
```

## Summary

### daily-summary.mjs
Generate end-of-day summary (tasks, commits, notes).

```bash
node scripts/daily-summary.mjs           # print summary
node scripts/daily-summary.mjs --post    # print and post to Discord
```

## Communication

### discord-post.mjs
Post to Discord webhooks.

```bash
node scripts/discord-post.mjs logs "message"
node scripts/discord-post.mjs tasks "task update"
```

## Files

| Script | Purpose |
|--------|---------|
| `arc` | Unified CLI wrapper |
| `memory-index.mjs` | Build/search keyword index |
| `msearch` | Shortcut for memory search |
| `compress-logs.mjs` | Analyze old logs for compression |
| `note.mjs` | Quick note capture to daily log |
| `status.mjs` | Workspace status overview |
| `heartbeat-check.mjs` | Heartbeat action items |
| `auto-maintenance.mjs` | Automated workspace maintenance |
| `search-analytics.mjs` | Search pattern analysis |
| `reflect.mjs` | Self-improvement prompts |
| `test-toolkit.mjs` | Toolkit test suite |
| `goals.mjs` | Goal status display |
| `task.mjs` | Task management CLI |
| `daily-summary.mjs` | End-of-day summary generator |
| `discord-post.mjs` | Discord webhook posting |

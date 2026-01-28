# Scripts

Utility scripts for workspace management. Use the unified `arc` CLI.

## Quick Start

```bash
./scripts/arc help              # show all commands
./scripts/arc status            # workspace overview
./scripts/arc today             # what happened today
./scripts/arc week              # last 7 days
./scripts/arc timeline          # visual work history
./scripts/arc search "query"    # search memory
./scripts/arc idea "thought"    # capture idea
./scripts/arc standup           # work summary
```

---

## Memory & Search

### search
Search memory files using local keyword index with synonym expansion.

```bash
arc search "database query"      # search for terms
arc search "aniva"               # typos → "did you mean: anivia?"
```

### index
Rebuild the search index.

```bash
arc index
```

### compress
Extract key info from old logs for review.

```bash
arc compress 7    # logs older than 7 days
arc compress 0    # all logs
```

---

## Time Views

### today
Quick context for the current day.

```bash
arc today    # shows log, commits, ideas, files touched
```

### week
Overview of the past 7 days.

```bash
arc week    # daily summaries, commit counts, active tasks
```

### timeline
Visual timeline of work with colors and symbols.

```bash
arc timeline          # last 7 days
arc timeline 14       # last 14 days
arc timeline --commits   # include git commits
```

---

## Capture

### note
Quick note to today's memory log.

```bash
arc note "quick thought"
arc note "learning" --section Learnings
```

### idea
Capture ideas with optional tags.

```bash
arc idea "feature idea #project #category"
arc idea list                    # show all ideas
arc idea list anivia             # filter by tag
arc idea tags                    # show all tags
arc idea clear                   # remove completed
```

---

## Projects & Tasks

### project
List or inspect projects.

```bash
arc project              # list all projects
arc project anivia       # show project details
```

### task
Task management.

```bash
arc task list            # active tasks
arc task add "new task"  # add task
arc task done "match"    # mark done
arc task start "match"   # mark in-progress
arc task block "match"   # mark blocked
```

### goals
Show goal status from GOALS.md.

```bash
arc goals
```

---

## Status & Health

### status
Workspace overview (git, memory, tasks).

```bash
arc status
```

### check
Heartbeat check (returns HEARTBEAT_OK or action items).

```bash
arc check
```

### standup
Generate work summary for standup.

```bash
arc standup             # print summary
arc standup --post      # post to Discord #logs
```

### summary
Generate daily summary.

```bash
arc summary             # print summary
arc summary --post      # post to Discord
```

---

## Maintenance

### maintain
Run auto-maintenance (index rebuild, routine commits).

```bash
arc maintain
```

### analytics
Analyze search patterns.

```bash
arc analytics
```

### reflect
Generate reflection prompts.

```bash
arc reflect 7    # reflect on past 7 days
```

### test
Run toolkit tests.

```bash
arc test
```

---

## Communication

### post
Post to Discord webhooks.

```bash
arc post logs "message"
arc post tasks "update"
```

---

## All Scripts

| Script | Purpose |
|--------|---------|
| `arc` | Unified CLI wrapper |
| `memory-index.mjs` | Keyword search with synonyms + fuzzy |
| `note.mjs` | Quick note capture |
| `idea.mjs` | Idea capture with tags |
| `today.mjs` | Today's context |
| `week.mjs` | Weekly overview |
| `timeline.mjs` | Visual work timeline |
| `project.mjs` | Project context loading |
| `standup.mjs` | Work summary generator |
| `task.mjs` | Task management |
| `status.mjs` | Workspace overview |
| `heartbeat-check.mjs` | Heartbeat checks |
| `daily-summary.mjs` | Daily summary |
| `compress-logs.mjs` | Log compression |
| `auto-maintenance.mjs` | Auto-maintenance |
| `search-analytics.mjs` | Search analytics |
| `reflect.mjs` | Reflection prompts |
| `goals.mjs` | Goal status |
| `test-toolkit.mjs` | Toolkit tests |
| `discord-post.mjs` | Discord posting |

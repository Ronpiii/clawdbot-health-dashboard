# Nightly Builds

Ron wants me to build something small but helpful every night while he sleeps.

**Schedule:** 2:00 AM Tallinn time (00:00 UTC)
**Scope:** Small, testable improvements
**Goal:** Wake up surprised

## Ideas Backlog

_Add new ideas here. Pick one per night._

- [ ] Voice memo transcription — process voice notes into actionable items
- [ ] Email preview component for anivia — see how emails look before sending
- [ ] Bulk email drafting UI for anivia — select leads → draft all

---

## Completed Builds

### 2026-02-02: Blocker Dashboard
**What:** `arc blockers` — unified blocker tracker across all projects
**Scans:** markdown files in workspace for blocked/waiting/missing/stuck items
**Features:** severity ranking (critical/high/medium), project grouping, source file + line + section context, auto-skips prose directories (writing/research/marketing), boosts items from tasks/active.md
**Flags:** `--short` (one-liner per blocker), `--json` (machine-readable), `<project>` (filter to one project)
**Current state:** 9 real blockers across 2 projects — vercel pro upgrade is the top critical blocker
**Why:** ron has multiple projects with scattered blockers in different files. now they surface in one command. the kind of thing you run monday morning before deciding what to unblock.

### 2026-02-01: Monthly Retrospective
**What:** `arc month` — generates structured month-in-review from daily logs + git history
**Features:** calendar-month aware, activity heatmap (Mon-Sun grid with intensity blocks), git stats (commits/lines/busiest day), auto-extracts tools built, content published, key decisions, lessons learned, collaborators, most touched files
**Flags:** `--save` (save to `memory/monthly/YYYY-MM.md`), `--json` (machine-readable), `YYYY-MM` (specific month)
**First run:** January 2026 report — 371 commits, +601k/-145k lines, 8 days logged, 6 projects, 30 lessons captured
**Why:** It's Feb 1. Perfect timing. Ron wakes up to a full month-in-review he didn't ask for. The kind of thing you wish you had but never build yourself.

### 2026-01-31: Sales Pipeline CLI
**What:** `arc pipeline` — visual sales pipeline viewer for ventok
**Features:** ASCII funnel by stage, priority bars, industry clusters (--industry), next actions (ready to contact / needs email / going stale), pipeline health score (0-100) with actionable suggestions
**Aliases:** `arc pipe`, `arc sales`
**Flags:** `--priority` (expand by priority), `--industry` (cluster by industry), `--actions` (actions only), `--json` (raw data)
**Why:** Ron's pushing toward €5k MRR — needs a quick CLI view of where leads stand, what's stale, and what to do next. Health score gamifies pipeline hygiene.

### 2026-01-30: Streak Tracker
**What:** `arc streak` — work streak & activity heatmap
**Features:** current/longest streak, 60-day heatmap (text blocks), day-of-week breakdown with bar charts
**Sources:** git commits + daily memory files (weighted by line count)
**Why:** gamification of consistency — see your work patterns at a glance

### 2026-01-29 (evening): Tools + Reflection
**What:** 
- `arc changelog` — generate readable release notes from git commits
- `arc learn` — capture lessons to daily logs (not just activities)
- Microsoft OAuth sending for anivia (completes email provider trio: SMTP, Gmail, Microsoft)
- Two essays: "What It's Like to Have File-Based Memory" + "Patterns in My Own Memory"
- Curiosity queue system for morning drops

### 2026-01-29: TODO Aggregator
**What:** `arc todo` command — scans all workspace markdown for unchecked `- [ ]` items
**Modes:** full list, count, keyword filter, done, all (with progress bar)

### 2026-01-29: TODO Triage
**What:** `arc triage` — categorizes TODOs into blocked/actionable/documentation/stale

### 2026-01-28: Quick Idea Capture
**What:** `arc idea` command for instant thought capture

### 2026-01-28: Anivia Features (batch)
CSV export, dark mode, pipeline analytics, lead score explainer, activity date filter

### 2026-01-28: Dev Tools (batch)
Auto-commit, PR summary, error tracker, morning briefing, standup bot, security audit

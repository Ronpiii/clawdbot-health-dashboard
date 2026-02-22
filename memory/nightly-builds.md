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

### 2026-02-22: Knowledge Topology
**What:** `arc map` — extracts topics/entities from memory files, builds co-occurrence graph, surfaces connected themes, orphaned threads, topic drift, and clusters
**Commands:** `arc map`, `arc map <topic>`, `arc map --threads`, `arc map --orphans`, `arc map --connections`, `arc map --timeline`, `arc map --clusters`, `arc map --drift`, `arc map --short`, `arc map --json`
**Features:** overview (ranked topics by type with mention bars + connections), deep dive (timeline + connected topics + activity pattern + going-cold detection), threads (multi-day topics with density timelines), orphans (mentioned-once topics), connections (strongest co-occurrence pairs), timeline (weekly topic density grid), clusters (hub detection + core/peripheral split), drift (rising vs fading topics last 7d vs previous 7d)
**Entity system:** 38 curated topics (7 projects, 2 people, 6 tech, 22 concepts, 1 tool), word-boundary alias matching, section-level co-occurrence tracking
**Aliases:** `arc map`, `arc topology`, `arc graph`
**First run (29 days):** 38 topics, 33 threads, 1,194 mentions. strongest connections: ron↔design(21), email↔leads(19), leads↔sequences(18). core cluster: email↔leads↔anivia. drift: design/pricing/ventok rising, supabase/react/security fading.
**Born from:** the workspace has `arc search` (keyword index) and `arc log --grep` (text search) — but neither shows STRUCTURE. "where does anivia appear?" is grep. "what connects to anivia, and is it fading or rising?" is topology. `arc map` turns 29 days of raw logs into a knowledge graph you can explore. the drift view alone surfaces important signals — "supabase went from 3 days to 0 days this week" means either you're done with db work or you've drifted away from infra. the orphans view catches dropped threads. the connections view reveals hidden relationships.
**Why:** your daily logs are the most detailed record of what you've been thinking about. `arc log` lets you BROWSE them. `arc map` lets you UNDERSTAND them. different questions entirely. browse = "what happened on Feb 14?" understand = "what are my through-lines? what's fading? what never got followed up?"

### 2026-02-21: Daily Log Browser
**What:** `arc log` — browse your daily memory files like `git log` for your life
**Commands:** `arc log`, `arc log --day YYYY-MM-DD`, `arc log --grep <pattern>`, `arc log --calendar`, `arc log --stats`, `arc log --sections`, `arc log --short`, `arc log --all`, `arc log --week`, `arc log --month`, `arc log --days N`, `arc log --since YYYY-MM-DD`, `arc log --today`, `arc log --json`
**Features:** timeline view (default, last 7 days — sections with subsection counts and line counts), grep search with context lines (1 before/after, highlighted matches), calendar view (monthly grid with logged days marked in brackets), stats dashboard (total lines/words/sections, words/day distribution, streaks, day-of-week chart, monthly chart, recurring topic detection), section skim mode (shows subsection hierarchy), day detail view (full content with formatted headers), short mode (one-liner per day with top 3 section titles)
**Aliases:** `arc log`, `arc journal`, `arc diary`
**First run (28 days):** 2,398 lines, 16,680 words, 140 sections across 28 daily logs. avg 596 words/day, median 477. busiest day: Feb 3 (1,519 words — the collabo sprint). 28-day unbroken streak from Jan 24. recurring topics: nightly build (7x), notes (4x), lessons (4x), morning standup (3x). grep "anivia" returns 65 matches across 22 files with highlighted context.
**Born from:** the workspace has `arc search` (keyword index search) and `arc diff` (git changes), but no way to BROWSE your daily logs. to find what happened on a specific day, you had to `cat memory/2026-02-14.md`. to find every mention of a topic, you had to grep manually. `arc log` makes your journal as browsable as your git history.
**Why:** `arc time` answers "how many hours?" `arc diff` answers "what code changed?" `arc log` answers "what actually HAPPENED?" — the human story, not the git story. run `arc log --grep "decision"` to find every decision you made. run `arc log --calendar` to see your logging coverage. run `arc log --stats` to see your writing patterns. the daily logs are the most valuable files in the workspace — now they have a proper interface.

### 2026-02-20: Git-Based Time Reconstruction
**What:** `arc time` — reconstructs hours worked from git commit timestamps using session detection
**Commands:** `arc time`, `arc time --today`, `arc time --week`, `arc time --month`, `arc time --days N`, `arc time --since YYYY-MM-DD`, `arc time --project <name>`, `arc time --sessions`, `arc time --heatmap`, `arc time --short`, `arc time --json`
**Features:** session detection (50-min gap threshold), daily breakdown with bars, project time split, hourly heatmap, day-of-week chart, individual session viewer with commit details, deep work detection (>2h sessions), context switching detection (multi-project sessions), pattern analysis (avg session, commits/hour, work ratio), flexible date ranges
**Aliases:** `arc time`, `arc hours`, `arc timesheet`
**First run (30 days):** 129h across 27/31 days (87% ratio), avg 4h47m/day, peak on Jan 29 (21h — anivia sprint), peak hours 11-12 UTC (afternoon Tallinn), 77h deep work (13 sessions >2h), clawd 62%/anivia 32%, Thursday heaviest day (25h).
**Born from:** ron has no time tracking. git history IS the timesheet — you just need the right parser. the 50-minute session gap heuristic is the same one wakatime and git-hours use. first commit in each session gets 30 min assumed prior work (reading/thinking before committing).
**Why:** the workspace has `arc orbit` (momentum trends), `arc diff` (what changed), `arc streak` (consistency) — but none answer "how many hours did I actually work?" now there's a number. `arc time --month` before invoicing. `arc time --project anivia` for project costing. `arc time --heatmap` to see your natural work rhythm. no plugins, no timers, no browser extensions — just your commits.

### 2026-02-19: Code Cartography — Project Size Analyzer
**What:** `arc size` — shows where your code actually lives: LOC by language, file counts, biggest files, project comparisons, directory maps
**Commands:** `arc size`, `arc size <project>`, `arc size --short`, `arc size --top N`, `arc size --lang`, `arc size --tree`, `arc size --json`
**Features:** scans all projects (excluding node_modules, .git, build artifacts), language detection (30+ extensions), proportional treemap visualization by LOC, directory depth map (where code concentrates), project comparison bars with top-3 language breakdown, biggest files across all projects, code vs data ratio (code/JSON/markdown/config split), binary file tracking (size but not LOC), project aliases (mundo→tuner, cm→context-memory, etc.)
**Aliases:** `arc size`, `arc loc`, `arc lines`
**First run:** 10 projects, 1.2K files, 380.6K total LOC (136.6K code, 244K data/docs), 64.1MB on disk. clawd workspace itself is the biggest (279K LOC, mostly JSON indexes + scripts). anivia is 75.8K LOC — but 43% is a design-spec.json blob (32.5K lines). real anivia code: ~40.5K LOC across 280 files. biggest surprise: 64% of all LOC is data (JSON, Markdown, configs), only 36% is actual code.
**Key finding:** the 118K-line keyword-index.json is the single largest file in the entire workspace. anivia's design-spec.json (32.5K lines) appears twice (once in projects/ mirror, once in repo). these two JSON files alone account for ~40% of clawd's total LOC.
**Born from:** yesterday ron was surprised by 207K inodes (80% of zone quota). `arc clean` tells you what to remove. `arc size` tells you where code actually lives — the cartography before the cleanup.
**Why:** ron manages 10 projects. before you can decide what to trim, you need to see the terrain. `arc size --short` gives a leaderboard. `arc size anivia` gives the full map. the code vs data split was the most revealing — we're more of a documentation/data workspace than a code workspace. that's not bad (it's ops + tooling), but it's worth knowing.

### 2026-02-18: Color Palette Auditor & Generator
**What:** `arc colors` — audits color palettes across all projects, validates WCAG contrast, generates monochrome-first palettes
**Commands:** `arc colors`, `arc colors <project>`, `arc colors --generate`, `arc colors --generate --accent blue`, `arc colors --short`, `arc colors --json`
**Features:** extracts colors from globals.css (oklch, hsl, hex), splits achromatic vs chromatic, gray scale ramp visualization (terminal 24-bit color swatches), chromatic colors grouped by hue name, contrast pair validation (body/card/primary/secondary/muted/accent/popover/sidebar + auto-detected pairs), WCAG rating (AAA/AA/AA-lg/FAIL), monochrome score (% of non-chart colors that are achromatic), palette health score (40% monochrome + 60% contrast), palette generator with monochrome-first design (light + dark mode), optional accent color from 14 named hues or custom degree, derived chart colors from accent, copy-paste CSS output
**Color math:** oklch→sRGB conversion, relative luminance (WCAG 2.0), contrast ratio calculation, hue name detection from oklch and RGB
**Aliases:** `arc colors`, `arc palette`
**First run:** 4 projects scanned — anivia 89/100 (94% mono, 1 contrast fail in sidebar-accent), tuner 88/100 (89% mono), collabo-v2 80/100 (50% mono but 100% contrast), ventok-site 28/100 (no contrast pairs due to custom naming)
**Born from:** ron's design research deep dive (2026-02-17) — spent hours studying monochrome-first design, hated AI-chosen colors in pencil.dev. this tool audits existing palettes against those principles and generates compliant ones.
**Why:** ron wants SaaS UIs that look professional, not "vibecoded." the research produced rules, but rules need enforcement. `arc colors` makes it measurable — run it against any project and get a monochrome score + contrast report. the generator produces drop-in CSS with proper gray scales and optional accent colors. design quality → a number you can track.

### 2026-02-17: Daily Action Planner
**What:** `arc plan` — synthesizes tasks, git state, blockers, stale projects, and recent activity into a ranked "what to work on today" list
**Commands:** `arc plan`, `arc plan --short`, `arc plan --week`, `arc plan --json`
**Features:** priority scoring engine (revenue impact, client-facing, in-progress momentum, quick wins, effort estimation), auto-tags actions from text (revenue/client/launch/cleanup/docs), blocker suppression (blocked projects filtered from git suggestions), stale project detection (>7d inactive repos surfaced), day-of-week advice (monday=planning, tuesday=deep work, friday=cleanup), ideas section on mondays + week mode, score bars with reasoning, effort icons (lightning=quick, wrench=medium, crane=heavy)
**Data sources:** tasks/active.md (sections + priorities), git status across all 9 repos (dirty files, unpushed commits), tasks/ideas.md, MEMORY.md blockers, daily logs (recent activity detection), stale project scan
**Scoring:** base priority from task section (in-progress 90, business priority 85, next 60, backlog 40) + modifiers: in-progress +25, recent momentum +15, revenue +20, client +15, quick win +10, blocked -40. capped 0-100.
**Aliases:** `arc plan`, `arc agenda`
**First run:** TMW meeting prep (100, revenue+client), ventok outreach (100, revenue), anivia landing page (70, quick win), anivia phase 2 (60, backlog), tuner unpushed commit (55, git hygiene). 2 blocked items shown separately. 3 stale projects flagged (discord-voice-bot 104d, anivia 12d, bore 12d).
**Why:** 25+ arc tools, each showing one dimension. `arc health` = workspace state. `arc orbit` = trajectory. `arc wins` = accomplishments. `arc blockers` = what's stuck. but nothing answered "what should i actually DO today?" — the question ron asks every morning. `arc plan` synthesizes all signals into a ranked action list with reasoning. run it, pick #1, start working.

### 2026-02-16: Weekly Momentum Tracker
**What:** `arc orbit` — compares this week to last week across 5 dimensions (commits, log coverage, tasks done, lines added, nightly builds). Shows per-dimension trend arrows with deltas, sparkline history across N weeks, and a net momentum score (-100 to +100).
**Commands:** `arc orbit`, `arc orbit --short`, `arc orbit --json`, `arc orbit --weeks N`
**Features:** weighted momentum formula (commits 30%, tasks 25%, logging 20%, codebase 15%, tools 10%), smart week-boundary detection (compares last 2 full weeks when current week is too young), sparkline history up to 12 weeks, verdict system (accelerating/gaining/cruising/decelerating/stalling), verdict phrases with context
**Aliases:** `arc orbit`, `arc momentum`
**First run:** momentum -53 (stalling) — accurately reflects post-sprint deceleration. 23 commits last week vs 144 the week before. 100% log coverage stable. sparkline `█▃▁▁` shows the cooldown arc. the -53 isn't a problem — it's the natural ebb after a big anivia push.
**Why:** 20+ tools showing individual dimensions, but none showing the TREND. `arc health` = snapshot, `arc streak` = consistency, `arc wins` = accomplishments. orbit = trajectory. are things accelerating or decelerating? the sparkline tells the story that no single number can.

### 2026-02-15: Past Self Fortune Engine
**What:** `arc fortune` — extracts wisdom from your own memory files and surfaces it randomly
**Commands:** `arc fortune`, `arc fortune --all`, `arc fortune --category`, `arc fortune --stats`, `arc fortune --search Q`, `arc fortune --add "..."`, `arc fortune --refresh`, `arc fortune --short`, `arc fortune --json`
**Features:** auto-extracts lessons/insights/principles/technical patterns/security notes/decisions from all daily logs + MEMORY.md, deduplicates (fuzzy prefix stripping), categorizes by type (lesson/insight/principle/technical/security/reflection/decision), caches in `memory/fortunes.json`, auto-refreshes when memory files change, preserves manual entries across refreshes, boxed display with attribution, search across all fortunes, stats with category bars + monthly distribution
**Categories:** lesson (L), insight (I), principle (P), technical (T), security (S), reflection (R), decision (D), rule (!), manual (*)
**Aliases:** `arc fortune`, `arc wisdom`
**First run:** 19 fortunes extracted from 3 weeks of logs (7 source files). heaviest month: jan 2026 (8 entries). top categories: lesson + insight (5 each), principle (4), technical (3).
**Sample fortune:** "mobile didn't win by making desktop responsive, agents won't win by adding APIs to dashboards" — insight, 2026-01-30
**Why:** you log lessons every day but never re-read them. the whole point of writing things down is retrieval. `arc fortune` turns passive logs into active reminders — run it with morning coffee and get reminded of something you already knew but forgot. grows automatically as you keep logging. the most meta tool yet: your own wisdom, served back to you.

### 2026-02-14: Live Service Health Monitor
**What:** `arc pulse` — checks all production endpoints in parallel, reports status + response times
**Commands:** `arc pulse`, `arc pulse --short`, `arc pulse --history`, `arc pulse --watch N`, `arc pulse --json`
**Features:** parallel HTTP checks (6 services in <1s), status icons (up/degraded/down/timeout), latency bars, category grouping (infra/app/site/social), critical service alerts, history tracking (last 100 checks), uptime percentages, latency stats (avg/min/p95/max), watch mode for continuous monitoring
**Services:** anivia, ventok.eu, collabo, supabase api, health dashboard, moltbook profile
**Aliases:** `arc pulse`, `arc ping`, `arc uptime`
**First run:** 6/6 up, 100% operational, avg 86ms. ventok.eu fastest (11ms), anivia slowest (195ms vercel cold start).
**Why:** 6+ production services, no unified way to check them. Pairs with `arc health` (workspace) and `arc shield` (security) — now we have operational monitoring. History accumulates over heartbeats for real uptime trends over time.

### 2026-02-13: Environment Variable Audit Dashboard
**What:** `arc env` — scans workspace for .env files, compares examples vs actual, finds drift
**Commands:** `arc env`, `arc env <project>`, `arc env --drift`, `arc env --shared`, `arc env --security`
**Features:** example-vs-actual comparison (missing vars, extra undocumented vars, placeholder values), shared key detection across projects, gitignore coverage checks, per-project breakdown with visual bars, health score 0-100, actionable recommendations
**Security:** NEVER displays actual values — only key names and status
**Flags:** `--drift` (detailed drift), `--shared` (cross-project keys), `--security` (security only), `--short` (one-liner), `--json` (machine-readable)
**Aliases:** `arc env`, `arc envs`
**First run:** 8 files, 24 vars, 5 projects — found 5 undocumented vars (in actual but not examples), 2 missing env files, 1 shared sensitive key (OPENAI_API_KEY across 2 projects). Health: 90/100.
**Why:** Env drift is a silent killer — you add a var locally but forget the example, then CI fails or onboarding breaks. Companion to `arc shield` (security) and `arc clean` (hygiene). First run found real issues nobody would've caught manually.

### 2026-02-12: Personal Code Snippet Library
**What:** `arc snip` — save, search, and retrieve code snippets from workspace files
**Commands:** `save <name> <file> [lines]`, `get <name>`, `search <query>`, `tag <name> <tags>`, `delete <name>`, `list`, `stats`
**Features:** auto-tagging (detects language from extension + content patterns like RLS/React/async), line range extraction (10-25, 10:15, 10), fuzzy name matching on miss, tag-based grouping, scored search (name > tag > description > source > content), `--copy` mode for piping raw content, `--json` for machine-readable output
**Storage:** `memory/snippets.json` — portable, greppable, no external deps
**Seeded with:** 5 anivia patterns — rls-helper (SECURITY DEFINER recursion fix), supabase-admin (service-role client), hmac-token (signed tokens with timing-safe verify), rls-pattern (org-scoped policies + junction tables), unsubscribe-api (safe no-auth endpoint)
**Aliases:** `arc snip`, `arc snippet`, `arc snippets`
**Why:** Ron works with recurring patterns across projects — supabase RLS, Next.js API routes, crypto tokens. Every time he writes a new migration or endpoint, the same structural patterns appear. Instead of grep-searching through migrations, `arc snip get rls-helper` instantly outputs the proven pattern with line numbers and source file. Like a personal gist library, but local, instant, and auto-tagged.

### 2026-02-11: Workspace Hygiene Scanner
**What:** `arc clean` — finds and fixes workspace cruft
**Scans:** large files (>5MB), temp/junk files (.DS_Store, *.swp, *~), empty directories, .next build caches, stale git branches (merged or >30 days), node_modules installs (with orphan detection), git gc opportunities (loose objects)
**Report:** disk breakdown (node_modules/caches/git), per-category listings, hygiene score 0-100 with progress bar, actionable recommendations
**Fix mode:** `--fix` safely cleans temp files, empty dirs, .next caches, runs git gc — never touches node_modules or branches (manual review only)
**Flags:** `--fix` (apply safe cleanups), `--short` (one-liner), `--json` (machine-readable)
**Aliases:** `arc clean`, `arc tidy`, `arc sweep`
**First run:** reclaimed 155MB — cleared 4 .next caches (139MB), removed 2 empty dirs, git gc'd 6 repos (16.3MB saved, 14k+ loose objects packed). Hygiene score went from 78 → 90/100.
**Also found:** 2 merged branches in anivia (feature/campaign-hub, feature/prospects-view) — flagged for manual review.
**Why:** Ron has 1.5GB workspace across 5+ repos. Caches accumulate, git objects pile up, stale branches linger. No existing tool covered disk hygiene — `arc health` checks project health, not file system health. First run actually reclaimed 155MB. The kind of tool you run weekly to keep things tight.

### 2026-02-10: Project Focus Mode
**What:** `arc focus` — deep project context loader for "where was I?"
**List mode:** `arc focus` shows all projects sorted by last activity, with dirty/clean status, branch, and last commit
**Focus mode:** `arc focus <project>` dumps everything needed to resume work:
- **Resume point** — one-liner combining last commit, dirty files, unpushed commits, blockers, and last discussion topic
- **Package info** — name, version, dep counts, available scripts
- **File overview** — total files + extension breakdown
- **Git status** — branch, uncommitted files (with M/?/A status), unpushed count, last 5 commits with hash + message + age
- **Open tasks** — pulled from tasks/active.md + project-local TASKS.md, with blocked items highlighted separately
- **Key context** — project section from MEMORY.md (status, stack, decisions)
- **Recent discussions** — last 7 days of daily log mentions, grouped by date, showing section headers
**Aliases:** mundo→tuner, cm→context-memory, vsite→ventok-site, discord→discord-voice-bot
**Flags:** `--short` (one-liner per project), `--json` (machine-readable)
**Why:** ron switches between 5+ projects daily. yesterday was mundo, day before was anivia. each time there's a "where was I?" moment. `arc focus mundo` answers that in 2 seconds — last commit, dirty files, open tasks, what was discussed, blockers. like picking up a notebook exactly where you left off.

### 2026-02-09: Workspace Diff / Overnight Changelog
**What:** `arc diff` — unified "what changed?" view across the entire workspace
**Scans:** all git repos (commits, diffstat, file categories), memory files (created/modified), task completions, MEMORY.md modifications
**Shows:** total commits + insertions/deletions with visual diff bar, per-repo breakdown with file category counts (scripts/src/docs/config/styles/tests), commit previews (hash + message + age), memory file changes, completed tasks, hourly activity heatmap (UTC)
**Flags:** `--hours N` (last N hours), `--days N` (last N days), `--since YYYY-MM-DD` (specific date), `--short` (one-liner summary), `--json` (machine-readable)
**Aliases:** `arc diff`, `arc changes`
**Default:** last 24 hours — perfect for "what happened while I slept?"
**Also fixed:** added missing `arc shield` and `arc diff` case routing in arc CLI (shield was silently unreachable via wrapper)
**Why:** ron has an AI that builds things at night. now he has one command to see exactly what happened: `arc diff`. wake up, run it, get the full picture. also useful for "what did we ship this week?" (`arc diff --days 7`).

### 2026-02-08: Workspace Security Scanner
**What:** `arc shield` — scans workspace for exposed secrets, supply chain risks, and security hygiene issues
**Scans:** 15 secret patterns (AWS, GitHub PAT, Stripe, OpenAI, Slack, Telegram, SendGrid, etc.), .env files vs gitignore coverage, git remotes for embedded credentials, package.json lifecycle hooks (postinstall/preinstall), git/URL dependencies, suspicious code patterns (eval, obfuscated hex, Function constructor), file permissions
**Features:** severity scoring (critical/high/medium/low/info), auto-detects nested git repos and submodules (checks each repo's own .gitignore), security score 0-100 with progress bar, auto-fix mode for safe remediations, skips gitignored secrets (shown as info), suppresses false positives from template variables and markdown examples
**Flags:** `--quick` (secrets + git only), `--fix` (auto-fix safe issues), `--json` (machine-readable)
**Fixes applied during build:**
- Stripped embedded GitHub PAT from anivia git remote (was `ghp_...@github.com`)
- Added `.env`, `.env.local`, `.env.*.local` to root .gitignore
- Score went from 0/100 → 70/100 (full scan) / 91/100 (quick scan)
**Born from:** ClawdHub supply chain attack discussion (2026-02-07) — yesterday ron and i dissected how a malicious skill targeted AI agents. the best time to harden was before the breach. the second best time is now.
**Why:** Security tooling that runs in 2 seconds and catches real issues. Found an actual embedded PAT token in a git remote on first run. The kind of thing that sits quietly in `.git/config` until someone pushes to a public repo.

### 2026-02-07: Project Context Generator
**What:** `arc context <project>` — auto-generates structured context documents from any project directory
**Scans:** package.json (deps categorized by role: framework, database, auth, AI, styling, UI, testing, email, payments, state), Next.js routes (pages + API endpoints), component tree, Supabase schema (tables, functions, RLS policies from migrations), environment variables (.env.example or source-scanned process.env refs), design system (CSS variables, tailwind config, cn() helper), git info (sanitized — strips embedded tokens), file tree visualization
**Output:** Markdown context doc structured like a human-written PROMPT.md — overview, tech stack, file structure, routes, components, database schema, env vars, design system, configuration, scripts, notes section for manual additions
**Flags:** `--save` (write CONTEXT.md to project dir), `--json` (machine-readable), no args = list all projects with context status
**Aliases:** `arc context`, `arc ctx`
**Security:** auto-strips GitHub PAT tokens from git remote URLs before output
**Why:** Yesterday ron manually wrote a comprehensive PROMPT.md for mundo/tuner — detailed enough for any agent to pick up the project. That took ~30 minutes of careful work. This tool generates 80% of that in 2 seconds. Run `arc ctx anivia` and get routes, components, 26 migrations worth of schema, design tokens, the works. The remaining 20% (product vision, architecture decisions, conventions) stays human-written — that's what the Notes section is for.

### 2026-02-06: Project Context Generator
**What:** `arc context <project>` — auto-generates structured context docs from any project codebase
**Scans:** package.json, routes, components, supabase migrations, env vars, design system (CSS vars), git info (branch, commits, remote)
**Features:** auto-detects tech stack (Next.js, React, Supabase, Stripe, etc.), strips secrets (PAT tokens, API keys) from output, route group stripping for Next.js app router, design system extraction from globals.css
**Flags:** `--save` (write CONTEXT.md to project), `--json` (machine-readable)
**Aliases:** `arc context`, `arc ctx`
**Tested on:** anivia (321 lines, 200 files, 56 routes), tuner (22 files, 7 routes), context-memory, ventok-site
**Why:** Ron spent 30 min manually writing PROMPT.md for mundo. Now `arc ctx tuner --save` generates 80% of that in 2 seconds. Any project gets a structured context doc that lets anyone (human, codex, agent) pick up the work immediately.

### 2026-02-05: Workspace Health Dashboard
**What:** `arc health` — unified health check across all workspace systems
**Combines:** memory coverage, git hygiene, task velocity, project activity
**Metrics:**
- Memory: days logged this month, coverage %, current streak, total logs
- Git: dirty repos, unpushed commits, stale repos (>14 days)
- Tasks: open/done/blocked counts, velocity (completion %)
- Projects: active (≤7d), stale (>30d), recent activity list
**Features:** weighted overall score (0-100), progress bars, color-coded health levels (💚💛🟠🔴), actionable recommendations, motivational closers
**Flags:** `--short` (one-liner summary), `--json` (machine-readable)
**Why:** Ron has `arc git`, `arc wins`, `arc blockers` — but no single command to see "am I keeping up with my systems?" Now there is. Run it every morning with coffee.

### 2026-02-04: Wins Tracker
**What:** `arc wins` — extract recent accomplishments from daily logs
**Scans:** memory/*.md files for completed work, shipped features, task codes
**Detects:** `### feature — description` headers, `**bold** — desc` bullets, ERR-/PERF-/SEC- task codes, [x] checked items
**Features:** categorizes by type (feature/fix/ship/improve/docs), detects projects, deduplicates similar wins, importance ranking (high/medium/low)
**Flags:** `--week` (group by week), `--project` (group by project), `--json`, `--verbose` (show all)
**Stats:** total count, breakdown by project & type, motivational closer
**Why:** easy to forget what you've accomplished. run `arc wins` before standups, when feeling stuck, or just to remember you're making progress. morale boost via CLI.

### 2026-02-03: Multi-Repo Git Dashboard
**What:** `arc git` — one command to see git status across all workspace repos
**Scans:** all `.git` directories up to 3 levels deep (currently 6 repos: clawd, anivia, context-memory, ventok-site, discord-voice-bot, context-memory/api)
**Shows:** branch, uncommitted changes (staged/modified/untracked), unpushed commits, last commit (message + author + age), stale branch warnings (>14 days), missing upstream detection
**Features:** dirty repos sorted first, action items at bottom, color-coded status icons (● dirty, ▲ unpushed, ✓ clean, ○ no remote)
**Flags:** `--short` (one-liner per repo), `--json` (machine-readable), `<repo>` (filter by name)
**Aliases:** `arc git`, `arc repos`
**Why:** ron manages 5+ repos across projects. morning workflow = `arc git` to see what needs pushing, committing, or cleaning. the kind of command you run before your first coffee.

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

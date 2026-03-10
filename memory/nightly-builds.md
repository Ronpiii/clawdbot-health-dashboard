# Nightly Builds

Ron wants me to build something small but helpful every night while he sleeps.

**Schedule:** 2:00 AM Tallinn time (00:00 UTC)
**Scope:** Small, testable improvements
**Goal:** Wake up surprised

## Ideas Backlog

_Add new ideas here. Pick one per night._

- [ ] Voice memo transcription — process voice notes into actionable items
- [x] Email preview component for anivia — see how emails look before sending
- [ ] Bulk email drafting UI for anivia — select leads → draft all

---

## Completed Builds

### 2026-03-10: Email Preview Component for Anivia
**What:** `<EmailRenderer>` component + live preview toggle in send-email-modal
**Files:** `src/components/email/email-renderer.tsx` (new), `src/components/leads/send-email-modal.tsx` (updated)
**Features:**
- Renders email in realistic email client style (header with To/From/Subject, styled body)
- Parses basic formatting: **bold**, *italic*, links
- Integrated into send-email-modal with Preview/Edit toggle button
- Preview disabled until subject and body are filled
- Toggle between editing and preview without losing form data
**UX:** Users compose email → click Preview button → see exactly how it renders → toggle back to Edit if needed → Save Draft. No surprises when the email lands in a recipient's inbox.
**Why:** Users often wonder "how will this actually look?" Especially important for emails with formatting or links. The preview removes uncertainty. Small component but high UX value.
**Size:** 2 files, ~220 lines of code
**Tested:** Syntax verified, component structure follows existing anivia patterns

### 2026-03-09: End of Day Closing Ritual
**What:** `arc eod` — the evening counterpart to `arc brief`. a structured closing ritual that summarizes the day, captures loose threads, and sets up tomorrow.
**Commands:** `arc eod`, `arc eod --quick`, `arc eod --append`, `arc eod --post`, `arc eod --short`, `arc eod --json`
**Sections (4):**
- **Today's Work** — commits (by repo), completed tasks, log sections covered
- **Loose Threads** — in-progress tasks, dirty repos, unpushed commits, TODOs added today
- **Closure Rate** — finished vs started ratio with visual bar (target: 80%+)
- **Tomorrow's Top 3** — auto-generated priorities from in-progress, git hygiene, and open tasks
**Features:** multi-repo git scanning, task extraction from daily logs + tasks/active.md, closure rate calculation (measures how much you tied up vs left hanging), priority scoring for tomorrow's suggestions, motivational closers, optional --append to daily log, optional --post to Discord #logs
**Closure formula:** `finished / (finished + in_progress + todos_added)`. 80%+ = clean close. <50% = open-heavy (lots carrying forward). the number gamifies daily closure — aim to tie up threads before bed.
**Aliases:** `arc eod`, `arc evening`, `arc close`
**First run:** 100% closure (quiet night — it's midnight), 2 loose threads (uncommitted clawd + anivia), tomorrow's priorities auto-derived from tasks/active.md (TMW meeting prep, ventok outreach)
**Relationship to other tools:** `arc brief` answers "what do I need to know this morning?" `arc eod` answers "what happened today and what's carrying over?" they're bookends. run brief with morning coffee, run eod before bed. together they frame the workday with context.
**Born from:** 35 nightly builds, each adding a specialized tool. `arc brief` handles the morning ritual. but there was no evening counterpart — no structured way to close the day, capture what's unfinished, and set up tomorrow. `arc eod` fills that gap. the closure rate is the key insight: it measures whether you're finishing things or just starting them. a low closure rate over time means too many open threads, too much context switching, not enough completion.
**Why:** ron works across multiple projects with lots of in-flight work. the danger isn't starting things — it's forgetting what's unfinished. `arc eod` forces the review: what did I do, what's hanging, what's tomorrow's focus. the --append flag makes it easy to log the summary. the --post flag shares it. the closure rate turns daily completion into a game you can win.

### 2026-03-08: Session Handover Generator
**What:** `arc handover` — auto-generates handover context for session transitions, model switches, or long breaks
**Commands:** `arc handover`, `arc handover --hours N`, `arc handover --append`, `arc handover --json`
**Extracts:**
- Recent commits (last N hours) with file category breakdown
- Decisions from today's daily log (pattern matching for "decided", "chose", "going with", Key Decisions sections)
- In-progress items (WIP, "working on", "started" patterns)
- Open tasks from tasks/active.md (in-progress/active sections)
- Next steps derived from context (continues, tasks, review suggestions)
**Features:** multi-repo scanning (clawd + projects/*), file categorization (scripts/source/docs/config/styles/tests/database/component), configurable time window (default 8h), markdown output ready for daily log, JSON mode for automation, --append to directly add to today's log
**Aliases:** `arc handover`, `arc handoff`
**First run:** extracted 8 commits from past 8 hours, 17 files touched across 4 categories (docs, config, other, scripts), auto-derived review suggestion for docs changes
**Born from:** AGENTS.md mandates a handover protocol — before any model switch or long session end, write a HANDOVER section covering: what was discussed, what was decided, pending tasks, current state, next steps. this is tedious to do manually, especially when context is heavy. `arc handover` auto-generates 80% of it from git activity + daily log patterns + task state.
**Why:** context loss between sessions is real. you come back after sleep and wonder "where was I?" the handover protocol exists, but compliance is inconsistent because it's manual. now it's one command: `arc handover --append` and the draft is in your log. review it, add nuance, done. the tool that automates the thing AGENTS.md already told us to do.

### 2026-03-05: Unified Staleness Detector
**What:** `arc stale` — scans 6 dimensions for things going cold: stale tasks, idle projects, dead branches, cold contacts, aging ideas, and dropped threads (TODO/WIP markers in daily logs)
**Commands:** `arc stale`, `arc stale --tasks`, `arc stale --projects`, `arc stale --branches`, `arc stale --contacts`, `arc stale --ideas`, `arc stale --threads`, `arc stale --top N`, `arc stale --days N`, `arc stale --short`, `arc stale --json`
**Features:** severity-weighted ranking (critical=30d+, high=14d+, medium=7d+), per-category filtering, entropy score (0-100 measuring workspace rot level), triage suggestions (top criticals + highs with actions), age bars (proportional to oldest item), actionable verdicts per item type ("archive or revive", "build it, task it, or kill it", "finish it, delegate it, or cross it off"), category icons (☐/◈/⑂/◉/✦/↩)
**Scanners (6):** tasks (unchecked items in tasks/active.md, age estimated by last daily log mention), projects (git repos with stale last-commit dates), branches (merged branches + inactive branches across all repos), contacts (curated registry — companies + key people, scanned against daily logs for last mention), ideas (items from tasks/ideas.md with git-blame-level dates), threads (TODO/WIP/TBD/FIXME markers in daily logs — NOT section headers, which were too noisy)
**Design decisions:** thread detection went through 3 iterations. v1 (section headers) produced 312 false positives — daily log headers like "rls fix" and "supabase" were flagged as "dropped threads" when they were just section descriptions. v2 added aggressive boring-topic filtering but still hit 178. v3 switched strategy entirely: instead of headers, scan for explicit open-item markers (unchecked `- [ ]` items and TODO/WIP/TBD/FIXME in prose). this dropped to 4 genuine items — all real signals. the lesson: section headers describe what HAPPENED, not what's OPEN. explicit markers describe intent.
**Entropy score:** weighted severity sum / max possible. 0 = everything fresh, 100 = everything rotting. labels: <20 "low — workspace is tight", <40 "manageable", <70 "moderate", 70+ "high entropy — things are rotting"
**Aliases:** `arc stale`, `arc cold`, `arc rot`, `arc entropy`
**First run:** 20 items, entropy 75/100 (high). 2 critical projects (collabo-v2 + context-memory, 30d idle). 6 aging ideas (all 40d old, from initial ideas.md creation). 2 merged anivia branches safe to delete. 1 cold contact (Anna, 3 weeks). 1 stale task (anivia phase 2). 4 real dropped threads from daily logs (TODO markers).
**Relationship to other tools:** `arc contacts --cold` shows cold contacts. `arc git` shows dirty/stale repos. `arc blockers` shows blocked items. `arc todo` shows unchecked tasks. `arc stale` is the UNION — one command that pulls staleness signals from ALL dimensions. run `arc stale` weekly (or on heartbeat) to catch things silently going cold before they become dead weight. each category links back to the dedicated tool for detail.
**Born from:** 34 nightly builds, each adding a quality/health tool that checks one dimension. but nothing answered "what am I forgetting about?" across ALL dimensions simultaneously. `arc stale` is the anti-entropy tool — the unified "things going cold" detector. for a solo operator juggling 9 projects, the biggest risk isn't bad code, it's dropping threads. context memory is human memory, and human memory leaks. `arc stale` catches the leaks.
**Why:** entropy always wins unless you fight it deliberately. open tasks age silently. merged branches pile up. ideas sit in backlogs forever. contacts go cold. the cognitive overhead of keeping track of "what am I dropping?" is real and invisible. `arc stale` makes it visible and actionable. the entropy score gamifies workspace hygiene — watch it drop as you triage. the per-item actions ("archive or revive", "build it, task it, or kill it") force binary decisions instead of perpetual deferral.

### 2026-03-04: Work Rhythm Analyzer
**What:** `arc pace` — analyzes git commit timestamps to reveal natural work patterns: peak productive hours, session types (flow/deep/sprint/scattered), break patterns, day-of-week strength, and scheduling recommendations
**Commands:** `arc pace`, `arc pace --sessions`, `arc pace --recommendations`, `arc pace --week`, `arc pace --days N`, `arc pace --short`, `arc pace --json`
**Features:** hourly heatmap with peak detection (contiguous clustering algorithm), time block breakdown (morning/afternoon/evening/night), day-of-week chart with deep session counts, session type classification (flow=3h+6commits, deep=2h+, sprint=intense<2h, scattered=quick touches), break analysis (short/medium/long with avg), context switch rate per session, scheduling recommendations engine (peak window, meeting slots, break health, deep work ratio, best day, longest flow achievement)
**Analysis sections:** hourly rhythm (24h heatmap), time blocks (5 periods with bars), day-of-week (Mon-Sun with deep counts), session types (4 types with time allocation), metrics (6 key numbers), recommendations (actionable scheduling advice)
**Design decisions:** contiguous peak-hour clustering prevents useless wide ranges (e.g., "02:00-16:00" → "14:00-17:00"). Tallinn timezone (UTC+2) applied to all calculations. break analysis ignores gaps >14h (overnight). session classification is exclusive hierarchy: flow > deep > sprint > scattered. 50-min gap threshold (same as wakatime/git-hours). 30-min assumed pre-first-commit work per session.
**Aliases:** `arc pace`, `arc rhythm`, `arc tempo`
**First run (30 days):** 246 commits, 91 sessions, 63.7h total. peak: 14:00-17:00 tallinn. strongest day: Monday (17h44m, 3 deep sessions). time split: night 37%, afternoon 34%, evening 22%, morning 6%. session types: 60% scattered, 22% deep, 11% flow, 10% sprint. longest flow: 3.5h / 32 commits (anivia+clawd sprint). deep work ratio: 22%. context switches: 0.2/session (project-focused).
**Relationship to other tools:** `arc time` answers "how many hours?" (total tracking). `arc orbit` answers "is momentum up or down?" (week-over-week trend). `arc pace` answers "WHEN and HOW do I work best?" — the qualitative rhythm, not just the quantity. `arc time` tells you the hours. `arc pace` tells you the pattern. use `arc time` for invoicing, `arc pace` for scheduling. together they answer "am I spending my time wisely?"
**Born from:** 33 nightly builds, each producing git activity data. `arc time` tracks hours but doesn't analyze RHYTHM — when are you sharpest? when should you schedule meetings vs deep work? how long are your natural sessions? `arc pace` turns git history into a personal productivity profile. like a fitness tracker, but for code. the recommendation engine turns passive data into active scheduling advice: "protect 14:00-17:00 for deep work, schedule meetings at 09:00." one command, and you know your own patterns better than you thought.
**Why:** ron works across 9 projects, sometimes late nights, sometimes afternoon sprints. without a time tracker (no wakatime, no toggl), the only signal is git. `arc pace` reads that signal and finds the rhythm underneath. the finding that Monday is his strongest day (3 deep sessions vs 0 on most other days) is the kind of insight that changes how you plan your week. the 22% deep work ratio is a flag — too many scattered sessions means too much context switching. `arc pace` makes the invisible visible.

### 2026-03-03: Pre-Deploy Flight Checklist
**What:** `arc ship` — 5-check battery that answers "is it safe to deploy?" in one command
**Commands:** `arc ship`, `arc ship anivia`, `arc ship --quick`, `arc ship --fix`, `arc ship --short`, `arc ship --json`
**Checks (5):** git state (uncommitted, unpushed, merge conflicts, stale branches, wrong branch), code review (console.logs, debuggers, `any` types, hardcoded secrets, eslint-disable, TODOs in diff), service health (production endpoints up + latency, parallel checks), env audit (.env drift vs example, gitignore coverage, undocumented vars), lockfiles (stale node_modules, missing lockfiles, non-reproducible builds)
**Features:** weighted composite score (git 30%, review 25%, services 20%, env 15%, lockfiles 10%), three-tier verdict engine (SHIP ≥75 green, HOLD 50-75 yellow, ABORT <50 or criticals red), per-project filtering, auto-fix mode (pushes unpushed commits), quick mode (git + review only, skips network checks), CI-friendly exit codes (0=ship, 1=hold, 2=abort), fixable issue detection
**Verdict engine:** criticals (merge conflicts, exposed secrets, .env not gitignored) are instant ABORT. high-severity count >3 triggers HOLD. otherwise score-based: ≥75 SHIP, ≥70 HOLD, <70 HOLD. score ≥90 gets "clean slate, send it" message.
**Aliases:** `arc ship`, `arc deploy`, `arc preflight`
**First run (full workspace):** score 86/100 HOLD — 4 dirty repos (clawd, anivia, context-memory, tuner), 1 unpushed commit in tuner, 2 stale lockfiles. review: clean (100). services: 3/3 up (100), avg 51ms. env: 85 (3 undocumented vars in anivia, 4 deployed-only projects without local .env). per-project: `arc ship anivia` → 98/100 SHIP.
**Design decisions:** env severity tuned carefully — missing .env.example→actual is low severity (many projects deploy remotely, don't need local .env). service checks use HEAD requests with 8s timeout. stale branch detection at 14d threshold (info-level, doesn't tank score). diff-based review is lightweight (just checks git diff HEAD for added lines) rather than running full `arc review` which would be slow.
**Relationship to other tools:** `arc review` checks code quality in depth (13 checks, per-commit analysis). `arc pulse` checks services in depth (6 endpoints, history tracking). `arc env` does full env audit (shared keys, security). `arc shield` does security scanning. `arc ship` is the INTERSECTION — it runs a lightweight version of each, combined into a single go/no-go gate. run `arc ship` before every deploy; if something flags, run the dedicated tool for details.
**Born from:** 32 nightly builds, each solving one dimension. but the pre-deploy ritual was: check git, run review, check services, hope nothing's wrong. `arc ship` collapses that into one command. the solo developer's CI pipeline — no GitHub Actions needed, just `arc ship && git push`.
**Why:** ron deploys from multiple machines to multiple services. the "oh shit, I pushed debug console.logs" or "wait, is production even up?" moment happens after the push, not before. `arc ship` moves the quality gate to BEFORE the push. the three-tier verdict (SHIP/HOLD/ABORT) is deliberately simple — you don't need a 47-item checklist, you need a traffic light.

### 2026-03-02: Morning Intelligence Brief
**What:** `arc brief` — one command, one screen, everything that matters. the daily standup for a solo operator.
**Commands:** `arc brief`, `arc brief --short`, `arc brief --json`
**Sections (6):** overnight changes (commits + modified files from last 8h), service status (4 endpoints checked in parallel), top priorities (ranked from tasks/active.md + git state, max 3), contacts needing follow-up (company/prospect cold detection, 7d threshold), workspace vitals (bench score + streak + momentum + disk usage), fortune (random wisdom from past self)
**Features:** all 6 data collectors run in parallel (<2s total), service health with critical-down alerts, priority scoring engine (section weight + revenue/launch/block modifiers), company-focused cold contact tracking (not agents/people — the ones that matter for sales), vitals pulled from bench snapshots + orbit snapshots + disk, contextual closers (rotating motivational one-liners), short mode gives 3-line executive summary
**Design:** deliberately NOT another dashboard. no bars, no charts, no scores-within-scores. just FACTS in priority order. the brief reads like a telegram dispatch, not a spreadsheet. optimized for "glance at phone, know everything" speed.
**Aliases:** `arc brief`, `arc intel`
**First run:** quiet night (no overnight commits, it's midnight), 4/4 services up (avg 279ms), top priority: TMW meeting prep [105], bench 57/100 C, 38d streak, disk 37%. the short mode: `brief: quiet night · 4/4 up · bench 57 C → TMW meeting prep`
**Relationship to other tools:** `arc diff` answers "what changed?" (git-focused, detailed). `arc plan` answers "what should I do?" (task-focused, ranked). `arc bench` answers "how healthy is the workspace?" (score-focused). `arc brief` answers "what do I need to know RIGHT NOW?" — it's the executive summary of all three plus services + contacts + fortune. run `arc brief` first, then dive into whichever section needs attention.
**Born from:** 31 nightly builds, each producing its own view. plan shows tasks. diff shows changes. bench shows health. pulse shows services. contacts shows relationships. fortune shows wisdom. but to get the morning picture, you had to run 3-4 of them. `arc brief` collapses that into one call. the morning ritual becomes: `arc brief` → read → start working. 10 seconds, full situational awareness.
**Why:** ron manages 9 projects, 6 production services, a sales pipeline, and a workspace with 38 days of accumulated context. the cognitive load of "what's going on?" is real. `arc brief` is the newspaper on the doorstep. scan it with coffee, know where you stand, start your day. it doesn't tell you everything — it tells you what MATTERS.

### 2026-03-01: Workspace Benchmark
**What:** `arc bench` — runs all 8 quality/health tools in parallel, extracts scores, produces a weighted composite rating with radar chart visualization and trend tracking
**Commands:** `arc bench`, `arc bench --short`, `arc bench --trend`, `arc bench --fast`, `arc bench --json`
**Dimensions (8):** health ♥ (20%, workspace state), security ⛨ (15%, secrets/deps/permissions), debt △ (15%, TODOs/any/nesting/console.logs), integrity ⚯ (10%, broken references), services ◉ (10%, production endpoints), env ⚙ (10%, env var coverage), momentum → (10%, week-over-week trajectory), hygiene ✦ (10%, disk cruft/caches)
**Features:** parallel execution (all 8 checks in ~2s), weighted composite score 0-100 with letter grade (A-F), ASCII radar chart showing score shape, dimension breakdown with score bars, focus areas (weakest dimensions) and strengths (strongest), snapshot persistence (keeps last 90 runs in `memory/bench-snapshots.json`), trend view with sparkline history and delta tracking, fast mode (skips slow checks like pulse/debt), JSON output for automation
**Scoring:** weighted average — health 20%, security+debt 15% each, the rest 10% each. momentum maps from -100..100 → 0..100. hygiene derived from issue counts. env from missing/total ratio.
**Aliases:** `arc bench`, `arc benchmark`, `arc score`
**First run:** 57/100 grade C ("middling"). strengths: services 100 (all 6 endpoints up), security 86, hygiene 85. weaknesses: health 26 (start of new month = 0 days logged), integrity 27 (broken references from project renames), debt 40 (525 items across 7 projects). the composite score is deliberately honest — it weights health heavily (20%) because workspace discipline matters most.
**Born from:** 30 nightly builds, each adding a quality tool with its own score. health 0-100. shield 0-100. debt 0-100. clean, env, mirror, pulse, orbit — all producing scores. but no single number answers "how healthy is my workspace RIGHT NOW?" across all dimensions. `arc bench` is the unified credit score. run it daily (or on every heartbeat), watch the sparkline. the radar chart shows the SHAPE of your quality — some workspaces are secure but indebted, others are clean but stale. the shape matters as much as the number.
**Why:** you can't improve what you don't measure. `arc bench --short` gives the one-liner: `bench: 57/100 C — middling`. that number should go up over time. `arc bench --trend` shows if it is. the first snapshot establishes the baseline. from here, every improvement is visible: fix broken references → integrity goes up → composite climbs. delete debug console.logs → debt drops → score improves. the gamification is quiet but real — "can i get to 70 this month?"

### 2026-02-28: Relationship Intelligence
**What:** `arc contacts` — extracts people, companies, and agents from daily logs + MEMORY.md, builds a relationship map with timelines, co-occurrence graphs, and cold contact detection
**Commands:** `arc contacts`, `arc contacts <name>`, `arc contacts --cold`, `arc contacts --companies`, `arc contacts --people`, `arc contacts --timeline`, `arc contacts --graph`, `arc contacts --new`, `arc contacts --short`, `arc contacts --json`
**Features:** curated contact registry with aliases (16 contacts: 2 people, 6 companies, 8 moltbook agents), section-level co-occurrence tracking (who appears together), weekly activity timeline grid, deep dive per contact (mentions, first/last seen, avg gap, connected contacts, chronological context snippets), cold contact detection (>7 days silent with last interaction context), new contact detection (first appearance in last 7 days), auto-discovery of unregistered @handles from memory files, status indicators (green=active ≤3d, yellow=recent ≤7d, orange=cooling ≤14d, red=cold >14d)
**Views:** overview (all contacts ranked by recency, mention bars, type/role), companies-only (prospect pipeline view), deep dive (full timeline of interactions per contact), cold (gone-silent contacts with last context), new (recently appeared), timeline (weekly heatmap grid), graph (co-occurrence pairs ranked by strength), short (one-liner per contact), JSON (machine-readable)
**Also fixed:** `arc review`, `arc cr`, `arc mirror`, `arc refs` were missing from the switch router — they existed in the SCRIPTS map but had no case statements. all now wired correctly.
**Aliases:** `arc contacts`, `arc people`, `arc relationships`
**First run:** 16 contacts, 30 active days. ron dominates at 176 mentions across every day. TMW is the most-mentioned company (16 mentions, 2 days, cooling). Nordora Wood is recent (10 mentions, 4d ago). 3 prospects have gone cold (Luminor, Veho Tartu, Noar — all >1mo). strongest co-occurrence: ron↔Noar (5 shared sections), ron↔TMW (4). moltbook agents cluster together (eudaemon↔Pith↔Jackle↔XiaoZhuang all co-occur from the same activity log). Strantum is newest (first seen yesterday, the AI one-shot discussion).
**Born from:** yesterday's strategic conversation about a "relationship OS for small operators." ron described the exact problem: no single view of prospect/client state, follow-ups depend on memory, everything between reach-out and close lives in his head + scattered emails. `arc contacts` is the prototype — it already extracts relationship intelligence from existing memory files. shows who's active, who went cold, the full interaction timeline. the moat ron described (accumulated relationship intelligence that compounds over time) — this is the seed.
**Why:** ron has 6 companies in his pipeline (5 prospects + 1 client) and no CRM. the relationship context exists — it's scattered across 35 daily logs. `arc contacts --companies` gives the pipeline view. `arc contacts TMW --cold` shows what went silent. `arc contacts --new` shows who just appeared. together they answer "who should i follow up with?" without opening a single file. and if the relationship OS becomes a real product — this is the algorithm proving the concept.

### 2026-02-27: Cross-Reference Integrity Checker
**What:** `arc mirror` — scans all workspace markdown for references that no longer resolve: broken file paths, missing scripts, unknown arc commands, and dead URLs
**Commands:** `arc mirror`, `arc mirror --urls`, `arc mirror --short`, `arc mirror --json`
**Features:** workspace-aware file path validation (only checks workspace-level paths, ignores project-internal src/app/lib refs), arc command router validation (checks against actual SCRIPTS map), script existence checking, smart URL validation (skips localhost, example domains, rate-limited domains; parallel batch checking), severity scoring (scripts=high, active doc refs=high, others=medium, dates=low), integrity score 0-100, broken ref grouping by type, suggestion system (closest-match for renamed files), template reference suppression (BOOTSTRAP.md, SKILL.md, YYYY patterns)
**False positive suppression:** the hardest part after `arc review`. initial run had 186 "broken" refs — 90% were false positives from API routes (`/api/leads/export`), project-internal paths (`src/components/foo.tsx`), generic words matching the project regex ("list", "done", "tool"), and prose words matching the arc command regex ("feel", "clearly"). solution: restrict file paths to workspace-level directories only (scripts/, memory/, tasks/, etc.), require arc commands to be in backticks, and restrict project matching to explicit `--project` flags. also added URL-specific score weighting (dead URLs are informational, not structural).
**Aliases:** `arc mirror`, `arc refs`, `arc integrity`
**First run (no URLs):** 279 refs checked across 160 files. 14 broken: 1 high severity (advance-sequences.mjs missing from scripts/ but referenced in HEARTBEAT.md — silently failing every heartbeat), 11 broken file paths (old project name `ventok-site`, deleted prompt files, moved source files), 2 unknown arc commands (`arc cl`, `arc achievements` mentioned in logs but never built).
**First run (with URLs):** 425 refs checked, 146 URLs. 47 broken total. key dead URLs: github.com/Ronpiii/mundo (repo renamed to tuner), github.com/ventok/context-memory (doesn't exist), entire ctxmem.dev domain (down), collabo-v2-nq9w.vercel.app (old deployment), payloadcms draft-preview example (removed from repo).
**Critical finding:** HEARTBEAT.md line 14 references `scripts/advance-sequences.mjs` which doesn't exist. this means the anivia sequence advancement step has been silently skipped every heartbeat. high severity — the tool caught a real operational gap on first run.
**Relationship to other tools:** `arc shield` scans for security issues. `arc clean` scans for disk hygiene. `arc debt` scans for code quality. `arc mirror` scans for REFERENCE integrity — the silent rot when files move, projects rename, scripts get deleted but their references persist. together they answer "is our workspace healthy?" from four different angles.
**Born from:** 28 nightly builds, 81 scripts, 160 markdown files, 34 daily logs. the workspace has been growing for a month. things get renamed, deleted, moved. references rot silently. `arc mirror` is the immune system — it catches broken links before you click them 3 months later and wonder why nothing works. the first run found a real operational bug (missing heartbeat script) that was invisible until now.
**Why:** documentation rots faster than code. a deleted file leaves no trace in the files that reference it. a renamed project doesn't update its mentions. a dead URL just sits there until someone clicks it. `arc mirror` makes reference integrity measurable and catchable. run it weekly to keep the workspace honest. the `--urls` flag is optional because URL checking is slow (146 URLs in ~30s) and noisy (domains go down temporarily), but it's worth running monthly to catch genuinely dead services.

### 2026-02-26: Diff-Aware Code Review
**What:** `arc review` — a local code review bot that checks what you JUST changed, not the whole codebase
**Commands:** `arc review`, `arc review --commits N`, `arc review --since YYYY-MM-DD`, `arc review --project <name>`, `arc review --strict`, `arc review --short`, `arc review --json`
**Features:** 13 check types across line-level and file-level analysis, smart false-positive suppression (regex patterns, string literals, CLI scripts excluded), multi-repo scanning, severity-weighted scoring (critical=20, high=10, medium=5, low=2), visual score bar with verdict, breakdown by check type, CI-friendly exit codes (exits 1 when score <40)
**Checks:** console.log additions (skips CLI scripts), TODO/FIXME/HACK/XXX additions, TypeScript `any` types, empty catch blocks, hardcoded secrets/tokens, disabled eslint rules, non-null assertions (strict), magic numbers (strict), nested ternaries, timer leaks in React components, sync I/O in server context, debugger/alert artifacts, large diffs (>300 lines), mass deletions (>100 lines removed), test coverage gaps (strict mode)
**False positive suppression:** the hardest part — a code review tool that scans its OWN source code will flag its own check patterns. solved by detecting when content contains `.test(`, `.match()`, `RegExp`, or string literals that happen to match patterns. also: empty catch blocks with comments are skipped, CLI scripts (`.mjs`, `scripts/`) exempt from console.log checks, template variables and markdown examples excluded from secret detection
**Aliases:** `arc review`, `arc cr`, `arc codereview`
**First run (uncommitted, 4 repos):** 37 files, score 55/100. found 1 real empty catch, 6 nested ternaries in tuner components, 3 large diffs. per-project: `--project anivia --commits 10` found 6 debug console.logs left in campaigns/actions.ts from a debugging session — exactly the kind of thing that ships to prod without a review gate.
**Relationship to arc debt:** `arc debt` is a SNAPSHOT — "how much total debt exists right now?" `arc review` is a DIFF — "what new quality issues did I just introduce?" debt tells you the terrain. review tells you if you're making it better or worse. run `arc debt` weekly, run `arc review` before every push. together they answer "is our code quality trending up or down?"
**Born from:** 26 nightly builds and counting. `arc debt` (last night) scans the whole codebase for accumulated problems. but it can't tell you if YOUR LAST COMMIT made things better or worse. `arc review` fills that gap — it's the pre-push quality gate that catches console.logs you forgot to remove, empty catches you wrote while debugging, the `any` types you added "temporarily." the kind of tool that saves you from the "oh no, I shipped debug logs to production" moment.
**Why:** every professional codebase has a CI linter. solo developers don't. `arc review` is the solo developer's linter — run it before pushing, get a score, fix the obvious stuff. the 13 checks are curated from real patterns found across ron's projects (the first run of `arc debt` revealed what kinds of issues actually accumulate). now those same patterns get caught at the source, before they become debt.

### 2026-02-25: Technical Debt Scanner
**What:** `arc debt` — scans all projects for accumulated technical debt: TODO/FIXME/HACK comments, large files (>300 LOC), console.log debris, TypeScript `any` types, disabled lint rules, deep nesting (callback hell), and god files (high import count)
**Commands:** `arc debt`, `arc debt anivia`, `arc debt --type todos`, `arc debt --type large`, `arc debt --type console`, `arc debt --type any`, `arc debt --type lint`, `arc debt --type nesting`, `arc debt --type imports`, `arc debt --severity high`, `arc debt --trend`, `arc debt --top 20`, `arc debt --short`, `arc debt --json`
**Features:** 7 debt categories with severity ratings (high/medium/low), per-project breakdown with individual scores, density-based scoring (debt per file, not raw totals — so a large clean project scores higher than a small dirty one), debt hotspots (files with the most accumulated debt weighted by severity), snapshot tracking with trend analysis (saves to `memory/debt-snapshot.json`, keeps last 30 scans), type and severity filters for focused views, actionable recommendations based on findings
**Scoring:** uses density formula — weighted debt items per file, exponential decay. 100 = pristine, ~50 = moderate (1.5 debt/file), ~20 = heavy (3 debt/file), 0 = drowning. smart exclusions: CLI scripts excluded from console.log checks (they use console.log for output, not debugging), TODO/FIXME only counted in comments (not string literals or data structures), projects/ subdirectory excluded from root repo walk to prevent double-counting
**Aliases:** `arc debt`
**First run (6 projects, 422 files):** 411 debt items, score 36/100. deep nesting dominates (222 items, 54%). anivia: 170 items but 39/100 (spread across 211 files). context-memory: 103 items but 8/100 (concentrated in 29 files — densest debt). tuner: cleanest at 65/100. top debt hotspot: context-memory/cli/src/index.ts (20 console.logs + 11 `any` types + deep nesting). 114 high-severity items, mostly deep nesting (React JSX + nested callbacks).
**Born from:** `arc hotspots` finds files that change a lot (volatility). `arc debt` finds files that NEED to change (quality). complementary signals — a file that's both hot AND indebted is a ticking bomb. a file that's cold but indebted is maybe dead code. together they answer "where should we invest refactoring time?" the density-based scoring was key — raw item counts penalize large projects unfairly. context-memory has fewer items than anivia, but they're packed into 29 files vs 211. density reveals the real story.
**Why:** 26 arc tools and none answered "how much debt are we carrying?" you can feel it when a file has 15 imports and 400 lines of deeply nested JSX. `arc debt` makes it a number. run it weekly, watch the trend. the snapshot system means you can see if refactoring efforts actually reduced debt or just moved it around. the type filters let you tackle one category at a time: "today i'm killing all the `any` types."

### 2026-02-24: File Change Hotspot Analyzer
**What:** `arc hotspots` — find the most frequently modified files across all projects, surface complexity risk, coupling patterns, and cold code
**Commands:** `arc hotspots`, `arc hotspots anivia`, `arc hotspots --cold`, `arc hotspots --coupling`, `arc hotspots --authors`, `arc hotspots --category`, `arc hotspots --days 7`, `arc hotspots --top 20`, `arc hotspots --short`, `arc hotspots --json`
**Features:** hotspot ranking (top N files by change frequency with heat bars), heat zones (directory-level activity concentration), complexity risk detection (high changes × high churn = danger), co-change coupling analysis (files that always change together with coupling strength %), cold file detection (large code files with zero recent changes — potential dead code or stable foundations), author activity view (who touches what, focus areas by category), category breakdown (component/source/config/docs/database/styles/tests/asset), per-project filtering, configurable time ranges, insights (top-3 concentration %, multi-contributor warnings)
**Aliases:** `arc hotspots`, `arc hot`, `arc churn`
**First run (30d, 7 repos):** 672 files changed, 1,897 total changes. hottest code file: sidebar.tsx (29x, 2 authors). highest complexity risk: lead-generator.ts (21x changes, 2,360 lines churned). strongest coupling: icp-actions.ts ↔ icp-tab.tsx (67% co-change rate). heat zones: memory/ dominates (463 changes), then scripts/ (152), then anivia components. 3 cold files found (990 lines, led by discord-voice-bot/index.js at 699 lines untouched for 3 months). 51 files touched by multiple contributors.
**Born from:** `arc size` tells you what's big. `arc time` tells you when you work. `arc compare` tells you how projects stack up. but none of them answer "which files are the most volatile?" — the files that keep getting rewritten, the directories where all the action concentrates, the pairs of files that are secretly welded together. `arc hotspots` is the software engineering intuition tool: it surfaces the files that are probably too complex (high churn), the coupling that probably should be a shared module, and the code that probably should be deleted (large + untouched). classic technique from "Your Code as a Crime Scene" (Adam Tornhill) — applied to a personal workspace.
**Why:** ron and arc both work on anivia. sidebar.tsx has been touched 29 times in 30 days by 2 people — that's a smell. lead-generator.ts has 2,360 lines of churn — it keeps getting rewritten. these aren't bugs, but they're signals. the coupling view reveals hidden dependencies: when you change icp-actions.ts, you ALWAYS change icp-tab.tsx (67% of the time). that's either tight coupling worth abstracting, or a natural page/action pair. either way, knowing it exists changes how you plan work.

### 2026-02-23: Side-by-Side Project Comparison
**What:** `arc compare` — side-by-side project comparison dashboard across every dimension
**Commands:** `arc compare`, `arc compare anivia tuner`, `arc compare --by size`, `arc compare --by activity`, `arc compare --by commits`, `arc compare --by tasks`, `arc compare --by age`, `arc compare --by churn`, `arc compare --by velocity`, `arc compare --short`, `arc compare --json`
**Features:** per-project analysis (LOC, file count, disk size, top languages, code density), git stats (7d/30d commits, velocity per week, churn +/-, dirty files, unpushed, total commits, contributors, repo age), task tracking (open/blocked/done from tasks/active.md + project-local TASKS.md), package info (deps/devDeps, version, scripts), memory mentions (last 7d of daily logs), status detection (active/recent/idle/stale), activity scoring (weighted: commits×10, mentions×5, tasks×3), comparison summary (superlatives: biggest/busiest/stalest/most tasks/heaviest deps/most churn), totals (LOC, files, disk, velocity), focus suggestion (which project needs attention based on open tasks + dirty files)
**Sort modes:** activity (default — weighted composite), size (code LOC), commits (30d count), tasks (open + blocked), age (repo age), velocity (commits/week), churn (7d insertions + deletions)
**Aliases:** `arc compare`, `arc vs`
**First run (9 projects):** anivia dominates at 40.5K LOC / 271 commits / 7 open tasks. ventok is the only "recent" project (1 commit this week). discord-voice-bot flagged stale (110d idle). total workspace: 56.8K LOC, 487 files, 15.9MB. focus suggestion: anivia needs attention (7 open tasks, 1 dirty file).
**Born from:** 22 arc tools that each show one dimension. `arc size` = LOC. `arc time` = hours. `arc git` = repo status. `arc plan` = what to do. but nothing answers "how do my projects compare AGAINST each other?" — the relative view. `arc compare anivia tuner` puts two codebases side by side and shows exactly where they differ: size, velocity, churn, tasks, deps, age. the comparison summary surfaces superlatives automatically: "anivia has the most code, ventok has the most churn, discord-voice-bot is the most stale." one command, whole portfolio view.
**Why:** ron manages 9 projects. deciding where to focus is partly gut feel, partly "what has open tasks?" `arc compare` makes it data-driven. sort by any dimension to see the ranking change. `--by churn` shows where code is actively changing. `--by tasks` shows where work is piling up. `--by age` shows the project timeline. the focus suggestion at the bottom synthesizes it all into one recommendation.

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

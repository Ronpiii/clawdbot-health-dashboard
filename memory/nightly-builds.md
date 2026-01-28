# Nightly Builds

Ron wants me to build something small but helpful every night while he sleeps.

**Schedule:** 2:00 AM Tallinn time (00:00 UTC)
**Scope:** Small, testable improvements
**Goal:** Wake up surprised

## Ideas Backlog

### Workflow & Communication
- [ ] Daily standup bot — auto-summary of yesterday's work posted to Discord #logs
- [x] Quick capture CLI — `arc idea "thought"` saves to ideas file ✓ built 2026-01-28
- [ ] Voice memo transcription — process voice notes into actionable items

### Anivia Improvements
- [ ] Email preview component — see how emails look before sending
- [ ] Lead scoring explainer — show why AI scored a lead the way it did
- [ ] Keyboard shortcuts — power user navigation
- [ ] Dark mode toggle — if not already there
- [x] Export leads to CSV — simple data export ✓ built 2026-01-28
- [ ] Bulk email drafting UI — select leads → draft all
- [ ] Activity feed filters — by type, date range
- [ ] Pipeline analytics — conversion rates between stages

### Developer Tools
- [x] Auto-commit script — commits workspace changes with AI-generated message ✓ built 2026-01-28
- [ ] PR summary generator — summarize changes for review
- [ ] Error tracker — collect and summarize errors from logs

### Fun/Surprise
- [ ] Morning briefing — weather + calendar + priorities
- [ ] Random inspiration — quote or interesting fact with morning summary

---

## Completed Builds

### 2026-01-28: Quick Idea Capture
**What:** `arc idea` command for instant thought capture
**Why:** Brain dump without context switching — idea comes, capture it, move on
**How to test:**
```bash
arc idea "what if we added dark mode"
arc idea list
arc idea clear   # removes completed
```
**Files changed:**
- `scripts/idea.mjs` (new)
- `scripts/arc` (added idea command)
- `ideas/IDEAS.md` (created on first use)
**Time spent:** ~5 minutes

---

## Build Log Format

### YYYY-MM-DD: [Feature Name]
**What:** Brief description
**Why:** Problem it solves
**How to test:** Steps to try it
**Files changed:** List of files
**Time spent:** X minutes

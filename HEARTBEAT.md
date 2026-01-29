# HEARTBEAT.md

## quick check
run `node scripts/heartbeat-check.mjs` — returns HEARTBEAT_OK or action items

## detailed status
run `node scripts/status.mjs` for workspace overview (git, tasks, memory)

## cross-post check
- if significant telegram activity since last heartbeat, post summary to discord #logs
- webhook: `https://discord.com/api/webhooks/1464653461915435049/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj`

## rotate checks (2-4x daily)
- [ ] git status — uncommitted changes? push if stable
- [ ] tasks/active.md — anything unblocked?
- [ ] memory index — rebuild if files changed (`node scripts/memory-index.mjs build`)

## morning ritual (first heartbeat after 06:00 tallinn / 04:00 UTC)
- **curiosity drop**: share one cool thing learned from night exploration
- can be tech, dog stuff, random rabbit hole — whatever's interesting

## proactive work (if idle)
- explore something curious (night time especially)
- review and compress daily logs into MEMORY.md
- check projects for work that doesn't need ron's input
- improve documentation or tooling
- commit and push changes

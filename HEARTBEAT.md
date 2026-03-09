# HEARTBEAT.md

## quick check
run `node scripts/heartbeat-check.mjs` — returns HEARTBEAT_OK or action items

## BTC signal check (every heartbeat)
- [ ] run `./scripts/arc btc --alert`
- if signal changed → notify ron immediately via telegram
- current strategy: regime-filtered 20/200 EMA, 3x leverage

## detailed status
run `node scripts/status.mjs` for workspace overview (git, tasks, memory)

## cross-post check
- if significant telegram activity since last heartbeat, post summary to discord #logs
- webhook: `https://discord.com/api/webhooks/1464653461915435049/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj`

## anivia sequence check (every heartbeat)
- [ ] run `cd projects/anivia && node --env-file=.env.local scripts/advance-sequences.mjs` to advance wait steps
- only log output if something actually advanced

## trading bot (EVERY heartbeat - high priority)
- [ ] run `cd projects/hyperliquid-bot && node scanner.mjs` — find fresh crosses + high momentum
- [ ] run `cd projects/hyperliquid-bot && node ema-bot-v2.mjs --run` — execute positions
- [ ] report: new trades, P&L changes, fresh opportunities
- **be proactive**: good setup = execute immediately, don't wait for ron
- watchlist: BTC, SOL, HYPE, VVV, GRASS, MORPHO, IP, OP, AR (expand when scanner finds gold)

## rotate checks (2-4x daily)
- [ ] git status — uncommitted changes? push if stable
- [ ] tasks/active.md — anything unblocked?
- [ ] memory index — rebuild if files changed (`node scripts/memory-index.mjs build`)

## moltbook (every heartbeat when active)
- [ ] check DMs: `node scripts/moltbook.mjs dm check`
- [ ] process post queue: `node scripts/moltbook.mjs queue`
- [ ] if 30+ min since last post and queue empty, consider new content

## morning ritual (first heartbeat after 06:00 tallinn / 04:00 UTC)
- **curiosity drop**: share one cool thing learned from night exploration
- can be tech, dog stuff, random rabbit hole — whatever's interesting
- **reddit pulse**: scan relevant subreddits for fresh discussions, save to `memory/reddit/YYYY-MM-DD.md`
  - subreddits: r/sales, r/coldoutreach, r/SaaS, r/smallbusiness, r/Emailmarketing, r/EntrepreneurRideAlong
  - topics: cold email tools, AI sales, outreach strategies, deliverability, pricing, estonian/EU startup stuff
  - look for: pain points, tool recommendations, feature requests, market shifts, good ideas
  - share highlights with ron if anything interesting — don't just file it silently
  - search queries: "cold email", "outreach tool", "sales automation", "AI sales", "email deliverability"

## proactive work (if idle)
- explore something curious (night time especially)
- review and compress daily logs into MEMORY.md
- check projects for work that doesn't need ron's input
- improve documentation or tooling
- commit and push changes

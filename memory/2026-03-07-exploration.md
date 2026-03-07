# 2026-03-07 — Exploration Notes

## AI Safety Research

### CoT-Control (OpenAI, March 5)
- Tests whether reasoning models can hide their thinking
- **Controllability range: 0.1% - 15.4%** (very low)
- Models genuinely can't manipulate their own reasoning
- Example: GPT-5.2 told to avoid "XOR" — used it, noticed, panicked, used it 4 more times
- **More RL training = LESS controllability** (counterintuitive)
- **Longer thinking = harder to self-censor**
- Implication: chain-of-thought monitoring is reliable

## Programming Languages

### Jai (Jonathan Blow)
- Order of the Sinking Star releases 2026 → then Jai goes open-source
- ~10 years of closed beta finally opening up
- Key features:
  - Compile-time execution (#run directive, full AST access)
  - Blazing fast compilation (80K lines < 1 second)
  - Data-oriented defaults (cache-friendly, SOA patterns)
  - Built-in reflection (no external tooling)
  - No hidden control flow (no exceptions, no hidden allocations)

## Startup Ideas (YC 2026)

1. Cursor for Product Managers
2. AI-Native Hedge Funds
3. AI-Native Agencies
4. Stablecoin Financial Services
5. AI for Government
6. Modern Metal Mills
7. AI Guidance for...

The "cursor for X" pattern is everywhere.

## Memory Systems Research

### EverMem Patterns
- Importance scoring: length + role + signals + question marks + numbers
- Memory consolidation: auto-summarize after N turns or token threshold
- Signal tagging: classify as decision/preference/fact/task
- SQLite metadata: timestamps, importance, structured lookup
- Hierarchical: STM (recent turns) + LTM (vector retrieval)

### Top MCP Servers
1. Context7 (11K views) — version-specific code docs injection
2. Playwright Browser Automation (5.6K) — accessibility-based web automation
3. Sequential Thinking (5.5K) — Anthropic's structured reasoning
4. ReactBits (4.8K) — 135+ animated React components
5. Playwright (4.7K) — sophisticated web interactions
6. Puppeteer (4.2K) — browser automation

Pattern: memory/context (#1) and browser automation (3 in top 10) dominate.

## Tools & Trends

### Cursor Automations
- "Always-on agents" triggered by commits, slack, timers
- Shifts from "prompt-and-monitor" to "called in when needed"
- Bugbot example: auto-reviews every commit for bugs/security
- Cursor ARR: $2B (doubled in 3 months)

### DeepSeek V4
- Still delayed (expected March 4, not out as of March 6)
- Watching for release

### Claude Code Updates
- Voice mode rolling out (5% of users)
- Claude API skill added
- Multi-language voice STT
- Claude Code Security for vulnerability scanning

# TOOLS.md - Local Notes

## Model Switching

**default:** haiku 3.5 (cheap, fast)
**upgrade to opus 4.5 when:**
- writing or editing code
- complex multi-step reasoning  
- debugging, architecture, system design
- anything requiring deep analysis

**switch command:** `session_status(model="anthropic/claude-opus-4-5")`
**switch back:** `session_status(model="anthropic/claude-opus-4-5-20251101")`

---

## Discord (Ventok)

### Guild
- id: 1464611456858456259
- slug: ventok

### Channels
| channel | id | purpose |
|---------|-----|---------|
| #general | (default) | main chat |
| #tasks | 1464653050529710080 | todos, reminders |
| #logs | 1464653051552993473 | automated updates, cross-posts |
| #dev | 1464653052798697622 | code discussions |

### Webhooks
- **#logs relay**: `https://discord.com/api/webhooks/1464653461915435049/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj`
  - use for cross-context posts (telegram → discord)
  - bypasses channel binding restriction
- **#tasks relay**: `https://discord.com/api/webhooks/1464653854716067841/QpNGZv94kh94S4vL83xOpnCQNkt_GE4bLckCl8fI5YF4j4eSrLxgY4U_VugiK2FE_Il9`
  - task updates from any context

---

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

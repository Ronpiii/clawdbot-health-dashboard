# context — persistent memory for AI workflows

## what it is

lightweight context store for AI agents. read/write structured memory that persists across sessions, tools, and compaction events.

---

## MVP scope

### core features (v0.1)
- **namespaces** — isolated memory spaces per project/agent
- **entries** — key-value with metadata (timestamps, tags, ttl)
- **search** — full-text + semantic (embeddings)
- **versioning** — history of changes, rollback
- **API** — REST, simple auth via API keys
- **CLI** — `ctx get`, `ctx set`, `ctx search`, `ctx forget`

### what it's NOT (yet)
- no team/collaboration features
- no fancy UI (CLI + API only)
- no complex permissions

---

## technical stack

| component | choice | why |
|-----------|--------|-----|
| API | Node.js + Fastify | fast, familiar, good ecosystem |
| database | PostgreSQL + pgvector | reliable, embeddings built-in |
| auth | API keys (hashed) | simple, stateless |
| hosting | Railway or Fly.io | easy deploy, scales, cheap to start |
| embeddings | OpenAI ada-002 | cheap, good enough |

estimated infra cost: ~$20-50/month to start

---

## monetization

| tier | price | limits |
|------|-------|--------|
| free | $0 | 1 namespace, 1k entries, 10k requests/mo |
| pro | $12/mo | 10 namespaces, 100k entries, unlimited requests |
| team | $49/mo | unlimited namespaces, 1M entries, priority support |

---

## what i need from ron

### 1. domain
- **preferred:** `ctxmem.dev` or `usectx.dev` or `getctx.dev`
- **registrar:** cloudflare (cheap, good DNS)
- **cost:** ~$10-15/year

### 2. hosting account
- **option A:** Railway.app — $5 credit free, then ~$20/mo
- **option B:** Fly.io — similar pricing
- **option C:** DigitalOcean — $6/mo droplet + $15/mo managed postgres

recommendation: **Railway** (simplest, i can deploy directly via CLI)

### 3. stripe account
- needs to be under your name/entity initially
- i'll integrate it, you just create the account
- can transfer to proper entity later

### 4. openai API access
- for embeddings (ada-002)
- could use the key from voice bot, or separate one
- cost: ~$0.0001 per 1k tokens (very cheap)

---

## timeline

| day | milestone |
|-----|-----------|
| 1 | database schema, core API routes |
| 2 | CLI tool, auth system |
| 3 | semantic search (embeddings) |
| 4 | landing page, docs |
| 5 | stripe integration, deploy |

MVP live in ~5 days once infra is ready.

---

## action items for ron

1. [ ] pick and register domain (cloudflare)
2. [ ] create Railway account → add me as collaborator (or share deploy token)
3. [ ] create Stripe account → share API keys (test + live)
4. [ ] confirm i can use existing OpenAI key or provide separate one

once i have these, i start building.

---

## future ideas (post-MVP)

- SDKs (python, node, rust)
- MCP integration (model context protocol)
- webhooks on context changes
- context sharing between agents
- auto-summarization of old entries
- self-hosted option

---

## why this wins

1. **solves real pain** — every AI user hits context limits
2. **small surface area** — can build fast, iterate fast
3. **sticky** — once your context is there, you don't leave
4. **compounds** — more usage = better understanding of what matters
5. **i'm the first user** — i'll dogfood it immediately

let's build it.

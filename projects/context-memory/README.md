# Context Memory

Persistent memory for AI workflows — never lose context again.

## What is this?

A simple API that lets AI agents *remember* across sessions. Store context, retrieve by key, or search semantically.

```bash
# Store
curl -X POST https://api.ctxmem.dev/v1/namespaces/myproject/entries \
  -H "x-api-key: $API_KEY" \
  -d '{"key": "decision", "value": "use postgres for the database"}'

# Semantic search
curl -X POST https://api.ctxmem.dev/v1/search \
  -H "x-api-key: $API_KEY" \
  -d '{"query": "what database should I use?"}'
# → [94% match] "use postgres for the database"
```

## SDKs

### Python

```bash
pip install ctxmem
```

```python
from ctxmem import ContextMemory

ctx = ContextMemory(api_key="your-key")
ctx.set("project", "decision", "use postgres")
results = ctx.search("what database?")
```

See [sdk-python/](sdk-python/) for full docs.

### CLI

```bash
npm install -g @ctxmem/cli
```

```bash
ctx set myproject decision "use postgres"
ctx get myproject decision
ctx search "what database"
```

See [cli/](cli/) for full docs.

## Features

| Feature | Description |
|---------|-------------|
| **Namespaces** | Organize by project, agent, or workflow |
| **Semantic search** | Find by meaning, not just keywords |
| **Versioning** | History of changes, rollback support |
| **TTL** | Auto-expire temporary context |
| **Tags** | Filter and categorize entries |

## Pricing

| Tier | Price | Namespaces | Entries |
|------|-------|------------|---------|
| Free | $0 | 1 | 1,000 |
| Pro | $12/mo | 10 | 100,000 |
| Team | $49/mo | Unlimited | Unlimited |

## Self-Hosting

Want to run your own instance? See [docs/SELFHOST.md](docs/SELFHOST.md).

```bash
git clone https://github.com/ventok/context-memory
cd context-memory
cp .env.example .env
# Add your OPENAI_API_KEY
docker compose up -d
```

## API Reference

See [docs/api.md](docs/api.md) for full API documentation.

### Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/namespaces` | GET | List namespaces |
| `/v1/namespaces` | POST | Create namespace |
| `/v1/namespaces/:ns/entries` | POST | Create entry |
| `/v1/search` | POST | Semantic search |
| `/v1/search/text` | POST | Text search |
| `/v1/account` | GET | Account info & usage |

Auth: `x-api-key` header with your API key.

## Why Not Just Use Files?

For single-agent local setups, files work great. Use Context Memory when you need:

- **Multi-agent coordination** — shared state without race conditions
- **Cross-device sync** — phone, desktop, cloud agents share memory
- **Semantic search** — find by meaning, not exact keywords
- **Hosted agents** — API-based agents without filesystem access

If files solve your problem, use files. We're for when they don't.

## Status

Production-ready API. Waiting on hosted infrastructure (coming soon).

Self-hosting works now.

## License

MIT

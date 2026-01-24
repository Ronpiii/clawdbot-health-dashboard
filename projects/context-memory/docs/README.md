# Context Memory Documentation

Persistent memory API for AI workflows.

## Quick Start

### 1. Sign Up

```bash
curl -X POST https://api.ctxmem.dev/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
```

Save the API key from the response — it's only shown once!

### 2. Install CLI

```bash
npm install -g ctx
ctx config --api-key YOUR_API_KEY
```

### 3. Store Your First Memory

```bash
# Create a namespace
ctx ns create myproject

# Store an entry
ctx set myproject decision "Use PostgreSQL for the database"

# Retrieve it
ctx get myproject decision

# Semantic search
ctx search "what database should we use"
```

## Concepts

### Namespaces

Namespaces are isolated memory spaces. Use them to separate:
- Different projects
- Different agents
- Different environments (dev/prod)

```bash
ctx ns create project-alpha
ctx ns create agent-research
ctx ns list
```

### Entries

Entries are key-value pairs within a namespace. Values can be any JSON.

```bash
# String value
ctx set myns greeting "Hello, world"

# JSON value
ctx set myns config '{"model": "gpt-4", "temperature": 0.7}'

# With tags
ctx set myns decision "Use React" --tags "frontend,framework"

# With TTL (auto-expire after 1 hour)
ctx set myns temp-note "Remember to check this" --ttl 3600
```

### Semantic Search

Search by meaning, not just keywords. Powered by vector embeddings.

```bash
ctx search "database choice"
# Finds: "Use PostgreSQL for persistence"

ctx search "frontend framework" --namespace myproject
# Searches only within myproject

ctx search "auth" --threshold 0.8
# Higher threshold = stricter matching
```

### Versioning

Every update creates a version. View history and rollback.

```bash
# View history
curl https://api.ctxmem.dev/v1/namespaces/myns/entries/mykey/history \
  -H "Authorization: Bearer $API_KEY"
```

## API Reference

### Authentication

All API requests require a bearer token:

```
Authorization: Bearer ctx_xxxxxxxxxxxxx
```

### Endpoints

#### Namespaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/namespaces` | List namespaces |
| POST | `/v1/namespaces` | Create namespace |
| GET | `/v1/namespaces/:slug` | Get namespace |
| DELETE | `/v1/namespaces/:slug` | Delete namespace |

#### Entries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/namespaces/:ns/entries` | List entries |
| GET | `/v1/namespaces/:ns/entries/:key` | Get entry |
| PUT | `/v1/namespaces/:ns/entries/:key` | Set entry (upsert) |
| DELETE | `/v1/namespaces/:ns/entries/:key` | Delete entry |
| GET | `/v1/namespaces/:ns/entries/:key/history` | Get version history |

#### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/search` | Semantic search |
| POST | `/v1/search/text` | Full-text search |

#### Account

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/account` | Get account info & usage |
| GET | `/v1/account/keys` | List API keys |
| DELETE | `/v1/account/keys/:id` | Revoke API key |

### Request/Response Examples

#### Create Entry

```bash
curl -X PUT https://api.ctxmem.dev/v1/namespaces/myns/entries/mykey \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "value": "This is my memory",
    "tags": ["important", "decision"],
    "ttl": 86400
  }'
```

Response:
```json
{
  "id": "uuid",
  "key": "mykey",
  "value": "This is my memory",
  "tags": ["important", "decision"],
  "version": 1,
  "created_at": "2024-01-24T12:00:00Z",
  "expires_at": "2024-01-25T12:00:00Z"
}
```

#### Semantic Search

```bash
curl -X POST https://api.ctxmem.dev/v1/search \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "database decision",
    "limit": 5,
    "threshold": 0.7
  }'
```

Response:
```json
{
  "results": [
    {
      "key": "db-choice",
      "namespace": "myproject",
      "value": "Use PostgreSQL for the main database",
      "similarity": 0.92,
      "tags": ["infrastructure"],
      "updated_at": "2024-01-24T10:00:00Z"
    }
  ],
  "count": 1
}
```

## Rate Limits

| Tier | Requests/minute |
|------|-----------------|
| Free | 100 |
| Pro | 1000 |
| Team | 10000 |

## SDKs

Coming soon:
- Python SDK
- Node.js SDK
- Rust SDK

For now, use the REST API directly or the CLI.

## Support

- Documentation: https://ctxmem.dev/docs
- GitHub Issues: https://github.com/ctxmem/ctx/issues
- Email: support@ctxmem.dev

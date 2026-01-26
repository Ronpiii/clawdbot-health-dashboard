# Context Memory API Reference

Base URL: `https://api.ctxmem.dev` (hosted) or your self-hosted URL.

## Authentication

All requests require an API key in the `x-api-key` header:

```bash
curl -H "x-api-key: ctx_your_api_key" https://api.ctxmem.dev/v1/account
```

## Namespaces

Namespaces organize your entries by project, agent, or workflow.

### List Namespaces

```http
GET /v1/namespaces
```

Response:
```json
{
  "namespaces": [
    {
      "id": "ns_abc123",
      "slug": "myproject",
      "name": "My Project",
      "description": "Project memories",
      "entry_count": 42,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T12:00:00Z"
    }
  ]
}
```

### Create Namespace

```http
POST /v1/namespaces
Content-Type: application/json

{
  "slug": "myproject",
  "name": "My Project",
  "description": "Optional description"
}
```

- `slug` (required): URL-safe identifier, lowercase alphanumeric + hyphens
- `name` (optional): Display name
- `description` (optional): Description

### Get Namespace

```http
GET /v1/namespaces/:slug
```

### Delete Namespace

```http
DELETE /v1/namespaces/:slug
```

⚠️ Deletes all entries in the namespace.

## Entries

### Create Entry

```http
POST /v1/namespaces/:namespace/entries
Content-Type: application/json

{
  "key": "api-decision",
  "value": "use REST for simplicity",
  "tags": ["architecture", "api"],
  "ttl_seconds": 2592000,
  "importance": 0.8
}
```

- `key` (required): Unique identifier within namespace
- `value` (required): Any JSON value (string, object, array, etc.)
- `tags` (optional): Array of strings for filtering
- `ttl_seconds` (optional): Auto-expire after N seconds
- `importance` (optional): 0-1 score for ranking

Response:
```json
{
  "id": "entry_xyz789"
}
```

### Search in Namespace

```http
POST /v1/namespaces/:namespace/entries/search
Content-Type: application/json

{
  "query": "what API style should we use",
  "limit": 10,
  "min_score": 0.7,
  "context_tags": ["architecture"]
}
```

## Search

### Semantic Search

Search across all namespaces (or filter to one) by meaning.

```http
POST /v1/search
Content-Type: application/json

{
  "query": "database recommendations",
  "namespace": "myproject",
  "limit": 10,
  "threshold": 0.7,
  "tags": ["infrastructure"]
}
```

- `query` (required): Natural language search query
- `namespace` (optional): Limit to specific namespace
- `limit` (optional): Max results, 1-100, default 10
- `threshold` (optional): Minimum similarity 0-1, default 0.7
- `tags` (optional): Filter by tags (AND logic)

Response:
```json
{
  "results": [
    {
      "id": "entry_abc",
      "key": "db-choice",
      "value": "use postgres with pgvector",
      "namespace": "myproject",
      "tags": ["infrastructure", "database"],
      "similarity": 0.94,
      "created_at": "2024-01-10T00:00:00Z",
      "updated_at": "2024-01-10T00:00:00Z"
    }
  ],
  "query": "database recommendations",
  "count": 1
}
```

### Text Search

Simple substring matching (no embeddings).

```http
POST /v1/search/text
Content-Type: application/json

{
  "query": "postgres",
  "namespace": "myproject",
  "limit": 10
}
```

## Account

### Get Account Info

```http
GET /v1/account
```

Response:
```json
{
  "account": {
    "id": "acc_123",
    "email": "user@example.com",
    "name": "User Name",
    "tier": "pro"
  },
  "usage": {
    "namespaces": {
      "current": 3,
      "limit": 10
    },
    "entries": {
      "current": 1542,
      "limit": 100000
    },
    "requests": {
      "current": 4521,
      "limit": 100000
    }
  }
}
```

### List API Keys

```http
GET /v1/account/keys
```

Response:
```json
{
  "keys": [
    {
      "id": "key_abc",
      "key_prefix": "ctx_a1b2",
      "name": "production",
      "last_used_at": "2024-01-15T12:00:00Z",
      "expires_at": null,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Revoke API Key

```http
DELETE /v1/account/keys/:keyId
```

## Health Check

```http
GET /health
```

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2024-01-15T12:00:00Z"
}
```

## Errors

All errors return JSON:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (validation failed) |
| 401 | Invalid or missing API key |
| 403 | Forbidden (limit exceeded) |
| 404 | Resource not found |
| 422 | Unprocessable entity |
| 429 | Rate limited |
| 500 | Server error |

### Rate Limits

- 100 requests per minute per API key
- `Retry-After` header indicates wait time on 429

### Limit Exceeded (403)

```json
{
  "error": "Namespace limit reached",
  "limit": 1,
  "current": 1,
  "upgrade": "https://ctxmem.dev/pricing"
}
```

## Webhooks

Coming soon: get notified on entry changes.

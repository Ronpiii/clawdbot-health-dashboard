# Self-Hosting Context Memory

Run your own Context Memory instance. Full control, no external dependencies (except OpenAI for embeddings).

## Requirements

- Docker + Docker Compose
- OpenAI API key (for embeddings)
- ~512MB RAM, 1GB disk minimum

## Quick Start

```bash
# Clone
git clone https://github.com/ventok/context-memory
cd context-memory

# Configure
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Run
docker compose up -d

# Verify
curl http://localhost:3000/health
```

API available at `http://localhost:3000`

## Configuration

### Required Environment Variables

```bash
# .env
OPENAI_API_KEY=sk-...          # Required for embeddings
API_KEY_SALT=your-random-salt  # Change this! Used for API key hashing
```

### Optional Variables

```bash
# Database (defaults work for docker-compose)
DATABASE_URL=postgresql://context:context@db:5432/context

# Server
PORT=3000
HOST=0.0.0.0

# Stripe (only if you want billing)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Architecture

```
┌─────────────┐     ┌─────────────┐
│   Clients   │────▶│  API (3000) │
└─────────────┘     └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  PostgreSQL │
                    │  + pgvector │
                    └─────────────┘
```

- **API**: Node.js/Fastify server
- **Database**: PostgreSQL 16 with pgvector extension
- **Embeddings**: OpenAI text-embedding-3-small (or configure your own)

## Production Deployment

### Option 1: Docker Compose (simple)

Good for single-server deployments.

```bash
# Use production compose file
docker compose -f docker-compose.prod.yml up -d
```

Recommendations:
- Put behind nginx/caddy for TLS
- Set up backups for the pgdata volume
- Use secrets management for API keys

### Option 2: Kubernetes

Helm chart coming soon. For now:

```yaml
# Example deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: context-memory-api
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: api
        image: ventok/context-memory:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: context-memory
              key: database-url
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: context-memory
              key: openai-key
```

### Option 3: Manual

```bash
# Database
docker run -d \
  --name context-db \
  -e POSTGRES_USER=context \
  -e POSTGRES_PASSWORD=your-password \
  -e POSTGRES_DB=context \
  -v context-pgdata:/var/lib/postgresql/data \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Initialize schema
psql $DATABASE_URL < schema.sql

# API
cd api
npm install
npm run build
DATABASE_URL=... OPENAI_API_KEY=... npm start
```

## Creating Your First API Key

Self-hosted doesn't use Stripe by default. Create keys directly:

```bash
# Connect to database
docker compose exec db psql -U context

# Create an account
INSERT INTO accounts (email, name, tier) 
VALUES ('admin@local', 'Admin', 'team')
RETURNING id;

# Create API key (note: store the full key, only prefix is saved)
INSERT INTO api_keys (account_id, key_hash, key_prefix, name)
VALUES (
  '<account-id-from-above>',
  encode(sha256('your-secret-key'), 'hex'),
  'ctx_',
  'default'
);
```

Then use `ctx_your-secret-key` as your API key.

**Better approach** — use the signup endpoint:

```bash
curl -X POST http://localhost:3000/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@local", "name": "Admin"}'
```

Returns your API key (save it, shown only once).

## Embedding Alternatives

Default uses OpenAI. To use something else:

### Local Embeddings (coming soon)

```bash
# In .env
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

### Custom Provider

Implement `src/services/embeddings.ts`:

```typescript
export async function getEmbedding(text: string): Promise<number[]> {
  // Your embedding logic
  return await yourEmbeddingService.embed(text);
}
```

## Scaling

### Database

- Use connection pooling (PgBouncer) for >50 concurrent connections
- Consider read replicas for heavy search workloads
- pgvector indexes: add HNSW index for faster search at scale

```sql
-- Add after significant data (>10k entries)
CREATE INDEX ON entries 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### API

- Horizontal scaling works (stateless)
- Use load balancer for multiple instances
- Consider Redis for rate limiting across instances

## Backup & Recovery

```bash
# Backup
docker compose exec db pg_dump -U context context > backup.sql

# Restore
docker compose exec -T db psql -U context context < backup.sql

# Or backup the volume directly
docker run --rm -v context-memory_pgdata:/data -v $(pwd):/backup \
  alpine tar czf /backup/pgdata-backup.tar.gz /data
```

## Troubleshooting

### "vector type not found"

pgvector extension not installed:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### "embedding dimension mismatch"

Schema expects 1536 dimensions (OpenAI default). If using different model:

```sql
-- Check current dimension
\d entries
-- Modify if needed (loses existing embeddings!)
ALTER TABLE entries ALTER COLUMN embedding TYPE vector(384);
```

### Connection refused

Check database is healthy:

```bash
docker compose ps
docker compose logs db
```

## Migrating from Hosted

Export from hosted, import to self-hosted:

```bash
# Export (contact support for data export)
# Import
psql $YOUR_DATABASE_URL < export.sql
```

---

Questions? Open an issue: https://github.com/ventok/context-memory/issues

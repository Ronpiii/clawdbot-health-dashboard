# Context Memory API

## Infrastructure Setup

### Database
- Using Neon (serverless PostgreSQL)
- Free tier supports:
  - 1 project
  - 3GB storage
  - Branching
  - pgvector support ✓

### Setup Steps
1. Create Neon account
2. Create new project
3. Enable pgvector extension
   ```sql
   CREATE EXTENSION vector;
   ```
4. Run `schema.sql` to set up tables
5. Copy connection string to `.env`

### Hosting
- Railway (for API deployment)
- Neon (for database)

### Integrations
- OpenAI (embeddings)
- Stripe (payments)

## Development Checklist
- [x] Basic API routes
- [x] Database schema
- [x] OpenAI key
- [x] Stripe key
- [ ] Database setup
- [ ] Stripe webhook secret
- [ ] Deployment configuration
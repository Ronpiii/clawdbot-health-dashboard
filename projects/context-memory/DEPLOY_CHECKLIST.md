# Deployment Checklist

Ready to deploy when Ron provides infra. This is the runbook.

## Prerequisites (from Ron)
- [ ] Domain purchased (ctxmem.dev?)
- [ ] Railway account + project
- [ ] Stripe account + test keys
- [ ] OpenAI API key confirmed

## Database (Neon)
- [ ] Create Neon account
- [ ] Create project "context-memory"
- [ ] Enable pgvector: `CREATE EXTENSION vector;`
- [ ] Run schema: `psql $DATABASE_URL < schema-neon.sql`
- [ ] Copy connection string

## API Deployment (Railway)
- [ ] Create Railway project
- [ ] Connect to GitHub repo
- [ ] Set environment variables:
  ```
  DATABASE_URL=<neon-connection-string>
  OPENAI_API_KEY=<key>
  STRIPE_SECRET_KEY=<key>
  STRIPE_WEBHOOK_SECRET=<from-step-below>
  API_KEY_SALT=<generate-random-string>
  PORT=3000
  HOST=0.0.0.0
  ```
- [ ] Deploy
- [ ] Verify: `curl https://api.ctxmem.dev/health`

## Stripe Setup
- [ ] Create product "Context Memory Pro" ($12/mo)
- [ ] Create product "Context Memory Team" ($49/mo)
- [ ] Create webhook endpoint: `https://api.ctxmem.dev/webhooks/stripe`
- [ ] Events to subscribe:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- [ ] Copy webhook signing secret to Railway env

## Domain & DNS
- [ ] Point `api.ctxmem.dev` → Railway app
- [ ] Point `ctxmem.dev` → landing page host (or Railway static)
- [ ] SSL should auto-provision

## Landing Page
- [ ] Deploy landing/index.html
- [ ] Or use Railway static site
- [ ] Update signup form to actually create accounts

## Post-Deploy Verification
- [ ] Health check: `curl https://api.ctxmem.dev/health`
- [ ] Signup test: create account via `/v1/signup`
- [ ] Full flow: create namespace → create entry → search
- [ ] Stripe webhook test: create test subscription

## Launch
- [ ] Post HN (marketing/hn-post.md)
- [ ] Tweet thread (marketing/launch-tweets.md)
- [ ] Update GitHub repo visibility (if private)

## Monitoring
- [ ] Set up Railway alerts
- [ ] Neon dashboard for DB metrics
- [ ] Consider: error tracking (Sentry?)

---

*arc will run through this when infra arrives*

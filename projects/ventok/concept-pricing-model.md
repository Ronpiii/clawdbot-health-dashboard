---
title: Pricing Model
description: Why $72-500/mo works. Payback logic, tier structure, margin thinking
tags: [pricing, economics, positioning]
links: [product-market-fit, service-tiers, competitive-landscape]
status: active (testing at $72/mo, planning $200-500/mo)
last-updated: 2026-03-12
---

# pricing model

The core logic: manufacturers compare us to *consultant time and operational waste*, not other SaaS. If we save 5 hours/week at $20/hr, we're worth $400/mo in value. We charge 25-50% of that value.

---

## payback period math

**baseline assumption:** saving 5 hours/week = core value

| ops hourly rate | weekly value | monthly value | our price | payback |
|-----------------|--------------|---------------|-----------|---------|
| €15/hr (junior) | €75 | €300 | €200 | 6 weeks |
| €20/hr (standard) | €100 | €400 | €250 | 6 weeks |
| €25/hr (experienced) | €125 | €500 | €300 | 6 weeks |

**key insight:** payback <6 weeks means easy approval, no ROI spreadsheet needed. >10 weeks = veto.

---

## tier structure (what we're selling)

### tier 1: infrastructure (€200-300/mo)
- process mapping + domain setup
- initial workflow automation (1-2 key processes)
- example: "automate quote-to-invoice flow for wood products"
- payback: saves 3-5 hr/week
- our margin: ~70% (high touch onboarding, low ongoing)

### tier 2: automation (€400-600/mo)
- expand to 3-5 core workflows
- integrations (email, accounting, CRM if needed)
- training + documentation
- payback: saves 8-10 hr/week
- our margin: ~60% (medium touch, some custom work)

### tier 3: AI workflows (€800-1200+/mo)
- predictive insights (pricing optimization, demand forecasting)
- autonomous suggestions (next order likely to be customer X, suggest Y product)
- example: "AI-powered sales assistant for order recommendations"
- payback: saves 10-15 hr/week or generates 5-10% margin uplift
- our margin: ~50% (higher support needs, more custom)

---

## why manufacturers accept this pricing

1. **they compare to hiring**: €250/mo is 6 hours of ops staff time (EU rates: €15-25/hr)
2. **they feel the waste**: 5 hr/week of manual work is *palpable* (lost time with customers, coffee breaks, frustration)
3. **they see domain knowledge**: we speak manufacturing language, not generic "workflow automation"
4. **safety premium**: they'll pay 50%+ more for "won't break my process"

---

## pricing power by customer size

| company size | typical price | rationale |
|--------------|---------------|-----------|
| 5-10 people | €150-250/mo | tight cash flow, high % of ops time saved is huge |
| 10-30 people | €250-500/mo | ops manager has budget authority, payback is clear |
| 30-100 people | €500-1500+/mo | higher hourly rates, more complex processes, custom tier |

---

## margins & sustainability

**to reach €2k/mo revenue (sustainable operations):**
- 10 customers at €200/mo (tight LTV:CAC ratio, but possible with network effect)
- or 5 customers at €400/mo (more realistic with direct outreach)

**cost structure (estimate):**
- infrastructure: €200/mo (Vercel, Supabase, email sending)
- labor (1 founder + 0.25 contractor): €3-4k/mo
- **breakeven:** 15-20 customers at €200/mo, or 8-10 customers at €400/mo

**to reach €5k/mo (full-time scaling):**
- 25 customers at €200/mo (highly scalable, minimal support)
- or 15 customers at €333/mo (blended)
- or 10 customers at €500/mo + 10 at €200/mo

---

## competitive positioning

| competitor | price | positioning | vs ventok |
|------------|-------|-------------|----------|
| Airtable | €0-200+/mo | generic workflow, any industry | lower cost but high complexity, no domain knowledge |
| Zapier | €10-500+/mo | automation glue, any process | fragile, no domain safety, spreadsheet-like |
| Industry ERP | €500-2000+/mo | all-in-one, overkill for SMB | way too expensive, too complex to implement |
| Consultant | €100-200/hr | custom implementation | 1-3 months implementation, then what? |

**our positioning:** €250/mo reliability + domain knowledge beats cheaper tools and expensive consultants

---

## edges to explore

- **minimum viable price**: at what point does €150/mo feel "too cheap" (signals low quality)?
- **maximum without enterprise segment**: where does €1000/mo start to exclude typical SMB? (estimate: €750+)
- **volume discounts**: do we discount for multi-location / multi-tier contracts? (defer until 5+ customers)
- **international pricing**: do German/Swedish customers pay more? (geography premium?)

---

## reference

- see [[service-tiers]] for what each tier includes
- see [[ideal-customer-profile]] for buyer sensitivity (CFO vs founder vs ops manager)
- see [[competitive-landscape]] for why we win vs alternatives

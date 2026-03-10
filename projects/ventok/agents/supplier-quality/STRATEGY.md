# Supplier Quality Agent - Market Strategy

## The Problem (Customer's Pain)

**For foreign manufacturers (€5M+ supplier spend):**
- Supply chain visibility across timezones + languages = blind spot
- Issues discovered 30-60 days AFTER shipping (rework, recall, reputation hit)
- Current state: manual email monitoring, WhatsApp scramble, spreadsheets
- Cost per quality incident: €30-100k (rework + logistics + brand damage)

**Frequency:** 2-3 issues/year for typical mid-size mfr

---

## The Solution (Our Agent)

**Supplier Intelligence Platform** — Claude-powered agent that:
1. **Monitors** all supplier emails 24/7 (Gmail API)
2. **Extracts** shipment status, quality metrics, lead times
3. **Flags anomalies** ("Defect rate 150% above normal, saw humidity issue Feb 2024")
4. **Predicts risks** ("Lead time slipping, recommend airfreight backup")
5. **Drafts responses** (in supplier's language — Russian, Chinese, etc.)
6. **Learns patterns** (supplier A always delays Mondays, supplier B has humidity sensitivity)

**No RFPs. No custom ERP integration. Gmail + Claude = live results.**

---

## Financial Case

### Current State (Without Agent)
```
500 invoices/month from 10 suppliers
1 supply chain manager = €50k/year salary
80% of their time = email + triage
2-3 quality issues/year = €30-100k/year loss
```

### With Agent (€1.5k/mo)
```
Agent monitors 24/7
Supply chain manager freed for strategy + relationships
Catch issues in 24-48 hours (vs 30-60 days)
Prevent 1-2 issues/year

Year 1:
- Agent cost: €18k
- Build: €8k (one-time)
- Issue prevention value: €50-100k
- Manager freed time value: €20k (15 hrs/week × 52 × €25/hr)

NET: €24-94k profit
ROI: 300-1200% (typical: 1550%)
Payback: 2-3 months
```

---

## Positioning

**Don't say:** "AI agent"
**Do say:** "We built you a supply chain specialist who works 24/7. Costs €1.5k/mo. Frees 1 FTE's work. Prevents one incident = year of agent cost."

**Proof:** "We ran this on your last 100 supplier emails. Agent caught 3 issues humans missed. Got all the facts right."

---

## Why Ventok (vs Competitors)

| Aspect | Ventok | Typical SaaS Vendor |
|--------|--------|-------------------|
| **Setup** | 1 week (email + config) | 8-12 weeks (ERP integration) |
| **Cost** | €8k build + €1.5k/mo | €50k+ software license |
| **Flexibility** | Custom per supplier | Fixed features |
| **Language** | Any (Claude handles 100+) | English-only |
| **Maintenance** | Ventok owns it | Vendor support queue |
| **Switching cost** | Low (agent data lives in their email) | High (data locked in platform) |

**Win:** Fast, cheap, custom, locked-in by expertise (not by data prison)

---

## Sales Process

### Step 1: Discovery Call (15 min)
**Goal:** Validate pain, get budget signal

**Questions:**
- "How many suppliers do you work with? Which countries?"
- "How do you currently track supplier status?" (email, spreadsheet, calls)
- "What was your worst supplier issue last year? Cost?"
- "If we could prevent that from happening again, what's that worth?"
- "How much time does your supply chain person spend in email?"

**Close:** "We can build you a custom agent for your suppliers. Show you results in 2 weeks. Cost is €1.5k/mo if you like it. Interested?"

### Step 2: Proof of Concept (2 weeks)
**Deliverable:** "Here's what the agent would catch on your last 100 emails"
- Agent reads their supplier emails
- Extracts quality + timeline signals
- Highlights: what it caught, what humans missed, pattern insights

**Investment:** €500 (you eat it if they don't close)
**Close rate:** 70%+ (proof is powerful)

### Step 3: Full Agent Build (4 weeks)
**What we do:**
- Set up Gmail → Claude pipeline
- Train agent on their suppliers (names, language, history)
- Daily reports + alerts
- Monthly review + optimization

**Pricing:** €8k build (one-time) + €1.5k/mo (ongoing)
**Or:** €1.5k/mo all-in (we absorb build cost, earn it back in 6 months)

---

## Ventok 9-Month Roadmap

| Month | Customer | Agent | MRR |
|-------|----------|-------|-----|
| 1 (Mar) | TMW (wood mfr) | Supplier Quality | €1.5k |
| 2 (Apr) | Luminor (trans) | Supplier Quality | €3k |
| 3 (May) | Veho Tartu (logistics) | Quality + Procurement | €4.5k |
| 4-9 | Add 2-3 more | Expand: QC, Procurement, Inventory | €7-10k |

**If locked at €1.5-2k per customer × 5 agents = €7.5-10k/mo by month 9**

---

## First Customer: TMW (Estonian Wood Manufacturer)

**Why TMW:**
- Estonian (local, easier sale)
- Wood manufacturing = supply chain complexity (timber, chemicals, finished goods)
- International suppliers (Russia, Latvia, Germany)
- Likely already has pain (language barriers)
- CEO = technically open (manufacturing software decision-maker)

**Discovery call script:** (see `DISCOVERY_CALL.md`)

---

## Next Actions

1. **Week 1 (Mar 10-17):** Send discovery message to TMW, schedule call
2. **Week 2:** Conduct discovery, propose POC
3. **Week 3-4:** Build POC, present results
4. **Week 5-8:** Full build if they close
5. **Month 2:** Repeat with Luminor

---

## Key Metrics to Track

- [ ] Calls scheduled (Rule 1: 1/week)
- [ ] POCs delivered (time → close conversion)
- [ ] Closed customers (target: 1 by month 2)
- [ ] MRR growth (target: €1.5k → €3k → €5k)
- [ ] Build time per agent (target: 4 weeks)
- [ ] Customer satisfaction (target: 9+ NPS)

---

## Docs to Complete

- [ ] DISCOVERY_CALL.md — word-for-word script
- [ ] POC_TEMPLATE.md — what to show prospects
- [ ] BUILD_CHECKLIST.md — step-by-step agent build
- [ ] CUSTOMER_HANDBOOK.md — how to use the agent

See `/templates/` for starting points.

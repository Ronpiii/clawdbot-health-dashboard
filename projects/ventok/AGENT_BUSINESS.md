# Ventok Agent Business — Supplier Quality Focus

## Mission
Build and sell custom Claude agents for Estonian manufacturers.
Target: €5k/mo MRR by Dec 10, 2026 (9 months).

---

## Product: Supplier Quality Agent

**What it does:**
- Reads supplier emails 24/7
- Extracts status, quality, lead time signals
- Flags anomalies ("defect rate 150% above normal")
- Predicts risks ("lead time slipping, recommend airfreight backup")
- Drafts responses in supplier's language

**Why it works:**
- Suppliers are international (Russia, China, Germany, etc.)
- Supply chain manager spends 50% time on email triage
- Quality issues cost €30-100k when discovered late
- Agent catches issues in 24-48 hours (vs 30-60 days)
- 1 prevented issue = 1 year of agent cost

**Pricing:**
- Build: €8k (one-time, customer may prepay)
- Run: €1.5k/mo (ongoing)
- Margin: €1.2k/mo per customer (after API + time)

---

## Go-To-Market

### Sales Process (Simple)
1. **Discovery call (15 min)** → Validate pain, understand budget
2. **Proof of concept (1 week)** → "Here's what the agent would catch on YOUR emails"
3. **Full build (4 weeks)** → Agent runs live, deliver daily reports
4. **Customer ownership** → They own the agent, you own the optimization

### First Customer: TMW
- Estonian wood manufacturer
- Likely international suppliers
- Probably has supply chain pain
- Local (easier to close)

---

## How to Execute (Rule 1: Revenue)

**Every week:**
- [ ] 1 discovery call (15 min)
- [ ] 1 implementation hour (code/agent tuning)

**This maps to:**
- Month 1: 1 customer identified → POC delivery
- Month 2: Customer #1 live + Customer #2 POC
- Month 3: Customer #2 live + Customer #3 POC
- Month 4-9: Repeat + expand to other agents (quality, procurement, inventory)

**Math:**
- 3 customers @ €1.5k = €4.5k/mo
- 1 expansion customer (multi-agent) @ €2k = +€2k
- Total: €5k+/mo

---

## Files Structure

```
projects/ventok/
├── AGENT_BUSINESS.md (this file)
├── EXECUTION_PLAN.md (detailed roadmap + tasks)
├── leads.csv (14 target manufacturers)
├── agents/
│   └── supplier-quality/
│       ├── STRATEGY.md (positioning + financial case)
│       ├── DISCOVERY_CALL.md (word-for-word script)
│       ├── POC_TEMPLATE.md (what to show prospects) [TODO]
│       ├── BUILD_CHECKLIST.md (step-by-step build) [TODO]
│       └── CUSTOMER_HANDBOOK.md (how to use the agent) [TODO]
└── sales/ (templates, email copies, etc) [TODO]
```

---

## Next Actions (This Week)

**By Friday (Mar 14):**
- [ ] Get TMW contact (email/LinkedIn)
- [ ] Send discovery message (personalized)
- [ ] Goal: 30-min call on calendar by Mar 25

**By Mar 21:**
- [ ] Conduct discovery call with TMW
- [ ] Get sample emails for POC
- [ ] Start POC analysis

**By Apr 1:**
- [ ] Deliver POC report to TMW
- [ ] Move to full build if they say yes

---

## Success Metrics

Track weekly (see EXECUTION_PLAN.md for details):

| Metric | Target | Tracking |
|--------|--------|----------|
| Discovery calls/week | 1 | Manual |
| POC conversion rate | 70%+ | Manual |
| Build time/agent | <4 weeks | Manual |
| First customer live | Apr 30 | Manual |
| Month 3 MRR | €3k | Accounting |
| Month 9 MRR | €5k+ | Accounting |

---

## Decision Locked

**Ironclad Rule 1:** 1 customer conversation/week + 1 implementation hour/week minimum

This is non-negotiable for 9 months. If fails 2 consecutive weeks, sprint stops and reassesses.

**Weekly review (Sunday 19:00 Tallinn):**
- Customer conversation? ✓/✗
- Implementation hours? ✓/✗
- Closer to €5k/mo? ✓/✗

---

## Why This Works (vs Anivia)

| Factor | Anivia (old) | Agent Business (new) |
|--------|------|-----------|
| Product | AI sales automation | Custom supply chain agents |
| Competition | 50+ companies doing this | None (specialized to manufacturers) |
| Switching cost | Low (anyone can use Claude) | High (agent knows their suppliers, language, history) |
| Margin | €300-800/mo | €1.5-2k/mo |
| Defensibility | None | Expertise + integration |
| Capital | Zero | Zero |

**Anivia was a features game. This is a services game (until we productize).**

---

## One More Thing

**This is real revenue, not a side project.**

The math shows:
- €8k build cost
- 3-4 customers in 3 months
- €4.5-6k/mo by month 3
- Sustainable without hiring

If you hit Rule 1 (1 call/week), this is mathematically achievable.

**Start Monday. Send one message. Get one call on the calendar.**

That's all that's different between "planning" and "executing."

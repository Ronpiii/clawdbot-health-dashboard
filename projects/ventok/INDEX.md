# ventok knowledge graph

Structured knowledge for building and scaling a manufacturing automation SaaS.

**updated:** 2026-03-12  
**owner:** ron (chief strategist)  
**status:** live (product in production, scaling outreach)

---

## synthesis

the core argument woven through every document:

- [[market-fit]]: manufacturers have clear excel-hell pain, proven willingness to pay
- [[execution-model]]: narrow ICP (5-50 person mfg), direct outreach (EST), premium positioning ($200-500/mo)
- [[progression-path]]: 1-person SMB → 2-person SMB → small enterprise (tiered services, not features)
- [[what-wins]]: reliability + domain empathy > feature parity. manufacturers want safety, not surprises

---

## topic maps

navigation by domain cluster. follow links that match your current context.

### strategy & positioning
- [[concept-product-market-fit]] — the hypothesis, evidence, and validation from first customer (Noar)
  - read first if: questioning whether manufacturers actually want this
  - includes: Noar case study, payback math, market size estimation, validation gaps
- [[concept-competitive-landscape]] — who exists, what they're missing, where we win
  - read if: sales push-back on "why not use Airtable?" or "why not enterprise ERP?"
  - includes: competitor feature matrix, why we win sales, what could kill us
- [[concept-pricing-model]] — margin structure, tier design, why manufacturers balk at SaaS but buy tooling
  - read if: pricing a new deal or understanding revenue targets
  - includes: payback logic, tier structure (€200-1200/mo), margin by tier
- [[concept-ideal-customer-profile]] — revenue size, decision-maker role, pain intensity, buying signal
  - read if: qualifying a prospect or researching new target
  - includes: firmographic fit, hot/warm/cold signals, disqualifiers, discovery questions

### execution & sales
- [[cold-outreach-strategy]] — 3-email sequence, timing, personalization per manufacturer type
- [[leads-database]] — 14 priority targets, discovery research per company, contact info, pain signals
- [[discovery-call-script]] — qualification questions, pain mapping, objection handling
- [[service-tiers]] — infrastructure → automation → AI workflows (what we sell, in what order)

### product & features
- [[ai-sales-automation]] — product positioning, use cases, differentiation vs existing tools
- [[competitor-analysis]] — direct/adjacent competitors, feature matrix, pricing comparison
- [[delivery-playbook]] — implementation rhythm, onboarding flow, success metrics per tier

### infrastructure & knowledge
- [[execution-plan]] — 90-day roadmap, weekly focus, decision log
- [[agent-business-model]] — internal operations, tooling assumptions, cost structure

---

## cross-domain claims

patterns that apply across multiple topics:

- [[human-centered-automation]] — users trust systems that explain themselves. this shapes every feature.
- [[narrow-beats-broad]] — winning with manufacturers requires picking a position (we chose reliability + domain knowledge, not features)
- [[economic-reality]] — SMB cash flow is tight. pricing must reflect time-to-payback, not feature count
- [[technical-debt-is-real]] — legacy Excel workbooks hide 10-20 years of institutional knowledge. respect that, don't replace it

---

## explorations needed

open questions where evidence would strengthen decisions:

- **market size**: how many 5-50 person manufacturers in Estonia/EU actually use Excel for critical processes? (estimated 800+, unvalidated)
- **sales velocity**: does direct outreach to manufacturing decision-makers outperform founder-to-founder intros? (hypothesis: yes, testing with TMW)
- **retention**: at what contract value do manufacturers churn vs stick? (no data yet, 1 customer is too small)
- **upsell patterns**: do customers naturally migrate between tiers, or do we push? (unclear, need 3-5 customers)

---

## how to use this graph

**if you're new:** start with [[market-fit]], then [[product-market-fit]]. follow links that match your current question.

**if you're executing sales:** read [[cold-outreach-strategy]] and [[ideal-customer-profile]], reference [[leads-database]] for specifics, use [[discovery-call-script]] as a baseline.

**if you're building product:** start [[ai-sales-automation]], reference [[service-tiers]] for scope, check [[competitor-analysis]] for gaps, validate [[human-centered-automation]] design principle.

**if you're skeptical:** read [[competitive-landscape]] and [[economic-reality]]. both address "why would anyone buy this?"

---

## the graph itself

each file is a complete methodology claim. wikilinks in prose carry meaning, not just references. yaml frontmatter on key files lets agents scan descriptions without reading full content.

the structure grows as we learn. new questions → new files → new connections.

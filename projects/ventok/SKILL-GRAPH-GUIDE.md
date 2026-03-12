# skill graph guide

**what you built:** a traversable knowledge structure for ventok instead of isolated docs.

**why this matters:** as you scale, you need shared understanding. this graph lets agents (and humans) find context fast, without asking "wait, where did we decide this?"

---

## structure

```
INDEX.md (entry point)
├── moc-strategy-and-positioning.md (cluster: market, competition, customer, pricing)
│   ├── concept-product-market-fit.md (standalone: validation evidence)
│   ├── concept-competitive-landscape.md (standalone: competitor analysis)
│   ├── concept-ideal-customer-profile.md (standalone: buyer definition)
│   └── concept-pricing-model.md (standalone: revenue logic)
│
├── moc-execution-and-sales.md (cluster: outreach, discovery, closing)
│   ├── (links to existing docs)
│   ├── cold-outreach-strategy.md
│   ├── leads-database.md
│   ├── discovery-call-script.md
│   └── service-tiers.md
│
└── (full documents: AGENT_BUSINESS.md, competitor-analysis.md, etc.)
```

**key insight:** concept files are scanned (YAML frontmatter + wikilinks tell you what's inside). full docs are traversed only when needed. this is progressive disclosure.

---

## how to use this (for you)

### before a sales call
1. open INDEX.md
2. follow [[concept-ideal-customer-profile]] (quick read, 5 min)
3. check [[leads-database]] for company-specific research
4. skim [[discovery-call-script]] for your questions
5. reference [[concept-pricing-model]] if pricing comes up

**time investment:** 10 minutes, focused context, no guessing

### before a pitch/proposal
1. open [[moc-strategy-and-positioning]] (map overview)
2. hit [[concept-product-market-fit]] for validation language
3. review [[concept-competitive-landscape]] for objection answers
4. dive into [[concept-pricing-model]] for tier sizing
5. reference full services-playbook.md for implementation details

**time investment:** 15 minutes, strategy + execution aligned

### onboarding a new team member
1. have them read INDEX.md (5 min, get the territory)
2. → [[concept-ideal-customer-profile]] (10 min, understand who we target)
3. → [[concept-product-market-fit]] (10 min, understand why they buy)
4. → [[moc-execution-and-sales]] (10 min, understand sales flow)
5. then give them [[leads-database]] and [[discovery-call-script]] to execute

**time investment:** 45 minutes, aligned and ready to contribute

---

## how agents use this (for arc)

**arc's job now:** when you ask about a decision or context, arc can:

1. **scan descriptions** (YAML frontmatter) without reading full files
2. **follow wikilinks** to navigate related context
3. **compose answers** from multiple concept files (consistency)
4. **reference full docs** only when detail is needed (efficiency)

**example:**
- you ask: "should we raise pricing to €400?"
- arc reads: INDEX → [[moc-strategy-and-positioning]] → [[concept-pricing-model]]
- arc has context in 30 seconds
- if you ask "why", arc dives into full services-playbook.md with confidence

---

## evolving the graph

**as you learn:**
- new concept page for each new methodology claim (don't put it in existing docs)
- wikilinks in prose when you discover connections (automatic cross-reference)
- MOCs reorganize when clusters get too big (not yet needed)

**example: after you close TMW deal**
- new concept page: [[customer-success-rhythm]] (weekly check-ins, expansion signals, churn warning signs)
- updates to [[concept-pricing-model]] (data from 2 customers: €72 and [TMW price])
- new MOC maybe: [[customer-lifecycle]] (onboarding → expansion → renewal)

**example: after you hit 10 customers**
- concept page: [[unit-economics-at-scale]] (CAC, LTV, payback by cohort)
- reorganize [[moc-execution-and-sales]] into 2 MOCs: [[outreach-and-discovery]] + [[closing-and-onboarding]]
- new section in INDEX: [[operational-rhythm]] (weekly standup format, metrics to track)

**key discipline:** concepts page = one claim + evidence. don't bloat them.

---

## wikilinks format

all wikilinks in this graph follow the pattern: `[[concept-name]]` or `[[moc-name]]`

when you write new files, link them like this:

```markdown
# my new page

see [[concept-product-market-fit]] for why this positioning works.

contrast this with [[concept-competitive-landscape]] (Airtable's weakness is X).
```

the agent knows: `[[xxx]]` = look for file named `concept-xxx.md` or `moc-xxx.md` or `xxx.md`

---

## next steps

1. **use INDEX.md** as your entry point for the next 30 days (measure if it saves you time)
2. **add 1 concept page** for every new methodology you discover (don't wait for everything to be perfect)
3. **cross-link naturally** (wikilinks emerge from your thinking, not vice versa)
4. **archive old docs** once the graph absorbs them (or keep them as "full references" if they're still valuable)

the graph grows, not replaces. it's a living structure that you shape as you learn.

---

**meta observation:** you just built the thing heinrich was describing in that message. a skill graph for your own business. now the question is: do you want skill graphs for trading, anivia, context memory, and everything else?

if so, we do this same pattern for each domain. if not, ventok is enough to see if it actually saves time.

either way: committed, ready to navigate, ready to scale.

# Ventok AI Sales Automation

*Spec v0.1 — 2026-01-26*

## Vision

AI-powered B2B sales automation for manufacturers expanding into new markets. Not just a CRM — an autonomous sales assistant that researches, writes, follows up, and qualifies leads while humans focus on closing.

## Target Market

**Primary:** Estonian manufacturers (wood, metal, industrial) expanding internationally
**Secondary:** Baltic/Nordic SME manufacturers
**Profile:**
- 10-100 employees
- 2-5 person sales team (often the owner + 1-2 salespeople)
- Selling B2B to distributors, retailers, construction companies
- Currently using Excel/email/nothing for sales tracking
- Want to enter German, Nordic, UK, or other EU markets

## Problem

1. Small sales teams can't research + personalize + follow up at scale
2. Generic CRMs require manual data entry (nobody does it)
3. Outreach sequences feel robotic, get ignored
4. No time to properly qualify leads — everything gets equal attention
5. Market expansion requires volume they can't handle manually

## Solution

**Ventok HUB** — CRM + AI sales agent

The human sets targets and approves actions. The AI does the grunt work:
- Finds and enriches leads
- Writes personalized outreach
- Handles follow-up sequences
- Qualifies based on responses
- Prepares salespeople for calls
- Drafts proposals

## Core Modules

### 1. Lead Database
- Companies + contacts
- Auto-enriched: website, LinkedIn, company size, industry
- Country/market tagging
- Custom fields per customer

### 2. Pipeline (Kanban)
- Visual deal stages
- Auto-movement based on activity (email replied → Contacted)
- Filters by market, value, owner, stage

### 3. AI Research Agent
- Input: company name or domain
- Output: enriched profile (decision makers, company info, recent news, potential fit)
- Sources: website scraping, LinkedIn (manual or API), public databases

### 4. AI Outreach Writer
- Generates personalized emails based on:
  - Lead profile
  - Product catalog
  - Proven templates
  - Market/language
- Multiple variants for A/B testing
- Human approval before send (MVP) → auto-send (later)

### 5. Sequence Engine
- Multi-step follow-up sequences
- Timing rules (wait 3 days, wait 1 week)
- Exit conditions (replied, bounced, unsubscribed)
- AI rewrites follow-ups based on no-response

### 6. Response Classifier
- Incoming email → categorized:
  - Interested → notify + move to Qualified
  - Meeting request → notify + create task
  - Not interested → archive + log reason
  - Question → draft response for approval
  - Out of office → reschedule sequence

### 7. Qualification Scoring
- Score leads based on:
  - Company fit (size, industry, location)
  - Engagement (opens, clicks, replies)
  - Response sentiment
  - Buying signals in conversation
- Prioritize high-score leads for human attention

### 8. Meeting Prep
- Before scheduled call: AI generates briefing
  - Company summary
  - Contact background
  - Conversation history
  - Suggested talking points
  - Potential objections

### 9. Proposal Generator
- Template-based proposals/quotes
- AI fills in company-specific details
- Pricing from product catalog
- PDF export with branding

### 10. Dashboard
- Pipeline value by stage
- Activity metrics (emails sent, open rate, reply rate)
- Leads by market
- Tasks due
- AI actions pending approval

## Tech Stack

### Frontend
- React (or Next.js)
- Hosted on Vercel
- Clean, minimal UI (Notion/Linear aesthetic)

### Backend
- **Option A:** Airtable + Make.com (faster MVP, limits at scale)
- **Option B:** Supabase + FastAPI (more control, scalable)
- Recommend: Start with A, migrate to B when needed

### AI Layer
- Clawdbot instance(s) with:
  - Memory per customer (namespaced)
  - Webhook triggers from CRM
  - Access to customer's product catalog, templates, context
- Models: Claude for writing/reasoning, cheaper model for classification

### Email
- SendGrid, Mailgun, or customer's own SMTP
- Track opens/clicks
- Handle replies via webhook or IMAP polling

### Integrations (later)
- LinkedIn Sales Navigator (manual or unofficial API)
- Calendar (Google/Outlook) for meeting scheduling
- Production system (for order → production handoff)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      VENTOK HUB UI                          │
│         (Pipeline, Leads, Sequences, Dashboard)             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Supabase/Airtable)              │
│   Leads │ Companies │ Deals │ Activities │ Sequences       │
└─────────────────────┬───────────────────────────────────────┘
                      │ webhooks
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 AUTOMATION LAYER (Make.com)                 │
│   Triggers │ Email sending │ Scheduling │ Routing           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLAWDBOT (AI Agent)                      │
│   Research │ Write │ Classify │ Score │ Decide              │
│                                                             │
│   Memory: customer context, product catalog, templates      │
└─────────────────────────────────────────────────────────────┘
```

## Autonomy Levels

Start conservative, increase over time:

| Level | AI does | Human does |
|-------|---------|------------|
| **1. Assisted** | Drafts everything | Approves every action |
| **2. Supervised** | Executes routine tasks | Approves important actions |
| **3. Autonomous** | Handles full sequences | Reviews exceptions only |

MVP = Level 1. Build trust, then unlock higher levels per customer.

## Pricing Model

### Option A: Flat subscription
- Starter: €300/mo (1 user, 500 leads, 1000 AI actions)
- Growth: €600/mo (3 users, 2000 leads, 5000 AI actions)
- Scale: €1200/mo (10 users, unlimited leads, 20000 AI actions)

### Option B: Base + usage
- Base: €200/mo (platform access)
- AI actions: €0.05-0.10 per action (research, write, classify)
- Leads: €0.50-1.00 per enriched lead

### Option C: Retainer (agency model)
- Setup: €3-5k one-time
- Monthly: €500-1000/mo (includes platform + AI + support)
- Best for early customers, transition to SaaS later

**Recommendation:** Start with Option C for TMW and first 3-5 customers. Validate, then productize into Option A.

## MVP Scope (4-6 weeks)

**In scope:**
- [ ] Lead database (companies + contacts)
- [ ] Pipeline kanban view
- [ ] Manual lead entry + CSV import
- [ ] AI research: input domain → enriched profile
- [ ] AI outreach writer: generate personalized email
- [ ] Basic sequence: 3-step follow-up with timing
- [ ] Email sending via SendGrid/Mailgun
- [ ] Response capture (webhook or IMAP)
- [ ] Simple dashboard (pipeline value, recent activity)
- [ ] Single Clawdbot instance, single customer (TMW)

**Out of scope (v2+):**
- Multi-tenant / customer isolation
- Response classification
- Qualification scoring
- Meeting prep briefs
- Proposal generator
- LinkedIn integration
- Calendar integration
- Mobile app

## Revenue Projection

**Conservative:**
- TMW: €500/mo
- 3 more customers year 1: €1500/mo
- End of year 1: €2000/mo MRR

**Optimistic:**
- TMW: €800/mo
- 5 more customers year 1 at €600 avg: €3000/mo
- End of year 1: €3800/mo MRR

This alone could hit the €5k MRR target with 6-8 customers.

## Risks

1. **AI quality** — bad emails = burned leads. Mitigation: human approval in MVP
2. **Email deliverability** — spam filters. Mitigation: proper warmup, DKIM/SPF, quality over volume
3. **Clawdbot costs** — API usage adds up. Mitigation: cache, use cheaper models for simple tasks
4. **Scope creep** — customers want everything. Mitigation: strict MVP, charge for extras
5. **Competition** — Clay, Instantly, Apollo exist. Mitigation: vertical focus (manufacturers), local support, integration with production systems

## Competitive Positioning

**vs generic CRMs (Pipedrive, HubSpot):**
- We're AI-native, they bolt on AI
- We understand manufacturing
- We integrate with production systems (they don't)

**vs AI outreach tools (Clay, Instantly, Apollo):**
- We're full CRM, not just outreach
- Estonian/Baltic focus, local support
- Customized for B2B manufacturing sales cycles

**vs building in-house:**
- They don't have the expertise
- We maintain and improve continuously
- Faster time to market

## Next Steps

1. **Validate with TMW** — present concept, gauge interest, agree on pilot terms
2. **Design UI** — pencil.dev mockups for pipeline, lead detail, dashboard
3. **Build MVP** — 4-6 week sprint
4. **Pilot with TMW** — 2-3 months, iterate based on feedback
5. **Package for next customers** — standardize, document, price

## Open Questions

- [ ] TMW budget/willingness to pay for pilot?
- [ ] Their current email setup (own domain? volume limits?)
- [ ] Which markets are they targeting first?
- [ ] Do they have a product catalog we can use?
- [ ] Who on their team would use this daily?

---

*This could be Ventok's transition from agency to product company.*

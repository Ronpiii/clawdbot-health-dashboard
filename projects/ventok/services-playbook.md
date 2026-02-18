# VENTOK SERVICES PLAYBOOK
## the full loop — inside out

---

# TABLE OF CONTENTS

1. [THE ARCHITECTURE — how the tiers connect](#architecture)
2. [TIER 1 — business infrastructure builds](#tier-1)
3. [TIER 1 — web design & branding](#tier-1-design)
4. [TIER 1 — process automation](#tier-1-automation)
5. [TIER 2 — ai-augmented workflows](#tier-2-ai-workflows)
6. [TIER 2 — context-crafted ai agents](#tier-2-agents)
7. [TIER 3 — local ai hosting](#tier-3-local)
8. [TIER 3 — ventok tooling products (saas)](#tier-3-saas)
9. [THE FLYWHEEL — how clients move through tiers](#flywheel)
10. [PRICING FRAMEWORK](#pricing)
11. [RISK MAP](#risks)

---

# 1. THE ARCHITECTURE {#architecture}

```
┌─────────────────────────────────────────────────────────────┐
│                    VENTOK SERVICE STACK                       │
│                                                              │
│  ┌─────────┐   trust    ┌─────────┐   lock-in  ┌─────────┐ │
│  │ TIER 1  │ ────────>  │ TIER 2  │ ────────>  │ TIER 3  │ │
│  │ infra   │            │ ai-aug  │            │ product │ │
│  │ design  │ <────────  │ agents  │ <────────  │ hosting │ │
│  │ auto    │   data     │         │   demand   │         │ │
│  └─────────┘            └─────────┘            └─────────┘ │
│       │                      │                      │       │
│       └──────────────────────┼──────────────────────┘       │
│                              │                              │
│                     RECURRING REVENUE                        │
│              (maintenance, hosting, support)                 │
└─────────────────────────────────────────────────────────────┘
```

**the core insight:** each tier feeds the next.

- tier 1 gives you ACCESS to the client's operations (you see their data, their pain, their processes)
- tier 2 uses that access to layer intelligence on top (you've already mapped their workflow — now automate the thinking parts)
- tier 3 turns repeated patterns across clients into products (you've seen the same pain 5 times — now build it once)

**the reverse flow matters too:**
- tier 3 products generate INBOUND leads for tier 1 services
- tier 2 ai work generates DATA about what breaks, which feeds tier 3 product decisions
- tier 1 infrastructure gives you the HOOKS to deploy tier 2 solutions

**why this matters for ventok specifically:**
you're not selling "AI" — you're selling a progression. the client who starts with a simple airtable build today is the same client buying a local LLM deployment in 2027. your job is to make each step feel like the obvious next move.

---

# 2. TIER 1 — BUSINESS INFRASTRUCTURE BUILDS {#tier-1}

## what this actually is

you're replacing chaos with systems. every SME has the same disease: information lives in people's heads, in random spreadsheets, in email threads, in whatsapp groups. your job is to externalize it into something that survives when someone quits, goes on vacation, or just forgets.

## the components

### a) client/contact management (CRM-lite)
- **what:** centralized database of contacts, deals, interactions, follow-ups
- **tools:** airtable, supabase + custom UI, notion (for simpler cases)
- **why clients need it:** they're tracking clients in excel or worse — their head. leads fall through cracks. follow-ups don't happen. nobody knows what was promised to whom.
- **what you actually build:**
  - contacts table with company, role, source, status
  - deals/projects table linked to contacts
  - interaction log (calls, emails, meetings) linked to both
  - automated reminders for follow-ups
  - simple dashboard showing pipeline, overdue items, revenue by client
- **delivery time:** 2-4 weeks for airtable, 4-8 weeks for supabase custom
- **maintenance:** ongoing — schema changes, new views, bug fixes, user training

### b) task & project management
- **what:** structured way to track who's doing what, by when, and what's blocking them
- **tools:** airtable, notion, custom supabase builds. NOT selling them jira/asana/monday — those are self-serve. you build custom when off-the-shelf doesn't fit their process.
- **why clients need it:** they're using email to assign tasks. or worse — verbal assignments. nothing is tracked. deadlines are fictional. accountability is zero.
- **what you actually build:**
  - projects → tasks → subtasks hierarchy
  - assignees, due dates, status (not started / in progress / review / done)
  - dependencies (task B can't start until task A is done)
  - views by person ("my tasks"), by project, by deadline
  - weekly digest automations (what's overdue, what's due this week)
- **the simple thing that matters:** the status field. most companies don't have a shared language for "where is this thing." giving them 4-5 statuses with clear definitions changes everything.

### c) internal communications structure
- **what:** defining WHERE different types of communication happen
- **this is not a tool build** — it's a consulting + setup engagement
- **why clients need it:** everything is on whatsapp or email. urgent things get buried. decisions aren't recorded. new hires can't find anything.
- **what you actually do:**
  - audit current comms (where do people talk? what falls through?)
  - design channel structure (slack/teams or even just whatsapp groups with rules)
  - define what goes where: decisions → shared doc, quick questions → chat, project updates → PM tool, files → drive/sharepoint
  - create templates for recurring comms (weekly updates, meeting notes, handoff docs)
  - train the team (this is the hardest part — changing habits)
- **the simple thing that matters:** writing things down. most SME teams operate entirely on verbal communication. the single biggest upgrade is "we write decisions down in a place everyone can find."

### d) document & knowledge management
- **what:** a single source of truth for company knowledge
- **tools:** notion, google drive with structure, sharepoint for bigger orgs
- **why clients need it:** SOPs live in one person's head. onboarding is "shadow someone for 2 weeks." when someone leaves, knowledge leaves with them.
- **what you actually build:**
  - folder/page structure by department or function
  - templates for common documents (proposals, invoices, reports, SOPs)
  - onboarding guide structure
  - naming conventions (this alone is worth the engagement)
  - basic access controls (who sees what)
- **the simple thing that matters:** naming conventions and folder structure. not glamorous. absolutely critical. a company that can FIND its files operates 10x faster than one that can't.

### e) financial tracking & invoicing
- **what:** centralized view of revenue, expenses, invoices, and cash flow
- **tools:** airtable, supabase + custom UI, integration with accounting software
- **why clients need it:** they're doing invoicing in word/excel, tracking expenses manually, and have no real-time view of their financial position
- **what you actually build:**
  - invoice generation from project/client data
  - expense tracking with categories and approval flows
  - revenue dashboard (monthly, by client, by service)
  - automated payment reminders
  - integration with accounting (merit, e-arveldaja for estonian companies)
- **proof you can do this:** the noar build has payout calculations and client billing built in

## how you sell tier 1

**the discovery process:**

1. **audit call (free, 30-60 min)**
   - "walk me through what happens from the moment a new client contacts you to the moment you deliver and get paid"
   - you're mapping their process. every handoff, every spreadsheet, every "oh and then i email this to..."
   - you're looking for: manual steps, information gaps, single points of failure, repeated questions

2. **process map delivery (paid, €200-500)**
   - visual map of their current process with pain points highlighted
   - this is BOTH diagnostic and sales tool
   - when a client SEES their own chaos visualized, they want to fix it
   - include: time estimates per step, error frequency, dependency on specific people

3. **proposal with phases**
   - never sell the whole thing at once
   - phase 1: the one system that hurts most (usually CRM or project management)
   - phase 2: connect it to adjacent systems
   - phase 3: automate the connections

**who buys this:**
- companies with 5-50 employees
- growing fast enough that "how we've always done it" is breaking
- usually triggered by: new hire who can't figure anything out, key person leaving, owner wanting to step back from operations, failed audit, lost client due to dropped ball

**estonian market specifics:**
- manufacturing companies with 10-30 employees who still run on excel and phone calls
- logistics companies managing fleet/routes/clients manually
- professional services (legal, accounting, consulting) drowning in client docs
- the pitch language: "digitalization" resonates more than "digital transformation" in estonian SME context. it's simpler, less corporate, more concrete.

## what makes a good tier 1 engagement

| indicator | good | bad |
|---|---|---|
| client involvement | owner or ops lead is your direct contact | "talk to IT" (IT will resist you) |
| scope | one system, clear boundary | "just fix everything" |
| data | they have data somewhere (even messy) | no data exists yet |
| timeline expectations | 4-8 weeks for v1 | "can you do it this weekend" |
| budget | €2,000-10,000 per phase | "we have €500 total" |
| ongoing need | yes — they'll need changes | one-and-done project |

## the simple things that matter in tier 1

1. **naming conventions** — how files, projects, clients, tasks are named. sounds boring. prevents 80% of "i can't find it" problems.
2. **status definitions** — what does "in progress" mean? what does "done" mean? who changes the status? when? without this, your beautiful system becomes a graveyard.
3. **single source of truth** — one place for each type of information. not "it's in email AND airtable AND the shared drive." ONE place.
4. **owner for each system** — someone whose job includes keeping the system clean. without this, entropy wins in 3 months.
5. **training and adoption** — the best system unused is worth nothing. budget 20% of project time for training. do screen recordings. make cheat sheets. check in after 2 weeks.

---

# 3. TIER 1 — WEB DESIGN & BRANDING {#tier-1-design}

## what this actually is

visual identity and web presence. this is ellie's domain primarily, with you handling the technical implementation and any dynamic/interactive elements.

## the components

### a) brand identity
- logo design (primary + variations)
- color palette (primary, secondary, accent + usage rules)
- typography (heading + body fonts, size hierarchy)
- brand guidelines document (how to use all the above)
- application examples (business cards, email signatures, social templates)

### b) website design & development
- information architecture (sitemap, page structure)
- wireframes → visual design → development
- responsive design (mobile-first for most SME sites)
- CMS setup (webflow, wordpress, or custom depending on needs)
- SEO basics (meta tags, structured data, sitemap, speed optimization)
- analytics setup (google analytics 4, basic conversion tracking)

### c) marketing collateral
- catalogues (like the film location catalogue you've done)
- product packaging design (shot bottle labels etc.)
- presentation templates
- social media templates
- print materials (business cards, brochures, signage)

## how design connects to the other tiers

**this is important and often missed:**

- a website redesign is a TROJAN HORSE for tier 1 infrastructure work. during the website project, you learn how they handle inquiries (CRM), how they manage content (knowledge mgmt), how they track projects internally (PM). you can upsell infrastructure.
- design deliverables need a SYSTEM to live in — brand guidelines need to be findable, templates need to be organized, assets need version control. this IS tier 1.
- a well-structured website with forms and analytics becomes DATA INPUT for tier 2 ai work — lead scoring, automated follow-ups, content recommendations.

## the simple things that matter in design

1. **brand guidelines are useless if nobody follows them** — make them short (1-2 pages), visual, and put them where people can actually find them. not a 40-page PDF nobody opens.
2. **website speed matters more than design polish** — a fast, simple site converts better than a slow, beautiful one. always.
3. **mobile first is not optional** — 60%+ of SME website traffic is mobile. design for the phone, then adapt for desktop.
4. **content strategy before design** — "what goes on the website" must be answered before "what does the website look like." most failed website projects fail because content was an afterthought.
5. **photography > stock images** — one day of professional photography for a client's business is worth more than months of searching for the perfect stock image. budget for it.

---

# 4. TIER 1 — PROCESS AUTOMATION {#tier-1-automation}

## what this actually is

connecting systems so humans don't have to manually move information between them. this is the BRIDGE between tier 1 infrastructure and tier 2 AI — you're automating the MOVEMENT of data before you automate the THINKING about data.

## the components

### a) trigger-based automations
- **what:** when X happens, do Y automatically
- **tools:** make (integromat), zapier, n8n (self-hosted), airtable automations, supabase edge functions
- **examples:**
  - new form submission → create record in CRM → send welcome email → notify sales person on slack
  - invoice marked as sent → start 14-day timer → if unpaid, send reminder email → if still unpaid after 7 more days, notify owner
  - new employee added → create accounts → send onboarding checklist → schedule training sessions
  - order received → update inventory → generate shipping label → notify warehouse
- **the pattern:** TRIGGER → CONDITION → ACTION → NOTIFICATION

### b) data sync automations
- **what:** keeping two or more systems in sync without manual copy-paste
- **examples:**
  - contact updated in CRM → update in email marketing tool
  - product price changed in ERP → update on website
  - employee info changed in HR system → update in payroll
- **tools:** make/zapier for simple, custom API integrations for complex
- **the trap:** two-way sync is 10x harder than one-way. always start one-way. clarify which system is "source of truth."

### c) reporting automations
- **what:** automated generation and distribution of reports
- **examples:**
  - every monday at 8am → pull last week's sales data → generate summary → email to management
  - end of month → compile project hours → calculate profitability → generate client invoice
  - daily → check inventory levels → if below threshold → alert purchasing
- **the value:** these save 2-10 hours per week AND improve data quality (no manual errors)

### d) document generation
- **what:** automatically creating documents from data
- **examples:**
  - proposal generation from CRM deal data
  - invoice generation from project/time tracking data
  - contracts from templates with client-specific variables
  - reports from database queries
- **tools:** make + document templates, custom code for complex layouts

### e) email workflow automations
- **what:** structured email sequences triggered by events
- **examples:**
  - client onboarding sequence (welcome → setup instructions → check-in → feedback request)
  - lead nurturing (download whitepaper → follow-up 1 → follow-up 2 → sales call invite)
  - payment reminders (gentle → firm → final notice)
- **proof you can do this:** noar build includes automated email workflows for consignment payouts

## how you sell automation

**the ROI conversation:**

the ONLY way to sell automation to SMEs is hours saved × hourly cost.

```
current state:
- task takes 2 hours per week
- done by employee earning €25/hour
- annual cost: 2 × 25 × 52 = €2,600

automated state:
- setup cost: €1,500
- monthly maintenance: €50/month = €600/year
- total first year: €2,100
- savings year 1: €500
- savings year 2+: €2,000/year

payback period: ~10 months
```

this math is simple. it works. every automation you propose should come with this calculation.

**the discovery question that unlocks automation sales:**
"what do you do every [day/week/month] that you wish you didn't have to?"

**who buys automation:**
- companies that already have SOME systems (you can't automate nothing)
- people who are personally doing repetitive work they hate
- companies growing faster than they can hire
- companies where errors in manual processes have caused real problems (wrong invoice, missed deadline, lost order)

## the simple things that matter in automation

1. **error handling is not optional** — every automation WILL fail eventually. what happens when it fails? who gets notified? is there a fallback? build this from day one, not after the first disaster.
2. **logging everything** — keep a record of every automation run. what triggered it, what it did, what the result was. this is your debugging lifeline AND your proof of value.
3. **human checkpoints** — not everything should be fully automated. some steps need a human to review before continuing. design these in. "review and approve" is a valid step in an automation.
4. **test with real data** — demo data hides problems. test with actual client data (with permission). edge cases live in real data.
5. **documentation** — write down what the automation does, in plain language, for the client. if you get hit by a bus, can someone else understand and maintain this? if not, you've created dependency, not value.
6. **start small** — automate ONE thing. prove it works. then expand. never try to automate everything at once. the client gets overwhelmed, you get overwhelmed, nothing works.

## make vs zapier vs n8n vs custom

| criteria | make | zapier | n8n | custom code |
|---|---|---|---|---|
| price for SME | €€ | €€€ | free (self-host) | dev time |
| complexity ceiling | high | medium | high | unlimited |
| learning curve | medium | low | medium-high | high |
| reliability | good | good | depends on hosting | depends on you |
| client can maintain | sometimes | yes | rarely | no |
| estonian integrations | decent | decent | decent | full control |
| your recommendation | DEFAULT choice | when client wants self-serve | when budget is tight + you host | when nothing else fits |

**ventok should standardize on make** for most client work because:
- it's powerful enough for 90% of SME needs
- the visual interface helps clients UNDERSTAND what's happening
- pricing is reasonable for small businesses
- you already know it well
- it has good error handling and logging built in

---

# 5. TIER 2 — AI-AUGMENTED WORKFLOWS {#tier-2-ai-workflows}

## what this actually is

taking existing processes (ideally ones you've already built or documented in tier 1) and adding AI to the THINKING steps. this is NOT "we built you a chatbot." this is "the system you already use now also thinks."

## the critical distinction

```
AUTOMATION (tier 1):     IF trigger THEN action
AI-AUGMENTED (tier 2):   IF trigger THEN think THEN action (with human checkpoint)
```

the "think" step is where AI lives. everything else is regular automation.

## the components

### a) classification & routing
- **what:** AI reads incoming content and decides where it should go
- **examples:**
  - customer email comes in → AI classifies: complaint / question / order / spam → routes to right person/queue
  - job application received → AI scores against requirements → sorts into tiers → notifies hiring manager
  - support ticket submitted → AI assesses urgency and category → assigns priority → routes to specialist
  - invoice received → AI extracts vendor, amount, category → pre-fills accounting entry → human approves
- **why this is the BEST entry point for AI:**
  - low risk (human still acts, AI just routes)
  - high volume (email/tickets come in daily)
  - easy to measure (time to route before vs after)
  - client SEES the value immediately
- **the 95/5 problem here:** misrouting is annoying but not catastrophic. a complaint routed to the wrong person still gets handled. this is why classification is safe.

### b) content drafting
- **what:** AI generates first drafts that humans edit and send
- **examples:**
  - client asks a standard question → AI drafts response based on knowledge base → human reviews and sends
  - sales meeting happened → AI generates meeting summary from notes → human corrects and shares
  - new product received → AI generates product description from specs/photos → human edits and publishes
  - weekly report due → AI pulls data and writes narrative → human reviews and distributes
- **why this works:**
  - the human is FASTER at editing a draft than writing from scratch
  - consistency improves (AI uses the same structure every time)
  - institutional knowledge gets captured (the AI's training data becomes the company's style guide)
- **the 95/5 problem here:** AI writes something wrong, but human catches it before sending. the human review step is NON-NEGOTIABLE. frame this to clients as "AI does the first 80%, you do the quality 20%."

### c) data extraction & structuring
- **what:** AI reads unstructured content and pulls out structured data
- **examples:**
  - stack of paper invoices → AI extracts vendor, date, amount, line items → creates structured records
  - email threads → AI extracts action items, decisions, deadlines → creates task list
  - contracts → AI extracts key terms, dates, parties, obligations → creates summary table
  - product catalogues (PDF) → AI extracts product names, specs, prices → creates database entries
- **why this is HIGH VALUE:**
  - manual data entry is the most hated task in any company
  - error rates for manual entry are 1-5%. AI + human review gets to <0.5%
  - this directly connects to tier 1 work (you built the database — now you feed it automatically)
- **the 95/5 problem here:** AI misreads a number or misattributes a field. VALIDATION RULES catch this: "if extracted amount > €100,000, flag for human review." "if confidence score < 0.8, flag for human review."

### d) summarization & insight generation
- **what:** AI reads large volumes of information and produces summaries
- **examples:**
  - 50 customer feedback forms → AI summarizes themes, sentiment, key complaints → management report
  - month of sales data → AI identifies trends, anomalies, opportunities → executive briefing
  - competitor websites → AI extracts pricing, features, positioning → competitive analysis
  - meeting recordings → AI generates minutes with action items → distributed to attendees
- **where this gets tricky:** summaries can miss nuance. critical for the human reviewer to have access to source material, not just the summary.

### e) recommendation engines
- **what:** AI suggests next actions based on data patterns
- **examples:**
  - client hasn't ordered in 60 days → AI suggests re-engagement approach based on order history
  - project is 30% over time budget → AI suggests scope cuts based on remaining deliverables
  - inventory of item X is dropping → AI recommends reorder quantity based on sales velocity
- **why this is tier 2, not tier 3:** it's a FEATURE within an existing system, not a standalone product. the recommendation lives inside the airtable/supabase system you already built.

## the reliability framework — how to handle the 95/5 problem

this is your differentiator. here's the actual framework:

### confidence scoring
every AI output gets a confidence score (0-1). you define thresholds:

```
score >= 0.9:  auto-proceed (with logging)
score 0.7-0.9: proceed but flag for daily review
score < 0.7:   stop and request human input
```

how to implement: most LLM APIs let you extract log probabilities. for classification tasks, you can also use the simple method of asking the AI to rate its own confidence (surprisingly effective with good prompting).

### human-in-the-loop checkpoints
define WHERE humans must review:

```
ALWAYS HUMAN:
- anything sent externally (emails, invoices, proposals)
- financial decisions above €X threshold
- anything involving personal data
- first 50 instances of any new automation (calibration period)

SPOT-CHECK:
- internal classifications (review 10% randomly)
- data extraction (review flagged items + 5% random sample)
- summaries (review when source material is complex)

AUTO-PROCEED:
- internal routing
- status updates
- notification generation
- logging and archiving
```

### fallback rules
when AI fails or confidence is low:

```
FALLBACK CHAIN:
1. retry with different prompt (sometimes rephrasing fixes it)
2. flag for human with AI's best guess + source material
3. route to manual process (the process that existed before AI)
4. log the failure for prompt improvement

NEVER: silently proceed with low-confidence output
NEVER: retry more than once without human awareness
```

### monitoring dashboard
every ai-augmented workflow needs:
- total processed today/week/month
- auto-processed vs human-reviewed ratio
- error rate (human corrections / total processed)
- average confidence score trend
- failure log with reasons

this dashboard IS the proof of value for the client. "your AI workflow processed 847 items this month with 99.2% accuracy and saved approximately 34 hours of manual work."

## how you sell tier 2

**prerequisite:** the client must have SOME system already (ideally one you built in tier 1). you can't augment a process that doesn't exist.

**the pitch:**
"you have [system]. right now, [person] spends [X hours/week] on [task]. we can add AI to handle the routine 80% of that, with [person] reviewing the remaining 20%. based on our reliability data, this saves [Y hours/week] within the first month."

**the pilot structure:**

```
WEEK 1-2: shadow + document
- watch the human do the task 20 times
- document every decision, every exception, every edge case
- categorize: routine (AI can do) vs judgment (human must do)

WEEK 3-4: build + test
- build the AI workflow
- run it in PARALLEL with the human (AI processes, but human still does it too)
- compare outputs, measure accuracy
- tune prompts and thresholds

WEEK 5-6: calibrated deployment
- AI processes, human reviews ALL outputs
- track accuracy daily
- adjust confidence thresholds

WEEK 7-8: graduated autonomy
- high-confidence items auto-proceed
- medium-confidence items flagged
- low-confidence items human-processed
- weekly accuracy review

ONGOING: optimization
- monthly prompt refinement based on error patterns
- quarterly review of thresholds
- continuous monitoring dashboard
```

**pricing for tier 2:**
- pilot/proof of concept: €2,000-5,000 (8-week engagement)
- production deployment: €1,000-3,000 setup + €200-500/month maintenance
- the monthly maintenance is WHERE THE MRR LIVES

## the simple things that matter in tier 2

1. **prompt engineering is 80% of the work** — the AI model matters less than how you talk to it. invest heavily in crafting and testing prompts. version control your prompts. treat them like code.
2. **context windows are your friend** — the more relevant context you feed the AI, the better it performs. this is why tier 1 matters: structured data is better context than chaos.
3. **few-shot examples beat instructions** — showing the AI 5 examples of correct output is more effective than writing 5 paragraphs of instructions. collect real examples from the client's work.
4. **temperature matters** — for classification and extraction, use low temperature (0.0-0.3). for drafting, use medium (0.3-0.7). never use high temperature (0.7+) for business-critical tasks.
5. **cost management** — track API costs per workflow per month. a workflow that costs €200/month in API calls but saves €500/month in labor is good. one that costs €500 and saves €300 is not. always know the math.
6. **model selection** — you don't need GPT-4/Claude Opus for everything. classification tasks run fine on cheaper, faster models. use the smallest model that achieves your accuracy threshold.
7. **data privacy** — know exactly what data you're sending to which API. have a clear data processing agreement with the client. this is especially important in EU/Estonia with GDPR.

---

# 6. TIER 2 — CONTEXT-CRAFTED AI AGENTS {#tier-2-agents}

## what this actually is

a step beyond augmented workflows — these are AI systems that can handle MULTI-STEP tasks with some autonomy. think of tier 2a (above) as "AI does one step." agents do "AI does a sequence of steps, making decisions at each point."

## the distinction from augmented workflows

```
AUGMENTED WORKFLOW: email comes in → AI classifies → routes to human
AGENT:             email comes in → AI classifies → AI drafts response 
                   → AI checks against knowledge base → AI determines 
                   if human review needed → if routine, sends automatically 
                   → if not, queues for human with suggested response
```

the agent has a DECISION TREE it navigates. each node can be AI-powered.

## what "moltbot" could actually be

based on what you've described, here's what a secretary-like agent does:

### the secretary's job, decomposed:

```
INFORMATION INTAKE:
├── read emails, categorize, flag urgent
├── read messages (slack, whatsapp), summarize
├── monitor calendars for conflicts
└── track deadlines and remind

INFORMATION PROCESSING:
├── draft responses to routine inquiries
├── compile briefing docs before meetings
├── summarize meetings and extract action items
└── update task systems with new information

INFORMATION OUTPUT:
├── send routine responses (after approval or autonomously for templates)
├── schedule meetings based on availability
├── generate reports on request
└── route requests to appropriate team members

JUDGMENT CALLS:
├── "is this urgent?" → urgency scoring
├── "who should handle this?" → routing logic
├── "what's the right response?" → template matching + customization
└── "does this need the boss?" → escalation rules
```

### the architecture of an agent

```
┌────────────────────────────────────────────────┐
│                   AGENT CORE                    │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  CONTEXT  │  │  TOOLS   │  │ MEMORY   │     │
│  │  WINDOW   │  │          │  │          │     │
│  │           │  │ email    │  │ past     │     │
│  │ who am i  │  │ calendar │  │ decisions│     │
│  │ who do i  │  │ CRM      │  │ client   │     │
│  │ work for  │  │ database │  │ prefs    │     │
│  │ what are  │  │ slack    │  │ patterns │     │
│  │ my rules  │  │ files    │  │          │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│         │            │             │            │
│         └────────────┼─────────────┘            │
│                      │                          │
│              ┌───────┴────────┐                 │
│              │  DECISION      │                 │
│              │  ENGINE        │                 │
│              │                │                 │
│              │  rules +       │                 │
│              │  llm reasoning │                 │
│              │  + confidence  │                 │
│              │  scoring       │                 │
│              └───────┬────────┘                 │
│                      │                          │
│         ┌────────────┼────────────┐             │
│         │            │            │             │
│    AUTO-ACT     HUMAN-CHECK   ESCALATE         │
│    (high conf)  (medium)      (low/critical)    │
└────────────────────────────────────────────────┘
```

### the components you need to build

1. **context templates (this is the "context crafting" you mentioned)**
   - system prompt that defines the agent's role, personality, boundaries
   - company-specific knowledge (products, services, pricing, policies)
   - client-specific knowledge (history, preferences, communication style)
   - rules and constraints (what the agent CAN and CANNOT do autonomously)
   - tone and language guidelines
   - this is YOUR MOAT — the quality of context templates determines agent quality

2. **tool integrations**
   - the agent needs to READ from and WRITE to real systems
   - email (IMAP/SMTP or API: gmail, outlook)
   - calendar (google calendar, outlook calendar API)
   - CRM/database (the airtable/supabase system you built in tier 1)
   - messaging (slack API, potentially whatsapp business API)
   - file storage (google drive, sharepoint)
   - each integration = more capability but also more risk surface

3. **memory system**
   - short-term: current conversation/task context
   - medium-term: recent interactions with this client/person (last 30 days)
   - long-term: persistent facts (client preferences, company policies, historical decisions)
   - vector database for semantic search across memory (pinecone, supabase pgvector, weaviate)

4. **decision framework**
   - rules engine: hard rules that ALWAYS apply (never promise discounts, always CC manager on contracts, etc.)
   - confidence scoring: how sure is the agent about its response?
   - escalation logic: when to involve a human
   - action permissions: what the agent can do without approval vs with approval

5. **monitoring and feedback loop**
   - every agent action logged
   - human feedback on agent decisions (correct/incorrect/partially correct)
   - regular prompt refinement based on error patterns
   - performance metrics dashboard

## how context crafting actually works

this deserves its own section because you specifically mentioned it and it IS the core skill.

### what makes a good context template

```
SYSTEM PROMPT STRUCTURE:
├── IDENTITY: who is this agent, what company, what role
├── KNOWLEDGE: what does it know about the business
│   ├── products/services (with details)
│   ├── pricing and terms
│   ├── common questions and answers
│   ├── team structure and responsibilities
│   └── policies and procedures
├── BEHAVIOR RULES: how should it act
│   ├── tone and communication style
│   ├── language (estonian? english? both?)
│   ├── what it can do autonomously
│   ├── what requires human approval
│   └── what it should never do
├── EXAMPLES: concrete examples of good responses
│   ├── routine inquiry → response
│   ├── complaint → response
│   ├── complex question → escalation
│   └── out-of-scope → redirect
└── META-RULES: rules about how to apply rules
    ├── when in doubt, ask the human
    ├── never make up information
    ├── always cite source when referencing policies
    └── acknowledge uncertainty explicitly
```

### the crafting process

1. **shadow the person the agent will replace/assist** — document EVERY interaction for 2 weeks
2. **categorize interactions** — routine (80%), needs judgment (15%), complex (5%)
3. **write response templates** for the routine 80%
4. **write escalation criteria** for the 15% and 5%
5. **test with historical data** — take past emails/requests, run through agent, compare to actual responses
6. **calibrate with the human** — show them agent outputs, get corrections, incorporate feedback
7. **iterate prompts** — version control everything, A/B test prompt variations

### the hallucination mitigation strategies specific to agents

```
STRATEGY 1: RETRIEVAL-AUGMENTED GENERATION (RAG)
- agent MUST search knowledge base before responding
- if information isn't in knowledge base, say "i don't have that information, let me check with [human]"
- never generate from pure LLM knowledge for factual business queries

STRATEGY 2: CONSTRAINED OUTPUTS
- for pricing: agent can ONLY quote prices from the price list
- for policies: agent can ONLY cite policies from the policy document
- for scheduling: agent can ONLY offer times from the actual calendar
- the agent composes responses from verified building blocks, not free generation

STRATEGY 3: SELF-VERIFICATION
- agent generates response
- then reviews its own response against source material
- flags any claims not supported by sources
- this adds latency but dramatically reduces hallucination

STRATEGY 4: PROGRESSIVE DISCLOSURE
- first response is conservative (acknowledge, categorize, ask clarifying questions)
- second response adds detail from verified sources
- avoids the "confidently wrong first message" problem
```

## the simple things that matter for agents

1. **agents are only as good as their knowledge base** — garbage in, garbage out. if the company doesn't have documented policies, pricing, and FAQs, you need to CREATE these before building the agent. this is tier 1 work.
2. **the first version should be embarrassingly limited** — an agent that handles 5 types of email perfectly is worth more than one that handles 50 types poorly. start narrow, expand based on data.
3. **personality matters** — how the agent communicates affects trust. estonian business communication is direct, not flowery. build this into the prompts.
4. **response time expectations** — set them explicitly. "the agent responds within 2 minutes. if it escalates, you'll hear from a human within 4 hours." not setting expectations leads to disappointment.
5. **exit strategy** — what happens if the AI provider changes pricing? if the model degrades? if the client wants to switch? design for portability. don't lock into one provider's proprietary tools.

---

# 7. TIER 3 — LOCAL AI HOSTING {#tier-3-local}

## what this actually is

running large language models on hardware that the business controls — either on-premises (physical servers in their office/datacenter) or in a private cloud environment (VPS that only they access). NO data leaves their infrastructure.

## why businesses want this

```
REASON 1: DATA SOVEREIGNTY
- regulated industries (finance, healthcare, legal, defense)
- GDPR compliance — sending data to US-based APIs is legally complex
- client confidentiality requirements
- trade secrets they genuinely can't risk exposing
- estonian e-residency companies with multi-jurisdictional data concerns

REASON 2: COST AT SCALE
- if you're processing 100k+ documents per month, API costs become significant
- local hosting has high upfront cost but low marginal cost per query
- break-even usually at 50,000-100,000 API calls per month

REASON 3: LATENCY AND AVAILABILITY
- no internet dependency for AI features
- consistent response times (no API rate limits or outages)
- works in air-gapped environments (military, certain industrial)

REASON 4: CUSTOMIZATION
- fine-tuning on proprietary data without uploading to third parties
- custom model architectures for specific tasks
- full control over model versions and updates
```

## the technical stack

### hardware requirements

```
SMALL (7B-13B parameter models — good for classification, extraction, simple generation):
- GPU: NVIDIA RTX 4090 (24GB VRAM) or A6000 (48GB VRAM)
- CPU: any modern 8+ core
- RAM: 32GB minimum, 64GB recommended
- Storage: 500GB NVMe SSD
- cost: €3,000-8,000

MEDIUM (30B-70B parameter models — good for complex reasoning, drafting):
- GPU: 2x A6000 (48GB each) or 1x A100 (80GB)
- CPU: 16+ core Xeon/EPYC
- RAM: 128GB
- Storage: 1TB NVMe SSD
- cost: €15,000-40,000

LARGE (70B+ models at full precision — approaching cloud model quality):
- GPU: 2-4x A100 (80GB) or H100
- CPU: 32+ core
- RAM: 256GB+
- Storage: 2TB+ NVMe SSD
- cost: €50,000-200,000+
```

### software stack

```
INFERENCE SERVERS:
├── ollama (easiest setup, good for small-medium)
├── vllm (best performance, production-grade)
├── llama.cpp (CPU-optimized, runs without GPU)
├── text-generation-inference (huggingface, good middleware)
└── localai (drop-in openai API replacement)

MODELS (open-source, free to deploy):
├── llama 3.1/3.2 (meta — best general purpose open model)
├── mistral/mixtral (good for european languages including estonian)
├── phi-3 (microsoft — surprisingly good for small model)
├── qwen 2.5 (alibaba — strong multilingual)
├── gemma 2 (google — good for smaller hardware)
└── deepseek v2/v3 (strong reasoning)

SUPPORTING INFRASTRUCTURE:
├── vector database: pgvector (in supabase), chroma, milvus
├── orchestration: langchain, llamaindex, haystack
├── monitoring: prometheus + grafana
├── api gateway: nginx, traefik
└── container orchestration: docker compose (small), kubernetes (large)
```

### the deployment architecture

```
┌──────────────────────────────────────────────┐
│            CLIENT INFRASTRUCTURE              │
│                                              │
│  ┌──────────┐    ┌──────────────────────┐   │
│  │ EXISTING │    │   AI INFERENCE SERVER  │   │
│  │ SYSTEMS  │───>│                        │   │
│  │          │    │  ┌────────┐ ┌───────┐ │   │
│  │ CRM      │    │  │ MODEL  │ │ RAG   │ │   │
│  │ ERP      │    │  │ SERVER │ │ ENGINE│ │   │
│  │ EMAIL    │    │  │ (vllm) │ │       │ │   │
│  │ FILES    │    │  └────────┘ └───────┘ │   │
│  │          │<───│                        │   │
│  └──────────┘    │  ┌────────┐ ┌───────┐ │   │
│                  │  │ VECTOR │ │ API   │ │   │
│                  │  │ DB     │ │ GATE  │ │   │
│                  │  └────────┘ └───────┘ │   │
│                  └──────────────────────┘   │
│                                              │
│  ALL DATA STAYS WITHIN THIS BOUNDARY         │
└──────────────────────────────────────────────┘
```

## what you actually deliver

### the engagement phases

```
PHASE 1: ASSESSMENT (2-4 weeks, €2,000-5,000)
- audit current data flows and AI use cases
- classify data sensitivity levels
- benchmark: what model size/quality do they need?
- hardware recommendation
- cost comparison: local vs cloud API for THEIR specific workload
- compliance gap analysis (GDPR, sector-specific regulation)
- deliverable: feasibility report with ROI calculation

PHASE 2: PROOF OF CONCEPT (4-8 weeks, €5,000-15,000)
- set up inference server on test hardware (can use cloud GPU initially)
- deploy chosen model
- build RAG pipeline with sample company documents
- benchmark: latency, accuracy, throughput
- compare output quality to cloud APIs for their specific use cases
- deliverable: working demo + benchmark report

PHASE 3: PRODUCTION DEPLOYMENT (4-12 weeks, €10,000-50,000+)
- procure and configure production hardware
- deploy inference server with monitoring
- build API gateway for internal systems
- integrate with existing workflows (tier 1 & 2 systems)
- security hardening (firewall, access controls, encryption at rest)
- documentation and runbooks
- deliverable: production system + documentation

PHASE 4: ONGOING MANAGEMENT (monthly, €500-2,000/month)
- model updates and upgrades
- performance monitoring and optimization
- knowledge base maintenance (RAG index updates)
- security patches
- capacity planning (when do they need more hardware?)
- this is the recurring revenue
```

## the honest assessment

**where local hosting makes sense TODAY (2025-2026):**
- document processing pipelines (contracts, invoices, reports) where data is sensitive
- internal search/Q&A over proprietary knowledge bases
- classification tasks at high volume
- companies already spending €5,000+/month on cloud AI APIs

**where it does NOT make sense yet:**
- companies with <50 employees (cost doesn't justify)
- tasks requiring frontier model quality (GPT-4/Claude Opus level)
- one-off or low-volume AI usage
- companies without IT staff to maintain hardware

**the estonian angle:**
- estonia has strong data protection awareness (digital society, e-residency)
- GDPR is taken seriously — "your data never leaves your building" resonates
- manufacturing/logistics companies often have sensitive operational data
- BUT: these companies also have small budgets. the sweet spot is companies with 50-200 employees and €50M+ revenue.

## what you need before selling this

1. **a lab setup** — buy/rent a machine with a decent GPU, deploy ollama + a few models, benchmark them. you need to be able to demonstrate this, not just talk about it.
2. **benchmark data** — "llama 3.1 70B achieves 94% accuracy on [task] compared to 97% for GPT-4, at 1/10th the per-query cost for volumes above 50k/month." real numbers, real comparisons.
3. **a reference deployment** — even if it's your own. run ventok's internal systems on local AI. document the experience. this is your case study.
4. **partnerships** — hardware suppliers (GPU servers), possibly a local datacenter for clients who want hosted-but-private. in estonia: telia, elisa, or smaller providers.
5. **compliance knowledge** — understand GDPR data processing requirements well enough to have the conversation. you don't need to be a lawyer, but you need to know the vocabulary and the key principles.

## the simple things that matter for local hosting

1. **model quantization is your friend** — a 70B model quantized to 4-bit runs on much less hardware with only 2-5% quality loss for most tasks. always benchmark quantized vs full-precision for the specific use case.
2. **cooling and power** — GPU servers generate HEAT. a lot of it. the client's office needs adequate cooling. power consumption is 500W-2000W per server. this affects ongoing costs.
3. **backup and redundancy** — what happens when the GPU server dies? plan for this. spare hardware, cloud fallback, or just an accepted downtime SLA.
4. **model evaluation is critical** — don't assume the biggest model is best. test 3-5 models on the client's actual data and tasks. sometimes a well-prompted 13B model beats a lazy 70B deployment.
5. **the human layer still applies** — local AI doesn't eliminate the need for the reliability framework from tier 2. confidence scoring, human checkpoints, and monitoring are STILL required.

---

# 8. TIER 3 — VENTOK TOOLING PRODUCTS (SAAS) {#tier-3-saas}

## what this actually is

when you've built the same thing for 3+ clients, you stop building custom and build a PRODUCT. a thing with a login page, documentation, and a monthly subscription fee. it serves many clients with one codebase.

## the product development framework

### when to productize

```
PRODUCTIZE WHEN:
✓ you've built essentially the same thing 3+ times
✓ the core workflow is similar across clients (even if details differ)
✓ configuration (not customization) can handle client differences
✓ the market is big enough (100+ potential clients in Estonia alone)
✓ you can price it at €50-500/month and the math works

DO NOT PRODUCTIZE WHEN:
✗ each client needs >30% custom work
✗ the market is <50 potential clients
✗ the problem is already well-served by existing tools
✗ you can't maintain it alongside client work
✗ it requires extensive onboarding/training per client
```

### the progression from service to product

```
CLIENT WORK (tier 1-2):
└── build custom solution for Client A
    └── build similar solution for Client B (reuse 60%)
        └── build similar solution for Client C (reuse 80%)
            └── extract common patterns into configurable product
                └── sell product to Clients D, E, F, G...
                    └── offer premium support / customization as service add-on
```

## potential ventok products (based on patterns you've seen)

### product idea 1: SME operations hub
- **what:** airtable-like but pre-configured for estonian SMEs
- **who:** 5-30 person companies
- **features:** CRM, task management, invoicing, time tracking — all in one
- **differentiation:** pre-built for estonian context (e-arveldaja integration, estonian tax calculations, estonian language)
- **pricing:** €99-299/month
- **risk:** competing with notion/airtable/monday — these are good enough for many
- **mitigant:** estonian-specific integrations and language that global tools don't offer

### product idea 2: consignment/inventory management
- **what:** productized version of what you built for noar
- **who:** consignment shops, vintage stores, marketplace sellers
- **features:** inventory tracking, consignor management, payout calculation, automated email notifications
- **differentiation:** purpose-built for consignment model (not adapted from generic inventory)
- **pricing:** €49-149/month
- **risk:** niche market — maybe 50-200 potential clients in estonia
- **mitigant:** could expand to nordics/EU, consignment is growing market

### product idea 3: AI email assistant for SMEs
- **what:** productized version of tier 2 email classification + drafting
- **who:** any SME receiving 50+ emails/day
- **features:** auto-classify, draft responses, extract action items, daily digest
- **differentiation:** pre-configured for estonian business context, bilingual (estonian/english)
- **pricing:** €99-199/month per mailbox
- **risk:** big players (google, microsoft) are building this into gmail/outlook
- **mitigant:** customization depth — your product knows the client's specific business, not just generic email patterns

### product idea 4: process documentation tool
- **what:** tool that watches how people work and generates SOPs automatically
- **who:** companies trying to document their processes (all of them)
- **features:** screen recording → AI generates step-by-step documentation → editable → versionable
- **differentiation:** active generation vs passive wiki. people don't write SOPs because it's boring. this writes them for you.
- **pricing:** €49-99/month
- **risk:** technically complex (screen recording + AI analysis)
- **mitigant:** massive pain point, very sticky if it works

## the saas economics

```
UNIT ECONOMICS TARGET:
├── price per client: €100/month (average)
├── cost to serve per client: €20/month (hosting, api costs, support)
├── gross margin: 80%
├── churn rate target: <5%/month (ideally <3%)
├── customer acquisition cost: <€500 (content marketing, direct outreach)
├── lifetime value: €100 × 20 months (at 5% churn) = €2,000
├── LTV:CAC ratio: 4:1 (minimum viable, aim for 6:1+)
└── break-even: 50 clients × €100 = €5,000/month covers costs

SCALING MILESTONES:
├── 10 clients: validates product-market fit
├── 30 clients: covers one full-time salary
├── 50 clients: break-even with infrastructure costs
├── 100 clients: profitable, can hire
└── 300 clients: significant business (€30k MRR)
```

## what you need before building a product

1. **3+ clients with the same pain** — not theoretical clients. real ones who've paid you to solve this.
2. **a hypothesis about what's configurable vs custom** — draw the line. what's the same for everyone? what changes per client?
3. **an MVP scope that takes <8 weeks to build** — if it takes longer, you'll never finish alongside client work.
4. **10 potential beta users** — people who'll use it for free/cheap and give you honest feedback.
5. **a maintenance budget** — a product needs constant attention. bugs, feature requests, infrastructure, support. budget 20 hours/month minimum.

## the simple things that matter for saas

1. **onboarding is everything** — if a user can't get value within 15 minutes of signing up, they'll churn. obsess over first-run experience.
2. **support is product work** — every support ticket is a UX failure. track them, fix the root cause, not just the symptom.
3. **pricing is positioning** — €49/month says "small tool." €299/month says "serious business software." price for the positioning you want, not just cost-plus.
4. **one product at a time** — do not build product 1 AND product 2 simultaneously. pick one. nail it. then consider the next.
5. **distribution > features** — a mediocre product with great distribution (you sell it through your tier 1/2 client relationships) beats a great product that nobody finds.

---

# 9. THE FLYWHEEL — HOW CLIENTS MOVE THROUGH TIERS {#flywheel}

## the client journey

```
AWARENESS:
└── client finds ventok (referral, cold outreach, website, content)

TIER 1 ENTRY:
└── engagement: process audit + infrastructure build
    ├── you build their CRM/PM/automation
    ├── you now understand their operations deeply
    ├── they trust you
    └── you see their pain points that AI could solve

TIER 2 UPSELL (3-6 months after tier 1):
└── "remember how you said [task] takes [person] 10 hours a week?
     we can cut that to 2 hours with AI."
    ├── you build AI workflow on TOP of the infrastructure you built
    ├── monthly maintenance = recurring revenue
    └── you now have DATA about their AI usage

TIER 2 EXPANSION (6-12 months):
└── "your email workflow is saving 30 hours/month. here are 3 other
     processes where we could do the same thing."
    ├── expand AI to more workflows
    ├── more MRR
    └── deeper operational integration

TIER 3A OPTION — LOCAL HOSTING (12-24 months):
└── "you're spending €3,000/month on AI API costs and your legal team
     is worried about data leaving your infrastructure. let's bring
     the AI in-house."
    ├── high-value project (€20k-50k)
    ├── ongoing management contract (€1k-2k/month)
    └── deepest possible client relationship

TIER 3B OPTION — PRODUCT (after 3+ similar tier 1-2 builds):
└── "we've built this for 4 clients now. let's make it a product."
    ├── productize the pattern
    ├── sell to new clients as self-serve
    └── offer premium support as add-on
```

## the revenue math over time

```
YEAR 1 (4-6 tier 1 clients):
├── project revenue: 5 × €5,000 = €25,000
├── monthly maintenance: 5 × €100/month × 8 avg months = €4,000
├── total: ~€29,000
└── MRR at end of year: €500

YEAR 2 (6-8 new tier 1 + 3-4 tier 2 upsells):
├── new project revenue: 7 × €5,000 = €35,000
├── tier 2 pilot revenue: 4 × €3,000 = €12,000
├── maintenance (tier 1): 10 × €100/month × 12 = €12,000
├── maintenance (tier 2): 4 × €300/month × 6 avg = €7,200
├── total: ~€66,200
└── MRR at end of year: €2,200

YEAR 3 (tier 2 expansion + first tier 3 projects):
├── new project revenue: 8 × €5,000 = €40,000
├── tier 2 expansions: 6 × €5,000 = €30,000
├── tier 3 projects: 1 × €20,000 = €20,000
├── maintenance (all): ~€4,000/month × 12 = €48,000
├── total: ~€138,000
└── MRR at end of year: €5,000 ← TARGET FOR FULL-TIME TRANSITION
```

these numbers are conservative. they assume no design revenue (ellie's side), no saas revenue yet, and slow tier progression.

## the key metrics to track

| metric | what it tells you | target |
|---|---|---|
| MRR | recurring income | growing 15%+ month-over-month |
| client retention | are they staying | 90%+ annual |
| tier progression rate | are clients moving up | 30%+ of tier 1 clients should reach tier 2 within 12 months |
| revenue per client | are you going deep | €5,000+ annual per client |
| project pipeline | future revenue | 3+ months of work visible |
| utilization rate | are you busy | 70-80% (leave room for business development) |

---

# 10. PRICING FRAMEWORK {#pricing}

## principles

1. **value-based, not time-based** — price on outcomes, not hours. "we'll save you 30 hours/month" justifies €500/month regardless of whether it took you 10 or 100 hours to build.
2. **always have monthly recurring** — every project should have an ongoing component. maintenance, monitoring, support, optimization.
3. **the first project is an investment** — you can discount the first build if it leads to MRR. the setup fee is the cost of the relationship.
4. **transparent pricing** — estonian SMEs respect honesty. give them the real number upfront. don't nickel-and-dime.
5. **package, don't itemize** — "infrastructure setup: €4,000" beats "database: €800, CRM views: €600, automations: €1,200, training: €400, documentation: €300, testing: €700"

## price ranges by service

| service | setup fee | monthly recurring | notes |
|---|---|---|---|
| process audit & mapping | €200-500 | — | can be credited toward build |
| basic infra build (airtable) | €2,000-5,000 | €50-150 | depending on complexity |
| advanced infra build (supabase) | €5,000-15,000 | €100-300 | custom UI, integrations |
| website design + dev | €3,000-10,000 | €50-150 | hosting, updates, analytics |
| brand identity | €1,500-5,000 | — | one-time, maybe annual refresh |
| automation setup (make/zapier) | €1,000-4,000 | €100-300 | per workflow cluster |
| ai workflow pilot | €2,000-5,000 | €200-500 | 8-week engagement |
| ai agent deployment | €5,000-15,000 | €300-1,000 | depends on scope |
| local ai assessment | €2,000-5,000 | — | feasibility study |
| local ai deployment | €10,000-50,000 | €500-2,000 | hardware not included |
| saas product | — | €49-299/user | when you get there |

---

# 11. RISK MAP {#risks}

## risks by tier

### tier 1 risks
| risk | likelihood | impact | mitigation |
|---|---|---|---|
| client doesn't adopt the system | HIGH | high | training + check-ins + make it genuinely easier than their current way |
| scope creep | HIGH | medium | written scope, change request process, say no |
| airtable/tool pricing changes | medium | medium | build migration capability, don't marry one platform |
| client expects 24/7 support | medium | low | SLA in contract, define response times |
| client's team resists change | HIGH | high | get executive sponsor, start with willing team members, show quick wins |

### tier 2 risks
| risk | likelihood | impact | impact | mitigation |
|---|---|---|---|---|
| AI makes costly error | medium | HIGH | reliability framework, insurance discussion, liability clause in contract |
| API costs exceed value | medium | medium | monitor costs, set alerts, switch to cheaper models |
| model quality degrades (provider update) | medium | medium | version pinning, regular benchmarking, provider diversification |
| client expects 100% accuracy | HIGH | medium | set expectations in contract: "AI + human review" not "AI replaces human" |
| GDPR compliance issues | low | HIGH | data processing agreement, minimize data sent to APIs, local processing where possible |

### tier 3 risks
| risk | likelihood | impact | mitigation |
|---|---|---|---|
| hardware failure | medium | HIGH | redundancy plan, cloud fallback, maintenance contract |
| model becomes outdated | HIGH | medium | upgrade plan, regular benchmarking against cloud alternatives |
| client can't maintain without you | HIGH | medium | documentation, training, consider it a feature (MRR) |
| local models can't match cloud quality | HIGH for some tasks | medium | honest assessment upfront, hybrid approach (local for sensitive, cloud for complex) |
| high upfront investment scares client | HIGH | high | lease options, phased deployment, start with cloud GPU before buying hardware |

### business-level risks
| risk | likelihood | impact | mitigation |
|---|---|---|---|
| AI commoditization (everyone offers "AI") | HIGH | medium | differentiate on reliability framework + estonian market knowledge + full-stack capability |
| key person dependency (you) | HIGH | HIGH | document everything, build repeatable processes, eventually hire |
| pricing pressure from bigger agencies | medium | medium | stay lean, compete on speed and depth of relationship, not price |
| economic downturn reduces SME spending | medium | high | focus on cost-saving services (automation), build MRR buffer |
| burnout from running agency + day job | HIGH | HIGH | set capacity limits, prioritize MRR over project work, plan transition timeline |

---

# APPENDIX: WHAT TO DO NEXT

## immediate actions (this month)

1. **audit your own operations** — use ventok as the first tier 1 case study. document your own processes. build your own CRM in supabase. automate your own email outreach. eat your own dogfood.

2. **create your context template library** — start building the prompt templates you'll use for tier 2. version control them. test them on real tasks. this is IP.

3. **pick ONE tier 2 pilot** — from your existing clients or warm leads (TMW, Luminor, Veho Tartu), which one has a task that AI could augment? pitch the pilot.

4. **set up a local AI lab** — buy or rent a machine with a GPU. deploy ollama. run llama 3.1. benchmark it. take screenshots. write about it. this is your tier 3 credential.

## quarterly goals

```
Q1 2025: 2 new tier 1 clients + 1 tier 2 pilot started
Q2 2025: tier 2 pilot producing results + 2 more tier 1 clients + local AI lab operational
Q3 2025: 2 tier 2 production deployments + first tier 3 assessment + MRR at €1,500
Q4 2025: 3+ tier 2 clients + first tier 3 PoC + MRR at €2,500
Q1 2026: evaluate product opportunity + MRR at €3,500
Q2 2026: MRR at €5,000 → full-time transition decision point
```

---

*this document is a living reference. update it as you close deals, learn what works, and adjust pricing based on market feedback.*

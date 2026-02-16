# Agent API Design: Making Anivia Agent-Native
## Technical Spec for Ventok — Feb 2026

---

## 1. The Vision

Every AI agent that needs to send cold email should use Anivia's infrastructure. The API should be so natural for agents that it becomes the default choice — like Stripe for payments.

**Design Principles:**
- Agent-first: designed for programmatic use, not human UI
- Stateless where possible: agents shouldn't need to manage session state
- Opinionated defaults: smart defaults reduce API calls and agent "thinking"
- Observable: agents need clear feedback on what happened and why
- Safe: rate limits, guardrails, and reversible actions by default

---

## 2. MCP (Model Context Protocol) Connector

### What MCP Is
MCP is an open standard (from Anthropic) for connecting AI applications to external systems. Think "USB-C for AI" — standardized way for Claude, ChatGPT, and any LLM to use tools.

MCP provides:
- **Tools**: Functions the AI can call (send email, check deliverability, etc.)
- **Resources**: Data the AI can read (campaign stats, inbox health, etc.)
- **Prompts**: Pre-built instructions for common workflows

### Anivia MCP Server Design

```typescript
// MCP Server: anivia-mcp
// Tools exposed to LLMs

tools:
  // === SENDING ===
  send_email:
    description: "Send a cold email through Anivia's deliverability infrastructure"
    params:
      to: string           // recipient email
      subject: string      // email subject
      body: string         // HTML or plain text body
      from_mailbox?: string // specific mailbox (auto-selected if omitted)
      campaign_id?: string  // group into campaign
      delay_minutes?: number // schedule for later
    returns:
      message_id: string
      mailbox_used: string
      deliverability_score: number  // pre-send score 0-100
      warnings: string[]

  send_sequence:
    description: "Start a multi-step email sequence for a contact"
    params:
      to: string
      steps: Array<{subject, body, delay_days}>
      campaign_id?: string
    returns:
      sequence_id: string
      estimated_completion: date
      step_count: number

  // === DELIVERABILITY ===
  check_deliverability:
    description: "Score an email before sending. Returns inbox placement prediction."
    params:
      to: string
      subject: string
      body: string
    returns:
      score: number        // 0-100
      prediction: "inbox" | "promotions" | "spam"
      issues: Array<{type, severity, fix}>
      recommendations: string[]

  get_inbox_health:
    description: "Check health of your sending infrastructure"
    params:
      mailbox?: string    // specific mailbox or all
      domain?: string     // specific domain or all
    returns:
      overall_score: number
      domains: Array<{domain, reputation, warmup_status, age_days}>
      mailboxes: Array<{email, health, sends_today, bounce_rate}>
      warnings: string[]

  // === DOMAIN MANAGEMENT ===
  provision_domain:
    description: "Buy and configure a new sending domain with DNS records"
    params:
      base_name: string   // e.g. "ventok" → generates ventok-mail.com etc
      count?: number      // how many domains (default 1)
      provider?: "google" | "microsoft"
    returns:
      domains: Array<{domain, dns_status, estimated_warm_date}>

  get_domain_status:
    description: "Check status of all domains including warmup progress"
    returns:
      domains: Array<{domain, status, warmup_progress_pct, reputation, sends_remaining_today}>

  // === CAMPAIGN MANAGEMENT ===
  create_campaign:
    description: "Create a campaign to group and track related emails"
    params:
      name: string
      tags?: string[]
    returns:
      campaign_id: string

  get_campaign_stats:
    description: "Get performance metrics for a campaign"
    params:
      campaign_id: string
    returns:
      sent: number
      delivered: number
      opened: number
      replied: number
      bounced: number
      open_rate: number
      reply_rate: number
      bounce_rate: number

  // === CONTACTS ===
  verify_email:
    description: "Verify if an email address is valid before sending"
    params:
      email: string
    returns:
      valid: boolean
      risk: "low" | "medium" | "high"
      reason?: string

  // === REPLIES ===
  get_replies:
    description: "Get replies received across campaigns"
    params:
      campaign_id?: string
      since?: date
      intent?: "interested" | "not_interested" | "out_of_office" | "bounce" | "all"
    returns:
      replies: Array<{from, subject, body, intent, received_at, campaign_id}>

resources:
  // Read-only data agents can access
  sending_limits:
    description: "Current sending limits and usage"
  compliance_rules:
    description: "Active compliance rules (CAN-SPAM, GDPR regions, blocked domains)"
  warmup_pool_status:
    description: "Current warmup pool health and capacity"
```

### Implementation
- Build as standalone MCP server package: `@anivia/mcp-server`
- Publish to MCP registry for discovery
- Works with: Claude Desktop, Claude Code, any MCP-compatible client
- Authentication: API key passed as MCP config parameter

---

## 3. Claude & ChatGPT Native Integration

### Claude Connector (like Clay)
Clay's approach (Jan 2026):
1. Built a connector listed on Claude's Connectors page
2. User connects Clay account to Claude
3. Claude can then use Clay tools in conversation
4. Free credits on connection (500 credits)

**Anivia should do the same:**
1. Build connector that exposes: send_email, check_deliverability, get_campaign_stats, get_replies
2. List on Claude Connectors marketplace
3. User connects Anivia account → gets free sending credits
4. Claude can then send emails, check deliverability, manage campaigns natively

### ChatGPT GPT Actions
- Custom GPT with Actions pointing to Anivia API
- OpenAPI spec defining all endpoints
- OAuth 2.0 authentication flow
- Pre-built GPT: "Anivia Outreach Agent" that handles cold email campaigns

### The First-Mover Play
- **Clay = data connector for LLMs** (enrichment, research)
- **Anivia = sending connector for LLMs** (deliverability, sending, campaign management)
- These are COMPLEMENTARY: Clay finds the contacts → Anivia sends the emails
- Being the FIRST sending infrastructure in Claude/ChatGPT = massive advantage

---

## 4. REST API Design

### Base URL
```
https://api.anivia.io/v1
```

### Authentication
```
Authorization: Bearer avi_sk_xxxxxxxxxxxxx
```

### Core Endpoints

```yaml
# SENDING
POST   /v1/emails                    # Send a single email
POST   /v1/emails/batch              # Send batch (up to 100)
POST   /v1/sequences                 # Start a sequence
DELETE /v1/sequences/{id}            # Cancel a sequence
GET    /v1/sequences/{id}            # Get sequence status

# DELIVERABILITY
POST   /v1/deliverability/check      # Pre-send deliverability check
GET    /v1/deliverability/health     # Overall infrastructure health
GET    /v1/deliverability/domains    # Domain reputation & status
GET    /v1/deliverability/mailboxes  # Mailbox health & stats

# DOMAINS
POST   /v1/domains                   # Provision new domain
GET    /v1/domains                   # List all domains
GET    /v1/domains/{id}              # Domain detail + warmup status
POST   /v1/domains/{id}/warmup      # Start/adjust warming
DELETE /v1/domains/{id}              # Retire domain

# MAILBOXES
POST   /v1/mailboxes                 # Provision new mailbox
GET    /v1/mailboxes                 # List all mailboxes
GET    /v1/mailboxes/{id}            # Mailbox health detail

# CAMPAIGNS
POST   /v1/campaigns                 # Create campaign
GET    /v1/campaigns                 # List campaigns
GET    /v1/campaigns/{id}            # Campaign detail
GET    /v1/campaigns/{id}/stats      # Campaign performance stats

# REPLIES
GET    /v1/replies                   # Get all replies (filterable)
GET    /v1/replies/{id}              # Single reply detail

# CONTACTS
POST   /v1/contacts/verify           # Verify email address
POST   /v1/contacts/verify/batch     # Batch verify (up to 1000)

# COMPLIANCE
GET    /v1/compliance/rules          # Active compliance rules
POST   /v1/compliance/check          # Check if send is compliant
GET    /v1/compliance/suppressions   # Global suppression list

# WEBHOOKS
POST   /v1/webhooks                  # Register webhook
GET    /v1/webhooks                  # List webhooks
DELETE /v1/webhooks/{id}             # Remove webhook
```

### Smart Defaults (Agent-Friendly)
- `POST /v1/emails` without specifying `from` → auto-selects healthiest mailbox
- `POST /v1/emails` without `campaign_id` → auto-groups by recipient domain
- Deliverability check runs automatically on every send (returns score in response)
- Compliance check runs automatically (blocks non-compliant sends with clear error)
- Rate limiting is automatic per mailbox/domain (no agent configuration needed)

---

## 5. Webhook / Event System

### Events
```yaml
events:
  email.sent:        # Email left the server
  email.delivered:    # Confirmed delivery (SMTP 250)
  email.opened:       # Recipient opened (pixel tracking)
  email.clicked:      # Link clicked
  email.replied:      # Reply received
  email.bounced:      # Bounce (hard or soft)
  email.complained:   # Spam complaint via ISP feedback loop
  
  sequence.step_sent:     # Sequence step executed
  sequence.completed:     # All steps done
  sequence.stopped:       # Stopped (reply, bounce, or manual)
  
  domain.health_change:   # Domain reputation changed significantly
  domain.warmup_complete: # Domain fully warmed
  domain.blacklisted:     # Domain appeared on blacklist (URGENT)
  
  mailbox.health_change:  # Mailbox health score changed
  mailbox.suspended:      # Mailbox suspended by provider
  
  compliance.violation:   # Send blocked for compliance reasons
```

### Webhook Payload
```json
{
  "event": "email.replied",
  "timestamp": "2026-02-16T08:30:00Z",
  "data": {
    "message_id": "msg_abc123",
    "campaign_id": "camp_xyz",
    "from": "prospect@company.com",
    "subject": "Re: Quick question about...",
    "body": "Sure, I'd be happy to chat...",
    "intent": "interested",
    "intent_confidence": 0.92
  }
}
```

### Polling Alternative (for agents that can't receive webhooks)
```
GET /v1/events?since=2026-02-16T08:00:00Z&types=email.replied,email.bounced
```

---

## 6. SDK Design

### TypeScript/JavaScript
```typescript
import { Anivia } from '@anivia/sdk';

const anivia = new Anivia({ apiKey: 'avi_sk_xxx' });

// Send an email (auto-selects best mailbox)
const result = await anivia.emails.send({
  to: 'prospect@company.com',
  subject: 'Quick question about your stack',
  body: '<p>Hey {{firstName}}...</p>',
  variables: { firstName: 'Sarah' }
});

console.log(result.deliverabilityScore); // 87
console.log(result.mailboxUsed); // outreach@ventok-mail.com

// Check infrastructure health
const health = await anivia.deliverability.health();
console.log(health.overallScore); // 94

// Get interested replies
const replies = await anivia.replies.list({
  intent: 'interested',
  since: '2026-02-15'
});
```

### Python
```python
from anivia import Anivia

client = Anivia(api_key="avi_sk_xxx")

# Send email
result = client.emails.send(
    to="prospect@company.com",
    subject="Quick question",
    body="Hey {{firstName}}...",
    variables={"firstName": "Sarah"}
)

# Check deliverability before sending
score = client.deliverability.check(
    to="prospect@company.com",
    subject="Quick question",
    body="..."
)
print(f"Predicted placement: {score.prediction}")  # "inbox"
```

### Framework Integrations
- **LangChain**: `AniviaToolkit` — exposes send, check, reply tools as LangChain tools
- **CrewAI**: `AniviaSendTool`, `AniviaDeliverabilityTool` as CrewAI tools
- **n8n**: Custom node for Anivia (send, sequence, check deliverability)
- **Make**: Anivia module with triggers (new reply, bounce, campaign complete)

---

## 7. Example Agent Workflows

### Workflow 1: Autonomous Prospecting Agent
```
1. Agent receives target ICP description
2. Uses Clay API to find matching contacts (enrichment)
3. Uses Anivia verify_email to validate contacts
4. Uses Anivia check_deliverability to test email copy
5. Uses Anivia send_sequence to start outreach
6. Monitors replies via webhook/polling
7. Qualifies interested replies using LLM
8. Forwards qualified leads to calendar booking
```

### Workflow 2: Reply Handling Agent
```
1. Webhook fires: email.replied with intent="interested"
2. Agent reads reply body + context
3. LLM generates personalized response
4. Uses Anivia check_deliverability on response
5. Uses Anivia send_email to reply
6. Updates CRM via separate API
```

### Workflow 3: Deliverability Monitor Agent
```
1. Cron: every 4 hours
2. Uses Anivia get_inbox_health
3. If any domain/mailbox score drops below threshold:
   - Auto-reduces sending volume
   - Alerts human via Slack/Telegram
   - Adjusts campaign schedules
4. If domain blacklisted:
   - Immediately pauses all campaigns on that domain
   - Provisions replacement domain
   - Notifies admin
```

### Workflow 4: A/B Test Agent
```
1. Agent creates campaign with 3 subject line variants
2. Sends variant A to 100 contacts, B to 100, C to 100
3. Waits 48 hours
4. Pulls stats via get_campaign_stats
5. Identifies winner (highest reply rate)
6. Scales winner to remaining 1,000 contacts
7. Logs results for future optimization
```

### Workflow 5: Agency Campaign Manager Agent
```
1. New client onboarded (webhook from CRM)
2. Agent calls provision_domain (5 domains for client)
3. Monitors warmup progress daily
4. When warmup_complete fires:
   - Builds lead list (Clay API)
   - Generates copy variants (LLM)
   - Creates campaign + sequence
   - Launches at optimal volume
5. Weekly: generates report, sends to client
```

---

## 8. Competitive Reference: Existing APIs

### Instantly API
- Basic REST API, limited documentation
- Endpoints: campaigns, leads, analytics
- No deliverability checking endpoint
- No domain management via API
- Not designed for agent use

### Smartlead API
- More comprehensive than Instantly
- Campaign management, lead management, email accounts
- Webhooks for events
- Full API on Pro tier ($599/mo SmartDelivery)
- Better but still human-workflow-oriented

### SendGrid / Mailgun (Transactional)
- Excellent APIs (agent-ready)
- But designed for transactional email, not cold outreach
- No warmup, no cold email deliverability features
- No sequence management
- **SendGrid's API design is a good TEMPLATE for Anivia's API quality**

### What Nobody Has
- Pre-send deliverability scoring via API
- Domain lifecycle management via API
- Agent-specific SDK with smart defaults
- MCP server for LLM native integration
- Intent classification on replies via API

---

## 9. Implementation Priority

### Phase 1: Core API (Month 1-2)
- Email sending endpoint with auto-mailbox selection
- Deliverability health check
- Campaign CRUD + stats
- Reply retrieval with intent classification
- Webhook system for key events
- API key authentication

### Phase 2: Agent Integration (Month 2-3)
- MCP server package
- TypeScript + Python SDKs
- LangChain toolkit
- Pre-send deliverability scoring

### Phase 3: Platform Embedding (Month 3-4)
- Claude connector (apply to Anthropic connector program)
- ChatGPT GPT Action
- n8n + Make modules

### Phase 4: Advanced (Month 4-6)
- Domain provisioning API
- Mailbox provisioning API
- Compliance engine API
- Cross-campaign intelligence endpoints
- CrewAI + AutoGen integrations

---

## Summary

The agent-native API is Anivia's **strategic differentiator**. While Instantly and Smartlead built UIs for humans, Anivia should build APIs for agents. The market is moving toward agent-driven outreach — the infrastructure that agents use by default wins.

**First priorities:**
1. Clean REST API with smart defaults
2. MCP server for Claude/LLM native use
3. TypeScript + Python SDKs
4. Pre-send deliverability scoring (nobody has this as API)

**The killer feature:** `POST /v1/emails` that automatically selects the best mailbox, checks deliverability, ensures compliance, and returns a confidence score — all in one call. An agent sends one request. Anivia handles everything else.

---

*Sources: MCP specification (modelcontextprotocol.io), Clay Claude connector analysis, Instantly/Smartlead/SendGrid API patterns, Feb 2026*

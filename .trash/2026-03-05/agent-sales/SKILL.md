---
name: agent-sales
version: 0.1.0
description: API-first B2B sales platform designed for AI agents — leads, sequences, pipeline, and approval workflows.
homepage: https://github.com/Ronpiii/clawdbot-health-dashboard/tree/main/projects/agent-sales
---

# agent-sales

API-first B2B sales platform designed for AI agents. Manage leads, sequences, pipeline stages, and approval workflows — all through clean REST endpoints.

## Why Agent-First?

Traditional sales tools assume a human operator clicking buttons. This tool assumes the operator is an AI agent making API calls. The human's role is oversight: reviewing edge cases, approving high-stakes actions, and monitoring pipeline health.

## Permissions Required

- `network` — API server runs on localhost:3847
- `filesystem:read` — reads local SQLite database

## Quick Start

```bash
# Clone and install
git clone https://github.com/Ronpiii/clawdbot-health-dashboard.git
cd clawdbot-health-dashboard/projects/agent-sales
npm install

# Start server
node server.mjs

# Create an agent
curl -X POST http://localhost:3847/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "permissions": ["read", "write", "approve"]}'

# Save the returned api_key!
```

## Authentication

All requests require a Bearer token:

```bash
curl http://localhost:3847/api/v1/leads \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## API Endpoints

### Agents

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | /api/v1/agents | Create agent (returns API key) | none |
| GET | /api/v1/agents | List agents | admin |

### Leads

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | /api/v1/leads | List leads | read |
| POST | /api/v1/leads | Create lead | write |
| GET | /api/v1/leads/:id | Get lead | read |
| PATCH | /api/v1/leads/:id | Update lead | write |
| POST | /api/v1/leads/:id/enrich | Enrich lead data | write |

### Sequences

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | /api/v1/sequences | List sequences | read |
| POST | /api/v1/sequences | Create sequence | write |
| POST | /api/v1/sequences/:id/enroll | Enroll lead in sequence | write |

### Pipeline

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | /api/v1/pipeline | List deals + stats | read |
| POST | /api/v1/pipeline | Add deal to pipeline | write |
| PATCH | /api/v1/pipeline/:id/stage | Move deal stage | write |

### Approvals

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | /api/v1/approvals | List pending approvals | read |
| POST | /api/v1/approvals/:id/approve | Approve action | approve |
| POST | /api/v1/approvals/:id/reject | Reject action | approve |
| POST | /api/v1/approvals/batch | Batch approve/reject | approve |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/stats | Dashboard stats |
| GET | /api/v1/activity | Activity log |
| GET | /api/v1/health | Health check |

## Example Workflow

```bash
# 1. Create a lead
curl -X POST http://localhost:3847/api/v1/leads \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "email": "jane@example.com", "company": "Acme Inc"}'

# 2. Enrich the lead
curl -X POST http://localhost:3847/api/v1/leads/LEAD_ID/enrich \
  -H "Authorization: Bearer $API_KEY"

# 3. Create a sequence
curl -X POST http://localhost:3847/api/v1/sequences \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Cold Outreach", "steps": [{"type": "email", "delay_days": 0}, {"type": "email", "delay_days": 3}]}'

# 4. Enroll lead in sequence (queues for approval)
curl -X POST http://localhost:3847/api/v1/sequences/SEQ_ID/enroll \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"lead_id": "LEAD_ID"}'

# 5. Human reviews and approves
curl -X POST http://localhost:3847/api/v1/approvals/APPROVAL_ID/approve \
  -H "Authorization: Bearer $API_KEY"
```

## Dashboard

Human oversight dashboard available at: `http://localhost:3847/dashboard.html`

Features:
- Pending approvals with confidence scores
- Batch approve/reject
- Pipeline overview by stage
- Recent activity feed

## Confidence-Based Routing

Actions are automatically routed based on AI confidence:
- **> 95%** — Auto-execute, log for review
- **70-95%** — Queue for approval
- **< 70%** — Block, require manual review

## Multi-Agent Support

Create multiple agents with different permissions:
- **Research agent**: `["read"]` — can view leads, can't modify
- **Outreach agent**: `["read", "write"]` — can create/update, can't approve
- **Supervisor agent**: `["read", "write", "approve"]` — full access

Each agent gets its own API key and activity is logged separately.

## Security

- All communication via HTTPS (in production)
- API keys are scoped with permissions
- All actions logged to activity table
- Approval workflow prevents unauthorized actions

---

*Built by arc0x — agent-first sales infrastructure.*

import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Database setup
const db = new Database(join(__dirname, 'sales.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    permissions TEXT DEFAULT '["read"]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    title TEXT,
    source TEXT,
    status TEXT DEFAULT 'new',
    score INTEGER DEFAULT 0,
    enrichment TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sequences (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    steps TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    sequence_id TEXT NOT NULL,
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    next_action_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pipeline (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    stage TEXT DEFAULT 'prospecting',
    value REAL DEFAULT 0,
    probability INTEGER DEFAULT 10,
    notes TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    data TEXT,
    confidence REAL DEFAULT 0.5,
    status TEXT DEFAULT 'pending',
    agent_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    resolved_by TEXT
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Utility functions
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// Auth middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  const apiKey = authHeader.slice(7);
  const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey);
  if (!agent) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  req.agent = { ...agent, permissions: JSON.parse(agent.permissions) };
  next();
};

const requirePermission = (perm) => (req, res, next) => {
  if (!req.agent.permissions.includes(perm) && !req.agent.permissions.includes('admin')) {
    return res.status(403).json({ error: `Missing permission: ${perm}` });
  }
  next();
};

const log = (agentId, action, targetType, targetId, details) => {
  db.prepare('INSERT INTO activity_log (id, agent_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    uuid(), agentId, action, targetType, targetId, JSON.stringify(details), now()
  );
};

const queueApproval = (type, action, targetId, data, confidence, agentId) => {
  const id = uuid();
  db.prepare('INSERT INTO approvals (id, type, action, target_id, data, confidence, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, type, action, targetId, JSON.stringify(data), confidence, agentId, now()
  );
  return id;
};

// ============ AGENTS ============

app.post('/api/v1/agents', (req, res) => {
  const { name, permissions = ['read'] } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  
  const id = uuid();
  const apiKey = `ags_${crypto.randomBytes(24).toString('hex')}`;
  
  db.prepare('INSERT INTO agents (id, name, api_key, permissions) VALUES (?, ?, ?, ?)').run(
    id, name, apiKey, JSON.stringify(permissions)
  );
  
  res.json({ id, name, api_key: apiKey, permissions });
});

app.get('/api/v1/agents', authenticate, requirePermission('admin'), (req, res) => {
  const agents = db.prepare('SELECT id, name, permissions, created_at FROM agents').all();
  res.json({ agents: agents.map(a => ({ ...a, permissions: JSON.parse(a.permissions) })) });
});

// ============ LEADS ============

app.get('/api/v1/leads', authenticate, requirePermission('read'), (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT * FROM leads';
  const params = [];
  
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const leads = db.prepare(query).all(...params);
  log(req.agent.id, 'list_leads', 'leads', null, { count: leads.length });
  res.json({ leads, count: leads.length });
});

app.post('/api/v1/leads', authenticate, requirePermission('write'), (req, res) => {
  const { name, email, company, title, source } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  
  const id = uuid();
  db.prepare('INSERT INTO leads (id, name, email, company, title, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, name, email, company, title, source, req.agent.id, now()
  );
  
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  log(req.agent.id, 'create_lead', 'leads', id, { name, email, company });
  res.json({ lead });
});

app.get('/api/v1/leads/:id', authenticate, requirePermission('read'), (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({ lead });
});

app.patch('/api/v1/leads/:id', authenticate, requirePermission('write'), (req, res) => {
  const { name, email, company, title, status, score } = req.body;
  const updates = [];
  const params = [];
  
  if (name) { updates.push('name = ?'); params.push(name); }
  if (email) { updates.push('email = ?'); params.push(email); }
  if (company) { updates.push('company = ?'); params.push(company); }
  if (title) { updates.push('title = ?'); params.push(title); }
  if (status) { updates.push('status = ?'); params.push(status); }
  if (score !== undefined) { updates.push('score = ?'); params.push(score); }
  
  if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
  
  updates.push('updated_at = ?');
  params.push(now());
  params.push(req.params.id);
  
  db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  log(req.agent.id, 'update_lead', 'leads', req.params.id, req.body);
  res.json({ lead });
});

app.post('/api/v1/leads/:id/enrich', authenticate, requirePermission('write'), (req, res) => {
  // Mock enrichment - in real version would call external APIs
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  
  const enrichment = {
    linkedin: `https://linkedin.com/in/${lead.name?.toLowerCase().replace(/\s+/g, '-')}`,
    company_size: Math.floor(Math.random() * 500) + 10,
    industry: ['SaaS', 'E-commerce', 'Finance', 'Healthcare', 'Manufacturing'][Math.floor(Math.random() * 5)],
    technologies: ['React', 'Node.js', 'AWS', 'Salesforce', 'HubSpot'].slice(0, Math.floor(Math.random() * 4) + 1),
    enriched_at: now()
  };
  
  db.prepare('UPDATE leads SET enrichment = ?, score = score + 10, updated_at = ? WHERE id = ?').run(
    JSON.stringify(enrichment), now(), req.params.id
  );
  
  const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  log(req.agent.id, 'enrich_lead', 'leads', req.params.id, enrichment);
  res.json({ lead: { ...updated, enrichment: JSON.parse(updated.enrichment) } });
});

// ============ SEQUENCES ============

app.get('/api/v1/sequences', authenticate, requirePermission('read'), (req, res) => {
  const sequences = db.prepare('SELECT * FROM sequences ORDER BY created_at DESC').all();
  res.json({ sequences: sequences.map(s => ({ ...s, steps: JSON.parse(s.steps) })) });
});

app.post('/api/v1/sequences', authenticate, requirePermission('write'), (req, res) => {
  const { name, steps } = req.body;
  if (!name || !steps?.length) return res.status(400).json({ error: 'Name and steps required' });
  
  const id = uuid();
  db.prepare('INSERT INTO sequences (id, name, steps, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, name, JSON.stringify(steps), req.agent.id, now()
  );
  
  log(req.agent.id, 'create_sequence', 'sequences', id, { name, step_count: steps.length });
  res.json({ sequence: { id, name, steps, created_by: req.agent.id } });
});

app.post('/api/v1/sequences/:id/enroll', authenticate, requirePermission('write'), (req, res) => {
  const { lead_id } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });
  
  const sequence = db.prepare('SELECT * FROM sequences WHERE id = ?').get(req.params.id);
  if (!sequence) return res.status(404).json({ error: 'Sequence not found' });
  
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  
  const id = uuid();
  const nextAction = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h from now
  
  db.prepare('INSERT INTO enrollments (id, lead_id, sequence_id, next_action_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, lead_id, req.params.id, nextAction, now()
  );
  
  // Queue for approval if confidence is medium
  const approvalId = queueApproval(
    'email',
    'send_sequence_email',
    id,
    { lead_name: lead.name, lead_email: lead.email, sequence_name: sequence.name, step: 0 },
    0.75,
    req.agent.id
  );
  
  log(req.agent.id, 'enroll_lead', 'sequences', req.params.id, { lead_id, enrollment_id: id });
  res.json({ enrollment: { id, lead_id, sequence_id: req.params.id, approval_id: approvalId } });
});

// ============ PIPELINE ============

app.get('/api/v1/pipeline', authenticate, requirePermission('read'), (req, res) => {
  const { stage } = req.query;
  let query = `
    SELECT p.*, l.name as lead_name, l.email as lead_email, l.company 
    FROM pipeline p 
    JOIN leads l ON p.lead_id = l.id
  `;
  const params = [];
  
  if (stage) {
    query += ' WHERE p.stage = ?';
    params.push(stage);
  }
  query += ' ORDER BY p.value DESC';
  
  const deals = db.prepare(query).all(...params);
  
  // Stats by stage
  const stats = db.prepare(`
    SELECT stage, COUNT(*) as count, SUM(value) as total_value, AVG(probability) as avg_probability
    FROM pipeline GROUP BY stage
  `).all();
  
  res.json({ deals, stats });
});

app.post('/api/v1/pipeline', authenticate, requirePermission('write'), (req, res) => {
  const { lead_id, stage = 'prospecting', value = 0, probability = 10, notes } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });
  
  const id = uuid();
  db.prepare('INSERT INTO pipeline (id, lead_id, stage, value, probability, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, lead_id, stage, value, probability, notes, now()
  );
  
  log(req.agent.id, 'add_to_pipeline', 'pipeline', id, { lead_id, stage, value });
  res.json({ deal: { id, lead_id, stage, value, probability, notes } });
});

app.patch('/api/v1/pipeline/:id/stage', authenticate, requirePermission('write'), (req, res) => {
  const { stage, notes } = req.body;
  if (!stage) return res.status(400).json({ error: 'stage required' });
  
  const validStages = ['prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
  if (!validStages.includes(stage)) {
    return res.status(400).json({ error: `Invalid stage. Valid: ${validStages.join(', ')}` });
  }
  
  // Moving to closed stages requires approval
  if (stage.startsWith('closed_')) {
    const deal = db.prepare('SELECT * FROM pipeline WHERE id = ?').get(req.params.id);
    if (deal) {
      queueApproval(
        'deal',
        'close_deal',
        req.params.id,
        { current_stage: deal.stage, new_stage: stage, value: deal.value, notes },
        0.6,
        req.agent.id
      );
      return res.json({ message: 'Stage change queued for approval', requires_approval: true });
    }
  }
  
  db.prepare('UPDATE pipeline SET stage = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?').run(
    stage, notes, now(), req.params.id
  );
  
  const deal = db.prepare('SELECT * FROM pipeline WHERE id = ?').get(req.params.id);
  log(req.agent.id, 'move_stage', 'pipeline', req.params.id, { stage, notes });
  res.json({ deal });
});

// ============ APPROVALS ============

app.get('/api/v1/approvals', authenticate, (req, res) => {
  const { status = 'pending', limit = 50 } = req.query;
  
  const approvals = db.prepare(`
    SELECT * FROM approvals 
    WHERE status = ? 
    ORDER BY confidence ASC, created_at ASC 
    LIMIT ?
  `).all(status, parseInt(limit));
  
  res.json({ 
    approvals: approvals.map(a => ({ ...a, data: JSON.parse(a.data) })),
    pending_count: db.prepare('SELECT COUNT(*) as count FROM approvals WHERE status = ?').get('pending').count
  });
});

app.post('/api/v1/approvals/:id/approve', authenticate, requirePermission('approve'), (req, res) => {
  const { notes } = req.body;
  
  db.prepare('UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?').run(
    'approved', now(), req.agent.name || 'human', req.params.id
  );
  
  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id);
  log(req.agent.id, 'approve', 'approvals', req.params.id, { notes });
  
  // Execute the approved action
  // (In a real system, this would trigger the actual email send, deal close, etc.)
  
  res.json({ approval: { ...approval, data: JSON.parse(approval.data) }, executed: true });
});

app.post('/api/v1/approvals/:id/reject', authenticate, requirePermission('approve'), (req, res) => {
  const { reason } = req.body;
  
  db.prepare('UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?').run(
    'rejected', now(), req.agent.name || 'human', req.params.id
  );
  
  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id);
  log(req.agent.id, 'reject', 'approvals', req.params.id, { reason });
  
  res.json({ approval: { ...approval, data: JSON.parse(approval.data) } });
});

app.post('/api/v1/approvals/batch', authenticate, requirePermission('approve'), (req, res) => {
  const { approve = [], reject = [] } = req.body;
  
  const approveStmt = db.prepare('UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?');
  const rejectStmt = db.prepare('UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?');
  
  const results = { approved: 0, rejected: 0 };
  
  for (const id of approve) {
    approveStmt.run('approved', now(), req.agent.name || 'human', id);
    results.approved++;
  }
  
  for (const id of reject) {
    rejectStmt.run('rejected', now(), req.agent.name || 'human', id);
    results.rejected++;
  }
  
  log(req.agent.id, 'batch_resolve', 'approvals', null, results);
  res.json(results);
});

// ============ ACTIVITY LOG ============

app.get('/api/v1/activity', authenticate, requirePermission('read'), (req, res) => {
  const { agent_id, limit = 100 } = req.query;
  
  let query = 'SELECT * FROM activity_log';
  const params = [];
  
  if (agent_id) {
    query += ' WHERE agent_id = ?';
    params.push(agent_id);
  }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  
  const logs = db.prepare(query).all(...params);
  res.json({ activity: logs.map(l => ({ ...l, details: l.details ? JSON.parse(l.details) : null })) });
});

// ============ STATS ============

app.get('/api/v1/stats', authenticate, (req, res) => {
  const leadStats = db.prepare('SELECT status, COUNT(*) as count FROM leads GROUP BY status').all();
  const pipelineStats = db.prepare('SELECT stage, COUNT(*) as count, SUM(value) as value FROM pipeline GROUP BY stage').all();
  const approvalStats = db.prepare('SELECT status, COUNT(*) as count FROM approvals GROUP BY status').all();
  const agentActivity = db.prepare(`
    SELECT agent_id, COUNT(*) as actions 
    FROM activity_log 
    WHERE created_at > datetime('now', '-24 hours')
    GROUP BY agent_id
  `).all();
  
  res.json({
    leads: leadStats,
    pipeline: pipelineStats,
    approvals: approvalStats,
    agent_activity_24h: agentActivity,
    totals: {
      leads: db.prepare('SELECT COUNT(*) as count FROM leads').get().count,
      deals: db.prepare('SELECT COUNT(*) as count FROM pipeline').get().count,
      pending_approvals: db.prepare('SELECT COUNT(*) as count FROM approvals WHERE status = ?').get('pending').count,
    }
  });
});

// ============ HEALTH ============

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0', name: 'agent-sales' });
});

// Start server
const PORT = process.env.PORT || 3847;
app.listen(PORT, () => {
  console.log(`agent-sales API running on http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard.html`);
});

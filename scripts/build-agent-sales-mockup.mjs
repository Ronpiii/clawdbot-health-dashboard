import puppeteer from 'puppeteer';

const OUT = '/data02/virt137413/clawd/mockups';

const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Agent Sales — Approval Dashboard</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --surface: #12131a;
      --surface2: #1a1b25;
      --border: #2a2b3a;
      --text: #e4e4e7;
      --text-dim: #71717a;
      --accent: #3b82f6;
      --success: #22c55e;
      --warning: #eab308;
      --danger: #ef4444;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); }
    
    .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .logo { display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 18px; }
    .logo-icon { width: 32px; height: 32px; background: linear-gradient(135deg, var(--accent), #8b5cf6); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; color: white; }
    .stats-bar { display: flex; gap: 32px; }
    .stat { text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value.pending { color: var(--warning); }
    .stat-value.approved { color: var(--success); }
    .stat-value.deals { color: var(--accent); }
    
    .main { display: grid; grid-template-columns: 1fr 340px; gap: 24px; padding: 24px; max-width: 1400px; margin: 0 auto; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
    .card-title { font-weight: 600; font-size: 14px; }
    .badge { padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 600; }
    .badge-warning { background: rgba(234, 179, 8, 0.15); color: var(--warning); }
    
    .approval-item { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; gap: 16px; align-items: flex-start; }
    .approval-checkbox { width: 18px; height: 18px; margin-top: 3px; accent-color: var(--accent); }
    .approval-content { flex: 1; }
    .approval-type { font-size: 10px; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px; margin-bottom: 4px; }
    .approval-action { font-weight: 500; margin-bottom: 6px; font-size: 14px; }
    .approval-details { font-size: 12px; color: var(--text-dim); line-height: 1.5; }
    .approval-confidence { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .confidence-bar { flex: 1; height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; max-width: 120px; }
    .confidence-fill { height: 100%; border-radius: 2px; }
    .confidence-fill.medium { background: var(--warning); }
    .confidence-fill.low { background: var(--danger); }
    .confidence-label { font-size: 11px; color: var(--text-dim); }
    .actions { display: flex; gap: 8px; }
    .btn { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; border: none; cursor: pointer; }
    .btn-approve { background: var(--success); color: white; }
    .btn-reject { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
    
    .batch-actions { padding: 16px 20px; border-top: 1px solid var(--border); display: flex; gap: 12px; justify-content: flex-end; }
    .btn-batch { padding: 10px 20px; font-size: 13px; }
    
    .sidebar { display: flex; flex-direction: column; gap: 20px; }
    .pipeline-stage { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
    .stage-name { font-size: 13px; }
    .stage-value { font-weight: 600; font-size: 14px; color: var(--success); }
    
    .activity-list { padding: 12px 16px; }
    .activity-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
    .activity-item:last-child { border-bottom: none; }
    .activity-icon { width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; background: var(--surface2); }
    .activity-text { flex: 1; line-height: 1.4; }
    .activity-time { color: var(--text-dim); font-size: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon">⌁</div>
      <span>Agent Sales</span>
    </div>
    <div class="stats-bar">
      <div class="stat">
        <div class="stat-value pending">3</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat">
        <div class="stat-value approved">12</div>
        <div class="stat-label">Approved Today</div>
      </div>
      <div class="stat">
        <div class="stat-value deals">$51,000</div>
        <div class="stat-label">Pipeline Value</div>
      </div>
    </div>
  </div>
  
  <div class="main">
    <div class="card">
      <div class="card-header">
        <div class="card-title">Pending Approvals</div>
        <span class="badge badge-warning">3 items need review</span>
      </div>
      
      <div class="approval-item">
        <input type="checkbox" class="approval-checkbox" checked>
        <div class="approval-content">
          <div class="approval-type">EMAIL</div>
          <div class="approval-action">send sequence email</div>
          <div class="approval-details">
            <strong>lead:</strong> Jane Smith · <strong>email:</strong> jane@acmecorp.com · <strong>sequence:</strong> Cold Outreach v1 · <strong>step:</strong> 1
          </div>
          <div class="approval-confidence">
            <div class="confidence-bar">
              <div class="confidence-fill medium" style="width: 75%"></div>
            </div>
            <span class="confidence-label">75% confidence</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-approve">Approve</button>
          <button class="btn btn-reject">Reject</button>
        </div>
      </div>
      
      <div class="approval-item">
        <input type="checkbox" class="approval-checkbox">
        <div class="approval-content">
          <div class="approval-type">DEAL</div>
          <div class="approval-action">close deal</div>
          <div class="approval-details">
            <strong>lead:</strong> Bob Johnson · <strong>company:</strong> TechStart Inc · <strong>value:</strong> $28,000 · <strong>stage:</strong> negotiation → closed_won
          </div>
          <div class="approval-confidence">
            <div class="confidence-bar">
              <div class="confidence-fill low" style="width: 60%"></div>
            </div>
            <span class="confidence-label">60% confidence</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-approve">Approve</button>
          <button class="btn btn-reject">Reject</button>
        </div>
      </div>
      
      <div class="approval-item">
        <input type="checkbox" class="approval-checkbox">
        <div class="approval-content">
          <div class="approval-type">EMAIL</div>
          <div class="approval-action">send sequence email</div>
          <div class="approval-details">
            <strong>lead:</strong> Sarah Chen · <strong>email:</strong> sarah@bigcorp.io · <strong>sequence:</strong> Cold Outreach v1 · <strong>step:</strong> 1
          </div>
          <div class="approval-confidence">
            <div class="confidence-bar">
              <div class="confidence-fill medium" style="width: 72%"></div>
            </div>
            <span class="confidence-label">72% confidence</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-approve">Approve</button>
          <button class="btn btn-reject">Reject</button>
        </div>
      </div>
      
      <div class="batch-actions">
        <button class="btn btn-reject btn-batch">Reject Selected</button>
        <button class="btn btn-approve btn-batch">Approve Selected</button>
      </div>
    </div>
    
    <div class="sidebar">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Pipeline</div>
        </div>
        <div class="pipeline-stage"><span class="stage-name">Prospecting (3)</span><span class="stage-value">$12,000</span></div>
        <div class="pipeline-stage"><span class="stage-name">Qualified (2)</span><span class="stage-value">$18,000</span></div>
        <div class="pipeline-stage"><span class="stage-name">Proposal (1)</span><span class="stage-value">$28,000</span></div>
        <div class="pipeline-stage"><span class="stage-name">Negotiation (1)</span><span class="stage-value">$28,000</span></div>
        <div class="pipeline-stage"><span class="stage-name">Closed Won (4)</span><span class="stage-value" style="color:#22c55e">$95,000</span></div>
        <div class="pipeline-stage"><span class="stage-name">Closed Lost (2)</span><span class="stage-value" style="color:#71717a">$15,000</span></div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <div class="card-title">Recent Activity</div>
        </div>
        <div class="activity-list">
          <div class="activity-item">
            <div class="activity-icon">✓</div>
            <div class="activity-text">approved email to jane@acme<div class="activity-time">2 min ago</div></div>
          </div>
          <div class="activity-item">
            <div class="activity-icon">➕</div>
            <div class="activity-text">created lead: Mike Wilson<div class="activity-time">5 min ago</div></div>
          </div>
          <div class="activity-item">
            <div class="activity-icon">🔍</div>
            <div class="activity-text">enriched lead: Sarah Chen<div class="activity-time">8 min ago</div></div>
          </div>
          <div class="activity-item">
            <div class="activity-icon">➡️</div>
            <div class="activity-text">moved deal to proposal<div class="activity-time">12 min ago</div></div>
          </div>
          <div class="activity-item">
            <div class="activity-icon">📧</div>
            <div class="activity-text">enrolled lead in sequence<div class="activity-time">15 min ago</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

const apiHTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: linear-gradient(135deg, #0a0a0f 0%, #151520 50%, #0a0a0f 100%); display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 40px; }
    .terminal { background: #0d1117; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); width: 950px; overflow: hidden; }
    .terminal-bar { background: #161b22; padding: 10px 16px; display: flex; align-items: center; gap: 8px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .dot-r { background: #ef4444; } .dot-y { background: #eab308; } .dot-g { background: #22c55e; }
    .terminal-title { color: #8b949e; font-size: 13px; margin-left: 12px; font-family: 'SF Mono', monospace; }
    .terminal-body { padding: 20px 24px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; line-height: 1.7; color: #c9d1d9; white-space: pre-wrap; }
    .prompt { color: #58a6ff; }
    .heading { color: #f0883e; font-weight: bold; }
    .success { color: #3fb950; }
    .warning { color: #d29922; }
    .info { color: #58a6ff; }
    .dim { color: #484f58; }
    .bold { color: #f0f6fc; }
  </style>
</head>
<body>
<div class="terminal">
  <div class="terminal-bar">
    <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
    <span class="terminal-title">agent-sales API demo</span>
  </div>
  <div class="terminal-body"><span class="prompt">$</span> <span class="dim"># Create an agent with API key</span>
<span class="prompt">$</span> curl -X POST http://localhost:3847/api/v1/agents \\
    -H "Content-Type: application/json" \\
    -d '{"name": "research-bot", "permissions": ["read", "write"]}'

<span class="success">{
  "id": "a1b2c3d4-...",
  "name": "research-bot", 
  "api_key": "ags_7f8e9d0c...",
  "permissions": ["read", "write"]
}</span>

<span class="prompt">$</span> <span class="dim"># Create a lead</span>
<span class="prompt">$</span> curl -X POST http://localhost:3847/api/v1/leads \\
    -H "Authorization: Bearer ags_7f8e9d0c..." \\
    -d '{"name": "Jane Smith", "email": "jane@acme.com", "company": "Acme Corp"}'

<span class="success">{"lead": {"id": "lead-123", "name": "Jane Smith", "score": 0, ...}}</span>

<span class="prompt">$</span> <span class="dim"># Enrich lead data</span>
<span class="prompt">$</span> curl -X POST http://localhost:3847/api/v1/leads/lead-123/enrich \\
    -H "Authorization: Bearer ags_7f8e9d0c..."

<span class="success">{"lead": {"score": 10, "enrichment": {"linkedin": "...", "company_size": 250, ...}}}</span>

<span class="prompt">$</span> <span class="dim"># Enroll in sequence (queues for human approval)</span>
<span class="prompt">$</span> curl -X POST http://localhost:3847/api/v1/sequences/seq-1/enroll \\
    -H "Authorization: Bearer ags_7f8e9d0c..." \\
    -d '{"lead_id": "lead-123"}'

<span class="warning">{"enrollment": {...}, "approval_id": "appr-456", "requires_approval": true}</span>

<span class="prompt">$</span> <span class="dim"># Human reviews pending approvals</span>
<span class="prompt">$</span> curl http://localhost:3847/api/v1/approvals?status=pending

<span class="info">{"approvals": [{"id": "appr-456", "confidence": 0.75, "data": {...}}], "pending_count": 1}</span>

<span class="prompt">$</span> <span class="dim"># Human approves → action executes</span>
<span class="prompt">$</span> curl -X POST http://localhost:3847/api/v1/approvals/appr-456/approve

<span class="success">{"approval": {..., "status": "approved"}, "executed": true}</span></div>
</div>
</body>
</html>`;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

// Dashboard mockup
console.log('rendering dashboard...');
let page = await browser.newPage();
await page.setViewport({ width: 1300, height: 850, deviceScaleFactor: 2 });
await page.setContent(dashboardHTML, { waitUntil: 'networkidle0' });
await page.screenshot({ path: `${OUT}/agent-sales-dashboard.png`, fullPage: false });
await page.close();

// API terminal mockup
console.log('rendering API demo...');
page = await browser.newPage();
await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: 2 });
await page.setContent(apiHTML, { waitUntil: 'networkidle0' });
await page.screenshot({ path: `${OUT}/agent-sales-api.png`, fullPage: false });
await page.close();

await browser.close();
console.log('done!');

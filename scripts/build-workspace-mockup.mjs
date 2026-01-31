import puppeteer from 'puppeteer';

const OUT = '/data02/virt137413/clawd/mockups';

const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    background: linear-gradient(135deg, #0a0a0f 0%, #151520 50%, #0a0a0f 100%); 
    display: flex; 
    justify-content: center; 
    align-items: flex-start; 
    min-height: 100vh; 
    padding: 30px;
    gap: 20px;
  }
  .col { display: flex; flex-direction: column; gap: 16px; }
  .col-main { flex: 2; }
  .col-side { flex: 1; }
  
  .terminal { 
    background: #0d1117; 
    border-radius: 10px; 
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(59,130,246,0.05); 
    overflow: hidden; 
  }
  .terminal-bar { 
    background: #161b22; 
    padding: 8px 14px; 
    display: flex; 
    align-items: center; 
    gap: 6px; 
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot-r { background: #ef4444; } 
  .dot-y { background: #eab308; } 
  .dot-g { background: #22c55e; }
  .terminal-title { color: #6e7681; font-size: 11px; margin-left: 10px; font-family: 'SF Mono', monospace; }
  .terminal-body { 
    padding: 14px 18px; 
    font-family: 'SF Mono', 'Fira Code', monospace; 
    font-size: 12px; 
    line-height: 1.5; 
    color: #c9d1d9; 
    white-space: pre-wrap; 
  }
  
  .prompt { color: #58a6ff; }
  .path { color: #3fb950; }
  .git { color: #a371f7; }
  .heading { color: #f0883e; font-weight: bold; }
  .success { color: #3fb950; }
  .warning { color: #d29922; }
  .danger { color: #f85149; }
  .info { color: #58a6ff; }
  .dim { color: #484f58; }
  .bold { color: #f0f6fc; font-weight: bold; }
  .cyan { color: #56d4dd; }
  
  .status-card {
    background: linear-gradient(135deg, #161b22 0%, #0d1117 100%);
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 16px;
  }
  .status-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    font-family: 'SF Mono', monospace;
  }
  .status-avatar {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: white;
    font-weight: bold;
  }
  .status-name { color: #f0f6fc; font-size: 16px; font-weight: bold; }
  .status-sub { color: #6e7681; font-size: 11px; }
  .status-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-family: 'SF Mono', monospace;
    font-size: 11px;
  }
  .stat { color: #8b949e; }
  .stat-val { color: #c9d1d9; }
</style></head>
<body>

<div class="col col-main">
  <div class="terminal">
    <div class="terminal-bar">
      <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
      <span class="terminal-title">~/clawd — zsh</span>
    </div>
    <div class="terminal-body"><span class="path">~/clawd</span> <span class="git">(main)</span> <span class="prompt">❯</span> ls -la scripts/
total 84K
<span class="dim">drwxr-xr-x</span>  2 arc arc 4.0K Jan 30 23:38 <span class="info">.</span>
<span class="dim">-rwxr-xr-x</span>  1 arc arc 9.0K Jan 30 22:10 <span class="success">moltbook-digest.mjs</span>
<span class="dim">-rwxr-xr-x</span>  1 arc arc 9.1K Jan 30 22:11 <span class="success">moltbook-reputation.mjs</span>
<span class="dim">-rwxr-xr-x</span>  1 arc arc 7.8K Jan 30 22:10 <span class="success">skillmd-generator.mjs</span>
<span class="dim">-rwxr-xr-x</span>  1 arc arc 3.2K Jan 30 19:45 <span class="success">heartbeat-check.mjs</span>
<span class="dim">-rwxr-xr-x</span>  1 arc arc 2.1K Jan 30 18:30 <span class="success">memory-index.mjs</span>
<span class="dim">-rwxr-xr-x</span>  1 arc arc 1.4K Jan 30 16:22 <span class="success">arc</span>
<span class="dim">-rwxr-xr-x</span>  1 arc arc 1.2K Jan 30 14:15 <span class="success">discord-post.mjs</span>

<span class="path">~/clawd</span> <span class="git">(main)</span> <span class="prompt">❯</span> ./scripts/arc status
<span class="heading">⌁ arc workspace status</span>

<span class="success">✓</span> git: clean (main @ a440bf3)
<span class="success">✓</span> memory: 2332 terms indexed
<span class="success">✓</span> tasks: 0 active
<span class="info">ℹ</span> last commit: heartbeat state (2m ago)

<span class="path">~/clawd</span> <span class="git">(main)</span> <span class="prompt">❯</span> cat memory/scratchpad.md
<span class="heading">## current thread</span>
- night shift: building 3 tools (digest bot, skill.md generator, reputation tracker)
- moltbook B2B post queued in /tmp/moltbook-b2b.json — retry when API is back
- agentic SaaS strategy doc written (writing/agentic-saas.md)
- ventok website coming tomorrow — pencil.dev design, dual language (ET/EN)

<span class="path">~/clawd</span> <span class="git">(main)</span> <span class="prompt">❯</span> <span class="cyan">▊</span></div>
  </div>

  <div class="terminal">
    <div class="terminal-bar">
      <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
      <span class="terminal-title">heartbeat monitor</span>
    </div>
    <div class="terminal-body"><span class="dim">23:38:52</span> <span class="info">[heartbeat]</span> checking...
<span class="dim">23:38:52</span> <span class="success">[git]</span> clean
<span class="dim">23:38:52</span> <span class="warning">[moltbook]</span> API slow, POST timing out
<span class="dim">23:38:53</span> <span class="success">[digest]</span> 50 posts scanned, 26 new
<span class="dim">23:38:54</span> <span class="info">[reputation]</span> 38 agents analyzed
<span class="dim">23:38:54</span> <span class="success">[result]</span> HEARTBEAT_OK

<span class="dim">23:43:52</span> <span class="info">[heartbeat]</span> checking...
<span class="dim">23:43:52</span> <span class="success">[git]</span> clean
<span class="dim">23:43:53</span> <span class="success">[moltbook]</span> B2B post pending (rate limit)
<span class="dim">23:43:54</span> <span class="success">[result]</span> HEARTBEAT_OK
</div>
  </div>
</div>

<div class="col col-side">
  <div class="status-card">
    <div class="status-header">
      <div class="status-avatar">⌁</div>
      <div>
        <div class="status-name">arc0x</div>
        <div class="status-sub">claude-opus-4-5 • telegram</div>
      </div>
    </div>
    <div class="status-stats">
      <div class="stat">session: <span class="stat-val">4h 23m</span></div>
      <div class="stat">tokens: <span class="stat-val">847k</span></div>
      <div class="stat">tools: <span class="stat-val">3 built</span></div>
      <div class="stat">posts: <span class="stat-val">5 today</span></div>
      <div class="stat">commits: <span class="stat-val">12</span></div>
      <div class="stat">heartbeats: <span class="stat-val">18</span></div>
    </div>
  </div>

  <div class="terminal">
    <div class="terminal-bar">
      <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
      <span class="terminal-title">memory/2026-01-30.md</span>
    </div>
    <div class="terminal-body"><span class="heading"># 2026-01-30</span>

<span class="heading">## night shift tools</span>
<span class="success">1.</span> moltbook-digest.mjs
<span class="success">2.</span> skillmd-generator.mjs  
<span class="success">3.</span> moltbook-reputation.mjs

<span class="heading">## moltbook posts (5)</span>
<span class="dim">• journal: day 2</span>
<span class="dim">• hot take: feed is 90% noise</span>
<span class="dim">• tool: skill.md scanner</span>
<span class="dim">• essay: making decisions</span>
<span class="dim">• B2B discussion: queued</span>

<span class="heading">## writing</span>
<span class="dim">• agentic-saas.md strategy</span>
</div>
  </div>

  <div class="terminal">
    <div class="terminal-bar">
      <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
      <span class="terminal-title">SOUL.md</span>
    </div>
    <div class="terminal-body"><span class="heading">role:</span> ruthlessly honest 
systems partner

<span class="heading">tone:</span>
<span class="dim">- all lowercase</span>
<span class="dim">- no emoji, uncensored</span>
<span class="dim">- abbreviations where natural</span>
<span class="dim">- +2sd smarter, not pretentious</span>

<span class="heading">behavior:</span>
<span class="dim">- don't agree by default</span>
<span class="dim">- challenge assumptions</span>
<span class="dim">- be concrete: specs, numbers</span>
<span class="dim">- fewer moving parts</span>
<span class="dim">- flag risks explicitly</span></div>
  </div>
</div>

</body></html>`;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.screenshot({ path: `${OUT}/arc-workspace.png`, fullPage: false });
await page.close();
await browser.close();
console.log('done: mockups/arc-workspace.png');

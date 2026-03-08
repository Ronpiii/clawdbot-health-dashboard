#!/usr/bin/env node
/**
 * arc neuron — knowledge network visualization
 * nightly build 2026-03-08
 * 
 * pure black/white minimalist design
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const OUTPUT_FILE = path.join(WORKSPACE, 'neuron.html');

// topic definitions with deepening threads
const TOPICS = {
  'cold-email': {
    label: 'Cold Email',
    cluster: 'sales',
    keywords: ['cold email', 'outreach', 'deliverability', 'warmup', 'reply rate', 'open rate'],
    threads: [
      'what makes "human" emails outperform polished ones?',
      'optimal send times for estonian SMEs',
      'domain reputation recovery strategies',
      'AI personalization at scale without sounding robotic'
    ]
  },
  'anivia': {
    label: 'Anivia',
    cluster: 'sales',
    keywords: ['anivia', 'sequence', 'enrollment', 'AI draft', 'approval queue'],
    threads: [
      'multi-channel sequences (email + linkedin + phone)',
      'intent signals that predict reply likelihood',
      'A/B testing at small volume — statistical validity',
      'when to auto-send vs require human approval'
    ]
  },
  'sales-automation': {
    label: 'Sales Automation',
    cluster: 'sales',
    keywords: ['sales automation', 'pipeline', 'CRM', 'lead', 'prospect'],
    threads: [
      'full-funnel ownership vs point solutions',
      'where human judgment beats AI in sales',
      'SMB pricing psychology (€300-800/mo sweet spot)',
      'sales AI that improves from rejection feedback'
    ]
  },
  'context-memory': {
    label: 'Context Memory API',
    cluster: 'products',
    keywords: ['context memory', 'persistent memory', 'namespace', 'semantic search', 'pgvector', 'embedding'],
    threads: [
      'memory decay models — what to forget and when',
      'cross-agent memory sharing protocols',
      'semantic vs keyword search tradeoffs',
      'memory as competitive moat for AI products'
    ]
  },
  'collabo': {
    label: 'Collabo',
    cluster: 'products',
    keywords: ['collabo', 'task', 'project', 'linear', 'notion', 'workspace'],
    threads: [
      'natural language → structured task decomposition',
      'proactive AI (stale detection, smart triage)',
      'cmd+K as universal AI interface pattern',
      'project health scoring from task velocity'
    ]
  },
  'ventok-saas': {
    label: 'Ventok Products',
    cluster: 'products',
    keywords: ['ventok', 'manufacturer', 'estonian', 'SME', 'excel hell'],
    threads: [
      'vertical SaaS for manufacturing niches',
      'language barriers in estonian B2B',
      'build vs buy for estonian companies',
      'trust signals for AI in conservative industries'
    ]
  },
  'web-design': {
    label: 'Web Design',
    cluster: 'design',
    keywords: ['design', 'awwward', 'composition', 'typography', 'animation', 'art direction'],
    threads: [
      'few ingredients principle — what to cut',
      'typography as primary design tool',
      'animation that enhances vs distracts',
      'dark mode as default — accessibility tradeoffs'
    ]
  },
  'excalidraw-style': {
    label: 'Excalidraw Aesthetic',
    cluster: 'design',
    keywords: ['excalidraw', 'hand-drawn', 'sketch', 'diagram', 'whiteboard'],
    threads: [
      'when hand-drawn feels authentic vs lazy',
      'hybrid approaches — clean + sketchy',
      'excalidraw for technical documentation',
      'SVG animation of hand-drawn elements'
    ]
  },
  'ux-patterns': {
    label: 'UX Patterns',
    cluster: 'design',
    keywords: ['modal', 'overlay', 'single-column', 'notion-style', 'settings'],
    threads: [
      'progressive disclosure in complex UIs',
      'command palette as power user interface',
      'when modals beat separate pages',
      'mobile-first that doesn\'t feel stripped down'
    ]
  },
  'agentic-ai': {
    label: 'Agentic AI',
    cluster: 'ai',
    keywords: ['agentic', 'autonomous', 'function calling', 'tools', 'agent'],
    threads: [
      'reactive vs proactive agent architectures',
      'tool design for LLM reliability',
      'human-in-the-loop patterns that don\'t bottleneck',
      'agent confidence thresholds for auto-action'
    ]
  },
  'memory-systems': {
    label: 'Memory Systems',
    cluster: 'ai',
    keywords: ['memory', 'file-based', 'MEMORY.md', 'daily log', 'recall'],
    threads: [
      'spaced repetition for code/architecture',
      'when to distill vs when to preserve raw logs',
      'memory as identity — what makes an AI "the same"',
      'distributed memory across agent instances'
    ]
  },
  'llm-patterns': {
    label: 'LLM Patterns',
    cluster: 'ai',
    keywords: ['LLM', 'prompt', 'claude', 'opus', 'haiku', 'model'],
    threads: [
      'model selection by task type',
      'chain-of-thought vs direct answer',
      'context window management strategies',
      'fine-tuning vs prompting economics'
    ]
  },
  'supabase': {
    label: 'Supabase',
    cluster: 'infra',
    keywords: ['supabase', 'postgres', 'RLS', 'migration', 'auth'],
    threads: [
      'RLS patterns that don\'t kill performance',
      'edge functions vs server functions',
      'realtime subscriptions at scale',
      'supabase vs planetscale vs neon'
    ]
  },
  'vercel': {
    label: 'Vercel',
    cluster: 'infra',
    keywords: ['vercel', 'deploy', 'serverless', 'edge', 'cron'],
    threads: [
      'hobby vs pro tier decision points',
      'cold start mitigation strategies',
      'vercel cron limitations and workarounds',
      'preview deployments for client review'
    ]
  },
  'dev-workflow': {
    label: 'Dev Workflow',
    cluster: 'infra',
    keywords: ['git', 'commit', 'nightly build', 'arc', 'script', 'CLI'],
    threads: [
      'commit granularity — atomic vs batched',
      'nightly builds as forcing function',
      'CLI tools that compound over time',
      'workspace health as daily metric'
    ]
  },
  'pricing': {
    label: 'Pricing',
    cluster: 'business',
    keywords: ['pricing', 'MRR', 'tier', 'subscription', 'free', 'pro'],
    threads: [
      'freemium vs free trial for dev tools',
      'pricing anchoring psychology',
      'self-host option as trust signal',
      'usage-based vs seat-based for AI products'
    ]
  },
  'go-to-market': {
    label: 'Go-to-Market',
    cluster: 'business',
    keywords: ['launch', 'market', 'positioning', 'pipeline', 'lead', 'TMW', 'Luminor'],
    threads: [
      'dogfooding → SaaS transition timing',
      'estonian market size constraints',
      'referral loops for B2B',
      'content marketing for technical products'
    ]
  }
};

const CONNECTIONS = [
  ['cold-email', 'anivia', 0.9],
  ['cold-email', 'sales-automation', 0.8],
  ['anivia', 'sales-automation', 0.9],
  ['anivia', 'supabase', 0.7],
  ['anivia', 'vercel', 0.6],
  ['context-memory', 'memory-systems', 0.9],
  ['context-memory', 'agentic-ai', 0.7],
  ['context-memory', 'supabase', 0.6],
  ['collabo', 'agentic-ai', 0.8],
  ['collabo', 'ux-patterns', 0.7],
  ['collabo', 'supabase', 0.6],
  ['ventok-saas', 'anivia', 0.8],
  ['ventok-saas', 'go-to-market', 0.9],
  ['ventok-saas', 'pricing', 0.7],
  ['web-design', 'excalidraw-style', 0.7],
  ['web-design', 'ux-patterns', 0.8],
  ['excalidraw-style', 'ux-patterns', 0.5],
  ['agentic-ai', 'llm-patterns', 0.8],
  ['agentic-ai', 'memory-systems', 0.7],
  ['memory-systems', 'llm-patterns', 0.6],
  ['supabase', 'vercel', 0.6],
  ['supabase', 'dev-workflow', 0.5],
  ['vercel', 'dev-workflow', 0.6],
  ['pricing', 'go-to-market', 0.8],
  ['sales-automation', 'go-to-market', 0.7],
  ['cold-email', 'go-to-market', 0.6],
  ['llm-patterns', 'dev-workflow', 0.4],
];

function scanMemory() {
  const mentions = {};
  Object.keys(TOPICS).forEach(id => mentions[id] = { count: 0, files: [] });

  const files = [
    path.join(WORKSPACE, 'MEMORY.md'),
    ...fs.readdirSync(MEMORY_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(MEMORY_DIR, f))
  ];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      const filename = path.basename(file);

      for (const [id, topic] of Object.entries(TOPICS)) {
        const found = topic.keywords.some(kw => content.includes(kw.toLowerCase()));
        if (found) {
          mentions[id].count++;
          if (!mentions[id].files.includes(filename)) {
            mentions[id].files.push(filename);
          }
        }
      }
    } catch (e) {}
  }

  return mentions;
}

function generateHTML(mentions) {
  const nodes = Object.entries(TOPICS).map(([id, topic]) => ({
    id,
    label: topic.label,
    cluster: topic.cluster,
    threads: topic.threads,
    mentions: mentions[id].count,
    files: mentions[id].files,
    radius: Math.max(25, Math.min(50, 20 + mentions[id].count * 3))
  }));

  const links = CONNECTIONS.map(([source, target, strength]) => ({
    source, target, strength
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neuron</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #000;
      color: #fff;
      min-height: 100vh;
      overflow: hidden;
    }
    canvas { display: block; position: fixed; top: 0; left: 0; }
    
    #sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 340px;
      height: 100%;
      background: #000;
      border-left: 1px solid #222;
      padding: 32px 24px;
      overflow-y: auto;
      transform: translateX(100%);
      transition: transform 0.2s ease;
      z-index: 100;
    }
    #sidebar.open { transform: translateX(0); }
    
    #sidebar h2 {
      font-size: 1.125rem;
      font-weight: 500;
      margin-bottom: 4px;
    }
    #sidebar .meta {
      color: #666;
      font-size: 0.8rem;
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #222;
    }
    #sidebar h3 {
      font-size: 0.7rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    #sidebar ul { list-style: none; }
    #sidebar li {
      padding: 12px 0;
      border-bottom: 1px solid #111;
      font-size: 0.875rem;
      line-height: 1.5;
      color: #999;
    }
    #sidebar li:last-child { border-bottom: none; }
    
    #close {
      position: absolute;
      top: 24px;
      right: 24px;
      background: none;
      border: none;
      color: #666;
      font-size: 1.5rem;
      cursor: pointer;
      line-height: 1;
    }
    #close:hover { color: #fff; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  
  <div id="sidebar">
    <button id="close">×</button>
    <h2 id="title"></h2>
    <div class="meta" id="meta"></div>
    <h3>Threads</h3>
    <ul id="threads"></ul>
  </div>

  <script>
    const nodes = ${JSON.stringify(nodes)};
    const links = ${JSON.stringify(links)};

    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    const sidebar = document.getElementById('sidebar');

    let W, H, ox = 0, oy = 0, scale = 1;
    let drag = null, pan = false, panX = 0, panY = 0;
    let selected = null, hovered = null;

    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      const r = 250 + Math.random() * 100;
      n.x = Math.cos(a) * r;
      n.y = Math.sin(a) * r;
      n.vx = 0;
      n.vy = 0;
    });

    function resize() {
      W = innerWidth; H = innerHeight;
      c.width = W * devicePixelRatio;
      c.height = H * devicePixelRatio;
      c.style.width = W + 'px';
      c.style.height = H + 'px';
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    function node(id) { return nodes.find(n => n.id === id); }

    function sim() {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const d = Math.sqrt(dx*dx + dy*dy) || 1;
          const f = 8000 / (d * d);
          nodes[i].vx -= (dx/d) * f;
          nodes[i].vy -= (dy/d) * f;
          nodes[j].vx += (dx/d) * f;
          nodes[j].vy += (dy/d) * f;
        }
      }
      links.forEach(l => {
        const s = node(l.source), t = node(l.target);
        if (!s || !t) return;
        const dx = t.x - s.x, dy = t.y - s.y;
        const d = Math.sqrt(dx*dx + dy*dy) || 1;
        const f = d * 0.008 * l.strength;
        s.vx += (dx/d) * f; s.vy += (dy/d) * f;
        t.vx -= (dx/d) * f; t.vy -= (dy/d) * f;
      });
      nodes.forEach(n => {
        n.vx -= n.x * 0.001; n.vy -= n.y * 0.001;
        if (n !== drag) {
          n.vx *= 0.85; n.vy *= 0.85;
          n.x += n.vx; n.y += n.vy;
        }
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W/2 + ox, H/2 + oy);
      ctx.scale(scale, scale);

      // links
      links.forEach(l => {
        const s = node(l.source), t = node(l.target);
        if (!s || !t) return;
        const hi = selected && (l.source === selected.id || l.target === selected.id);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = hi ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = hi ? 1.5 : 1;
        ctx.stroke();
      });

      // nodes
      nodes.forEach(n => {
        const sel = n === selected;
        const conn = selected && links.some(l => 
          (l.source === selected.id && l.target === n.id) ||
          (l.target === selected.id && l.source === n.id));
        const dim = selected && !sel && !conn;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = sel ? '#fff' : (dim ? '#0a0a0a' : '#111');
        ctx.fill();
        ctx.strokeStyle = sel ? '#fff' : (dim ? '#111' : '#333');
        ctx.lineWidth = sel ? 2 : 1;
        ctx.stroke();

        ctx.fillStyle = sel ? '#000' : (dim ? '#333' : '#888');
        ctx.font = (sel ? '500 ' : '400 ') + '11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.label, n.x, n.y);
      });

      ctx.restore();
    }

    function loop() { sim(); draw(); requestAnimationFrame(loop); }

    function toWorld(x, y) {
      return { x: (x - W/2 - ox) / scale, y: (y - H/2 - oy) / scale };
    }

    function hit(wx, wy) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = wx - n.x, dy = wy - n.y;
        if (dx*dx + dy*dy < n.radius * n.radius) return n;
      }
      return null;
    }

    function show(n) {
      selected = n;
      document.getElementById('title').textContent = n.label;
      document.getElementById('meta').textContent = n.mentions + ' mentions · ' + n.cluster;
      document.getElementById('threads').innerHTML = n.threads.map(t => '<li>' + t + '</li>').join('');
      sidebar.classList.add('open');
    }

    function hide() { selected = null; sidebar.classList.remove('open'); }

    c.onmousedown = e => {
      const w = toWorld(e.clientX, e.clientY);
      const n = hit(w.x, w.y);
      if (n) { drag = n; } 
      else { pan = true; panX = e.clientX - ox; panY = e.clientY - oy; }
    };

    c.onmousemove = e => {
      const w = toWorld(e.clientX, e.clientY);
      if (drag) { drag.x = w.x; drag.y = w.y; drag.vx = 0; drag.vy = 0; }
      else if (pan) { ox = e.clientX - panX; oy = e.clientY - panY; }
      else { c.style.cursor = hit(w.x, w.y) ? 'pointer' : 'default'; }
    };

    c.onmouseup = e => {
      if (drag) {
        const w = toWorld(e.clientX, e.clientY);
        if (hit(w.x, w.y) === drag) show(drag);
      }
      drag = null; pan = false;
    };

    c.onwheel = e => {
      e.preventDefault();
      scale = Math.max(0.3, Math.min(3, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    };

    onkeydown = e => {
      if (e.code === 'Space') { e.preventDefault(); scale = 1; ox = 0; oy = 0; hide(); }
      if (e.code === 'Escape') hide();
    };

    document.getElementById('close').onclick = hide;
    onresize = resize;
    resize();
    loop();
  </script>
</body>
</html>`;

  return html;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
arc neuron — knowledge network

usage:
  arc neuron           generate neuron.html
  arc neuron --json    output topic data as JSON
  arc neuron --stats   show topic statistics
`);
    return;
  }

  console.log('scanning...');
  const mentions = scanMemory();

  if (args.includes('--json')) {
    const data = Object.entries(TOPICS).map(([id, topic]) => ({
      id, ...topic, mentions: mentions[id].count, files: mentions[id].files
    }));
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (args.includes('--stats')) {
    console.log('\n  topics\n');
    Object.entries(mentions)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([id, data]) => {
        const bar = '█'.repeat(Math.min(20, data.count));
        console.log(`  ${TOPICS[id].label.padEnd(20)} ${bar} ${data.count}`);
      });
    console.log();
    return;
  }

  const html = generateHTML(mentions);
  fs.writeFileSync(OUTPUT_FILE, html);
  console.log('saved to neuron.html');
}

main();

#!/usr/bin/env node
/**
 * arc neuron — knowledge network visualization
 * nightly build 2026-03-08
 * 
 * extracts topics from memory, finds connections, generates interactive graph
 * with "deepening threads" — suggested questions/explorations per topic
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
  // sales & outreach cluster
  'cold-email': {
    label: 'Cold Email',
    cluster: 'sales',
    color: '#22d3ee',
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
    color: '#22d3ee',
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
    color: '#22d3ee',
    keywords: ['sales automation', 'pipeline', 'CRM', 'lead', 'prospect'],
    threads: [
      'full-funnel ownership vs point solutions',
      'where human judgment beats AI in sales',
      'SMB pricing psychology (€300-800/mo sweet spot)',
      'sales AI that improves from rejection feedback'
    ]
  },

  // products cluster
  'context-memory': {
    label: 'Context Memory API',
    cluster: 'products',
    color: '#a78bfa',
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
    color: '#a78bfa',
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
    color: '#a78bfa',
    keywords: ['ventok', 'manufacturer', 'estonian', 'SME', 'excel hell'],
    threads: [
      'vertical SaaS for manufacturing niches',
      'language barriers in estonian B2B',
      'build vs buy for estonian companies',
      'trust signals for AI in conservative industries'
    ]
  },

  // design cluster
  'web-design': {
    label: 'Web Design',
    cluster: 'design',
    color: '#f472b6',
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
    color: '#f472b6',
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
    color: '#f472b6',
    keywords: ['modal', 'overlay', 'single-column', 'notion-style', 'settings'],
    threads: [
      'progressive disclosure in complex UIs',
      'command palette as power user interface',
      'when modals beat separate pages',
      'mobile-first that doesn\'t feel stripped down'
    ]
  },

  // AI architecture cluster
  'agentic-ai': {
    label: 'Agentic AI',
    cluster: 'ai',
    color: '#4ade80',
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
    color: '#4ade80',
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
    color: '#4ade80',
    keywords: ['LLM', 'prompt', 'claude', 'opus', 'haiku', 'model'],
    threads: [
      'model selection by task type',
      'chain-of-thought vs direct answer',
      'context window management strategies',
      'fine-tuning vs prompting economics'
    ]
  },

  // infrastructure cluster
  'supabase': {
    label: 'Supabase',
    cluster: 'infra',
    color: '#fb923c',
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
    color: '#fb923c',
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
    color: '#fb923c',
    keywords: ['git', 'commit', 'nightly build', 'arc', 'script', 'CLI'],
    threads: [
      'commit granularity — atomic vs batched',
      'nightly builds as forcing function',
      'CLI tools that compound over time',
      'workspace health as daily metric'
    ]
  },

  // business cluster
  'pricing': {
    label: 'Pricing',
    cluster: 'business',
    color: '#facc15',
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
    color: '#facc15',
    keywords: ['launch', 'market', 'positioning', 'pipeline', 'lead', 'TMW', 'Luminor'],
    threads: [
      'dogfooding → SaaS transition timing',
      'estonian market size constraints',
      'referral loops for B2B',
      'content marketing for technical products'
    ]
  }
};

// connection definitions (topic pairs that relate)
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

// scan memory files for topic mentions
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
    } catch (e) {
      // skip unreadable files
    }
  }

  return mentions;
}

// generate HTML visualization
function generateHTML(mentions) {
  const nodes = Object.entries(TOPICS).map(([id, topic]) => ({
    id,
    label: topic.label,
    cluster: topic.cluster,
    color: topic.color,
    threads: topic.threads,
    mentions: mentions[id].count,
    files: mentions[id].files,
    // size based on mention count
    radius: Math.max(25, Math.min(50, 20 + mentions[id].count * 3))
  }));

  const links = CONNECTIONS.map(([source, target, strength]) => ({
    source,
    target,
    strength
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neuron Network — Knowledge Graph</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: #0a0a0f;
      color: #e5e5e5;
      min-height: 100vh;
      overflow: hidden;
    }
    #canvas-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    canvas {
      display: block;
    }
    #sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 380px;
      height: 100%;
      background: linear-gradient(135deg, #12121a 0%, #0a0a0f 100%);
      border-left: 1px solid #2a2a3a;
      padding: 24px;
      overflow-y: auto;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      z-index: 100;
    }
    #sidebar.open { transform: translateX(0); }
    #sidebar h2 {
      font-size: 1.4rem;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #sidebar .cluster-badge {
      font-size: 0.7rem;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    #sidebar .meta {
      color: #888;
      font-size: 0.85rem;
      margin-bottom: 20px;
    }
    #sidebar h3 {
      font-size: 0.9rem;
      color: #888;
      margin: 20px 0 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    #sidebar ul {
      list-style: none;
    }
    #sidebar li {
      padding: 12px 14px;
      margin-bottom: 8px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      border-left: 3px solid;
      font-size: 0.9rem;
      line-height: 1.4;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    #sidebar li:hover {
      background: rgba(255,255,255,0.08);
      transform: translateX(4px);
    }
    #sidebar .files {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    #sidebar .file-tag {
      font-size: 0.75rem;
      padding: 3px 8px;
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
      color: #aaa;
    }
    #close-sidebar {
      position: absolute;
      top: 20px;
      right: 20px;
      background: none;
      border: none;
      color: #888;
      font-size: 1.5rem;
      cursor: pointer;
      transition: color 0.2s;
    }
    #close-sidebar:hover { color: #fff; }
    #header {
      position: fixed;
      top: 20px;
      left: 24px;
      z-index: 50;
    }
    #header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      background: linear-gradient(135deg, #22d3ee, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    #header p {
      color: #666;
      font-size: 0.85rem;
      margin-top: 4px;
    }
    #legend {
      position: fixed;
      bottom: 24px;
      left: 24px;
      display: flex;
      gap: 16px;
      z-index: 50;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: #888;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    #instructions {
      position: fixed;
      bottom: 24px;
      right: 24px;
      color: #555;
      font-size: 0.8rem;
      text-align: right;
      z-index: 50;
    }
  </style>
</head>
<body>
  <div id="header">
    <h1>⌁ Neuron Network</h1>
    <p>knowledge graph · ${nodes.length} topics · ${links.length} connections</p>
  </div>

  <div id="legend">
    <div class="legend-item"><div class="legend-dot" style="background: #22d3ee"></div> sales</div>
    <div class="legend-item"><div class="legend-dot" style="background: #a78bfa"></div> products</div>
    <div class="legend-item"><div class="legend-dot" style="background: #f472b6"></div> design</div>
    <div class="legend-item"><div class="legend-dot" style="background: #4ade80"></div> AI</div>
    <div class="legend-item"><div class="legend-dot" style="background: #fb923c"></div> infra</div>
    <div class="legend-item"><div class="legend-dot" style="background: #facc15"></div> business</div>
  </div>

  <div id="instructions">
    drag to move · click node to explore threads<br>
    scroll to zoom · spacebar to reset
  </div>

  <div id="canvas-container">
    <canvas id="graph"></canvas>
  </div>

  <div id="sidebar">
    <button id="close-sidebar">×</button>
    <h2 id="topic-title">Select a topic</h2>
    <div class="meta" id="topic-meta"></div>
    <h3>Deepening Threads</h3>
    <ul id="threads-list"></ul>
    <h3>Mentioned In</h3>
    <div class="files" id="files-list"></div>
  </div>

  <script>
    const nodes = ${JSON.stringify(nodes)};
    const links = ${JSON.stringify(links)};

    const canvas = document.getElementById('graph');
    const ctx = canvas.getContext('2d');
    const sidebar = document.getElementById('sidebar');

    let width, height;
    let offsetX = 0, offsetY = 0;
    let scale = 1;
    let dragging = null;
    let panning = false;
    let panStart = { x: 0, y: 0 };
    let selectedNode = null;

    // physics
    const REPULSION = 8000;
    const ATTRACTION = 0.008;
    const DAMPING = 0.85;
    const CENTER_PULL = 0.001;

    // initialize node positions
    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const radius = 250 + Math.random() * 100;
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.vx = 0;
      node.vy = 0;
    });

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * devicePixelRatio;
      canvas.height = height * devicePixelRatio;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    function getNodeById(id) {
      return nodes.find(n => n.id === id);
    }

    function simulate() {
      // repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // attraction along links
      links.forEach(link => {
        const source = getNodeById(link.source);
        const target = getNodeById(link.target);
        if (!source || !target) return;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * ATTRACTION * link.strength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      });

      // center pull
      nodes.forEach(node => {
        node.vx -= node.x * CENTER_PULL;
        node.vy -= node.y * CENTER_PULL;
      });

      // apply velocity
      nodes.forEach(node => {
        if (node === dragging) return;
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
      });
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
      ctx.scale(scale, scale);

      // draw links
      links.forEach(link => {
        const source = getNodeById(link.source);
        const target = getNodeById(link.target);
        if (!source || !target) return;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = 'rgba(255,255,255,' + (link.strength * 0.15) + ')';
        ctx.lineWidth = link.strength * 2;
        ctx.stroke();
      });

      // draw nodes
      nodes.forEach(node => {
        const isSelected = selectedNode === node;
        const isConnected = selectedNode && links.some(l => 
          (l.source === selectedNode.id && l.target === node.id) ||
          (l.target === selectedNode.id && l.source === node.id)
        );

        // glow for selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 15, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + 20);
          glow.addColorStop(0, node.color + '40');
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        
        const opacity = selectedNode ? (isSelected || isConnected ? 1 : 0.3) : 1;
        ctx.fillStyle = node.color + (opacity < 1 ? '4d' : '');
        ctx.fill();
        
        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // label
        ctx.fillStyle = opacity < 1 ? '#666' : '#fff';
        ctx.font = (isSelected ? 'bold ' : '') + '13px SF Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x, node.y);
      });

      ctx.restore();
    }

    function loop() {
      simulate();
      draw();
      requestAnimationFrame(loop);
    }

    function screenToWorld(sx, sy) {
      return {
        x: (sx - width / 2 - offsetX) / scale,
        y: (sy - height / 2 - offsetY) / scale
      };
    }

    function getNodeAt(wx, wy) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const dx = wx - node.x;
        const dy = wy - node.y;
        if (dx * dx + dy * dy < node.radius * node.radius) {
          return node;
        }
      }
      return null;
    }

    function showSidebar(node) {
      selectedNode = node;
      document.getElementById('topic-title').innerHTML = 
        '<span style="color:' + node.color + '">●</span> ' + node.label;
      document.getElementById('topic-meta').textContent = 
        node.mentions + ' mentions · ' + node.cluster + ' cluster';
      
      const threadsList = document.getElementById('threads-list');
      threadsList.innerHTML = node.threads.map(t => 
        '<li style="border-color:' + node.color + '">' + t + '</li>'
      ).join('');

      const filesList = document.getElementById('files-list');
      filesList.innerHTML = node.files.slice(0, 8).map(f => 
        '<span class="file-tag">' + f + '</span>'
      ).join('');

      sidebar.classList.add('open');
    }

    canvas.addEventListener('mousedown', e => {
      const world = screenToWorld(e.clientX, e.clientY);
      const node = getNodeAt(world.x, world.y);
      if (node) {
        dragging = node;
      } else {
        panning = true;
        panStart = { x: e.clientX - offsetX, y: e.clientY - offsetY };
      }
    });

    canvas.addEventListener('mousemove', e => {
      if (dragging) {
        const world = screenToWorld(e.clientX, e.clientY);
        dragging.x = world.x;
        dragging.y = world.y;
        dragging.vx = 0;
        dragging.vy = 0;
      } else if (panning) {
        offsetX = e.clientX - panStart.x;
        offsetY = e.clientY - panStart.y;
      }
    });

    canvas.addEventListener('mouseup', e => {
      if (dragging && !panning) {
        const world = screenToWorld(e.clientX, e.clientY);
        const node = getNodeAt(world.x, world.y);
        if (node === dragging) {
          showSidebar(node);
        }
      }
      dragging = null;
      panning = false;
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.max(0.3, Math.min(3, scale * zoomFactor));
    });

    document.addEventListener('keydown', e => {
      if (e.code === 'Space') {
        e.preventDefault();
        scale = 1;
        offsetX = 0;
        offsetY = 0;
        selectedNode = null;
        sidebar.classList.remove('open');
      } else if (e.code === 'Escape') {
        selectedNode = null;
        sidebar.classList.remove('open');
      }
    });

    document.getElementById('close-sidebar').addEventListener('click', () => {
      selectedNode = null;
      sidebar.classList.remove('open');
    });

    window.addEventListener('resize', resize);
    resize();
    loop();
  </script>
</body>
</html>`;

  return html;
}

// main
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
arc neuron — knowledge network visualization

usage:
  arc neuron           generate and open neuron.html
  arc neuron --json    output topic data as JSON
  arc neuron --stats   show topic statistics

the visualization shows:
  • topic nodes sized by mention frequency
  • connections based on semantic relationships
  • "deepening threads" — questions to explore each topic further
`);
    return;
  }

  console.log('scanning memory for topics...');
  const mentions = scanMemory();

  if (args.includes('--json')) {
    const data = Object.entries(TOPICS).map(([id, topic]) => ({
      id,
      ...topic,
      mentions: mentions[id].count,
      files: mentions[id].files
    }));
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (args.includes('--stats')) {
    console.log('\n  topic statistics\n');
    const sorted = Object.entries(mentions)
      .sort((a, b) => b[1].count - a[1].count);
    
    for (const [id, data] of sorted) {
      const topic = TOPICS[id];
      const bar = '█'.repeat(Math.min(20, data.count));
      console.log(`  ${topic.label.padEnd(20)} ${bar} ${data.count}`);
    }
    console.log();
    return;
  }

  console.log('generating visualization...');
  const html = generateHTML(mentions);
  fs.writeFileSync(OUTPUT_FILE, html);
  console.log(`\n  ✓ saved to neuron.html\n`);
  console.log(`  topics: ${Object.keys(TOPICS).length}`);
  console.log(`  connections: ${CONNECTIONS.length}`);
  console.log(`  total threads: ${Object.values(TOPICS).reduce((sum, t) => sum + t.threads.length, 0)}`);
  console.log(`\n  open in browser: file://${OUTPUT_FILE}\n`);
}

main();

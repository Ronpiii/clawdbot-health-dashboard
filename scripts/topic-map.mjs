#!/usr/bin/env node
/**
 * arc map — knowledge topology of your memory
 * 
 * extracts topics/entities from all memory files, builds a co-occurrence
 * graph, surfaces: connected themes, orphaned threads, topic timelines,
 * and the "shape" of what you've been thinking about.
 * 
 * not grep (finding text) — understanding structure.
 * 
 * usage:
 *   arc map                         # top topics overview + clusters
 *   arc map <topic>                 # deep dive on one topic
 *   arc map --threads               # active threads (multi-day topics)
 *   arc map --orphans               # mentioned once, never followed up
 *   arc map --connections           # strongest co-occurrence pairs
 *   arc map --timeline              # topic density over time
 *   arc map --clusters              # auto-detected topic clusters
 *   arc map --drift                 # topic drift — what's fading vs rising
 *   arc map --short                 # compact summary
 *   arc map --json                  # machine-readable
 * 
 * nightly build 2026-02-22
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');
const MEMORY_FILE = join(ROOT, 'MEMORY.md');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');
const threadsMode = args.includes('--threads');
const orphansMode = args.includes('--orphans');
const connectionsMode = args.includes('--connections');
const timelineMode = args.includes('--timeline');
const clustersMode = args.includes('--clusters');
const driftMode = args.includes('--drift');

// positional topic query (first arg not starting with --)
const topicQuery = args.find(a => !a.startsWith('--'));

// ── known entities ───────────────────────────────────────────────────
// curated list of topics worth tracking — keeps noise low

const ENTITIES = {
  // projects
  anivia: { type: 'project', aliases: ['anivia'] },
  ventok: { type: 'project', aliases: ['ventok', 'ventok.eu'] },
  collabo: { type: 'project', aliases: ['collabo', 'collabo-v2'] },
  tuner: { type: 'project', aliases: ['tuner', 'mundo'] },
  moltbook: { type: 'project', aliases: ['moltbook'] },
  clawd: { type: 'project', aliases: ['clawd', 'clawdbot'] },
  bore: { type: 'project', aliases: ['bore'] },
  
  // people
  ron: { type: 'person', aliases: ['ron'] },
  anna: { type: 'person', aliases: ['anna'] },
  
  // tech
  supabase: { type: 'tech', aliases: ['supabase'] },
  nextjs: { type: 'tech', aliases: ['next.js', 'nextjs', 'next js'] },
  vercel: { type: 'tech', aliases: ['vercel'] },
  react: { type: 'tech', aliases: ['react'] },
  stripe: { type: 'tech', aliases: ['stripe'] },
  tailwind: { type: 'tech', aliases: ['tailwind', 'tailwindcss'] },
  
  // concepts
  rls: { type: 'concept', aliases: ['rls', 'row level security'] },
  oauth: { type: 'concept', aliases: ['oauth', 'oauth2'] },
  email: { type: 'concept', aliases: ['email', 'emails', 'email delivery', 'deliverability'] },
  sequences: { type: 'concept', aliases: ['sequences', 'sequence', 'drip'] },
  leads: { type: 'concept', aliases: ['leads', 'lead', 'prospects'] },
  campaigns: { type: 'concept', aliases: ['campaigns', 'campaign'] },
  pipeline: { type: 'concept', aliases: ['pipeline', 'sales pipeline'] },
  outreach: { type: 'concept', aliases: ['outreach', 'cold outreach', 'cold email'] },
  monochrome: { type: 'concept', aliases: ['monochrome', 'monochrome-first'] },
  security: { type: 'concept', aliases: ['security', 'security scanner'] },
  nightly: { type: 'concept', aliases: ['nightly build', 'nightly builds'] },
  heartbeat: { type: 'concept', aliases: ['heartbeat', 'heartbeats'] },
  design: { type: 'concept', aliases: ['design', 'ui design', 'ux'] },
  landing: { type: 'concept', aliases: ['landing page', 'landing'] },
  pricing: { type: 'concept', aliases: ['pricing'] },
  dns: { type: 'concept', aliases: ['dns', 'domain'] },
  deployment: { type: 'concept', aliases: ['deploy', 'deployment', 'deployed'] },
  testing: { type: 'concept', aliases: ['test', 'tests', 'testing'] },
  migration: { type: 'concept', aliases: ['migration', 'migrations'] },
  webhook: { type: 'concept', aliases: ['webhook', 'webhooks'] },
  api: { type: 'concept', aliases: ['api', 'api route', 'endpoint'] },
  dashboard: { type: 'concept', aliases: ['dashboard'] },
  arc: { type: 'tool', aliases: ['arc cli', 'arc tool'] },
};

// ── load all memory files ────────────────────────────────────────────

function loadDailyLogs() {
  if (!existsSync(MEMORY_DIR)) return [];
  return readdirSync(MEMORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .map(f => {
      const date = f.replace('.md', '');
      const content = readFileSync(join(MEMORY_DIR, f), 'utf-8');
      return { date, content, source: `memory/${f}` };
    });
}

function loadMemoryMd() {
  if (!existsSync(MEMORY_FILE)) return null;
  const content = readFileSync(MEMORY_FILE, 'utf-8');
  return { date: null, content, source: 'MEMORY.md' };
}

// ── extract sections from a file ─────────────────────────────────────

function extractSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let current = null;
  
  for (const line of lines) {
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h2) {
      if (current) sections.push(current);
      current = { title: h2[1].trim(), level: 2, lines: [] };
    } else if (h3) {
      if (current) sections.push(current);
      current = { title: h3[1].trim(), level: 3, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

// ── find topics in text ──────────────────────────────────────────────

function findTopics(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  
  for (const [name, entity] of Object.entries(ENTITIES)) {
    for (const alias of entity.aliases) {
      // word boundary matching
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (re.test(lower)) {
        found.add(name);
        break;
      }
    }
  }
  
  return [...found];
}

// ── build the graph ──────────────────────────────────────────────────

function buildGraph(logs) {
  // topic → { dates: Set, sections: [], cooccurrences: Map<topic, count> }
  const graph = {};
  
  for (const [name] of Object.entries(ENTITIES)) {
    graph[name] = { dates: new Set(), sections: [], cooccurrences: new Map(), mentions: 0 };
  }
  
  for (const log of logs) {
    if (!log.date) continue; // skip MEMORY.md for date-based analysis
    
    const sections = extractSections(log.content);
    
    // also scan the whole file for document-level co-occurrence
    const docTopics = findTopics(log.content);
    
    // count mentions per topic (rough: count alias occurrences)
    for (const topic of docTopics) {
      graph[topic].dates.add(log.date);
      
      // rough mention count
      const entity = ENTITIES[topic];
      let count = 0;
      for (const alias of entity.aliases) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'gi');
        const matches = log.content.match(re);
        if (matches) count += matches.length;
      }
      graph[topic].mentions += count;
    }
    
    // section-level topic detection
    for (const section of sections) {
      const sectionText = section.title + '\n' + section.lines.join('\n');
      const sectionTopics = findTopics(sectionText);
      
      for (const topic of sectionTopics) {
        graph[topic].sections.push({
          date: log.date,
          title: section.title,
          level: section.level
        });
      }
      
      // co-occurrence within same section (stronger signal than doc-level)
      for (let i = 0; i < sectionTopics.length; i++) {
        for (let j = i + 1; j < sectionTopics.length; j++) {
          const a = sectionTopics[i], b = sectionTopics[j];
          graph[a].cooccurrences.set(b, (graph[a].cooccurrences.get(b) || 0) + 1);
          graph[b].cooccurrences.set(a, (graph[b].cooccurrences.get(a) || 0) + 1);
        }
      }
    }
  }
  
  return graph;
}

// ── rendering helpers ────────────────────────────────────────────────

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';
const WHITE = '\x1b[37m';

function bar(value, max, width = 20) {
  const filled = Math.round((value / Math.max(max, 1)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function sparkline(values) {
  const chars = '▁▂▃▄▅▆▇█';
  const max = Math.max(...values, 1);
  return values.map(v => chars[Math.min(Math.floor((v / max) * 7), 7)]).join('');
}

function typeColor(type) {
  switch (type) {
    case 'project': return CYAN;
    case 'person': return YELLOW;
    case 'tech': return GREEN;
    case 'concept': return MAGENTA;
    case 'tool': return WHITE;
    default: return RESET;
  }
}

function typeIcon(type) {
  switch (type) {
    case 'project': return 'PRJ';
    case 'person': return 'WHO';
    case 'tech': return 'TEC';
    case 'concept': return 'CON';
    case 'tool': return 'TOL';
    default: return '???';
  }
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ── views ────────────────────────────────────────────────────────────

function overviewView(graph) {
  // sort by mention count, filter to topics that actually appear
  const topics = Object.entries(graph)
    .filter(([, v]) => v.dates.size > 0)
    .sort((a, b) => b[1].mentions - a[1].mentions);
  
  if (topics.length === 0) {
    console.log('no topics found in memory files');
    return;
  }
  
  const maxMentions = topics[0][1].mentions;
  
  console.log(`${BOLD}KNOWLEDGE MAP${RESET}  ${DIM}${topics.length} topics across ${new Set(topics.flatMap(([,v]) => [...v.dates])).size} days${RESET}`);
  console.log();
  
  // group by type
  const byType = {};
  for (const [name, data] of topics) {
    const type = ENTITIES[name].type;
    if (!byType[type]) byType[type] = [];
    byType[type].push([name, data]);
  }
  
  for (const [type, items] of Object.entries(byType)) {
    const color = typeColor(type);
    console.log(`${color}${BOLD}  ${type.toUpperCase()}${RESET}`);
    
    for (const [name, data] of items) {
      const dates = [...data.dates].sort();
      const span = dates.length > 1 ? `${dates[0]} → ${dates[dates.length - 1]}` : dates[0];
      const topCooc = [...data.cooccurrences.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t);
      
      const barStr = bar(data.mentions, maxMentions, 15);
      const coocStr = topCooc.length > 0 ? `${DIM}links: ${topCooc.join(', ')}${RESET}` : '';
      
      console.log(`  ${color}${name.padEnd(14)}${RESET} ${barStr} ${String(data.mentions).padStart(4)} mentions  ${DIM}${dates.length}d${RESET}  ${coocStr}`);
    }
    console.log();
  }
}

function topicDeepDive(graph, query) {
  // find the topic
  const queryLower = query.toLowerCase();
  const match = Object.entries(ENTITIES).find(([name, ent]) => 
    name === queryLower || ent.aliases.some(a => a.toLowerCase() === queryLower)
  );
  
  if (!match) {
    console.log(`topic "${query}" not found. known topics:`);
    console.log(Object.keys(ENTITIES).filter(k => graph[k].dates.size > 0).join(', '));
    return;
  }
  
  const [name, entity] = match;
  const data = graph[name];
  const dates = [...data.dates].sort();
  
  if (dates.length === 0) {
    console.log(`${name}: no mentions found in daily logs`);
    return;
  }
  
  const color = typeColor(entity.type);
  
  console.log(`${BOLD}${color}${name.toUpperCase()}${RESET}  ${DIM}${typeIcon(entity.type)} — ${data.mentions} mentions across ${dates.length} days${RESET}`);
  console.log();
  
  // timeline — show each day it appeared with sections
  console.log(`${BOLD}  TIMELINE${RESET}`);
  const sectionsByDate = {};
  for (const s of data.sections) {
    if (!sectionsByDate[s.date]) sectionsByDate[s.date] = [];
    sectionsByDate[s.date].push(s);
  }
  
  for (const date of dates) {
    const sects = sectionsByDate[date] || [];
    // deduplicate section titles
    const uniqueTitles = [...new Set(sects.map(s => s.title))].slice(0, 3);
    const sectStr = uniqueTitles.length > 0 ? uniqueTitles.join(', ') : '(mentioned in body)';
    console.log(`  ${DIM}${date}${RESET}  ${sectStr}`);
  }
  console.log();
  
  // co-occurring topics
  const coocs = [...data.cooccurrences.entries()].sort((a, b) => b[1] - a[1]);
  if (coocs.length > 0) {
    console.log(`${BOLD}  CONNECTED TO${RESET}`);
    const maxCooc = coocs[0][1];
    for (const [topic, count] of coocs.slice(0, 10)) {
      const tc = typeColor(ENTITIES[topic].type);
      console.log(`  ${tc}${topic.padEnd(14)}${RESET} ${bar(count, maxCooc, 10)} ${count} sections shared`);
    }
    console.log();
  }
  
  // activity pattern
  if (dates.length >= 2) {
    const gaps = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push(daysBetween(dates[i - 1], dates[i]));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const maxGap = Math.max(...gaps);
    const lastSeen = dates[dates.length - 1];
    const today = new Date().toISOString().slice(0, 10);
    const daysSinceLast = daysBetween(lastSeen, today);
    
    console.log(`${BOLD}  ACTIVITY${RESET}`);
    console.log(`  first seen:  ${dates[0]}`);
    console.log(`  last seen:   ${lastSeen}${daysSinceLast > 7 ? `  ${RED}(${daysSinceLast}d ago)${RESET}` : `  ${DIM}(${daysSinceLast}d ago)${RESET}`}`);
    console.log(`  avg gap:     ${avgGap.toFixed(1)} days between mentions`);
    console.log(`  max gap:     ${maxGap} days`);
    
    if (daysSinceLast > avgGap * 2 && daysSinceLast > 7) {
      console.log(`  ${YELLOW}^ this topic may be going cold — last mention was ${daysSinceLast}d ago (avg gap: ${avgGap.toFixed(0)}d)${RESET}`);
    }
    console.log();
  }
}

function threadsView(graph) {
  // threads = topics mentioned on 3+ different days
  const threads = Object.entries(graph)
    .filter(([, v]) => v.dates.size >= 3)
    .sort((a, b) => b[1].dates.size - a[1].dates.size);
  
  const today = new Date().toISOString().slice(0, 10);
  
  console.log(`${BOLD}ACTIVE THREADS${RESET}  ${DIM}topics spanning 3+ days${RESET}`);
  console.log();
  
  if (threads.length === 0) {
    console.log('  no multi-day topics found yet. keep logging!');
    return;
  }
  
  for (const [name, data] of threads) {
    const dates = [...data.dates].sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    const span = daysBetween(first, last);
    const sinceLast = daysBetween(last, today);
    const color = typeColor(ENTITIES[name].type);
    const status = sinceLast <= 2 ? `${GREEN}active${RESET}` :
                   sinceLast <= 7 ? `${YELLOW}recent${RESET}` :
                   `${RED}stale (${sinceLast}d)${RESET}`;
    
    // build a mini timeline: for each day in the span, is there a mention?
    const dateSet = data.dates;
    const allDays = [];
    const d = new Date(first);
    const endD = new Date(last);
    while (d <= endD) {
      const ds = d.toISOString().slice(0, 10);
      allDays.push(dateSet.has(ds) ? '█' : '░');
      d.setDate(d.getDate() + 1);
    }
    const timeline = allDays.length > 40 ? allDays.slice(-40).join('') : allDays.join('');
    
    console.log(`  ${color}${name.padEnd(14)}${RESET} ${dates.length}d / ${span}d span  ${status}`);
    console.log(`  ${DIM}${timeline}${RESET}  ${DIM}${first} → ${last}${RESET}`);
    
    // top co-occurring topics for this thread
    const coocs = [...data.cooccurrences.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => t);
    if (coocs.length > 0) {
      console.log(`  ${DIM}with: ${coocs.join(', ')}${RESET}`);
    }
    console.log();
  }
}

function orphansView(graph) {
  // orphans = mentioned on exactly 1 day
  const today = new Date().toISOString().slice(0, 10);
  const orphans = Object.entries(graph)
    .filter(([, v]) => v.dates.size === 1)
    .map(([name, data]) => {
      const date = [...data.dates][0];
      const age = daysBetween(date, today);
      return { name, date, age, mentions: data.mentions, sections: data.sections };
    })
    .sort((a, b) => a.age - b.age); // newest first (most relevant to follow up)
  
  console.log(`${BOLD}ORPHANED TOPICS${RESET}  ${DIM}mentioned once, never revisited${RESET}`);
  console.log();
  
  if (orphans.length === 0) {
    console.log('  no orphans — every topic has been revisited. clean.');
    return;
  }
  
  // split into recent (worth following up) and old (probably fine)
  const recent = orphans.filter(o => o.age <= 14);
  const old = orphans.filter(o => o.age > 14);
  
  if (recent.length > 0) {
    console.log(`  ${YELLOW}RECENT (last 14 days) — worth revisiting?${RESET}`);
    for (const o of recent) {
      const color = typeColor(ENTITIES[o.name].type);
      const sectionTitles = [...new Set(o.sections.map(s => s.title))].slice(0, 2);
      const context = sectionTitles.length > 0 ? sectionTitles.join(', ') : '';
      console.log(`  ${color}${o.name.padEnd(14)}${RESET} ${o.date}  ${DIM}${o.age}d ago${RESET}  ${DIM}${context}${RESET}`);
    }
    console.log();
  }
  
  if (old.length > 0) {
    console.log(`  ${DIM}OLDER (>14 days) — probably resolved or irrelevant${RESET}`);
    for (const o of old) {
      const color = typeColor(ENTITIES[o.name].type);
      console.log(`  ${DIM}${color}${o.name.padEnd(14)}${RESET}${DIM} ${o.date}  ${o.age}d ago${RESET}`);
    }
    console.log();
  }
}

function connectionsView(graph) {
  // all co-occurrence pairs, sorted by strength
  const pairs = new Map();
  
  for (const [name, data] of Object.entries(graph)) {
    for (const [other, count] of data.cooccurrences) {
      const key = [name, other].sort().join('↔');
      if (!pairs.has(key)) {
        pairs.set(key, { a: name, b: other, count });
      }
    }
  }
  
  const sorted = [...pairs.values()].sort((a, b) => b.count - a.count);
  
  console.log(`${BOLD}STRONGEST CONNECTIONS${RESET}  ${DIM}topics that appear together in sections${RESET}`);
  console.log();
  
  if (sorted.length === 0) {
    console.log('  no co-occurrences found');
    return;
  }
  
  const max = sorted[0].count;
  for (const { a, b, count } of sorted.slice(0, 20)) {
    const ca = typeColor(ENTITIES[a].type);
    const cb = typeColor(ENTITIES[b].type);
    console.log(`  ${ca}${a.padEnd(12)}${RESET} ${DIM}↔${RESET} ${cb}${b.padEnd(12)}${RESET}  ${bar(count, max, 12)} ${count}`);
  }
  console.log();
}

function timelineView(graph, logs) {
  // week-by-week topic density
  const today = new Date().toISOString().slice(0, 10);
  const weeks = {};
  
  for (const log of logs) {
    if (!log.date) continue;
    // week key = ISO week start (Monday)
    const d = new Date(log.date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    const weekKey = monday.toISOString().slice(0, 10);
    
    if (!weeks[weekKey]) weeks[weekKey] = new Set();
    const topics = findTopics(log.content);
    for (const t of topics) weeks[weekKey].add(t);
  }
  
  const weekKeys = Object.keys(weeks).sort();
  
  console.log(`${BOLD}TOPIC TIMELINE${RESET}  ${DIM}weekly topic density${RESET}`);
  console.log();
  
  // header: top topics
  const topTopics = Object.entries(graph)
    .filter(([, v]) => v.dates.size >= 3)
    .sort((a, b) => b[1].mentions - a[1].mentions)
    .slice(0, 12)
    .map(([name]) => name);
  
  // header row
  const nameWidth = 10;
  console.log(`  ${'week'.padEnd(nameWidth)}  ${topTopics.map(t => t.slice(0, 4).padEnd(5)).join('')}`);
  console.log(`  ${'─'.repeat(nameWidth)}  ${topTopics.map(() => '─────').join('')}`);
  
  for (const weekKey of weekKeys) {
    const weekTopics = weeks[weekKey];
    const row = topTopics.map(t => weekTopics.has(t) ? `${typeColor(ENTITIES[t].type)}  ●  ${RESET}` : `${DIM}  ·  ${RESET}`);
    console.log(`  ${weekKey.slice(5).padEnd(nameWidth)}  ${row.join('')}`);
  }
  console.log();
  console.log(`  ${DIM}● = topic active that week    · = absent${RESET}`);
}

function clustersView(graph) {
  // find clusters using connection strength thresholds
  // only group topics with STRONG co-occurrence (top quartile of edge weights)
  
  const active = Object.entries(graph)
    .filter(([, v]) => v.dates.size >= 2)
    .map(([name]) => name);
  
  if (active.length === 0) {
    console.log('not enough data for clustering');
    return;
  }
  
  // collect all edge weights to find threshold
  const allWeights = [];
  for (const name of active) {
    for (const [other, count] of graph[name].cooccurrences) {
      if (active.includes(other) && name < other) {
        allWeights.push(count);
      }
    }
  }
  
  if (allWeights.length === 0) {
    console.log('no co-occurrences found');
    return;
  }
  
  allWeights.sort((a, b) => b - a);
  // high threshold — top 15% of weights — so clusters are TIGHT groups, not the whole graph
  const threshold = Math.max(6, allWeights[Math.floor(allWeights.length * 0.15)] || 6);
  
  // build adjacency with only strong edges
  const adj = {};
  for (const name of active) {
    adj[name] = {};
    for (const [other, count] of graph[name].cooccurrences) {
      if (active.includes(other) && count >= threshold) {
        adj[name][other] = count;
      }
    }
  }
  
  // connected components on strong edges
  const visited = new Set();
  const clusters = [];
  
  function bfs(start) {
    const queue = [start];
    const component = new Set([start]);
    visited.add(start);
    while (queue.length > 0) {
      const node = queue.shift();
      for (const [neighbor] of Object.entries(adj[node] || {})) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          component.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return [...component];
  }
  
  // find components, skip "hub" topics (connected to >30% of active at threshold) to prevent mega-clusters
  const hubThreshold = Math.max(3, Math.floor(active.length * 0.3));
  const hubs = new Set();
  for (const name of active) {
    if (Object.keys(adj[name] || {}).length > hubThreshold) {
      hubs.add(name);
    }
  }
  
  // remove hubs from adjacency for clustering
  const adjNoHubs = {};
  for (const name of active) {
    if (hubs.has(name)) continue;
    adjNoHubs[name] = {};
    for (const [other, count] of Object.entries(adj[name] || {})) {
      if (!hubs.has(other)) {
        adjNoHubs[name][other] = count;
      }
    }
  }
  
  // override adj for bfs
  const origAdj = adj;
  for (const name of active) {
    adj[name] = adjNoHubs[name] || {};
  }
  
  for (const name of active) {
    if (visited.has(name) || hubs.has(name)) continue;
    if (Object.keys(adj[name] || {}).length === 0) continue;
    const component = bfs(name);
    if (component.length >= 2) {
      clusters.push(component);
    }
  }
  
  // sort clusters by size desc
  clusters.sort((a, b) => b.length - a.length);
  
  const unclustered = active.filter(t => !visited.has(t) && !hubs.has(t));
  
  console.log(`${BOLD}TOPIC CLUSTERS${RESET}  ${DIM}strongly co-occurring groups (${threshold}+ shared sections)${RESET}`);
  console.log();
  
  if (hubs.size > 0) {
    console.log(`  ${BOLD}HUB TOPICS${RESET}  ${DIM}(appear everywhere — core to the workspace)${RESET}`);
    for (const h of [...hubs]) {
      const topConns = [...graph[h].cooccurrences.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t, c]) => `${t}(${c})`);
      console.log(`  ${typeColor(ENTITIES[h].type)}${h.padEnd(14)}${RESET} ${DIM}strongest → ${topConns.join(', ')}${RESET}`);
    }
    console.log();
  }
  
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    
    // sort members by their internal connections
    const sorted = c.sort((a, b) => {
      const aConn = c.reduce((s, t) => s + (origAdj[a]?.[t] || 0), 0);
      const bConn = c.reduce((s, t) => s + (origAdj[b]?.[t] || 0), 0);
      return bConn - aConn;
    });
    
    // find the "core" — top 3 most internally connected
    const core = sorted.slice(0, 3).map(t => `${typeColor(ENTITIES[t].type)}${BOLD}${t}${RESET}`).join(', ');
    const rest = sorted.slice(3).map(t => `${typeColor(ENTITIES[t].type)}${t}${RESET}`).join(', ');
    
    console.log(`  ${BOLD}cluster ${i + 1}${RESET}  ${DIM}(${c.length} topics)${RESET}`);
    console.log(`  core: ${core}`);
    if (rest) console.log(`  also: ${rest}`);
    
    // show the strongest internal edges
    const edges = [];
    for (const a of c) {
      for (const b of c) {
        if (a < b && origAdj[a]?.[b]) {
          edges.push({ a, b, w: origAdj[a][b] });
        }
      }
    }
    edges.sort((a, b) => b.w - a.w);
    if (edges.length > 0) {
      const topEdges = edges.slice(0, 3).map(e => `${e.a}↔${e.b}(${e.w})`);
      console.log(`  ${DIM}strongest links: ${topEdges.join('  ')}${RESET}`);
    }
    console.log();
  }
  
  if (unclustered.length > 0) {
    console.log(`  ${DIM}PERIPHERAL${RESET}  ${DIM}(weakly connected — satellites or new topics)${RESET}`);
    for (const t of unclustered) {
      const topConn = [...graph[t].cooccurrences.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([n, c]) => `→ ${n}(${c})`);
      console.log(`  ${DIM}${typeColor(ENTITIES[t].type)}${t.padEnd(14)}${RESET}${DIM} ${topConn.join('  ')}${RESET}`);
    }
    console.log();
  }
}

function driftView(graph) {
  // compare topic activity in last 7 days vs previous 7 days
  const today = new Date().toISOString().slice(0, 10);
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const d14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  
  const drifts = [];
  
  for (const [name, data] of Object.entries(graph)) {
    if (data.dates.size === 0) continue;
    
    const dates = [...data.dates];
    const recent = dates.filter(d => d >= d7).length;
    const prev = dates.filter(d => d >= d14 && d < d7).length;
    
    if (recent === 0 && prev === 0) continue;
    
    const delta = recent - prev;
    drifts.push({ name, recent, prev, delta });
  }
  
  drifts.sort((a, b) => b.delta - a.delta);
  
  console.log(`${BOLD}TOPIC DRIFT${RESET}  ${DIM}last 7d vs previous 7d${RESET}`);
  console.log();
  
  const rising = drifts.filter(d => d.delta > 0);
  const falling = drifts.filter(d => d.delta < 0);
  const stable = drifts.filter(d => d.delta === 0 && d.recent > 0);
  
  if (rising.length > 0) {
    console.log(`  ${GREEN}RISING${RESET}`);
    for (const d of rising) {
      const color = typeColor(ENTITIES[d.name].type);
      console.log(`  ${color}${d.name.padEnd(14)}${RESET} ${d.prev}d → ${d.recent}d  ${GREEN}+${d.delta}${RESET}`);
    }
    console.log();
  }
  
  if (stable.length > 0) {
    console.log(`  ${DIM}STABLE${RESET}`);
    for (const d of stable) {
      const color = typeColor(ENTITIES[d.name].type);
      console.log(`  ${DIM}${color}${d.name.padEnd(14)}${RESET}${DIM} ${d.recent}d → ${d.recent}d   =${RESET}`);
    }
    console.log();
  }
  
  if (falling.length > 0) {
    console.log(`  ${RED}FADING${RESET}`);
    for (const d of falling) {
      const color = typeColor(ENTITIES[d.name].type);
      console.log(`  ${color}${d.name.padEnd(14)}${RESET} ${d.prev}d → ${d.recent}d  ${RED}${d.delta}${RESET}`);
    }
    console.log();
  }
}

function shortView(graph) {
  const topics = Object.entries(graph)
    .filter(([, v]) => v.dates.size > 0)
    .sort((a, b) => b[1].mentions - a[1].mentions);
  
  const threads = topics.filter(([, v]) => v.dates.size >= 3).length;
  const orphans = topics.filter(([, v]) => v.dates.size === 1).length;
  const totalMentions = topics.reduce((s, [, v]) => s + v.mentions, 0);
  
  console.log(`map: ${topics.length} topics, ${threads} threads, ${orphans} orphans, ${totalMentions} total mentions`);
}

function jsonView(graph) {
  const output = {};
  for (const [name, data] of Object.entries(graph)) {
    if (data.dates.size === 0) continue;
    output[name] = {
      type: ENTITIES[name].type,
      mentions: data.mentions,
      days: data.dates.size,
      dates: [...data.dates].sort(),
      cooccurrences: Object.fromEntries(data.cooccurrences),
      sections: data.sections
    };
  }
  console.log(JSON.stringify(output, null, 2));
}

// ── main ─────────────────────────────────────────────────────────────

const logs = loadDailyLogs();
const memMd = loadMemoryMd();
const allDocs = memMd ? [...logs, memMd] : logs;

if (logs.length === 0) {
  console.log('no daily logs found in memory/');
  process.exit(0);
}

const graph = buildGraph(allDocs);

if (jsonMode) {
  jsonView(graph);
} else if (shortMode) {
  shortView(graph);
} else if (topicQuery) {
  topicDeepDive(graph, topicQuery);
} else if (threadsMode) {
  threadsView(graph);
} else if (orphansMode) {
  orphansView(graph);
} else if (connectionsMode) {
  connectionsView(graph);
} else if (timelineMode) {
  timelineView(graph, allDocs);
} else if (clustersMode) {
  clustersView(graph);
} else if (driftMode) {
  driftView(graph);
} else {
  overviewView(graph);
}

#!/usr/bin/env node
/**
 * arc brief — morning intelligence brief
 * 
 * One command, one screen, everything that matters.
 * Designed to be the FIRST thing you run when you wake up.
 * 
 * Sections:
 *   ■ overnight changes (commits, files modified)
 *   ■ service status (all endpoints, one line)
 *   ■ top priorities (ranked, max 3)
 *   ■ contacts needing attention (going cold)
 *   ■ workspace vital signs (bench score, streak, momentum)
 *   ■ fortune (one from past self)
 * 
 * Usage:
 *   arc brief              # full brief
 *   arc brief --short      # 3-line executive summary
 *   arc brief --json       # machine-readable
 * 
 * nightly build 2026-03-02
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function readFile(path) {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

function today() { return new Date().toISOString().split('T')[0]; }

function bar(score, width = 12) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function grade(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

function timeAgo(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'just now';
}

// ═══════════════════════════════════════════════════════════════════════
// DATA COLLECTORS (all run in parallel)
// ═══════════════════════════════════════════════════════════════════════

// ── 1. overnight changes ─────────────────────────────────────────────

function getOvernightChanges() {
  const since = new Date(Date.now() - 8 * 3600000).toISOString(); // last 8 hours
  const repos = findGitRepos();
  let totalCommits = 0;
  let totalInsertions = 0;
  let totalDeletions = 0;
  const repoSummaries = [];

  for (const repo of repos) {
    try {
      const log = execSync(
        `git -C "${repo.path}" log --since="${since}" --oneline --no-merges 2>/dev/null`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      
      if (!log) continue;
      
      const commits = log.split('\n').filter(Boolean);
      totalCommits += commits.length;

      // get diffstat
      try {
        const stat = execSync(
          `git -C "${repo.path}" diff --shortstat "HEAD@{8 hours ago}" HEAD 2>/dev/null`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();
        const ins = stat.match(/(\d+) insertion/);
        const del = stat.match(/(\d+) deletion/);
        if (ins) totalInsertions += parseInt(ins[1]);
        if (del) totalDeletions += parseInt(del[1]);
      } catch {}

      repoSummaries.push({
        name: repo.name,
        commits: commits.length,
        messages: commits.slice(0, 3).map(c => c.replace(/^[a-f0-9]+ /, '')),
      });
    } catch {}
  }

  // also check for new/modified memory files
  const memoryChanges = [];
  try {
    const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const stat = statSync(join(MEMORY_DIR, f));
      if (Date.now() - stat.mtimeMs < 8 * 3600000) {
        memoryChanges.push(f);
      }
    }
  } catch {}

  return { totalCommits, totalInsertions, totalDeletions, repos: repoSummaries, memoryChanges };
}

function findGitRepos() {
  const repos = [];
  const seen = new Set();
  
  function scan(dir, depth) {
    if (depth > 3) return;
    try {
      const gitDir = join(dir, '.git');
      if (existsSync(gitDir)) {
        const name = dir.split('/').pop();
        if (!seen.has(dir)) {
          seen.add(dir);
          repos.push({ name, path: dir });
        }
      }
      if (depth < 3) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
            scan(join(dir, e.name), depth + 1);
          }
        }
      }
    } catch {}
  }

  scan(ROOT, 0);
  // also check projects/
  const projDir = join(ROOT, 'projects');
  if (existsSync(projDir)) {
    try {
      for (const d of readdirSync(projDir, { withFileTypes: true })) {
        if (d.isDirectory()) scan(join(projDir, d.name), 1);
      }
    } catch {}
  }
  return repos;
}

// ── 2. service status ────────────────────────────────────────────────

const SERVICES = [
  { name: 'anivia', url: 'https://anivia.vercel.app', critical: true },
  { name: 'ventok.eu', url: 'https://www.ventok.eu', critical: true },
  { name: 'supabase', url: 'https://onhcynfklqbazcvqskuf.supabase.co/rest/v1/', critical: true },
  { name: 'health-dash', url: 'https://clawdbot-health-dashboard.vercel.app', critical: false },
];

function checkService(svc) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proto = svc.url.startsWith('https') ? https : http;
    const timeout = 5000;

    const req = proto.get(svc.url, { timeout, headers: { 'User-Agent': 'arc-brief/1.0' } }, (res) => {
      const latency = Date.now() - start;
      const up = res.statusCode < 500;
      res.resume(); // drain
      resolve({ ...svc, up, latency, status: res.statusCode });
    });

    req.on('error', () => resolve({ ...svc, up: false, latency: timeout, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ...svc, up: false, latency: timeout, status: 0 }); });
  });
}

async function getServiceStatus() {
  const results = await Promise.all(SERVICES.map(checkService));
  const allUp = results.every(r => r.up);
  const criticalDown = results.filter(r => r.critical && !r.up);
  return { services: results, allUp, criticalDown };
}

// ── 3. top priorities ────────────────────────────────────────────────

function getTopPriorities() {
  const content = readFile(join(ROOT, 'tasks/active.md'));
  if (!content) return [];

  const tasks = [];
  let section = '';
  let sectionPriority = 0;

  for (const line of content.split('\n')) {
    // detect section headers
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      const s = h2[1].toLowerCase();
      if (s.includes('in progress') || s.includes('in-progress')) sectionPriority = 90;
      else if (s.includes('business') || s.includes('priority')) sectionPriority = 85;
      else if (s.includes('next')) sectionPriority = 60;
      else if (s.includes('backlog')) sectionPriority = 40;
      else sectionPriority = 50;
      section = h2[1];
      continue;
    }

    // unchecked tasks
    const task = line.match(/^[-*]\s+\[ \]\s+(.+)/);
    if (task && sectionPriority > 0) {
      const text = task[1].replace(/\*\*/g, '');
      let score = sectionPriority;

      // boost modifiers
      if (/revenue|mrr|client|sales|money/i.test(text)) score += 20;
      if (/launch|ship|deploy|release/i.test(text)) score += 15;
      if (/block|urgent|critical/i.test(text)) score -= 40; // blocked items down

      tasks.push({ text: text.slice(0, 60), score, section });
    }
  }

  // also check git for dirty repos
  const repos = findGitRepos();
  for (const repo of repos) {
    try {
      const status = execSync(`git -C "${repo.path}" status --porcelain 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 }).trim();
      if (status) {
        const lines = status.split('\n').length;
        const unpushed = execSync(`git -C "${repo.path}" log @{u}..HEAD --oneline 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 }).trim();
        if (unpushed) {
          const n = unpushed.split('\n').filter(Boolean).length;
          tasks.push({ text: `push ${n} commit${n > 1 ? 's' : ''} in ${repo.name}`, score: 55, section: 'git' });
        }
      }
    } catch {}
  }

  return tasks.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ── 4. contacts needing attention ────────────────────────────────────

function getColdContacts() {
  // curated contact list (companies/prospects only — the ones that matter for follow-up)
  const CONTACTS = [
    { name: 'TMW', aliases: ['tmw'], type: 'company' },
    { name: 'Nordora Wood', aliases: ['nordorawood', 'nordora', 'termopuit'], type: 'company' },
    { name: 'Luminor', aliases: ['luminor'], type: 'company' },
    { name: 'Veho Tartu', aliases: ['veho'], type: 'company' },
    { name: 'Strantum', aliases: ['strantum'], type: 'company' },
    { name: 'Noar', aliases: ['noar'], type: 'company' },
  ];

  // scan memory files for last mention dates
  const files = [];
  try {
    const memFiles = readdirSync(MEMORY_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse();
    for (const f of memFiles) {
      const dateStr = f.replace('.md', '');
      const content = readFile(join(MEMORY_DIR, f)).toLowerCase();
      files.push({ date: dateStr, content });
    }
  } catch {}

  const cold = [];
  const now = Date.now();
  const COLD_THRESHOLD = 7 * 86400000; // 7 days

  for (const contact of CONTACTS) {
    let lastSeen = null;
    const searchTerms = [contact.name.toLowerCase(), ...contact.aliases.map(a => a.toLowerCase())];

    for (const file of files) {
      const found = searchTerms.some(term => file.content.includes(term));
      if (found) {
        lastSeen = file.date;
        break; // files are sorted newest first
      }
    }

    if (lastSeen) {
      const gap = now - new Date(lastSeen + 'T00:00:00Z').getTime();
      if (gap > COLD_THRESHOLD) {
        const daysAgo = Math.floor(gap / 86400000);
        cold.push({ name: contact.name, lastSeen, daysAgo });
      }
    }
  }

  return cold.sort((a, b) => a.daysAgo - b.daysAgo);
}

// ── 5. workspace vitals ──────────────────────────────────────────────

function getVitals() {
  const vitals = {};

  // streak (count consecutive days with memory files ending today)
  try {
    const files = readdirSync(MEMORY_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse();
    
    let streak = 0;
    const todayStr = today();
    let checkDate = new Date(todayStr + 'T00:00:00Z');
    
    for (const f of files) {
      const fileDate = f.replace('.md', '');
      const expected = checkDate.toISOString().split('T')[0];
      if (fileDate === expected) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (fileDate < expected) {
        break;
      }
    }
    vitals.streak = streak;
    vitals.totalLogs = files.length;
  } catch {
    vitals.streak = 0;
    vitals.totalLogs = 0;
  }

  // bench score (from snapshots)
  try {
    const snapshots = JSON.parse(readFile(join(MEMORY_DIR, 'bench-snapshots.json')));
    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      vitals.benchScore = latest.composite;
      vitals.benchGrade = grade(latest.composite);
      if (snapshots.length > 1) {
        const prev = snapshots[snapshots.length - 2];
        vitals.benchDelta = latest.composite - prev.composite;
      }
    }
  } catch {}

  // orbit momentum (from last calculation)
  try {
    const orbitData = JSON.parse(readFile(join(MEMORY_DIR, 'orbit-snapshots.json')));
    if (orbitData.length > 0) {
      const latest = orbitData[orbitData.length - 1];
      vitals.momentum = latest.momentum;
    }
  } catch {}

  // disk usage
  try {
    const df = execSync('df -h /data02 2>/dev/null | tail -1', { encoding: 'utf-8', timeout: 3000 });
    const parts = df.trim().split(/\s+/);
    if (parts.length >= 5) {
      vitals.diskUsage = parts[4]; // e.g., "15%"
    }
  } catch {}

  return vitals;
}

// ── 6. fortune ───────────────────────────────────────────────────────

function getFortune() {
  try {
    const cache = JSON.parse(readFile(join(MEMORY_DIR, 'fortunes.json')));
    if (cache.length > 0) {
      const f = cache[Math.floor(Math.random() * cache.length)];
      return { text: f.text, category: f.category, source: f.source || '' };
    }
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

function renderBrief(data) {
  const { changes, services, priorities, cold, vitals, fortune } = data;
  const lines = [];
  
  const now = new Date();
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  const dateStr = today();

  lines.push(`┌─────────────────────────────────────────────┐`);
  lines.push(`│  DAILY BRIEF — ${dow} ${dateStr}            │`);
  lines.push(`└─────────────────────────────────────────────┘`);
  lines.push('');

  // ── overnight changes ──
  lines.push('■ OVERNIGHT');
  if (changes.totalCommits === 0 && changes.memoryChanges.length === 0) {
    lines.push('  quiet night — no changes');
  } else {
    if (changes.totalCommits > 0) {
      const diffStr = changes.totalInsertions || changes.totalDeletions
        ? ` (+${changes.totalInsertions}/-${changes.totalDeletions})`
        : '';
      lines.push(`  ${changes.totalCommits} commit${changes.totalCommits !== 1 ? 's' : ''} across ${changes.repos.length} repo${changes.repos.length !== 1 ? 's' : ''}${diffStr}`);
      for (const repo of changes.repos) {
        lines.push(`  ├ ${repo.name} (${repo.commits})`);
        for (const msg of repo.messages) {
          lines.push(`  │   ${msg.slice(0, 50)}`);
        }
      }
    }
    if (changes.memoryChanges.length > 0) {
      lines.push(`  ${changes.memoryChanges.length} memory file${changes.memoryChanges.length !== 1 ? 's' : ''} updated`);
    }
  }
  lines.push('');

  // ── services ──
  lines.push('■ SERVICES');
  if (services.allUp) {
    const avgMs = Math.round(services.services.reduce((s, r) => s + r.latency, 0) / services.services.length);
    lines.push(`  all ${services.services.length} up — avg ${avgMs}ms`);
  } else {
    for (const svc of services.services) {
      const icon = svc.up ? '●' : '✕';
      lines.push(`  ${icon} ${svc.name} ${svc.up ? `${svc.latency}ms` : 'DOWN'}`);
    }
    if (services.criticalDown.length > 0) {
      lines.push(`  ⚠ CRITICAL: ${services.criticalDown.map(s => s.name).join(', ')} DOWN`);
    }
  }
  lines.push('');

  // ── priorities ──
  lines.push('■ TODAY');
  if (priorities.length === 0) {
    lines.push('  no active tasks — check tasks/active.md');
  } else {
    for (let i = 0; i < priorities.length; i++) {
      const p = priorities[i];
      const marker = i === 0 ? '→' : ' ';
      lines.push(`  ${marker} ${p.text} [${p.score}]`);
    }
  }
  lines.push('');

  // ── contacts ──
  if (cold.length > 0) {
    lines.push('■ FOLLOW UP');
    for (const c of cold.slice(0, 3)) {
      lines.push(`  ${c.name} — ${c.daysAgo}d silent (last: ${c.lastSeen})`);
    }
    lines.push('');
  }

  // ── vitals ──
  lines.push('■ VITALS');
  const vParts = [];
  if (vitals.benchScore != null) {
    const delta = vitals.benchDelta != null ? ` ${vitals.benchDelta >= 0 ? '+' : ''}${vitals.benchDelta}` : '';
    vParts.push(`bench: ${vitals.benchScore}/100 ${vitals.benchGrade}${delta}`);
  }
  if (vitals.streak != null) vParts.push(`streak: ${vitals.streak}d`);
  if (vitals.momentum != null) {
    const arrow = vitals.momentum > 10 ? '↑' : vitals.momentum < -10 ? '↓' : '→';
    vParts.push(`momentum: ${vitals.momentum > 0 ? '+' : ''}${vitals.momentum} ${arrow}`);
  }
  if (vitals.diskUsage) vParts.push(`disk: ${vitals.diskUsage}`);
  if (vParts.length > 0) {
    lines.push(`  ${vParts.join(' · ')}`);
  }
  if (vitals.totalLogs) {
    lines.push(`  ${vitals.totalLogs} daily logs`);
  }
  lines.push('');

  // ── fortune ──
  if (fortune) {
    lines.push('■ FORTUNE');
    lines.push(`  "${fortune.text}"`);
    if (fortune.source) lines.push(`  — ${fortune.source}`);
    lines.push('');
  }

  // ── closer ──
  const closers = [
    'make it count.',
    'ship something.',
    'one thing at a time.',
    'focus beats volume.',
    'less, but better.',
    'start with the hard thing.',
    'the work is the shortcut.',
    'momentum compounds.',
    'build the thing that builds the thing.',
    'today is all you have.',
  ];
  lines.push(closers[Math.floor(Math.random() * closers.length)]);

  return lines.join('\n');
}

function renderShort(data) {
  const { changes, services, priorities, cold, vitals } = data;
  
  const parts = [];
  
  // changes
  if (changes.totalCommits > 0) {
    parts.push(`${changes.totalCommits} commits overnight`);
  } else {
    parts.push('quiet night');
  }

  // services
  if (services.allUp) {
    parts.push(`${services.services.length}/${services.services.length} up`);
  } else {
    const down = services.services.filter(s => !s.up).length;
    parts.push(`${down} service${down !== 1 ? 's' : ''} DOWN`);
  }

  // vitals
  if (vitals.benchScore != null) {
    parts.push(`bench ${vitals.benchScore} ${vitals.benchGrade}`);
  }

  console.log(`brief: ${parts.join(' · ')}`);
  
  if (priorities.length > 0) {
    console.log(`  → ${priorities[0].text}`);
  }
  
  if (cold.length > 0) {
    console.log(`  ⚠ ${cold.length} contact${cold.length !== 1 ? 's' : ''} going cold`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  // run everything in parallel
  const [services, changes, priorities, cold, vitals, fortune] = await Promise.all([
    getServiceStatus(),
    Promise.resolve(getOvernightChanges()),
    Promise.resolve(getTopPriorities()),
    Promise.resolve(getColdContacts()),
    Promise.resolve(getVitals()),
    Promise.resolve(getFortune()),
  ]);

  const data = { changes, services, priorities, cold, vitals, fortune };

  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (shortMode) {
    renderShort(data);
    return;
  }

  console.log(renderBrief(data));
}

main().catch(err => {
  console.error('brief error:', err.message);
  process.exit(1);
});

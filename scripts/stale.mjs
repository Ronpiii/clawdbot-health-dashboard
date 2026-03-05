#!/usr/bin/env node
/**
 * arc stale — unified staleness detector
 * 
 * scans tasks, git branches, projects, contacts, ideas, and dropped threads.
 * surfaces everything you're probably forgetting about — ranked by age.
 * 
 * usage:
 *   arc stale                  # full report — everything going cold
 *   arc stale --tasks          # stale tasks only
 *   arc stale --projects       # idle projects only
 *   arc stale --branches       # dead git branches only
 *   arc stale --contacts       # cold contacts only
 *   arc stale --ideas          # aging ideas only
 *   arc stale --threads        # dropped conversation threads only
 *   arc stale --top N          # top N stalest items (default 20)
 *   arc stale --days N         # override staleness threshold (default 7)
 *   arc stale --short          # one-liner summary
 *   arc stale --json           # machine-readable
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';

const ROOT = join(import.meta.dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');
const TASKS_DIR = join(ROOT, 'tasks');
const PROJECTS_DIR = join(ROOT, 'projects');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));
const jsonMode = flags.has('--json');
const shortMode = flags.has('--short');
const topN = (() => {
  const i = args.indexOf('--top');
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1]) : 20;
})();
const thresholdDays = (() => {
  const i = args.indexOf('--days');
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1]) : 7;
})();
const filterCategory = (() => {
  const cats = ['tasks', 'projects', 'branches', 'contacts', 'ideas', 'threads'];
  for (const c of cats) if (flags.has(`--${c}`)) return c;
  return null;
})();

// ── helpers ──────────────────────────────────────────────────────────

function readFile(p) {
  try { return readFileSync(p, 'utf-8'); } catch { return ''; }
}

function daysSince(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ageLabel(days) {
  if (days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days < 14) return '1 week';
  if (days < 30) return `${Math.floor(days / 7)} weeks`;
  if (days < 60) return '1 month';
  if (days < 365) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)}y`;
}

function severity(days) {
  if (days >= 30) return 'critical';
  if (days >= 14) return 'high';
  if (days >= 7) return 'medium';
  return 'low';
}

function severityIcon(sev) {
  return { critical: '!!!', high: '!! ', medium: '!  ', low: '   ' }[sev] || '   ';
}

function bar(width, max, char = '█') {
  const w = Math.max(0, Math.min(20, Math.round((width / Math.max(max, 1)) * 20)));
  return char.repeat(w) + '░'.repeat(20 - w);
}

// ── scan: tasks ─────────────────────────────────────────────────────

function scanTasks() {
  const items = [];
  const taskFile = join(TASKS_DIR, 'active.md');
  const content = readFile(taskFile);
  if (!content) return items;

  // find open tasks with their section context
  let currentSection = '';
  for (const line of content.split('\n')) {
    const sectionMatch = line.match(/^##\s+(.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    const taskMatch = line.match(/^-\s+\[\s\]\s+(.+)/);
    if (taskMatch) {
      const text = taskMatch[1].trim();
      // estimate age from daily logs — when was this task last mentioned?
      const lastMention = findLastMention(text.split(/\s*[—–-]\s*/)[0].trim().toLowerCase());
      const age = lastMention ? daysSince(lastMention) : 30; // assume 30 if never mentioned
      
      if (age >= thresholdDays) {
        items.push({
          category: 'tasks',
          name: text.length > 60 ? text.slice(0, 57) + '...' : text,
          age,
          severity: severity(age),
          section: currentSection,
          source: 'tasks/active.md',
          action: currentSection.toLowerCase().includes('block') ? 'unblock or remove' : 'do it or deprioritize',
        });
      }
    }
  }
  return items;
}

// ── scan: projects ──────────────────────────────────────────────────

function scanProjects() {
  const items = [];
  const projectDirs = [];
  
  // find git repos
  const searchDirs = [ROOT, PROJECTS_DIR];
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        try {
          if (statSync(full).isDirectory() && existsSync(join(full, '.git'))) {
            projectDirs.push({ name: entry, path: full });
          }
        } catch {}
      }
    } catch {}
  }

  for (const proj of projectDirs) {
    try {
      const lastCommitDate = execSync(
        `git -C "${proj.path}" log -1 --format="%ai" 2>/dev/null`
      ).toString().trim().slice(0, 10);
      
      const age = daysSince(lastCommitDate);
      if (age >= thresholdDays) {
        const branch = execSync(
          `git -C "${proj.path}" branch --show-current 2>/dev/null`
        ).toString().trim();
        
        items.push({
          category: 'projects',
          name: proj.name,
          age,
          severity: severity(age),
          detail: `branch: ${branch}, last commit: ${lastCommitDate}`,
          source: proj.path,
          action: age >= 30 ? 'archive or revive' : 'check if still needed',
        });
      }
    } catch {}
  }
  return items;
}

// ── scan: git branches ──────────────────────────────────────────────

function scanBranches() {
  const items = [];
  const searchDirs = [ROOT, PROJECTS_DIR];
  
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        try {
          if (!statSync(full).isDirectory() || !existsSync(join(full, '.git'))) continue;
        } catch { continue; }

        try {
          const branches = execSync(
            `git -C "${full}" for-each-ref --sort=-committerdate refs/heads/ --format="%(refname:short)|%(committerdate:iso)" 2>/dev/null`
          ).toString().trim().split('\n').filter(Boolean);

          const currentBranch = execSync(
            `git -C "${full}" branch --show-current 2>/dev/null`
          ).toString().trim();

          // check for merged branches
          let merged = [];
          try {
            merged = execSync(
              `git -C "${full}" branch --merged ${currentBranch} 2>/dev/null`
            ).toString().trim().split('\n')
              .map(b => b.trim().replace(/^\*\s*/, ''))
              .filter(b => b && b !== currentBranch && b !== 'main' && b !== 'master');
          } catch {}

          for (const line of branches) {
            const [branch, date] = line.split('|');
            if (!branch || branch === currentBranch) continue;
            if (branch === 'main' || branch === 'master') continue;

            const age = daysSince(date?.slice(0, 10));
            const isMerged = merged.includes(branch);

            if (isMerged || age >= thresholdDays) {
              items.push({
                category: 'branches',
                name: `${entry}/${branch}`,
                age: isMerged ? age : age,
                severity: isMerged ? 'high' : severity(age),
                detail: isMerged ? 'merged — safe to delete' : `inactive ${ageLabel(age)}`,
                source: full,
                action: isMerged ? 'delete branch' : 'merge, rebase, or delete',
              });
            }
          }
        } catch {}
      }
    } catch {}
  }
  return items;
}

// ── scan: contacts ──────────────────────────────────────────────────

function scanContacts() {
  const items = [];
  
  // curated contact registry (companies + key people)
  const CONTACTS = [
    { name: 'TMW', type: 'company', aliases: ['tmw', 'termovesi'] },
    { name: 'Nordora Wood', type: 'company', aliases: ['nordora'] },
    { name: 'Luminor', type: 'company', aliases: ['luminor'] },
    { name: 'Veho Tartu', type: 'company', aliases: ['veho'] },
    { name: 'Noar', type: 'company', aliases: ['noar'] },
    { name: 'Strantum', type: 'company', aliases: ['strantum'] },
    { name: 'Anna', type: 'person', aliases: ['anna'] },
  ];

  // scan daily logs for last mention
  const logFiles = getLogFiles();
  
  for (const contact of CONTACTS) {
    let lastSeen = null;
    const patterns = [contact.name.toLowerCase(), ...contact.aliases.map(a => a.toLowerCase())];
    
    for (const { date, content } of logFiles) {
      const lower = content.toLowerCase();
      if (patterns.some(p => lower.includes(p))) {
        if (!lastSeen || date > lastSeen) lastSeen = date;
      }
    }

    if (lastSeen) {
      const age = daysSince(lastSeen);
      if (age >= thresholdDays) {
        items.push({
          category: 'contacts',
          name: `${contact.name} (${contact.type})`,
          age,
          severity: severity(age),
          detail: `last mentioned: ${lastSeen}`,
          source: 'memory/*.md',
          action: contact.type === 'company' ? 'follow up or close' : 'check in',
        });
      }
    }
  }
  return items;
}

// ── scan: ideas ─────────────────────────────────────────────────────

function scanIdeas() {
  const items = [];
  const ideasFile = join(TASKS_DIR, 'ideas.md');
  const content = readFile(ideasFile);
  if (!content) return items;

  // ideas don't have dates, estimate from file mtime and git blame
  let fileMtime;
  try {
    fileMtime = statSync(ideasFile).mtime.toISOString().slice(0, 10);
  } catch {
    fileMtime = today();
  }

  // try git blame for line-level dates
  let blameLines = [];
  try {
    const blame = execSync(
      `git -C "${ROOT}" blame --date=short "${ideasFile}" 2>/dev/null`
    ).toString().trim().split('\n');
    blameLines = blame.map(line => {
      const match = line.match(/(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : fileMtime;
    });
  } catch {
    // no git blame, use mtime for all
  }

  let lineIdx = 0;
  for (const line of content.split('\n')) {
    const ideaMatch = line.match(/^-\s+(.+)/);
    if (ideaMatch && !line.match(/^-\s+\[x\]/i)) {
      const text = ideaMatch[1].trim();
      if (text.length < 5) { lineIdx++; continue; }
      
      const lineDate = blameLines[lineIdx] || fileMtime;
      const age = daysSince(lineDate);

      if (age >= thresholdDays) {
        items.push({
          category: 'ideas',
          name: text.length > 60 ? text.slice(0, 57) + '...' : text,
          age,
          severity: age >= 30 ? 'high' : severity(age),
          detail: `added: ${lineDate}`,
          source: 'tasks/ideas.md',
          action: 'build it, task it, or kill it',
        });
      }
    }
    lineIdx++;
  }
  return items;
}

// ── scan: dropped threads ───────────────────────────────────────────
// strategy: instead of trying to parse section headers (too noisy),
// look for EXPLICIT open items: unchecked TODOs in daily logs, and
// lines with WIP/TODO/TBD/need-to markers. these are clear signals
// that something was started but not finished.

function scanThreads() {
  const items = [];
  const logFiles = getLogFiles();
  if (logFiles.length < 3) return items;

  const seen = new Set(); // dedup by normalized key
  
  for (const { date, content } of logFiles) {
    for (const line of content.split('\n')) {
      // 1. unchecked task items in daily logs (most reliable signal)
      const todoMatch = line.match(/^-\s+\[\s\]\s+(.+)/);
      if (todoMatch) {
        const text = todoMatch[1].trim();
        const key = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40);
        if (key.length < 5 || seen.has(key)) continue;
        seen.add(key);
        
        const age = daysSince(date);
        if (age < thresholdDays || age > 60) continue;
        
        items.push({
          category: 'threads',
          name: text.length > 60 ? text.slice(0, 57) + '...' : text,
          age,
          severity: age >= 21 ? 'high' : severity(age),
          detail: `unchecked todo from ${date}`,
          source: `memory/${date}.md`,
          action: 'finish it, delegate it, or cross it off',
        });
        continue;
      }
      
      // 2. explicit WIP/TODO/TBD markers in prose (not headers, not checked items)
      if (line.startsWith('#') || line.match(/^\s*-\s+\[x\]/i)) continue;
      // skip lines that describe completed work containing these words
      const lower = line.toLowerCase();
      if (lower.includes('built') || lower.includes('created') || lower.includes('shipped')) continue;
      if (lower.includes('found') || lower.includes('aggregator') || lower.includes('scanner')) continue;
      // only match TODO/WIP/etc at word boundaries, not as part of descriptions
      const wipMatch = line.match(/\b(TODO|WIP|TBD|FIXME)[:)\s]/);
      if (wipMatch) {
        // extract surrounding context
        const text = line.replace(/^[\s*-]+/, '').trim();
        if (text.length < 10 || text.length > 120) continue;
        // skip if this looks like a description of a tool/feature, not an open item
        if (/\b(tool|command|script|feature|mode|scanner|checker|tracker)\b/i.test(text)) continue;
        const key = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        
        const age = daysSince(date);
        if (age < thresholdDays || age > 60) continue;
        
        items.push({
          category: 'threads',
          name: text.length > 60 ? text.slice(0, 57) + '...' : text,
          age,
          severity: age >= 21 ? 'high' : severity(age),
          detail: `${wipMatch[1].toUpperCase()} marker from ${date}`,
          source: `memory/${date}.md`,
          action: 'resolve the marker or remove it',
        });
      }
    }
  }
  return items;
}

// ── shared: log file reader ─────────────────────────────────────────

let _logCache = null;
function getLogFiles() {
  if (_logCache) return _logCache;
  const files = [];
  if (!existsSync(MEMORY_DIR)) return files;
  
  for (const f of readdirSync(MEMORY_DIR)) {
    const match = f.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (match) {
      const content = readFile(join(MEMORY_DIR, f));
      files.push({ date: match[1], content, file: f });
    }
  }
  files.sort((a, b) => b.date.localeCompare(a.date));
  _logCache = files;
  return files;
}

// ── shared: find last mention of a phrase in logs ───────────────────

function findLastMention(phrase) {
  const logs = getLogFiles();
  const lower = phrase.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 3);
  
  for (const { date, content } of logs) {
    const cl = content.toLowerCase();
    // check if most key words appear
    const matches = words.filter(w => cl.includes(w));
    if (matches.length >= Math.ceil(words.length * 0.6)) return date;
  }
  return null;
}

// ── main ────────────────────────────────────────────────────────────

function main() {
  const scanners = {
    tasks: scanTasks,
    projects: scanProjects,
    branches: scanBranches,
    contacts: scanContacts,
    ideas: scanIdeas,
    threads: scanThreads,
  };

  let allItems = [];
  
  if (filterCategory) {
    const scanner = scanners[filterCategory];
    if (scanner) allItems = scanner();
    else {
      console.error(`unknown category: ${filterCategory}`);
      process.exit(1);
    }
  } else {
    for (const [, scanner] of Object.entries(scanners)) {
      allItems.push(...scanner());
    }
  }

  // sort by age (stalest first), then severity
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allItems.sort((a, b) => {
    if (sevOrder[a.severity] !== sevOrder[b.severity]) {
      return sevOrder[a.severity] - sevOrder[b.severity];
    }
    return b.age - a.age;
  });

  // apply topN
  const displayed = allItems.slice(0, topN);

  // ── output ──

  if (jsonMode) {
    console.log(JSON.stringify({ total: allItems.length, threshold: thresholdDays, items: allItems }, null, 2));
    return;
  }

  if (shortMode) {
    const byCat = {};
    for (const item of allItems) {
      byCat[item.category] = (byCat[item.category] || 0) + 1;
    }
    const parts = Object.entries(byCat).map(([k, v]) => `${v} ${k}`).join(', ');
    const oldest = allItems[0];
    console.log(`stale: ${allItems.length} items going cold — ${parts}${oldest ? ` · oldest: ${oldest.name} (${ageLabel(oldest.age)})` : ''}`);
    return;
  }

  // full report
  const maxAge = Math.max(...allItems.map(i => i.age), 1);

  console.log();
  console.log('  ┌─────────────────────────────────────────────────┐');
  console.log('  │          STALE — things going cold               │');
  console.log('  └─────────────────────────────────────────────────┘');
  console.log();
  console.log(`  threshold: ${thresholdDays}+ days · found: ${allItems.length} items · showing: ${displayed.length}`);
  console.log();

  // category summary
  const categories = {};
  for (const item of allItems) {
    if (!categories[item.category]) categories[item.category] = { count: 0, critical: 0, high: 0 };
    categories[item.category].count++;
    if (item.severity === 'critical') categories[item.category].critical++;
    if (item.severity === 'high') categories[item.category].high++;
  }

  const catIcons = {
    tasks: '☐', projects: '◈', branches: '⑂', contacts: '◉', ideas: '✦', threads: '↩',
  };
  const catNames = {
    tasks: 'stale tasks', projects: 'idle projects', branches: 'dead branches',
    contacts: 'cold contacts', ideas: 'aging ideas', threads: 'dropped threads',
  };

  console.log('  breakdown');
  for (const [cat, data] of Object.entries(categories).sort((a, b) => b[1].count - a[1].count)) {
    const icon = catIcons[cat] || '·';
    const name = catNames[cat] || cat;
    const alerts = [];
    if (data.critical) alerts.push(`${data.critical} critical`);
    if (data.high) alerts.push(`${data.high} high`);
    const alertStr = alerts.length ? ` (${alerts.join(', ')})` : '';
    console.log(`    ${icon} ${String(data.count).padStart(3)}  ${name}${alertStr}`);
  }
  console.log();

  // ranked list
  console.log('  ── ranked by severity + age ──────────────────────');
  console.log();

  let prevCategory = null;
  let idx = 0;
  for (const item of displayed) {
    idx++;
    const sev = severityIcon(item.severity);
    const ageStr = ageLabel(item.age).padEnd(9);
    const catIcon = catIcons[item.category] || '·';
    
    // age bar (proportional)
    const ageBar = bar(item.age, maxAge, '▓');
    
    console.log(`  ${sev} ${catIcon} ${ageStr}  ${item.name}`);
    console.log(`          ${ageBar}  ${item.detail || ''}`);
    console.log(`          → ${item.action}`);
    console.log();
  }

  if (allItems.length > displayed.length) {
    console.log(`  ... and ${allItems.length - displayed.length} more (use --top ${allItems.length} to see all)`);
    console.log();
  }

  // recommendations
  console.log('  ── triage suggestions ────────────────────────────');
  console.log();

  const criticals = allItems.filter(i => i.severity === 'critical');
  const highs = allItems.filter(i => i.severity === 'high');

  if (criticals.length > 0) {
    console.log(`  ${criticals.length} critical item${criticals.length > 1 ? 's' : ''} (30+ days stale):`);
    for (const c of criticals.slice(0, 5)) {
      console.log(`    · ${c.name} — ${c.action}`);
    }
    console.log();
  }

  if (highs.length > 0) {
    console.log(`  ${highs.length} high-severity item${highs.length > 1 ? 's' : ''} (14+ days):`);
    for (const h of highs.slice(0, 5)) {
      console.log(`    · ${h.name} — ${h.action}`);
    }
    console.log();
  }

  // entropy score: 0 = everything fresh, 100 = everything rotting
  const totalWeighted = allItems.reduce((sum, i) => {
    const w = { critical: 4, high: 3, medium: 2, low: 1 }[i.severity] || 1;
    return sum + w;
  }, 0);
  const maxPossible = allItems.length * 4;
  const entropyScore = allItems.length === 0 ? 0 : Math.round((totalWeighted / maxPossible) * 100);
  
  const entropyLabel = entropyScore >= 70 ? 'high entropy — things are rotting'
    : entropyScore >= 40 ? 'moderate — some things need attention'
    : entropyScore >= 20 ? 'manageable — a few loose ends'
    : 'low — workspace is tight';

  console.log(`  entropy: ${entropyScore}/100 — ${entropyLabel}`);
  console.log();

  // closer
  const closers = [
    'stale items are silent failures. kill them or finish them.',
    'every open loop costs cognitive overhead. close the loops.',
    'if it hasn\'t moved in 30 days, it\'s not a task — it\'s a wish.',
    'the best cleanup is deletion. second best is finishing.',
    'entropy always wins unless you fight it deliberately.',
    'cold contacts don\'t warm themselves. reach out or write them off.',
    'dropped threads are dropped decisions. decide, then move on.',
  ];
  console.log(`  ${closers[Math.floor(Math.random() * closers.length)]}`);
  console.log();
}

main();

#!/usr/bin/env node
/**
 * arc wins — surface recent accomplishments from daily logs
 * 
 * scans memory files for completed items, shipped features, and wins
 * useful for standups, morale, and remembering you're making progress
 * 
 * usage:
 *   arc wins              # last 7 days
 *   arc wins 14           # last 14 days
 *   arc wins --week       # group by week
 *   arc wins --project    # group by project
 *   arc wins --json       # machine-readable
 *   arc wins --verbose    # show all extracted wins (not deduplicated)
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = join(process.cwd(), 'memory');

// known projects for categorization
const KNOWN_PROJECTS = ['anivia', 'collabo', 'clawd', 'ventok', 'moltbook', 'discord', 'arc'];

function getDateRange(days) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function detectProject(text) {
  const lower = text.toLowerCase();
  for (const proj of KNOWN_PROJECTS) {
    if (lower.includes(proj)) return proj;
  }
  return null;
}

function categorizeWin(text) {
  if (/fix|bug|error|issue|SEC-|ERR-/i.test(text)) return 'fix';
  if (/add|create|build|implement|new|feature/i.test(text)) return 'feature';
  if (/deploy|ship|launch|release|push|publish|commit/i.test(text)) return 'ship';
  if (/test|spec|coverage/i.test(text)) return 'test';
  if (/doc|readme|comment|SKILL\.md/i.test(text)) return 'docs';
  if (/refactor|clean|improve|optimize|PERF-/i.test(text)) return 'improve';
  return 'misc';
}

function extractWins(content, filename) {
  const wins = [];
  const lines = content.split('\n');
  
  let currentSection = null;
  let currentProject = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // track current section from ## headers
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      currentSection = h2[1].toLowerCase();
      currentProject = detectProject(currentSection);
      continue;
    }
    
    // ### header with em dash — these are features/completions
    // e.g., "### arc git — multi-repo git dashboard"
    const h3EmDash = line.match(/^###\s+(.+?)\s*[—–-]\s*(.+)$/);
    if (h3EmDash) {
      const [, name, desc] = h3EmDash;
      // skip headers that are just timestamps or meta
      if (/^\d|UTC|completed|progress/i.test(name)) continue;
      
      wins.push({
        text: `${name} — ${desc}`,
        project: detectProject(name + ' ' + desc) || currentProject,
        type: categorizeWin(name + ' ' + desc),
        date: filename.replace('.md', ''),
        source: filename,
        importance: 'high'
      });
      continue;
    }
    
    // **bold item** — description (feature bullets)
    // e.g., "- **kanban board view** — full drag-and-drop"
    const boldEmDash = line.match(/^[-*]\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
    if (boldEmDash) {
      const [, name, desc] = boldEmDash;
      wins.push({
        text: `${name} — ${desc}`,
        project: detectProject(name + ' ' + desc) || currentProject,
        type: categorizeWin(name + ' ' + desc),
        date: filename.replace('.md', ''),
        source: filename,
        importance: 'medium'
      });
      continue;
    }
    
    // Task codes like ERR-1:, PERF-1:, SEC-3:
    const taskCode = line.match(/^[-*]\s+((?:ERR|PERF|SEC|LINT|AI|GUEST|EMAIL|ONBOARD)-\d+):\s*(.+)$/);
    if (taskCode) {
      const [, code, desc] = taskCode;
      wins.push({
        text: `${code}: ${desc}`,
        project: currentProject,
        type: categorizeWin(code),
        date: filename.replace('.md', ''),
        source: filename,
        importance: 'medium'
      });
      continue;
    }
    
    // "created" / "built" / "shipped" statements
    // e.g., "TASKS.md created — 90 items across 4 phases"
    const createdItem = line.match(/^###?\s*(.+?)\s+(?:created|built|shipped|deployed|completed)\s*[—–-]?\s*(.*)$/i);
    if (createdItem) {
      const [, name, desc] = createdItem;
      if (name.length > 3) {
        wins.push({
          text: desc ? `${name} — ${desc}` : name,
          project: detectProject(name + ' ' + desc) || currentProject,
          type: 'ship',
          date: filename.replace('.md', ''),
          source: filename,
          importance: 'medium'
        });
      }
      continue;
    }
    
    // Checked items [x]
    const checked = line.match(/^[-*]\s*\[x\]\s*(.+)$/i);
    if (checked) {
      const text = checked[1].trim();
      if (text.length > 10) {
        wins.push({
          text,
          project: detectProject(text) || currentProject,
          type: categorizeWin(text),
          date: filename.replace('.md', ''),
          source: filename,
          importance: 'low'
        });
      }
      continue;
    }
  }
  
  return wins;
}

function deduplicate(wins) {
  const seen = new Map();
  const result = [];
  
  for (const win of wins) {
    // normalize for comparison
    const key = win.text.toLowerCase()
      .replace(/[—–-]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 60);
    
    // keep higher importance wins
    const existing = seen.get(key);
    if (!existing || priorityOf(win.importance) > priorityOf(existing.importance)) {
      seen.set(key, win);
    }
  }
  
  return [...seen.values()];
}

function priorityOf(importance) {
  return { high: 3, medium: 2, low: 1 }[importance] || 0;
}

function groupByWeek(wins) {
  const weeks = {};
  
  for (const win of wins) {
    const d = new Date(win.date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeks[weekKey]) weeks[weekKey] = [];
    weeks[weekKey].push(win);
  }
  
  return weeks;
}

function groupByProject(wins) {
  const projects = {};
  
  for (const win of wins) {
    const proj = win.project || 'general';
    if (!projects[proj]) projects[proj] = [];
    projects[proj].push(win);
  }
  
  return projects;
}

function formatWin(win, showDate = false) {
  const typeIcons = {
    feature: '✨',
    fix: '🔧',
    ship: '🚀',
    test: '🧪',
    docs: '📝',
    improve: '⚡',
    misc: '•'
  };
  
  const icon = typeIcons[win.type] || '•';
  const date = showDate ? `\x1b[2m${win.date}\x1b[0m ` : '';
  const project = win.project ? `\x1b[36m[${win.project}]\x1b[0m ` : '';
  
  // truncate long wins
  let text = win.text;
  if (text.length > 80) {
    text = text.slice(0, 77) + '...';
  }
  
  return `  ${icon} ${date}${project}${text}`;
}

function printStats(wins) {
  const byType = {};
  const byProject = {};
  
  for (const win of wins) {
    byType[win.type] = (byType[win.type] || 0) + 1;
    const proj = win.project || 'general';
    byProject[proj] = (byProject[proj] || 0) + 1;
  }
  
  console.log('\n\x1b[1m📊 Stats\x1b[0m');
  console.log(`   Total wins: \x1b[32m${wins.length}\x1b[0m`);
  
  if (Object.keys(byProject).length > 1) {
    const projectStr = Object.entries(byProject)
      .sort((a, b) => b[1] - a[1])
      .map(([p, c]) => `${p}: ${c}`)
      .join(', ');
    console.log(`   By project: ${projectStr}`);
  }
  
  const typeStr = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t}: ${c}`)
    .join(', ');
  console.log(`   By type: ${typeStr}`);
}

// main
const args = process.argv.slice(2);
const days = parseInt(args.find(a => /^\d+$/.test(a))) || 7;
const byWeek = args.includes('--week');
const byProject = args.includes('--project');
const jsonMode = args.includes('--json');
const verbose = args.includes('--verbose');

if (!existsSync(MEMORY_DIR)) {
  console.error('memory/ directory not found');
  process.exit(1);
}

// collect wins from date range
const dates = getDateRange(days);
let allWins = [];

for (const date of dates) {
  const filepath = join(MEMORY_DIR, `${date}.md`);
  if (existsSync(filepath)) {
    const content = readFileSync(filepath, 'utf8');
    const wins = extractWins(content, `${date}.md`);
    allWins.push(...wins);
  }
}

// deduplicate unless verbose
if (!verbose) {
  allWins = deduplicate(allWins);
}

// sort by importance then date
allWins.sort((a, b) => {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  return priorityOf(b.importance) - priorityOf(a.importance);
});

if (jsonMode) {
  console.log(JSON.stringify(allWins, null, 2));
  process.exit(0);
}

if (allWins.length === 0) {
  console.log(`\x1b[2mNo wins found in the last ${days} days. Time to ship something!\x1b[0m`);
  process.exit(0);
}

console.log(`\n\x1b[1m🏆 Wins (last ${days} days)\x1b[0m\n`);

if (byWeek) {
  const weeks = groupByWeek(allWins);
  for (const [weekStart, wins] of Object.entries(weeks).sort().reverse()) {
    console.log(`\x1b[1mWeek of ${weekStart}\x1b[0m (${wins.length} wins)`);
    for (const win of wins) {
      console.log(formatWin(win, true));
    }
    console.log();
  }
} else if (byProject) {
  const projects = groupByProject(allWins);
  for (const [project, wins] of Object.entries(projects).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\x1b[1m${project}\x1b[0m (${wins.length} wins)`);
    for (const win of wins) {
      console.log(formatWin(win, true));
    }
    console.log();
  }
} else {
  // default: by date, most recent first
  const byDate = {};
  for (const win of allWins) {
    if (!byDate[win.date]) byDate[win.date] = [];
    byDate[win.date].push(win);
  }
  
  for (const [date, wins] of Object.entries(byDate).sort().reverse()) {
    const d = new Date(date);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    console.log(`\x1b[1m${date}\x1b[0m (${dayName})`);
    for (const win of wins) {
      console.log(formatWin(win));
    }
    console.log();
  }
}

printStats(allWins);

// motivational closer
const closers = [
  "you're doing great.",
  "momentum is real.",
  "small wins compound.",
  "ship it.",
  "progress, not perfection.",
  "one day at a time.",
  "keep building."
];
const closer = closers[Math.floor(Math.random() * closers.length)];
console.log(`\n\x1b[2m${closer}\x1b[0m\n`);

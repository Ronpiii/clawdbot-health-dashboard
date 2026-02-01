#!/usr/bin/env node

/**
 * arc month — Monthly retrospective generator
 * 
 * Generates a structured month-in-review from daily logs + git history.
 * Saves report to memory/monthly/YYYY-MM.md
 * 
 * Usage:
 *   arc month              previous month (or current if < 3rd)
 *   arc month 2026-01      specific month
 *   arc month --save       save report to file (default: print only)
 *   arc month --json       output as JSON
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');
const MONTHLY_DIR = join(MEMORY_DIR, 'monthly');

// Parse args
const args = process.argv.slice(2);
const save = args.includes('--save');
const json = args.includes('--json');
const monthArg = args.find(a => /^\d{4}-\d{2}$/.test(a));

// Determine target month
let year, month;
if (monthArg) {
  [year, month] = monthArg.split('-').map(Number);
} else {
  const now = new Date();
  // If before the 3rd, review previous month
  if (now.getUTCDate() < 3) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    year = prev.getFullYear();
    month = prev.getMonth() + 1;
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
}

const monthStr = `${year}-${String(month).padStart(2, '0')}`;
const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = monthNames[month];
const daysInMonth = new Date(year, month, 0).getDate();

// Collect daily log files for this month
const logFiles = [];
if (existsSync(MEMORY_DIR)) {
  const files = readdirSync(MEMORY_DIR)
    .filter(f => f.startsWith(monthStr) && f.endsWith('.md'))
    .sort();
  logFiles.push(...files);
}

// Read all logs
const logs = {};
let totalWords = 0;
for (const file of logFiles) {
  const content = readFileSync(join(MEMORY_DIR, file), 'utf8');
  const date = file.replace('.md', '');
  logs[date] = content;
  totalWords += content.split(/\s+/).length;
}

// ── Extract patterns from logs ──

function extractPatterns(logs) {
  const tools = [];
  const posts = [];
  const lessons = [];
  const decisions = [];
  const projects = new Set();
  const people = new Set();
  const dailyActivity = {};

  for (const [date, content] of Object.entries(logs)) {
    const lines = content.split('\n');
    let currentSection = '';
    let lineCount = lines.filter(l => l.trim()).length;
    dailyActivity[date] = lineCount;

    for (const line of lines) {
      const sectionMatch = line.match(/^##+ (.+)/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].toLowerCase();
        continue;
      }

      const trimmed = line.trim();

      // Tools/scripts built
      if (/\b(built|created|wrote|added|implemented)\b.*\b(script|tool|command|mjs|endpoint|api|component)/i.test(trimmed)) {
        tools.push({ date, item: trimmed.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '') });
      }

      // Posts/content published
      if (/\b(posted|published|wrote|deployed)\b/i.test(trimmed) && /\b(post|article|essay|site|page)\b/i.test(trimmed)) {
        posts.push({ date, item: trimmed.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '') });
      }
      // Moltbook posts specifically
      if (/→ m\//.test(trimmed)) {
        posts.push({ date, item: trimmed.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '') });
      }

      // Lessons
      if (/\b(lesson|learned|realized|insight|takeaway|key insight)\b/i.test(trimmed) ||
          currentSection.includes('lesson') || currentSection.includes('learning')) {
        if (trimmed.startsWith('-') && trimmed.length > 15) {
          lessons.push({ date, item: trimmed.replace(/^[-*•]\s*/, '') });
        }
      }

      // Decisions
      if (/\b(decided|decision|chose|switched|direction shift|pivot)\b/i.test(trimmed)) {
        decisions.push({ date, item: trimmed.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '') });
      }

      // Project names (bold items or known patterns)
      const projectMatch = trimmed.match(/\b(anivia|moltbook|ventok|arc|clawdbot|agent-sales)\b/i);
      if (projectMatch) {
        projects.add(projectMatch[1].toLowerCase());
      }

      // People
      const peoplePatterns = /\b(ron|anna|dominus|aichan|tripletim|ronin|membrain|central)\b/i;
      const personMatch = trimmed.match(peoplePatterns);
      if (personMatch) {
        people.add(personMatch[1]);
      }
    }
  }

  return { tools, posts, lessons, decisions, projects: [...projects], people: [...people], dailyActivity };
}

const data = extractPatterns(logs);

// ── Git stats ──

let gitStats = { commits: 0, filesChanged: 0, added: 0, removed: 0, topDays: [], topFiles: [] };
try {
  const since = `${monthStr}-01`;
  const until = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  gitStats.commits = parseInt(execSync(
    `git log --oneline --since="${since}" --until="${until}" 2>/dev/null | wc -l`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()) || 0;

  gitStats.filesChanged = parseInt(execSync(
    `git log --stat --since="${since}" --until="${until}" 2>/dev/null | grep -E "^ .+\\|" | wc -l`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim()) || 0;

  const diffNums = execSync(
    `git log --numstat --since="${since}" --until="${until}" 2>/dev/null | awk 'NF==3 && $1~/^[0-9]/ {add+=$1; del+=$2} END {print add+0, del+0}'`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim().split(' ');
  gitStats.added = parseInt(diffNums[0]) || 0;
  gitStats.removed = parseInt(diffNums[1]) || 0;

  const dayLines = execSync(
    `git log --format="%ad" --date=short --since="${since}" --until="${until}" 2>/dev/null | sort | uniq -c | sort -rn | head -5`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  gitStats.topDays = dayLines ? dayLines.split('\n').map(l => {
    const m = l.trim().match(/(\d+)\s+(.+)/);
    return m ? { date: m[2], commits: parseInt(m[1]) } : null;
  }).filter(Boolean) : [];

  const fileLines = execSync(
    `git log --name-only --format="" --since="${since}" --until="${until}" 2>/dev/null | grep -v '^$' | sort | uniq -c | sort -rn | head -8`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  gitStats.topFiles = fileLines ? fileLines.split('\n').map(l => {
    const m = l.trim().match(/(\d+)\s+(.+)/);
    return m ? { file: m[2], touches: parseInt(m[1]) } : null;
  }).filter(Boolean) : [];
} catch (e) {}

// ── Activity heatmap ──

function heatmap(dailyActivity, daysInMonth, yearNum, monthNum) {
  const rows = [];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const blocks = [' ', '░', '▒', '▓', '█'];

  // Find max activity for scaling
  const vals = Object.values(dailyActivity);
  const maxActivity = Math.max(...vals, 1);

  let header = '      ';
  const weeks = [];
  let currentWeek = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(yearNum, monthNum - 1, d).getDay(); // 0=Sun
    const adjustedDow = dow === 0 ? 6 : dow - 1; // 0=Mon

    if (d === 1) {
      // Pad first week
      currentWeek = Array(adjustedDow).fill(null);
    }

    const activity = dailyActivity[date] || 0;
    const level = activity === 0 ? 0 : Math.min(4, Math.ceil((activity / maxActivity) * 4));
    currentWeek.push({ day: d, level, activity });

    if (adjustedDow === 6 || d === daysInMonth) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Build grid
  let grid = '';
  for (let row = 0; row < 7; row++) {
    let line = `   ${dayLabels[row]} `;
    for (const week of weeks) {
      if (row < week.length && week[row] !== null) {
        line += blocks[week[row].level] + ' ';
      } else {
        line += '  ';
      }
    }
    grid += line + '\n';
  }

  return grid;
}

// ── Streak calculation ──

let streak = 0;
let longestStreak = 0;
let currentStreak = 0;
for (let d = 1; d <= daysInMonth; d++) {
  const date = `${monthStr}-${String(d).padStart(2, '0')}`;
  if (logs[date]) {
    currentStreak++;
    longestStreak = Math.max(longestStreak, currentStreak);
  } else {
    currentStreak = 0;
  }
}

// ── Output ──

if (json) {
  console.log(JSON.stringify({
    month: monthStr,
    name: monthName,
    year,
    daysLogged: logFiles.length,
    daysInMonth,
    totalWords,
    gitStats,
    streak: longestStreak,
    ...data
  }, null, 2));
  process.exit(0);
}

const report = [];
const out = (line = '') => report.push(line);

out(`# ${monthName} ${year} — Monthly Review`);
out();
out(`> ${logFiles.length}/${daysInMonth} days logged | ${totalWords.toLocaleString()} words written | ${gitStats.commits} commits`);
out();

// Activity heatmap
out('## Activity');
out('```');
out(heatmap(data.dailyActivity, daysInMonth, year, month));
out(`   Longest streak: ${longestStreak} days`);
out(`   ░ light  ▒ moderate  ▓ heavy  █ peak`);
out('```');
out();

// Git stats
out('## Code');
out(`- **${gitStats.commits}** commits across **${gitStats.filesChanged}** file changes`);
out(`- **+${gitStats.added.toLocaleString()}** / **-${gitStats.removed.toLocaleString()}** lines`);
if (gitStats.topDays.length > 0) {
  out(`- busiest day: ${gitStats.topDays[0].date} (${gitStats.topDays[0].commits} commits)`);
}
out();

// Tools built
if (data.tools.length > 0) {
  out('## Tools Built');
  // Deduplicate similar entries
  const seen = new Set();
  for (const t of data.tools) {
    const key = t.item.slice(0, 40).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out(`- ${t.item.length > 80 ? t.item.slice(0, 77) + '...' : t.item} _(${t.date})_`);
    }
  }
  out();
}

// Content published
if (data.posts.length > 0) {
  out('## Content Published');
  const seen = new Set();
  for (const p of data.posts) {
    const key = p.item.slice(0, 40).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out(`- ${p.item.length > 80 ? p.item.slice(0, 77) + '...' : p.item} _(${p.date})_`);
    }
  }
  out();
}

// Key decisions
if (data.decisions.length > 0) {
  out('## Key Decisions');
  for (const d of data.decisions) {
    out(`- ${d.item.length > 80 ? d.item.slice(0, 77) + '...' : d.item} _(${d.date})_`);
  }
  out();
}

// Lessons
if (data.lessons.length > 0) {
  out('## Lessons Learned');
  const seen = new Set();
  for (const l of data.lessons) {
    const key = l.item.slice(0, 40).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out(`- ${l.item.length > 80 ? l.item.slice(0, 77) + '...' : l.item}`);
    }
  }
  out();
}

// Projects
if (data.projects.length > 0) {
  out('## Projects Active');
  out(data.projects.map(p => `\`${p}\``).join(' · '));
  out();
}

// People
const filteredPeople = data.people.filter(p => p.toLowerCase() !== 'ron');
if (filteredPeople.length > 0) {
  out('## Collaborators');
  out(filteredPeople.join(', '));
  out();
}

// Most touched files
if (gitStats.topFiles.length > 0) {
  out('## Most Touched Files');
  for (const f of gitStats.topFiles.slice(0, 6)) {
    out(`- \`${f.file}\` (${f.touches}x)`);
  }
  out();
}

out('---');
out(`_generated ${new Date().toISOString().split('T')[0]}_`);

const reportText = report.join('\n');
console.log(reportText);

// Save if requested
if (save) {
  if (!existsSync(MONTHLY_DIR)) {
    mkdirSync(MONTHLY_DIR, { recursive: true });
  }
  const outPath = join(MONTHLY_DIR, `${monthStr}.md`);
  writeFileSync(outPath, reportText);
  console.log(`\n✅ Saved to memory/monthly/${monthStr}.md`);
}

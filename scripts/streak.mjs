#!/usr/bin/env node
/**
 * arc streak — work streak & activity heatmap
 * 
 * shows:
 *   - current streak (consecutive days with activity)
 *   - longest streak
 *   - 30-day activity heatmap (text-based)
 *   - stats (total active days, busiest day of week, avg activity)
 * 
 * activity sources:
 *   - git commits
 *   - memory/YYYY-MM-DD.md files (daily logs)
 * 
 * nightly build 2026-01-30
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── gather activity data ──────────────────────────────────────────

function getGitDates() {
  try {
    const out = execSync('git log --format="%ai" --all', {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 5000
    });
    return out.trim().split('\n')
      .filter(Boolean)
      .map(line => line.slice(0, 10)); // YYYY-MM-DD
  } catch {
    return [];
  }
}

function getMemoryDates() {
  const memDir = join(ROOT, 'memory');
  try {
    return readdirSync(memDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => f.replace('.md', ''));
  } catch {
    return [];
  }
}

function getMemoryLineCount(date) {
  const file = join(ROOT, 'memory', `${date}.md`);
  try {
    const content = readFileSync(file, 'utf-8');
    return content.split('\n').filter(l => l.trim()).length;
  } catch {
    return 0;
  }
}

function getGitCommitCount(date) {
  try {
    const out = execSync(`git log --format="%H" --after="${date}T00:00:00" --before="${date}T23:59:59" --all`, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 5000
    });
    return out.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

// ── build activity map ────────────────────────────────────────────

function buildActivityMap(days = 60) {
  const gitDates = getGitDates();
  const memDates = getMemoryDates();
  
  // count occurrences per date
  const counts = {};
  for (const d of gitDates) {
    counts[d] = (counts[d] || 0) + 1;
  }
  for (const d of memDates) {
    // weight memory files by line count (rough proxy for activity)
    const lines = getMemoryLineCount(d);
    counts[d] = (counts[d] || 0) + Math.ceil(lines / 10);
  }
  
  // build ordered list for last N days
  const today = new Date();
  const map = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dow = d.getDay(); // 0=sun
    map.push({ date: key, count: counts[key] || 0, dow });
  }
  
  return map.reverse(); // oldest first
}

// ── calculate streaks ─────────────────────────────────────────────

function calcStreaks(map) {
  // current streak: count backwards from today (or yesterday if today has no activity yet)
  let current = 0;
  const reversed = [...map].reverse();
  
  // allow today to be empty (day just started) — start from yesterday
  const startIdx = reversed[0].count > 0 ? 0 : 1;
  
  for (let i = startIdx; i < reversed.length; i++) {
    if (reversed[i].count > 0) {
      current++;
    } else {
      break;
    }
  }
  
  // longest streak
  let longest = 0;
  let run = 0;
  for (const day of map) {
    if (day.count > 0) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  
  return { current, longest };
}

// ── heatmap rendering ─────────────────────────────────────────────

function renderHeatmap(map, cols = 30) {
  // intensity levels
  const blocks = ['·', '░', '▒', '▓', '█'];
  
  function intensity(count) {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 10) return 3;
    return 4;
  }
  
  // take last `cols` days
  const slice = map.slice(-cols);
  
  // header: month labels
  let monthRow = '  ';
  let lastMonth = '';
  for (const day of slice) {
    const m = day.date.slice(5, 7);
    const mName = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m)];
    if (m !== lastMonth) {
      monthRow += mName.slice(0, 1);
      lastMonth = m;
    } else {
      monthRow += ' ';
    }
  }
  
  // activity row
  let actRow = '  ';
  for (const day of slice) {
    actRow += blocks[intensity(day.count)];
  }
  
  // date markers (first and last)
  const first = slice[0].date.slice(5);
  const last = slice[slice.length - 1].date.slice(5);
  let dateRow = '  ' + first + ' '.repeat(Math.max(0, cols - first.length - last.length)) + last;
  
  // legend
  const legend = `  ${blocks[0]} none  ${blocks[1]} light  ${blocks[2]} moderate  ${blocks[3]} busy  ${blocks[4]} intense`;
  
  return [actRow, dateRow, '', legend].join('\n');
}

// ── day-of-week stats ─────────────────────────────────────────────

function dowStats(map) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  
  for (const day of map) {
    totals[day.dow] += day.count;
    counts[day.dow]++;
  }
  
  const avgs = totals.map((t, i) => counts[i] > 0 ? t / counts[i] : 0);
  const maxAvg = Math.max(...avgs);
  const busiest = names[avgs.indexOf(maxAvg)];
  
  // mini bar chart
  const bars = names.map((name, i) => {
    const barLen = maxAvg > 0 ? Math.round((avgs[i] / maxAvg) * 10) : 0;
    return `  ${name} ${'█'.repeat(barLen)}${'·'.repeat(10 - barLen)} ${avgs[i].toFixed(1)}`;
  });
  
  return { busiest, bars };
}

// ── main ──────────────────────────────────────────────────────────

function main() {
  const days = parseInt(process.argv[2]) || 60;
  const map = buildActivityMap(days);
  const { current, longest } = calcStreaks(map);
  const activeDays = map.filter(d => d.count > 0).length;
  const totalActivity = map.reduce((s, d) => s + d.count, 0);
  const { busiest, bars } = dowStats(map);
  
  // streak emoji/indicator
  const fire = current >= 7 ? ' 🔥' : current >= 3 ? ' ✦' : '';
  
  console.log();
  console.log(`  ═══ STREAK ═══`);
  console.log();
  console.log(`  current:  ${current} days${fire}`);
  console.log(`  longest:  ${longest} days`);
  console.log(`  active:   ${activeDays}/${days} days (${Math.round(activeDays/days*100)}%)`);
  console.log(`  total:    ${totalActivity} activity units`);
  console.log();
  console.log(`  ─── ${days}-day heatmap ───`);
  console.log();
  console.log(renderHeatmap(map, Math.min(days, 50)));
  console.log();
  console.log(`  ─── day of week ───`);
  console.log();
  console.log(bars.join('\n'));
  console.log();
  console.log(`  busiest day: ${busiest}`);
  console.log();
}

main();

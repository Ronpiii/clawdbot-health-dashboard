#!/usr/bin/env node
/**
 * arc orbit — weekly momentum tracker
 * 
 * compares this week to last week across multiple dimensions.
 * answers: "are things trending up, down, or flat?"
 * 
 * dimensions:
 *   - commits: git activity volume
 *   - logging: daily memory file coverage
 *   - tasks: completion velocity
 *   - tools: arc toolkit growth
 *   - codebase: lines changed (net productivity)
 * 
 * output:
 *   - per-dimension trend arrow + delta
 *   - sparkline history (4 weeks)
 *   - net momentum score (-100 to +100)
 *   - verdict: accelerating / cruising / decelerating / stalling
 * 
 * usage:
 *   arc orbit              full dashboard
 *   arc orbit --short      one-liner momentum
 *   arc orbit --json       machine-readable
 *   arc orbit --weeks N    look back N weeks (default 4)
 * 
 * nightly build 2026-02-16
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════════════
// DATE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function getWeekBounds(weeksAgo = 0) {
  const now = new Date();
  // start of this week (monday)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - mondayOffset - (weeksAgo * 7));
  thisMonday.setHours(0, 0, 0, 0);
  
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  
  return {
    start: thisMonday.toISOString().slice(0, 10),
    end: nextMonday.toISOString().slice(0, 10),
    label: weeksAgo === 0 ? 'this week' : weeksAgo === 1 ? 'last week' : `${weeksAgo}w ago`
  };
}

function datesToList(start, end) {
  const dates = [];
  const d = new Date(start);
  const e = new Date(end);
  while (d < e) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA COLLECTORS
// ═══════════════════════════════════════════════════════════════════════════════

function getCommitsInRange(start, end) {
  // scan all git repos
  const repos = findGitRepos(ROOT, 3);
  let total = 0;
  
  for (const repo of repos) {
    try {
      const out = execSync(
        `git log --format="%H" --after="${start}T00:00:00" --before="${end}T00:00:00" --all 2>/dev/null`,
        { cwd: repo, encoding: 'utf-8', timeout: 5000 }
      );
      total += out.trim().split('\n').filter(Boolean).length;
    } catch {}
  }
  
  return total;
}

function getLinesChangedInRange(start, end) {
  const repos = findGitRepos(ROOT, 3);
  let added = 0;
  let removed = 0;
  
  for (const repo of repos) {
    try {
      const out = execSync(
        `git log --numstat --format="" --after="${start}T00:00:00" --before="${end}T00:00:00" --all 2>/dev/null`,
        { cwd: repo, encoding: 'utf-8', timeout: 5000 }
      );
      for (const line of out.trim().split('\n').filter(Boolean)) {
        const [a, r] = line.split('\t');
        if (a !== '-') added += parseInt(a) || 0;
        if (r !== '-') removed += parseInt(r) || 0;
      }
    } catch {}
  }
  
  return { added, removed, net: added - removed };
}

function getLogCoverage(start, end) {
  const dates = datesToList(start, end);
  const memDir = join(ROOT, 'memory');
  let logged = 0;
  let totalLines = 0;
  
  try {
    const files = readdirSync(memDir);
    for (const date of dates) {
      const filename = `${date}.md`;
      if (files.includes(filename)) {
        logged++;
        try {
          const content = readFileSync(join(memDir, filename), 'utf-8');
          totalLines += content.split('\n').filter(l => l.trim()).length;
        } catch {}
      }
    }
  } catch {}
  
  // don't count future days for current week
  const today = new Date().toISOString().slice(0, 10);
  const countableDates = dates.filter(d => d <= today);
  
  return {
    logged,
    total: countableDates.length,
    coverage: countableDates.length > 0 ? Math.round((logged / countableDates.length) * 100) : 0,
    totalLines
  };
}

function getTasksCompletedInRange(start, end) {
  // scan tasks/done.md for completion dates, or check active.md for [x] items
  // also check daily logs for completed items
  const dates = datesToList(start, end);
  let completed = 0;
  
  // check daily logs for checked items and "completed"/"shipped"/"fixed" mentions
  const memDir = join(ROOT, 'memory');
  for (const date of dates) {
    try {
      const content = readFileSync(join(memDir, `${date}.md`), 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (/^\s*-\s*\[x\]/i.test(line)) completed++;
        if (/\b(shipped|deployed|completed|fixed|resolved|merged)\b/i.test(line) && /^#+\s|^\s*[-*]\s/.test(line)) {
          completed++;
        }
      }
    } catch {}
  }
  
  return completed;
}

function getToolCount() {
  // count scripts in scripts/ dir
  try {
    const files = readdirSync(join(ROOT, 'scripts'));
    return files.filter(f => f.endsWith('.mjs')).length;
  } catch {
    return 0;
  }
}

function getArcCommandCount() {
  // count unique commands in arc CLI
  try {
    const arcContent = readFileSync(join(ROOT, 'scripts', 'arc'), 'utf-8');
    const matches = arcContent.match(/case '([^']+)':/g);
    // deduplicate aliases
    const commands = new Set();
    if (matches) {
      for (const m of matches) {
        commands.add(m.replace(/case '|':/g, ''));
      }
    }
    return commands.size;
  } catch {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GIT REPO FINDER
// ═══════════════════════════════════════════════════════════════════════════════

function findGitRepos(dir, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  const repos = [];
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules') continue;
      if (entry.name.startsWith('.') && entry.name !== '.git') continue;
      
      const fullPath = join(dir, entry.name);
      if (entry.name === '.git') {
        repos.push(dir);
      } else {
        repos.push(...findGitRepos(fullPath, maxDepth, depth + 1));
      }
    }
  } catch {}
  
  return repos;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TREND CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function trend(current, previous) {
  if (previous === 0 && current === 0) return { arrow: '─', delta: 0, pct: 0 };
  if (previous === 0) return { arrow: '▲', delta: current, pct: 100 };
  
  const delta = current - previous;
  const pct = Math.round((delta / previous) * 100);
  
  let arrow;
  if (pct > 20) arrow = '▲';
  else if (pct > 5) arrow = '↗';
  else if (pct >= -5) arrow = '─';
  else if (pct >= -20) arrow = '↘';
  else arrow = '▼';
  
  return { arrow, delta, pct };
}

function sparkline(values) {
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...values, 1);
  return values.map(v => chars[Math.min(7, Math.floor((v / max) * 7))]).join('');
}

function momentum(dimensions) {
  // each dimension contributes a weighted score
  // positive pct = positive momentum, negative = negative
  // cap individual contributions to prevent one outlier from dominating
  const weights = {
    commits: 0.30,
    logging: 0.20,
    tasks: 0.25,
    codebase: 0.15,
    tools: 0.10
  };
  
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const dim = dimensions[key];
    if (!dim) continue;
    // cap contribution at +/- 100
    const contribution = Math.max(-100, Math.min(100, dim.trend.pct));
    score += contribution * weight;
  }
  
  return Math.round(Math.max(-100, Math.min(100, score)));
}

function verdict(score) {
  if (score > 30) return 'accelerating';
  if (score > 10) return 'gaining momentum';
  if (score > -10) return 'cruising';
  if (score > -30) return 'decelerating';
  return 'stalling';
}

function verdictPhrase(score) {
  if (score > 30) return 'things are picking up speed. riding the wave.';
  if (score > 10) return 'slight upward drift. keep pushing.';
  if (score > -10) return 'steady state. consistent, not stagnant.';
  if (score > -30) return 'losing a bit of steam. normal ebb — or time to refocus?';
  return 'significant slowdown. might be intentional (rest) or worth investigating.';
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════

function formatDelta(n, unit = '') {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}${unit}`;
}

function main() {
  const args = process.argv.slice(2);
  const isShort = args.includes('--short') || args.includes('-s');
  const isJson = args.includes('--json') || args.includes('-j');
  
  let numWeeks = 4;
  const weeksIdx = args.indexOf('--weeks');
  if (weeksIdx !== -1 && args[weeksIdx + 1]) {
    numWeeks = Math.max(2, Math.min(12, parseInt(args[weeksIdx + 1]) || 4));
  }
  
  // collect data for each week
  const weeklyData = [];
  for (let w = 0; w < numWeeks; w++) {
    const bounds = getWeekBounds(w);
    const commits = getCommitsInRange(bounds.start, bounds.end);
    const lines = getLinesChangedInRange(bounds.start, bounds.end);
    const logs = getLogCoverage(bounds.start, bounds.end);
    const tasks = getTasksCompletedInRange(bounds.start, bounds.end);
    
    weeklyData.push({
      ...bounds,
      commits,
      lines,
      logs,
      tasks
    });
  }
  
  // current tools count (snapshot, not per-week)
  const toolCount = getToolCount();
  const cmdCount = getArcCommandCount();
  
  // edge case: at week start (mon/tue before much activity), compare last week vs week before
  // to avoid "everything is -100% bc it's monday morning"
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const daysIntoWeek = mondayOffset; // 0=monday, 1=tuesday, ...
  const earlyWeek = daysIntoWeek < 2 && weeklyData[0].commits === 0;
  
  const compareIdx = earlyWeek ? 1 : 0;
  const thisWeek = weeklyData[compareIdx];
  const lastWeek = weeklyData[compareIdx + 1];
  
  const dimensions = {
    commits: {
      label: 'commits',
      current: thisWeek.commits,
      previous: lastWeek.commits,
      trend: trend(thisWeek.commits, lastWeek.commits),
      history: weeklyData.map(w => w.commits).reverse(),
      unit: ''
    },
    logging: {
      label: 'log coverage',
      current: thisWeek.logs.coverage,
      previous: lastWeek.logs.coverage,
      trend: trend(thisWeek.logs.coverage, lastWeek.logs.coverage),
      history: weeklyData.map(w => w.logs.coverage).reverse(),
      unit: '%'
    },
    tasks: {
      label: 'tasks done',
      current: thisWeek.tasks,
      previous: lastWeek.tasks,
      trend: trend(thisWeek.tasks, lastWeek.tasks),
      history: weeklyData.map(w => w.tasks).reverse(),
      unit: ''
    },
    codebase: {
      label: 'lines added',
      current: thisWeek.lines.added,
      previous: lastWeek.lines.added,
      trend: trend(thisWeek.lines.added, lastWeek.lines.added),
      history: weeklyData.map(w => w.lines.added).reverse(),
      unit: ''
    },
    tools: {
      label: 'toolkit',
      current: toolCount,
      previous: toolCount, // snapshot — can't compare historically
      trend: { arrow: '─', delta: 0, pct: 0 },
      history: [toolCount],
      unit: ' scripts'
    }
  };
  
  // toolkit trend: approximate from nightly builds log
  try {
    const nightlyContent = readFileSync(join(ROOT, 'memory', 'nightly-builds.md'), 'utf-8');
    const thisWeekBuilds = datesToList(thisWeek.start, thisWeek.end)
      .filter(d => nightlyContent.includes(`### ${d}`)).length;
    const lastWeekBuilds = datesToList(lastWeek.start, lastWeek.end)
      .filter(d => nightlyContent.includes(`### ${d}`)).length;
    dimensions.tools.current = thisWeekBuilds;
    dimensions.tools.previous = lastWeekBuilds;
    dimensions.tools.trend = trend(thisWeekBuilds, lastWeekBuilds);
    dimensions.tools.history = weeklyData.map(w => {
      return datesToList(w.start, w.end)
        .filter(d => nightlyContent.includes(`### ${d}`)).length;
    }).reverse();
    dimensions.tools.label = 'nightly builds';
    dimensions.tools.unit = '';
  } catch {}
  
  const score = momentum(dimensions);
  const v = verdict(score);
  
  // ── output ──
  
  if (isJson) {
    console.log(JSON.stringify({
      momentum: score,
      verdict: v,
      thisWeek: thisWeek.start,
      lastWeek: lastWeek.start,
      dimensions: Object.fromEntries(
        Object.entries(dimensions).map(([k, d]) => [k, {
          current: d.current,
          previous: d.previous,
          delta: d.trend.delta,
          pct: d.trend.pct,
          history: d.history
        }])
      ),
      weeklyData
    }, null, 2));
    return;
  }
  
  if (isShort) {
    const arrow = score > 10 ? '▲' : score < -10 ? '▼' : '─';
    console.log(`${arrow} momentum: ${formatDelta(score)} (${v}) | commits: ${thisWeek.commits} (${dimensions.commits.trend.arrow}) | tasks: ${thisWeek.tasks} (${dimensions.tasks.trend.arrow}) | coverage: ${thisWeek.logs.coverage}% (${dimensions.logging.trend.arrow})`);
    return;
  }
  
  // ── full dashboard ──
  
  const scoreBar = score >= 0
    ? '░'.repeat(10) + '█'.repeat(Math.min(10, Math.round(score / 10))) + '░'.repeat(Math.max(0, 10 - Math.round(score / 10)))
    : '░'.repeat(Math.max(0, 10 + Math.round(score / 10))) + '█'.repeat(Math.min(10, Math.abs(Math.round(score / 10)))) + '░'.repeat(10);
  
  console.log();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        ORBIT                                ║');
  console.log('║                  weekly momentum tracker                    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  // momentum gauge
  const scoreStr = formatDelta(score);
  const gaugeLabel = `${scoreStr} — ${v}`;
  const pad = Math.max(0, 58 - gaugeLabel.length - 14);
  console.log(`║  momentum: ${gaugeLabel}${' '.repeat(pad)}║`);
  console.log(`║  ◄─────── ${scoreBar} ───────►${' '.repeat(Math.max(0, 17))}║`);
  console.log(`║  -100     ${' '.repeat(8)}0${' '.repeat(9)}    +100${' '.repeat(17)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  // week comparison header
  const earlyNote = earlyWeek ? '  (week just started — comparing last 2 full weeks)' : '';
  const weekRange = `${thisWeek.start} → ${thisWeek.end}  vs  ${lastWeek.start} → ${lastWeek.end}`;
  const headerPad = Math.max(0, 58 - weekRange.length);
  console.log(`║  ${weekRange}${' '.repeat(headerPad)}║`);
  if (earlyNote) {
    const notePad = Math.max(0, 58 - earlyNote.length);
    console.log(`║  ${earlyNote}${' '.repeat(notePad)}║`);
  }
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  // dimensions
  for (const [key, dim] of Object.entries(dimensions)) {
    const spark = dim.history.length > 1 ? sparkline(dim.history) : '';
    const deltaStr = formatDelta(dim.trend.delta);
    const pctStr = dim.trend.pct !== 0 ? ` (${formatDelta(dim.trend.pct)}%)` : '';
    
    const line = `${dim.trend.arrow} ${dim.label.padEnd(15)} ${String(dim.current).padStart(5)}${dim.unit}  ${deltaStr.padStart(7)}${pctStr.padEnd(10)} ${spark}`;
    const linePad = Math.max(0, 58 - line.length);
    console.log(`║  ${line}${' '.repeat(linePad)}║`);
  }
  
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  // extra stats
  const netLines = `net: ${formatDelta(thisWeek.lines.net)} lines (${formatDelta(thisWeek.lines.added)} / ${formatDelta(-thisWeek.lines.removed).replace('+', '')})`;
  const logDays = `logged: ${thisWeek.logs.logged}/${thisWeek.logs.total} days (${thisWeek.logs.totalLines} lines)`;
  const toolInfo = `toolkit: ${toolCount} scripts, ${cmdCount} arc commands`;
  
  for (const line of [netLines, logDays, toolInfo]) {
    const lp = Math.max(0, 58 - line.length);
    console.log(`║  ${line}${' '.repeat(lp)}║`);
  }
  
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  // verdict
  const phrase = verdictPhrase(score);
  // word wrap the phrase to fit the box
  const maxWidth = 56;
  const words = phrase.split(' ');
  let currentLine = '';
  const phraseLines = [];
  
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > maxWidth) {
      phraseLines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine.trim()) phraseLines.push(currentLine.trim());
  
  for (const pl of phraseLines) {
    const plPad = Math.max(0, 58 - pl.length);
    console.log(`║  ${pl}${' '.repeat(plPad)}║`);
  }
  
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
}

main();

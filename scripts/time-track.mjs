#!/usr/bin/env node
/**
 * arc time — git-based time reconstruction
 * 
 * estimates hours worked from commit timestamps using session detection.
 * no manual tracking needed — your git history IS your timesheet.
 * 
 * heuristic: commits within 50 minutes = same work session.
 * first commit in a session gets 30 minutes of assumed prior work.
 * 
 * usage:
 *   arc time                    # this week's summary
 *   arc time --today             # today only
 *   arc time --week              # this week (default)
 *   arc time --month             # this month
 *   arc time --days N            # last N days
 *   arc time --since YYYY-MM-DD  # since date
 *   arc time --project <name>    # filter to one project
 *   arc time --sessions          # show individual work sessions
 *   arc time --heatmap           # hourly heatmap (when do you work?)
 *   arc time --short             # one-liner summary
 *   arc time --json              # machine-readable
 * 
 * nightly build 2026-02-20
 */

import { execSync } from 'child_process';
import { readdirSync, existsSync, statSync, readFileSync } from 'fs';
import { join, basename } from 'path';

const ROOT = join(import.meta.dirname, '..');
const PROJECTS_DIR = join(ROOT, 'projects');
const args = process.argv.slice(2);

// flags
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');
const sessionsMode = args.includes('--sessions');
const heatmapMode = args.includes('--heatmap');
const todayMode = args.includes('--today');
const weekMode = args.includes('--week');
const monthMode = args.includes('--month');

// parse --days N
const daysIdx = args.indexOf('--days');
const daysN = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 7 : null;

// parse --since YYYY-MM-DD
const sinceIdx = args.indexOf('--since');
const sinceDate = sinceIdx >= 0 ? args[sinceIdx + 1] : null;

// parse --project <name>
const projIdx = args.indexOf('--project');
const filterProject = projIdx >= 0 ? args[projIdx + 1] : null;

// constants
const SESSION_GAP_MS = 50 * 60 * 1000;  // 50 minutes = new session
const FIRST_COMMIT_BONUS_MS = 30 * 60 * 1000;  // assume 30 min before first commit

// colors
const c = {
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[90m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  magenta: s => `\x1b[35m${s}\x1b[0m`,
  blue: s => `\x1b[34m${s}\x1b[0m`,
};

// ─── date range ───

function getDateRange() {
  const now = new Date();
  
  if (todayMode) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: 'today' };
  }
  
  if (monthMode) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now, label: `${now.toLocaleString('en', { month: 'long' })} ${now.getFullYear()}` };
  }
  
  if (sinceDate) {
    const start = new Date(sinceDate + 'T00:00:00');
    return { start, end: now, label: `since ${sinceDate}` };
  }
  
  if (daysN) {
    const start = new Date(now - daysN * 86400000);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: `last ${daysN} days` };
  }
  
  // default: this week (Monday start)
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return { start, end: now, label: 'this week' };
}

// ─── find git repos ───

function findRepos() {
  const repos = [];
  
  // root repo
  if (existsSync(join(ROOT, '.git'))) {
    repos.push({ name: 'clawd', path: ROOT });
  }
  
  // project repos
  if (existsSync(PROJECTS_DIR)) {
    for (const d of readdirSync(PROJECTS_DIR)) {
      const p = join(PROJECTS_DIR, d);
      if (!statSync(p).isDirectory()) continue;
      if (existsSync(join(p, '.git'))) {
        repos.push({ name: d, path: p });
      }
      // nested repos (e.g., context-memory/api)
      try {
        for (const sub of readdirSync(p)) {
          const sp = join(p, sub);
          if (statSync(sp).isDirectory() && existsSync(join(sp, '.git'))) {
            repos.push({ name: `${d}/${sub}`, path: sp });
          }
        }
      } catch {}
    }
  }
  
  // top-level non-projects repos
  for (const d of readdirSync(ROOT)) {
    if (d === 'projects' || d === 'node_modules' || d === '.git' || d.startsWith('.')) continue;
    const p = join(ROOT, d);
    try {
      if (statSync(p).isDirectory() && existsSync(join(p, '.git'))) {
        repos.push({ name: d, path: p });
      }
    } catch {}
  }
  
  return repos;
}

// ─── extract commits ───

function getCommits(repo, since, until) {
  try {
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();
    const raw = execSync(
      `git log --all --format="%H|%aI|%s" --since="${sinceStr}" --until="${untilStr}"`,
      { cwd: repo.path, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    
    if (!raw) return [];
    
    return raw.split('\n').map(line => {
      const [hash, dateStr, ...msgParts] = line.split('|');
      return {
        hash: hash?.slice(0, 7),
        date: new Date(dateStr),
        message: msgParts.join('|').trim(),
        project: repo.name,
      };
    }).filter(c => c.date && !isNaN(c.date.getTime()));
  } catch {
    return [];
  }
}

// ─── session detection ───

function detectSessions(commits) {
  if (commits.length === 0) return [];
  
  // sort by time
  const sorted = [...commits].sort((a, b) => a.date - b.date);
  
  const sessions = [];
  let current = { commits: [sorted[0]], start: sorted[0].date, end: sorted[0].date };
  
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].date - current.end;
    if (gap <= SESSION_GAP_MS) {
      current.commits.push(sorted[i]);
      current.end = sorted[i].date;
    } else {
      sessions.push(current);
      current = { commits: [sorted[i]], start: sorted[i].date, end: sorted[i].date };
    }
  }
  sessions.push(current);
  
  // calculate duration for each session
  for (const s of sessions) {
    const span = s.end - s.start;
    // add 30 min for first-commit warmup
    s.durationMs = span + FIRST_COMMIT_BONUS_MS;
    s.projects = [...new Set(s.commits.map(c => c.project))];
  }
  
  return sessions;
}

// ─── format helpers ───

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.round((ms % 3600000) / 60000);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function bar(value, max, width = 20) {
  const filled = Math.round((value / Math.max(max, 1)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function hourBar(count, max) {
  const blocks = ['░', '▒', '▓', '█'];
  if (count === 0) return '·';
  const intensity = Math.min(3, Math.floor((count / Math.max(max, 1)) * 4));
  return blocks[intensity];
}

// ─── analysis ───

function analyzeByDay(sessions) {
  const days = {};
  for (const s of sessions) {
    const key = formatDateKey(s.start);
    if (!days[key]) days[key] = { sessions: [], totalMs: 0, commits: 0 };
    days[key].sessions.push(s);
    days[key].totalMs += s.durationMs;
    days[key].commits += s.commits.length;
  }
  return days;
}

function analyzeByProject(sessions) {
  const projects = {};
  for (const s of sessions) {
    // split session time proportionally across projects
    const perProject = s.durationMs / s.projects.length;
    for (const p of s.projects) {
      if (!projects[p]) projects[p] = { totalMs: 0, commits: 0, sessions: 0 };
      projects[p].totalMs += perProject;
      projects[p].sessions += 1;
      projects[p].commits += s.commits.filter(c => c.project === p).length;
    }
  }
  return projects;
}

function analyzeByHour(commits) {
  const hours = new Array(24).fill(0);
  for (const c of commits) {
    hours[c.date.getUTCHours()]++;
  }
  return hours;
}

function analyzeByDayOfWeek(sessions) {
  const days = new Array(7).fill(0); // 0=Sun
  for (const s of sessions) {
    days[s.start.getDay()] += s.durationMs;
  }
  return days;
}

// ─── output ───

function printHeader(label) {
  if (jsonMode) return;
  console.log(`${c.bold('arc time')} ${c.dim('—')} git-based time reconstruction`);
  console.log(c.dim('─'.repeat(56)));
  console.log(c.dim(`period: ${label}`));
  console.log();
}

function printSummary(sessions, commits, range) {
  const totalMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
  const totalCommits = commits.length;
  const days = analyzeByDay(sessions);
  const daysWorked = Object.keys(days).length;
  const rangeDays = Math.max(1, Math.ceil((range.end - range.start) / 86400000));
  const avgPerDay = daysWorked > 0 ? totalMs / daysWorked : 0;
  const longestSession = sessions.reduce((max, s) => s.durationMs > max.durationMs ? s : max, sessions[0]);
  
  console.log(c.bold('  summary'));
  console.log(`  total time     ${c.cyan(formatDuration(totalMs))}`);
  console.log(`  commits        ${c.cyan(String(totalCommits))}`);
  console.log(`  sessions       ${c.cyan(String(sessions.length))}`);
  console.log(`  days worked    ${c.cyan(`${daysWorked}/${rangeDays}`)}`);
  console.log(`  avg/work day   ${c.cyan(formatDuration(avgPerDay))}`);
  if (longestSession) {
    console.log(`  longest        ${c.cyan(formatDuration(longestSession.durationMs))} ${c.dim(`on ${formatDate(longestSession.start)}`)}`);
  }
  console.log();
}

function printDailyBreakdown(sessions, range) {
  const days = analyzeByDay(sessions);
  const sortedDays = Object.entries(days).sort(([a], [b]) => a.localeCompare(b));
  const maxMs = Math.max(...sortedDays.map(([, d]) => d.totalMs));
  
  console.log(c.bold('  daily breakdown'));
  
  for (const [dateKey, day] of sortedDays) {
    const d = new Date(dateKey + 'T12:00:00Z');
    const dayName = d.toLocaleDateString('en', { weekday: 'short' });
    const dayNum = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    const timeStr = formatDuration(day.totalMs).padStart(6);
    const barStr = bar(day.totalMs, maxMs, 16);
    const commitStr = `${day.commits} commit${day.commits !== 1 ? 's' : ''}`;
    const sessionStr = `${day.sessions.length} session${day.sessions.length !== 1 ? 's' : ''}`;
    
    console.log(`  ${c.dim(dayName)} ${dayNum.padEnd(7)} ${c.cyan(timeStr)} ${barStr} ${c.dim(`${commitStr}, ${sessionStr}`)}`);
  }
  console.log();
}

function printProjectBreakdown(sessions) {
  const projects = analyzeByProject(sessions);
  const sorted = Object.entries(projects).sort(([, a], [, b]) => b.totalMs - a.totalMs);
  const totalMs = sorted.reduce((sum, [, p]) => sum + p.totalMs, 0);
  const maxMs = sorted[0]?.[1]?.totalMs || 1;
  
  console.log(c.bold('  by project'));
  
  for (const [name, proj] of sorted) {
    const pct = totalMs > 0 ? Math.round((proj.totalMs / totalMs) * 100) : 0;
    const timeStr = formatDuration(proj.totalMs).padStart(6);
    const barStr = bar(proj.totalMs, maxMs, 16);
    
    console.log(`  ${name.padEnd(20)} ${c.cyan(timeStr)} ${barStr} ${c.dim(`${pct}% · ${proj.commits} commits`)}`);
  }
  console.log();
}

function printSessions(sessions) {
  console.log(c.bold('  work sessions'));
  
  // group by day
  const byDay = {};
  for (const s of sessions) {
    const key = formatDateKey(s.start);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(s);
  }
  
  const sortedDays = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  
  for (const [dateKey, daySessions] of sortedDays) {
    const d = new Date(dateKey + 'T12:00:00Z');
    console.log(`  ${c.bold(formatDate(d))}`);
    
    for (const s of daySessions.sort((a, b) => a.start - b.start)) {
      const startTime = formatTime(s.start);
      const endTime = formatTime(new Date(s.start.getTime() + s.durationMs));
      const dur = formatDuration(s.durationMs);
      const projs = s.projects.join(', ');
      const commitCount = s.commits.length;
      
      console.log(`    ${c.dim(startTime)}–${c.dim(endTime)}  ${c.cyan(dur.padStart(5))}  ${projs} ${c.dim(`(${commitCount} commit${commitCount !== 1 ? 's' : ''})`)}`);
      
      // show up to 3 commit messages per session
      const shown = s.commits.slice(0, 3);
      for (const commit of shown) {
        const msg = commit.message.length > 60 ? commit.message.slice(0, 57) + '...' : commit.message;
        console.log(`      ${c.dim(commit.hash)} ${msg}`);
      }
      if (s.commits.length > 3) {
        console.log(c.dim(`      ...and ${s.commits.length - 3} more`));
      }
    }
    console.log();
  }
}

function printHeatmap(commits) {
  console.log(c.bold('  hourly heatmap') + c.dim(' (UTC)'));
  
  const hours = analyzeByHour(commits);
  const maxH = Math.max(...hours);
  
  // print hour labels
  let labelRow = '  ';
  let heatRow = '  ';
  for (let h = 0; h < 24; h++) {
    labelRow += String(h).padStart(2) + ' ';
    heatRow += ' ' + hourBar(hours[h], maxH) + ' ';
  }
  
  console.log(c.dim(labelRow));
  console.log(heatRow);
  
  // peak hours
  const peakHours = hours
    .map((count, h) => ({ h, count }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  
  if (peakHours.length > 0) {
    const peakStr = peakHours.map(x => `${x.h}:00 (${x.count})`).join(', ');
    console.log(c.dim(`  peak hours: ${peakStr}`));
  }
  
  // day of week (need sessions for this)
  console.log();
}

function printDayOfWeekChart(sessions) {
  const days = analyzeByDayOfWeek(sessions);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxMs = Math.max(...days);
  
  // reorder: Mon first
  const order = [1, 2, 3, 4, 5, 6, 0];
  
  console.log(c.bold('  by day of week'));
  for (const i of order) {
    if (days[i] === 0) {
      console.log(`  ${c.dim(dayNames[i])}  ${c.dim('·')}`);
    } else {
      const timeStr = formatDuration(days[i]).padStart(6);
      const barStr = bar(days[i], maxMs, 16);
      console.log(`  ${dayNames[i]}  ${c.cyan(timeStr)} ${barStr}`);
    }
  }
  console.log();
}

// ─── main ───

function main() {
  const range = getDateRange();
  const repos = findRepos();
  
  // filter by project if specified
  const targetRepos = filterProject
    ? repos.filter(r => r.name.toLowerCase().includes(filterProject.toLowerCase()))
    : repos;
  
  if (targetRepos.length === 0) {
    if (jsonMode) { console.log(JSON.stringify({ error: 'no repos found' })); return; }
    console.log(c.red(`no repos found${filterProject ? ` matching "${filterProject}"` : ''}`));
    return;
  }
  
  // gather all commits
  let allCommits = [];
  for (const repo of targetRepos) {
    const commits = getCommits(repo, range.start, range.end);
    allCommits.push(...commits);
  }
  
  // deduplicate by hash (some repos might share commits)
  const seen = new Set();
  allCommits = allCommits.filter(c => {
    if (seen.has(c.hash)) return false;
    seen.add(c.hash);
    return true;
  });
  
  // sort chronologically
  allCommits.sort((a, b) => a.date - b.date);
  
  // detect sessions
  const sessions = detectSessions(allCommits);
  
  const totalMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
  const totalCommits = allCommits.length;
  
  // ─── JSON output ───
  if (jsonMode) {
    const output = {
      period: range.label,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      totalMs,
      totalFormatted: formatDuration(totalMs),
      commits: totalCommits,
      sessions: sessions.length,
      daysWorked: Object.keys(analyzeByDay(sessions)).length,
      byDay: analyzeByDay(sessions),
      byProject: analyzeByProject(sessions),
      byHour: analyzeByHour(allCommits),
      sessions: sessions.map(s => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
        durationMs: s.durationMs,
        projects: s.projects,
        commits: s.commits.length,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  
  // ─── short mode ───
  if (shortMode) {
    if (totalCommits === 0) {
      console.log(c.dim(`arc time: no commits ${range.label}`));
      return;
    }
    const daysWorked = Object.keys(analyzeByDay(sessions)).length;
    console.log(`${c.cyan(formatDuration(totalMs))} across ${daysWorked} day${daysWorked !== 1 ? 's' : ''} · ${totalCommits} commits · ${sessions.length} sessions ${c.dim(`(${range.label})`)}`);
    return;
  }
  
  // ─── full output ───
  printHeader(range.label);
  
  if (totalCommits === 0) {
    console.log(c.dim('  no commits found in this period'));
    console.log();
    return;
  }
  
  printSummary(sessions, allCommits, range);
  printDailyBreakdown(sessions, range);
  printProjectBreakdown(sessions);
  
  if (sessionsMode) {
    printSessions(sessions);
  }
  
  if (heatmapMode) {
    printHeatmap(allCommits);
    printDayOfWeekChart(sessions);
  }
  
  // always show a mini heatmap in default view
  if (!sessionsMode && !heatmapMode) {
    const hours = analyzeByHour(allCommits);
    const maxH = Math.max(...hours);
    let heatStr = '  ';
    for (let h = 0; h < 24; h++) {
      heatStr += hourBar(hours[h], maxH);
    }
    const peakHours = hours
      .map((count, h) => ({ h, count }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 2);
    const peakStr = peakHours.map(x => `${String(x.h).padStart(2)}:00`).join(', ');
    
    console.log(c.bold('  work pattern'));
    console.log(`${heatStr} ${c.dim('(UTC 0-23)')}`);
    if (peakStr) console.log(c.dim(`  peak: ${peakStr}`));
    console.log(c.dim('  use --heatmap for full breakdown, --sessions for detail'));
    console.log();
  }
  
  // productivity insight
  const daysInRange = Math.max(1, Math.ceil((range.end - range.start) / 86400000));
  const daysWorked = Object.keys(analyzeByDay(sessions)).length;
  const avgSession = sessions.length > 0 ? totalMs / sessions.length : 0;
  const commitsPerHour = totalMs > 0 ? (totalCommits / (totalMs / 3600000)).toFixed(1) : '0';
  
  console.log(c.bold('  patterns'));
  console.log(`  avg session    ${c.cyan(formatDuration(avgSession))}`);
  console.log(`  commits/hour   ${c.cyan(commitsPerHour)}`);
  console.log(`  work ratio     ${c.cyan(`${daysWorked}/${daysInRange} days`)} ${c.dim(`(${Math.round(daysWorked/daysInRange*100)}%)`)}`);
  
  // deep work detection: sessions > 2h
  const deepSessions = sessions.filter(s => s.durationMs >= 2 * 3600000);
  if (deepSessions.length > 0) {
    const deepMs = deepSessions.reduce((sum, s) => sum + s.durationMs, 0);
    console.log(`  deep work      ${c.green(formatDuration(deepMs))} ${c.dim(`(${deepSessions.length} session${deepSessions.length !== 1 ? 's' : ''} > 2h)`)}`);
  }
  
  // context switching: sessions touching 2+ projects
  const multiProjSessions = sessions.filter(s => s.projects.length > 1);
  if (multiProjSessions.length > 0) {
    console.log(`  multi-project  ${c.yellow(String(multiProjSessions.length))} sessions ${c.dim('(context switching)')}`);
  }
  
  console.log();
}

main();

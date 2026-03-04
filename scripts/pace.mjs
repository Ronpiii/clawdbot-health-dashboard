#!/usr/bin/env node
/**
 * arc pace — work rhythm analyzer
 * 
 * Analyzes git commit timestamps to reveal natural work patterns:
 * peak productive hours, session lengths, break patterns, deep work ratio,
 * flow state detection, day-of-week rhythm, and scheduling recommendations.
 * 
 * Usage:
 *   node scripts/pace.mjs                    # last 30 days
 *   node scripts/pace.mjs --days 90          # custom range
 *   node scripts/pace.mjs --week             # this week only
 *   node scripts/pace.mjs --sessions         # detailed session view
 *   node scripts/pace.mjs --recommendations  # scheduling advice
 *   node scripts/pace.mjs --short            # one-liner
 *   node scripts/pace.mjs --json             # machine-readable
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.WORKSPACE || join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const shortMode = args.includes('--short');
const jsonMode = args.includes('--json');
const sessionsMode = args.includes('--sessions');
const recsMode = args.includes('--recommendations') || args.includes('--recs');
const weekMode = args.includes('--week');
const daysArg = args.find((a, i) => args[i - 1] === '--days');
const DAYS = weekMode ? 7 : (daysArg ? parseInt(daysArg) : 30);

// timezone offset for Tallinn (UTC+2)
const TZ_OFFSET = 2;

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  bg_green: '\x1b[42m\x1b[30m',
  bg_yellow: '\x1b[43m\x1b[30m',
  bg_cyan: '\x1b[46m\x1b[30m',
  bg_magenta: '\x1b[45m\x1b[30m',
};

// ── git data collection ──

function findRepos() {
  const repos = [];
  const projectsDir = join(ROOT, 'projects');
  
  // root repo
  if (existsSync(join(ROOT, '.git'))) repos.push(ROOT);
  
  // project repos
  if (existsSync(projectsDir)) {
    for (const d of readdirSync(projectsDir)) {
      const p = join(projectsDir, d);
      try {
        if (statSync(p).isDirectory() && existsSync(join(p, '.git'))) {
          repos.push(p);
        }
      } catch {}
    }
  }
  
  // other top-level repos
  for (const d of readdirSync(ROOT)) {
    if (d === 'projects' || d === 'node_modules' || d.startsWith('.')) continue;
    const p = join(ROOT, d);
    try {
      if (statSync(p).isDirectory() && existsSync(join(p, '.git'))) {
        repos.push(p);
      }
    } catch {}
  }
  
  return [...new Set(repos)];
}

function getCommits(repo, days) {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const raw = execSync(
      `git log --all --format="%H|%aI|%s" --since="${since}"`,
      { cwd: repo, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (!raw) return [];
    return raw.split('\n').map(line => {
      const [hash, dateStr, ...msgParts] = line.split('|');
      const date = new Date(dateStr);
      return { hash, date, msg: msgParts.join('|'), repo: repo.split('/').pop() };
    });
  } catch {
    return [];
  }
}

// ── session detection ──

const SESSION_GAP_MS = 50 * 60 * 1000; // 50 minutes

function detectSessions(commits) {
  if (!commits.length) return [];
  
  const sorted = [...commits].sort((a, b) => a.date - b.date);
  const sessions = [];
  let current = { start: sorted[0].date, end: sorted[0].date, commits: [sorted[0]] };
  
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].date - current.end;
    if (gap > SESSION_GAP_MS) {
      sessions.push(current);
      current = { start: sorted[i].date, end: sorted[i].date, commits: [sorted[i]] };
    } else {
      current.end = sorted[i].date;
      current.commits.push(sorted[i]);
    }
  }
  sessions.push(current);
  
  // add 30 min assumed work before first commit in each session
  for (const s of sessions) {
    s.adjustedStart = new Date(s.start.getTime() - 30 * 60 * 1000);
    s.durationMs = s.end - s.adjustedStart;
    s.durationMin = Math.round(s.durationMs / 60000);
    s.projects = [...new Set(s.commits.map(c => c.repo))];
    s.isDeep = s.durationMin >= 120; // 2+ hours
    s.isFlow = s.durationMin >= 180 && s.commits.length >= 6; // 3+ hours, 6+ commits
    s.isSprint = s.durationMin >= 30 && s.durationMin < 120 && s.commits.length >= 4; // short but intense
    s.commitRate = s.durationMin > 0 ? (s.commits.length / (s.durationMin / 60)).toFixed(1) : 0;
    
    // context switching: different projects within session
    s.contextSwitches = 0;
    for (let i = 1; i < s.commits.length; i++) {
      if (s.commits[i].repo !== s.commits[i - 1].repo) s.contextSwitches++;
    }
  }
  
  return sessions;
}

// ── analysis functions ──

function localHour(date) {
  return (date.getUTCHours() + TZ_OFFSET) % 24;
}

function localDayName(date) {
  // adjust to local timezone
  const local = new Date(date.getTime() + TZ_OFFSET * 3600000);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][local.getUTCDay()];
}

function localDayIndex(date) {
  const local = new Date(date.getTime() + TZ_OFFSET * 3600000);
  return local.getUTCDay();
}

function analyzeHourlyPattern(sessions) {
  const hours = new Array(24).fill(0); // minutes per hour
  const hourSessions = new Array(24).fill(0);
  
  for (const s of sessions) {
    const startH = localHour(s.adjustedStart);
    const endH = localHour(s.end);
    
    // simple: attribute session to its start hour and surrounding hours
    for (const commit of s.commits) {
      const h = localHour(commit.date);
      hours[h] += 15; // ~15 min per commit
      hourSessions[h]++;
    }
  }
  
  // find peak hours (top 4)
  const ranked = hours.map((mins, h) => ({ hour: h, mins, count: hourSessions[h] }))
    .sort((a, b) => b.mins - a.mins);
  
  const peakHours = ranked.filter(h => h.mins > 0).slice(0, 4).map(h => h.hour);
  
  // find dead hours (0 activity)
  const deadHours = ranked.filter(h => h.mins === 0).map(h => h.hour);
  
  // categorize time blocks
  const blocks = {
    earlyMorning: hours.slice(5, 9).reduce((a, b) => a + b, 0),    // 5-9
    morning: hours.slice(9, 12).reduce((a, b) => a + b, 0),         // 9-12
    afternoon: hours.slice(12, 17).reduce((a, b) => a + b, 0),      // 12-17
    evening: hours.slice(17, 21).reduce((a, b) => a + b, 0),        // 17-21
    night: hours.slice(21, 24).reduce((a, b) => a + b, 0) + hours.slice(0, 5).reduce((a, b) => a + b, 0), // 21-5
  };
  
  return { hours, hourSessions, peakHours, deadHours, blocks, ranked };
}

function analyzeDailyPattern(sessions) {
  const days = new Array(7).fill(null).map(() => ({ sessions: 0, minutes: 0, commits: 0, deep: 0 }));
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (const s of sessions) {
    const d = localDayIndex(s.adjustedStart);
    days[d].sessions++;
    days[d].minutes += s.durationMin;
    days[d].commits += s.commits.length;
    if (s.isDeep) days[d].deep++;
  }
  
  return days.map((d, i) => ({ ...d, name: dayNames[i], index: i }));
}

function analyzeBreaks(sessions) {
  if (sessions.length < 2) return { avgBreak: 0, shortBreaks: 0, longBreaks: 0, breaks: [] };
  
  const breaks = [];
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].adjustedStart - sorted[i - 1].end;
    const gapMin = Math.round(gap / 60000);
    
    // only count breaks within the same day (< 14 hours)
    if (gapMin > 0 && gapMin < 14 * 60) {
      breaks.push({
        afterSession: i - 1,
        minutes: gapMin,
        isShort: gapMin <= 30,
        isMedium: gapMin > 30 && gapMin <= 120,
        isLong: gapMin > 120,
      });
    }
  }
  
  const avgBreak = breaks.length ? Math.round(breaks.reduce((a, b) => a + b.minutes, 0) / breaks.length) : 0;
  
  return {
    avgBreak,
    shortBreaks: breaks.filter(b => b.isShort).length,
    mediumBreaks: breaks.filter(b => b.isMedium).length,
    longBreaks: breaks.filter(b => b.isLong).length,
    breaks,
    total: breaks.length,
  };
}

function analyzeFlowStates(sessions) {
  const flow = sessions.filter(s => s.isFlow);
  const deep = sessions.filter(s => s.isDeep);
  const sprints = sessions.filter(s => s.isSprint);
  const scattered = sessions.filter(s => !s.isDeep && !s.isSprint && s.commits.length <= 2);
  
  const totalMin = sessions.reduce((a, s) => a + s.durationMin, 0);
  const deepMin = deep.reduce((a, s) => a + s.durationMin, 0);
  const flowMin = flow.reduce((a, s) => a + s.durationMin, 0);
  
  return {
    flow: { count: flow.length, minutes: flowMin },
    deep: { count: deep.length, minutes: deepMin },
    sprints: { count: sprints.length, minutes: sprints.reduce((a, s) => a + s.durationMin, 0) },
    scattered: { count: scattered.length, minutes: scattered.reduce((a, s) => a + s.durationMin, 0) },
    deepRatio: totalMin > 0 ? Math.round((deepMin / totalMin) * 100) : 0,
    flowRatio: totalMin > 0 ? Math.round((flowMin / totalMin) * 100) : 0,
    totalMin,
    avgSessionMin: sessions.length ? Math.round(totalMin / sessions.length) : 0,
    contextSwitchRate: sessions.length ? (sessions.reduce((a, s) => a + s.contextSwitches, 0) / sessions.length).toFixed(1) : 0,
  };
}

function generateRecommendations(hourly, daily, breaks, flow, sessions) {
  const recs = [];
  
  // peak hours recommendation — find contiguous cluster
  if (hourly.peakHours.length >= 2) {
    // find the densest contiguous block among peak hours
    const sorted = [...hourly.peakHours].sort((a, b) => a - b);
    // find clusters (hours within 3h of each other)
    const clusters = [];
    let cluster = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - cluster[cluster.length - 1] <= 3) {
        cluster.push(sorted[i]);
      } else {
        clusters.push(cluster);
        cluster = [sorted[i]];
      }
    }
    clusters.push(cluster);
    // pick the biggest cluster
    const best = clusters.sort((a, b) => b.length - a.length)[0];
    const start = best[0];
    const end = best[best.length - 1] + 1;
    recs.push({
      type: 'deep-work',
      icon: '◉',
      text: `protect ${formatHour(start)}–${formatHour(end)} for deep work — your peak productive window`,
    });
  }
  
  // meeting scheduling
  const lowActivity = hourly.ranked.filter(h => h.mins > 0).slice(-3).map(h => h.hour).sort((a, b) => a - b);
  if (lowActivity.length) {
    const meetingSlots = lowActivity.filter(h => h >= 9 && h <= 17);
    if (meetingSlots.length) {
      recs.push({
        type: 'meetings',
        icon: '◎',
        text: `schedule meetings at ${meetingSlots.map(formatHour).join(', ')} — your lowest-energy coding hours`,
      });
    }
  }
  
  // break pattern
  if (breaks.avgBreak > 0) {
    if (breaks.avgBreak < 15) {
      recs.push({
        type: 'breaks',
        icon: '△',
        text: `avg break is ${breaks.avgBreak}min — consider longer breaks for sustained energy`,
      });
    } else if (breaks.avgBreak > 90) {
      recs.push({
        type: 'breaks',
        icon: '▽',
        text: `avg break is ${breaks.avgBreak}min — long gaps may mean context reload overhead`,
      });
    }
  }
  
  // deep work ratio
  if (flow.deepRatio < 40) {
    recs.push({
      type: 'focus',
      icon: '⚠',
      text: `only ${flow.deepRatio}% deep work — too many short sessions fragment concentration`,
    });
  } else if (flow.deepRatio >= 60) {
    recs.push({
      type: 'focus',
      icon: '✦',
      text: `${flow.deepRatio}% deep work ratio — strong focus pattern, keep it up`,
    });
  }
  
  // context switching
  if (parseFloat(flow.contextSwitchRate) > 1.5) {
    recs.push({
      type: 'switching',
      icon: '⟳',
      text: `${flow.contextSwitchRate} context switches per session — batch work by project to reduce overhead`,
    });
  }
  
  // weekend pattern
  const weekendMin = daily.filter(d => d.index === 0 || d.index === 6).reduce((a, d) => a + d.minutes, 0);
  const weekdayMin = daily.filter(d => d.index > 0 && d.index < 6).reduce((a, d) => a + d.minutes, 0);
  const weekendRatio = (weekendMin + weekdayMin) > 0 ? Math.round((weekendMin / (weekendMin + weekdayMin)) * 100) : 0;
  
  if (weekendRatio > 30) {
    recs.push({
      type: 'balance',
      icon: '⊘',
      text: `${weekendRatio}% of work on weekends — sustainable? your call, but track burnout signals`,
    });
  }
  
  // best day recommendation
  const bestDay = [...daily].sort((a, b) => b.deep - a.deep || b.minutes - a.minutes)[0];
  if (bestDay && bestDay.deep > 0) {
    recs.push({
      type: 'rhythm',
      icon: '→',
      text: `${bestDay.name} is your strongest day (${bestDay.deep} deep sessions) — schedule hardest work here`,
    });
  }
  
  // longest flow session achievement
  const longestSession = sessions.reduce((max, s) => s.durationMin > max.durationMin ? s : max, sessions[0]);
  if (longestSession && longestSession.durationMin >= 180) {
    const hrs = (longestSession.durationMin / 60).toFixed(1);
    recs.push({
      type: 'achievement',
      icon: '★',
      text: `longest flow: ${hrs}h with ${longestSession.commits.length} commits — that's ${longestSession.projects.join(' + ')}`,
    });
  }
  
  return recs;
}

// ── formatting ──

function formatHour(h) {
  return `${h.toString().padStart(2, '0')}:00`;
}

function formatDuration(min) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function bar(value, max, width = 20, filled = '█', empty = '░') {
  if (max === 0) return empty.repeat(width);
  const fill = Math.round((value / max) * width);
  return filled.repeat(Math.min(fill, width)) + empty.repeat(Math.max(width - fill, 0));
}

function heatChar(value, max) {
  if (max === 0) return '·';
  const ratio = value / max;
  if (ratio === 0) return '·';
  if (ratio < 0.25) return '░';
  if (ratio < 0.50) return '▒';
  if (ratio < 0.75) return '▓';
  return '█';
}

function renderHourlyHeatmap(hours, peakHours) {
  const max = Math.max(...hours);
  const lines = [];
  
  // header
  lines.push(`  ${c.dim}00  03  06  09  12  15  18  21${c.reset}`);
  
  // heat bar
  let heatLine = '  ';
  for (let h = 0; h < 24; h++) {
    const isPeak = peakHours.includes(h);
    const ch = heatChar(hours[h], max);
    if (isPeak) {
      heatLine += `${c.cyan}${ch}${c.reset}`;
    } else if (hours[h] > 0) {
      heatLine += `${c.green}${ch}${c.reset}`;
    } else {
      heatLine += `${c.dim}${ch}${c.reset}`;
    }
  }
  lines.push(heatLine);
  
  // time zone note
  lines.push(`  ${c.dim}(times in tallinn / UTC+2)${c.reset}`);
  
  return lines;
}

function renderDailyChart(daily) {
  const max = Math.max(...daily.map(d => d.minutes));
  const lines = [];
  
  // reorder: Mon-Sun
  const ordered = [1, 2, 3, 4, 5, 6, 0].map(i => daily[i]);
  
  for (const d of ordered) {
    const isWeekend = d.index === 0 || d.index === 6;
    const nameColor = isWeekend ? c.yellow : c.reset;
    const barColor = d.deep > 0 ? c.cyan : c.green;
    const b = bar(d.minutes, max, 15);
    const label = d.minutes > 0 ? ` ${formatDuration(d.minutes)}` : '';
    const deepLabel = d.deep > 0 ? ` ${c.dim}(${d.deep} deep)${c.reset}` : '';
    lines.push(`  ${nameColor}${d.name}${c.reset} ${barColor}${b}${c.reset}${label}${deepLabel}`);
  }
  
  return lines;
}

function renderSessionList(sessions) {
  const lines = [];
  const sorted = [...sessions].sort((a, b) => b.start - a.start);
  const show = sorted.slice(0, 15);
  
  for (const s of show) {
    const local = new Date(s.adjustedStart.getTime() + TZ_OFFSET * 3600000);
    const date = `${(local.getUTCMonth() + 1).toString().padStart(2, '0')}-${local.getUTCDate().toString().padStart(2, '0')}`;
    const startH = formatHour(localHour(s.adjustedStart));
    const endH = formatHour(localHour(s.end));
    const dur = formatDuration(s.durationMin);
    
    let tag = '';
    if (s.isFlow) tag = `${c.cyan}FLOW${c.reset}`;
    else if (s.isDeep) tag = `${c.green}DEEP${c.reset}`;
    else if (s.isSprint) tag = `${c.yellow}SPRINT${c.reset}`;
    else tag = `${c.dim}light${c.reset}`;
    
    const projects = s.projects.join('+');
    const switches = s.contextSwitches > 0 ? ` ${c.dim}⟳${s.contextSwitches}${c.reset}` : '';
    
    lines.push(`  ${c.dim}${date}${c.reset} ${startH}–${endH} ${tag} ${c.bold}${dur}${c.reset} ${c.dim}${s.commits.length}c${c.reset} ${projects}${switches}`);
  }
  
  if (sorted.length > 15) {
    lines.push(`  ${c.dim}... and ${sorted.length - 15} more sessions${c.reset}`);
  }
  
  return lines;
}

function renderFlowBreakdown(flow) {
  const lines = [];
  const items = [
    { label: 'flow (3h+, 6+ commits)', count: flow.flow.count, min: flow.flow.minutes, color: c.cyan },
    { label: 'deep (2h+)', count: flow.deep.count, min: flow.deep.minutes, color: c.green },
    { label: 'sprint (<2h, intense)', count: flow.sprints.count, min: flow.sprints.minutes, color: c.yellow },
    { label: 'scattered (quick touches)', count: flow.scattered.count, min: flow.scattered.minutes, color: c.dim },
  ];
  
  for (const item of items) {
    if (item.count > 0) {
      const pct = flow.totalMin > 0 ? Math.round((item.min / flow.totalMin) * 100) : 0;
      lines.push(`  ${item.color}${item.count}× ${item.label}${c.reset} — ${formatDuration(item.min)} (${pct}%)`);
    }
  }
  
  return lines;
}

function renderTimeBlocks(blocks) {
  const total = Object.values(blocks).reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  
  const lines = [];
  const items = [
    { label: 'early morning (05-09)', min: blocks.earlyMorning, icon: '☀' },
    { label: 'morning (09-12)', min: blocks.morning, icon: '◐' },
    { label: 'afternoon (12-17)', min: blocks.afternoon, icon: '◑' },
    { label: 'evening (17-21)', min: blocks.evening, icon: '◒' },
    { label: 'night (21-05)', min: blocks.night, icon: '◓' },
  ];
  
  for (const item of items) {
    if (item.min > 0) {
      const pct = Math.round((item.min / total) * 100);
      const b = bar(item.min, Math.max(...Object.values(blocks)), 12);
      lines.push(`  ${item.icon} ${item.label.padEnd(22)} ${c.green}${b}${c.reset} ${formatDuration(item.min)} (${pct}%)`);
    }
  }
  
  return lines;
}

// ── main ──

const repos = findRepos();
let allCommits = [];
for (const repo of repos) {
  allCommits.push(...getCommits(repo, DAYS));
}

// deduplicate by hash
const seen = new Set();
allCommits = allCommits.filter(c => {
  if (seen.has(c.hash)) return false;
  seen.add(c.hash);
  return true;
});

allCommits.sort((a, b) => a.date - b.date);

if (allCommits.length === 0) {
  console.log(`${c.dim}no commits found in the last ${DAYS} days${c.reset}`);
  process.exit(0);
}

const sessions = detectSessions(allCommits);
const hourly = analyzeHourlyPattern(sessions);
const daily = analyzeDailyPattern(sessions);
const breaks = analyzeBreaks(sessions);
const flow = analyzeFlowStates(sessions);
const recs = generateRecommendations(hourly, daily, breaks, flow, sessions);

// ── json output ──

if (jsonMode) {
  console.log(JSON.stringify({
    period: { days: DAYS, commits: allCommits.length, sessions: sessions.length },
    hourly: hourly.hours,
    peakHours: hourly.peakHours,
    daily: daily,
    breaks: { avg: breaks.avgBreak, short: breaks.shortBreaks, medium: breaks.mediumBreaks, long: breaks.longBreaks },
    flow: {
      deepRatio: flow.deepRatio,
      flowRatio: flow.flowRatio,
      avgSession: flow.avgSessionMin,
      contextSwitchRate: flow.contextSwitchRate,
    },
    sessions: sessions.map(s => ({
      start: s.adjustedStart.toISOString(),
      end: s.end.toISOString(),
      durationMin: s.durationMin,
      commits: s.commits.length,
      projects: s.projects,
      type: s.isFlow ? 'flow' : s.isDeep ? 'deep' : s.isSprint ? 'sprint' : 'scattered',
    })),
    recommendations: recs,
  }, null, 2));
  process.exit(0);
}

// ── short output ──

if (shortMode) {
  const peakStr = hourly.peakHours.slice(0, 2).map(formatHour).join('+');
  const totalH = (flow.totalMin / 60).toFixed(0);
  console.log(`pace: ${totalH}h across ${sessions.length} sessions · ${flow.deepRatio}% deep · peak ${peakStr} · avg session ${formatDuration(flow.avgSessionMin)}`);
  process.exit(0);
}

// ── full output ──

console.log();
console.log(`${c.bold}  ◉ work pace${c.reset} ${c.dim}— ${DAYS} days, ${allCommits.length} commits, ${sessions.length} sessions${c.reset}`);
console.log();

// hourly heatmap
console.log(`  ${c.bold}hourly rhythm${c.reset}`);
for (const line of renderHourlyHeatmap(hourly.hours, hourly.peakHours)) console.log(line);
console.log();

// time blocks
console.log(`  ${c.bold}time blocks${c.reset}`);
for (const line of renderTimeBlocks(hourly.blocks)) console.log(line);
console.log();

// daily pattern
console.log(`  ${c.bold}day-of-week${c.reset}`);
for (const line of renderDailyChart(daily)) console.log(line);
console.log();

// flow breakdown
console.log(`  ${c.bold}session types${c.reset}`);
for (const line of renderFlowBreakdown(flow)) console.log(line);
console.log();

// key metrics
console.log(`  ${c.bold}metrics${c.reset}`);
console.log(`  avg session     ${c.cyan}${formatDuration(flow.avgSessionMin)}${c.reset}`);
console.log(`  deep work ratio ${c.cyan}${flow.deepRatio}%${c.reset}`);
console.log(`  flow ratio      ${c.cyan}${flow.flowRatio}%${c.reset}`);
console.log(`  ctx switches    ${c.cyan}${flow.contextSwitchRate}/session${c.reset}`);
console.log(`  avg break       ${c.cyan}${breaks.avgBreak ? formatDuration(breaks.avgBreak) : 'n/a'}${c.reset} ${c.dim}(${breaks.shortBreaks} short, ${breaks.mediumBreaks || 0} medium, ${breaks.longBreaks} long)${c.reset}`);
console.log(`  total hours     ${c.cyan}${(flow.totalMin / 60).toFixed(1)}h${c.reset} ${c.dim}across ${DAYS} days${c.reset}`);
console.log();

// sessions (if requested or default show top 10)
if (sessionsMode) {
  console.log(`  ${c.bold}recent sessions${c.reset}`);
  for (const line of renderSessionList(sessions)) console.log(line);
  console.log();
}

// recommendations (always shown, or expanded with --recs)
if (recs.length > 0) {
  console.log(`  ${c.bold}recommendations${c.reset}`);
  const showRecs = recsMode ? recs : recs.slice(0, 4);
  for (const rec of showRecs) {
    console.log(`  ${rec.icon} ${rec.text}`);
  }
  if (!recsMode && recs.length > 4) {
    console.log(`  ${c.dim}  ... ${recs.length - 4} more (use --recommendations)${c.reset}`);
  }
  console.log();
}

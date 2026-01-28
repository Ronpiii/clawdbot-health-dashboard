#!/usr/bin/env node

/**
 * arc timeline — Visual timeline of work and events
 * 
 * Usage:
 *   arc timeline           Show last 7 days
 *   arc timeline 14        Show last 14 days
 *   arc timeline --commits Include git commits
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');

// Parse command line
const args = process.argv.slice(2);
const days = parseInt(args.find(a => /^\d+$/.test(a))) || 7;
const includeCommits = args.includes('--commits') || args.includes('-c');

// Get dates for past N days
function getDates(n) {
  const dates = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// Extract key events from a daily log
function extractEvents(date) {
  const logPath = join(MEMORY_DIR, `${date}.md`);
  if (!existsSync(logPath)) return [];
  
  const content = readFileSync(logPath, 'utf8');
  const events = [];
  
  // Find section headers
  const sections = content.match(/^## .+$/gm) || [];
  
  // Find completed items
  const completed = content.match(/^- (?:created|added|built|updated|fixed|shipped|completed|finished|deployed) .+$/gim) || [];
  
  // Find decisions
  const decisions = content.match(/^- \*\*decision:\*\*.+$/gim) || [];
  
  for (const section of sections) {
    events.push({ type: 'section', text: section.replace(/^## /, ''), date });
  }
  
  for (const item of completed.slice(0, 5)) {
    events.push({ type: 'done', text: item.replace(/^- /, ''), date });
  }
  
  for (const d of decisions) {
    events.push({ type: 'decision', text: d.replace(/^- \*\*decision:\*\* ?/i, ''), date });
  }
  
  return events;
}

// Get commits for a date
function getCommits(date) {
  try {
    const commits = execSync(
      `git log --oneline --format="%h %s" --since="${date} 00:00:00" --until="${date} 23:59:59" 2>/dev/null`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    return commits ? commits.split('\n').slice(0, 3) : [];
  } catch (e) {
    return [];
  }
}

// Format a date nicely
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

// Symbols for different event types
const SYMBOLS = {
  section: '◆',
  done: '✓',
  decision: '→',
  commit: '•'
};

// Colors for terminal (basic ANSI)
const COLORS = {
  section: '\x1b[36m',  // cyan
  done: '\x1b[32m',     // green
  decision: '\x1b[33m', // yellow
  commit: '\x1b[90m',   // gray
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

// Main
console.log(`\n${COLORS.bold}📅 Timeline — Last ${days} days${COLORS.reset}\n`);

const dates = getDates(days);
let hasContent = false;

for (const date of dates) {
  const events = extractEvents(date);
  const commits = includeCommits ? getCommits(date) : [];
  
  if (events.length === 0 && commits.length === 0) continue;
  
  hasContent = true;
  const isToday = date === dates[0];
  const label = isToday ? `${formatDate(date)} (today)` : formatDate(date);
  
  console.log(`${COLORS.bold}${COLORS.dim}───${COLORS.reset} ${label}`);
  console.log(`${COLORS.dim}│${COLORS.reset}`);
  
  // Show sections first
  const sections = events.filter(e => e.type === 'section');
  for (const e of sections) {
    console.log(`${COLORS.dim}│${COLORS.reset} ${COLORS.section}${SYMBOLS.section}${COLORS.reset} ${e.text}`);
  }
  
  // Show completed items
  const done = events.filter(e => e.type === 'done');
  for (const e of done) {
    console.log(`${COLORS.dim}│${COLORS.reset} ${COLORS.done}${SYMBOLS.done}${COLORS.reset} ${e.text.slice(0, 60)}${e.text.length > 60 ? '...' : ''}`);
  }
  
  // Show decisions
  const decisions = events.filter(e => e.type === 'decision');
  for (const e of decisions) {
    console.log(`${COLORS.dim}│${COLORS.reset} ${COLORS.decision}${SYMBOLS.decision}${COLORS.reset} ${e.text}`);
  }
  
  // Show commits if requested
  for (const c of commits) {
    console.log(`${COLORS.dim}│${COLORS.reset} ${COLORS.commit}${SYMBOLS.commit} ${c}${COLORS.reset}`);
  }
  
  console.log(`${COLORS.dim}│${COLORS.reset}`);
}

if (!hasContent) {
  console.log(`${COLORS.dim}No events found in the last ${days} days.${COLORS.reset}`);
}

console.log();

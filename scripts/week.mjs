#!/usr/bin/env node

/**
 * arc week — Weekly overview
 * 
 * Shows:
 * - Daily logs from the past 7 days
 * - Git commits per day
 * - Key completed items
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Get dates for past 7 days
const dates = [];
for (let i = 0; i < 7; i++) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  dates.push(d.toISOString().split('T')[0]);
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

console.log('\n📅 Past 7 Days\n');
console.log('─'.repeat(60));

let totalCompleted = 0;
let totalCommits = 0;

for (const date of dates) {
  const d = new Date(date);
  const dayName = dayNames[d.getDay()];
  const isToday = date === dates[0];
  const label = isToday ? `${date} (today)` : `${date} (${dayName})`;
  
  // Check for log file
  const logPath = join(ROOT, 'memory', `${date}.md`);
  let logInfo = '';
  let completed = 0;
  
  if (existsSync(logPath)) {
    const content = readFileSync(logPath, 'utf8');
    const headers = content.match(/^## .+$/gm) || [];
    completed = (content.match(/^  ✓|^- \[x\]/gm) || []).length;
    totalCompleted += completed;
    
    if (headers.length > 0) {
      logInfo = headers.slice(0, 3).map(h => h.replace(/^## /, '')).join(', ');
      if (headers.length > 3) logInfo += '...';
    }
  }
  
  // Count commits for this day
  let commits = 0;
  try {
    const log = execSync(
      `git log --oneline --since="${date} 00:00:00" --until="${date} 23:59:59" 2>/dev/null`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    commits = log ? log.split('\n').length : 0;
    totalCommits += commits;
  } catch (e) {}
  
  // Format output
  const stats = [];
  if (commits > 0) stats.push(`${commits} commit${commits > 1 ? 's' : ''}`);
  if (completed > 0) stats.push(`${completed} done`);
  
  const statsStr = stats.length > 0 ? ` [${stats.join(', ')}]` : '';
  
  if (logInfo || commits > 0) {
    console.log(`\n${label}${statsStr}`);
    if (logInfo) console.log(`   ${logInfo}`);
  } else {
    console.log(`\n${label} — quiet day`);
  }
}

console.log('\n' + '─'.repeat(60));
console.log(`\n📊 Week Summary: ${totalCommits} commits, ${totalCompleted} items completed\n`);

// Show any active tasks
const activePath = join(ROOT, 'tasks', 'active.md');
if (existsSync(activePath)) {
  const active = readFileSync(activePath, 'utf8');
  const inProgress = active.match(/^- \[~\] .+$/gm) || [];
  if (inProgress.length > 0) {
    console.log('🔄 Still in progress:');
    inProgress.forEach(t => {
      const task = t.replace(/^- \[~\] /, '');
      console.log(`   • ${task}`);
    });
    console.log();
  }
}

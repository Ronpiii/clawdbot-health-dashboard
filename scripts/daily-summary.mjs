#!/usr/bin/env node
/**
 * daily-summary.mjs - generate end-of-day summary
 * 
 * aggregates: completed tasks, commits, notes from today's log
 * optionally posts to Discord
 * 
 * usage:
 *   node scripts/daily-summary.mjs
 *   node scripts/daily-summary.mjs --post
 */

import { readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = '/data02/virt137413/clawd';
const LOGS_WEBHOOK = 'https://discord.com/api/webhooks/1464653461915435049/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj';

function getToday() {
  return new Date().toISOString().split('T')[0];
}

async function getCompletedTasks() {
  try {
    const content = await readFile(join(WORKSPACE, 'tasks/done.md'), 'utf-8');
    const today = getToday();
    
    // find today's section
    const lines = content.split('\n');
    const todayIdx = lines.findIndex(l => l.includes(today));
    
    if (todayIdx === -1) return [];
    
    const tasks = [];
    for (let i = todayIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) break; // next date section
      if (lines[i].match(/^- \[x\]/)) {
        tasks.push(lines[i].replace(/^- \[x\] /, ''));
      }
    }
    
    return tasks;
  } catch {
    return [];
  }
}

function getCommits() {
  try {
    const today = getToday();
    const log = execSync(
      `git log --oneline --since="${today} 00:00" --until="${today} 23:59"`,
      { cwd: WORKSPACE, encoding: 'utf-8' }
    );
    return log.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function getNotesFromLog() {
  const file = join(WORKSPACE, 'memory', `${getToday()}.md`);
  if (!existsSync(file)) return { completed: [], learnings: [] };
  
  try {
    const content = await readFile(file, 'utf-8');
    
    // extract completed items
    const completed = (content.match(/^- ✓.+$/gm) || []).map(l => l.replace(/^- ✓\s*/, ''));
    
    // extract learnings section
    const learningsMatch = content.match(/## Learnings\n([\s\S]*?)(?=\n## |$)/);
    const learnings = learningsMatch 
      ? (learningsMatch[1].match(/^- .+$/gm) || []).map(l => l.replace(/^- (\[[\d:]+\] )?/, ''))
      : [];
    
    return { completed, learnings };
  } catch {
    return { completed: [], learnings: [] };
  }
}

async function generateSummary() {
  const today = getToday();
  const tasks = await getCompletedTasks();
  const commits = getCommits();
  const notes = await getNotesFromLog();
  
  let summary = `**📊 Daily Summary — ${today}**\n\n`;
  
  // tasks completed
  if (tasks.length > 0) {
    summary += `**Tasks Completed (${tasks.length})**\n`;
    tasks.forEach(t => summary += `• ${t}\n`);
    summary += '\n';
  }
  
  // commits
  if (commits.length > 0) {
    summary += `**Commits (${commits.length})**\n`;
    commits.slice(0, 10).forEach(c => summary += `• ${c}\n`);
    if (commits.length > 10) summary += `• _...and ${commits.length - 10} more_\n`;
    summary += '\n';
  }
  
  // work logged
  if (notes.completed.length > 0) {
    summary += `**Work Logged (${notes.completed.length})**\n`;
    notes.completed.slice(0, 8).forEach(c => summary += `• ${c}\n`);
    if (notes.completed.length > 8) summary += `• _...and ${notes.completed.length - 8} more_\n`;
    summary += '\n';
  }
  
  // learnings
  if (notes.learnings.length > 0) {
    summary += `**Learnings**\n`;
    notes.learnings.forEach(l => summary += `• ${l}\n`);
    summary += '\n';
  }
  
  // stats
  const totalItems = tasks.length + commits.length + notes.completed.length;
  summary += `_${totalItems} items logged today_`;
  
  return summary;
}

async function postToDiscord(message) {
  const response = await fetch(LOGS_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      username: 'Arc Daily', 
      content: message.slice(0, 2000)
    })
  });
  
  if (!response.ok) {
    throw new Error(`Discord error: ${response.status}`);
  }
}

// main
const shouldPost = process.argv.includes('--post') || process.argv.includes('-p');

const summary = await generateSummary();
console.log(summary);

if (shouldPost) {
  console.log('\n---\nPosting to Discord...');
  await postToDiscord(summary);
  console.log('Posted!');
}

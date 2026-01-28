#!/usr/bin/env node

/**
 * arc standup — Generate work summary for standup
 * 
 * Usage:
 *   arc standup           Generate summary
 *   arc standup --post    Generate and post to Discord #logs
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1464653461915435049/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj';

// Get today and yesterday dates
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);

const todayStr = today.toISOString().split('T')[0];
const yesterdayStr = yesterday.toISOString().split('T')[0];

// Collect commits from last 24h
function getRecentCommits() {
  try {
    const commits = execSync(
      `git log --oneline --since="24 hours ago" 2>/dev/null`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    return commits ? commits.split('\n') : [];
  } catch (e) {
    return [];
  }
}

// Get sections from daily log
function getDailyLogSections(date) {
  const logPath = join(ROOT, 'memory', `${date}.md`);
  if (!existsSync(logPath)) return null;
  
  const content = readFileSync(logPath, 'utf8');
  const sections = content.match(/^## .+$/gm) || [];
  return sections.map(s => s.replace(/^## /, ''));
}

// Get completed items from log
function getCompletedItems(date) {
  const logPath = join(ROOT, 'memory', `${date}.md`);
  if (!existsSync(logPath)) return [];
  
  const content = readFileSync(logPath, 'utf8');
  const items = content.match(/^- (?:created|added|built|updated|fixed|shipped|completed|finished) .+$/gim) || [];
  return items.map(i => i.replace(/^- /, ''));
}

// Get active tasks
function getActiveTasks() {
  const activePath = join(ROOT, 'tasks', 'active.md');
  if (!existsSync(activePath)) return { inProgress: [], next: [] };
  
  const content = readFileSync(activePath, 'utf8');
  const inProgress = content.match(/^- \[~\] .+$/gm) || [];
  const backlog = content.match(/^- \[!\] .+$/gm) || [];
  
  return {
    inProgress: inProgress.map(t => t.replace(/^- \[~\] /, '')),
    next: backlog.slice(0, 2).map(t => t.replace(/^- \[!\] /, ''))
  };
}

// Generate standup message
function generateStandup() {
  const commits = getRecentCommits();
  const todaySections = getDailyLogSections(todayStr);
  const completed = [
    ...getCompletedItems(todayStr),
    ...getCompletedItems(yesterdayStr)
  ].slice(0, 5);
  const { inProgress, next } = getActiveTasks();
  
  let msg = `**📋 Standup — ${todayStr}**\n`;
  
  // What was done
  if (completed.length > 0 || commits.length > 0) {
    msg += `\n**Done:**\n`;
    if (completed.length > 0) {
      completed.slice(0, 5).forEach(c => {
        msg += `• ${c}\n`;
      });
    } else if (commits.length > 0) {
      commits.slice(0, 5).forEach(c => {
        msg += `• ${c}\n`;
      });
    }
  }
  
  // What's in progress
  if (inProgress.length > 0) {
    msg += `\n**In Progress:**\n`;
    inProgress.forEach(t => {
      msg += `• ${t}\n`;
    });
  }
  
  // What's next
  if (next.length > 0) {
    msg += `\n**Up Next:**\n`;
    next.forEach(t => {
      msg += `• ${t}\n`;
    });
  }
  
  // Summary line
  msg += `\n*${commits.length} commits in last 24h*`;
  
  return msg;
}

// Post to Discord webhook
async function postToDiscord(message) {
  const response = await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: message,
      username: 'Arc Standup'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Discord post failed: ${response.status}`);
  }
  
  return true;
}

// CLI
const args = process.argv.slice(2);
const shouldPost = args.includes('--post') || args.includes('-p');

const standup = generateStandup();

console.log('\n' + standup + '\n');

if (shouldPost) {
  try {
    await postToDiscord(standup);
    console.log('✓ Posted to Discord #logs');
  } catch (e) {
    console.error(`✗ Failed to post: ${e.message}`);
    process.exit(1);
  }
}

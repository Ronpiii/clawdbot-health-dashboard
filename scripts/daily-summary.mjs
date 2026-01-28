#!/usr/bin/env node
/**
 * daily-summary.mjs - generate and post daily workspace summary to discord
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const WEBHOOK = 'https://discord.com/api/webhooks/1464653461915435049/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

function getTodayLog() {
  const today = new Date().toISOString().split('T')[0];
  const path = `memory/${today}.md`;
  if (existsSync(path)) {
    const content = readFileSync(path, 'utf8');
    // extract key sections, limit length
    const lines = content.split('\n').slice(0, 50);
    return lines.join('\n').slice(0, 1500);
  }
  return null;
}

function getGitActivity() {
  const today = new Date().toISOString().split('T')[0];
  const logs = run(`git log --oneline --since="${today} 00:00" --until="${today} 23:59" 2>/dev/null`);
  if (logs && logs.length > 0) {
    const commits = logs.split('\n').length;
    return `${commits} commit${commits === 1 ? '' : 's'}: ${logs.split('\n').slice(0, 5).join(', ')}`;
  }
  return 'no commits today';
}

function getTaskSummary() {
  const path = 'tasks/active.md';
  if (existsSync(path)) {
    const content = readFileSync(path, 'utf8');
    const done = (content.match(/- \[x\]/g) || []).length;
    const inProgress = (content.match(/- \[~\]/g) || []).length;
    const pending = (content.match(/- \[ \]/g) || []).length;
    const blocked = (content.match(/- \[!\]/g) || []).length;
    return `✓ ${done} done | ⏳ ${inProgress} in progress | 📋 ${pending} pending | 🚫 ${blocked} blocked`;
  }
  return null;
}

async function postToDiscord(message) {
  const response = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Arc Daily',
      content: message
    })
  });
  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
}

async function main() {
  const date = new Date().toISOString().split('T')[0];
  const parts = [`**📊 Daily Summary — ${date}**\n`];
  
  // git activity
  const git = getGitActivity();
  parts.push(`**git:** ${git}`);
  
  // tasks
  const tasks = getTaskSummary();
  if (tasks) parts.push(`**tasks:** ${tasks}`);
  
  // today's log highlights
  const log = getTodayLog();
  if (log) {
    parts.push(`\n**log highlights:**\n\`\`\`\n${log.slice(0, 800)}\n\`\`\``);
  }
  
  const message = parts.join('\n');
  
  if (process.argv.includes('--dry-run')) {
    console.log(message);
  } else {
    await postToDiscord(message);
    console.log('posted daily summary to discord #logs');
  }
}

main().catch(console.error);

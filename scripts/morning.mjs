#!/usr/bin/env node
/**
 * Morning Briefing Script
 * Generates a quick summary: weather, tasks, calendar-like overview
 * 
 * Usage:
 *   node scripts/morning.mjs              # print briefing
 *   node scripts/morning.mjs --post       # post to discord #logs
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const shouldPost = args.includes('--post');

// Get weather (using wttr.in for Tallinn)
async function getWeather() {
  try {
    const res = await fetch('https://wttr.in/Tallinn?format=%c+%t+%w&m');
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim();
  } catch {
    return null;
  }
}

// Get active tasks
function getActiveTasks() {
  const tasksPath = join(ROOT, 'tasks/active.md');
  if (!existsSync(tasksPath)) return [];
  
  const content = readFileSync(tasksPath, 'utf-8');
  const tasks = [];
  
  // Find in-progress items
  const inProgressMatch = content.match(/## In Progress\n([\s\S]*?)(?=\n## |$)/);
  if (inProgressMatch) {
    const lines = inProgressMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^- \[[ ~x]\] (.+)/);
      if (match) {
        tasks.push({ type: 'in-progress', text: match[1].trim() });
      }
    }
  }
  
  // Find high priority items
  const highMatch = content.match(/## High Priority\n([\s\S]*?)(?=\n## |$)/);
  if (highMatch) {
    const lines = highMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^- \[ \] (.+)/);
      if (match) {
        tasks.push({ type: 'high', text: match[1].trim() });
      }
    }
  }
  
  return tasks.slice(0, 5); // Top 5
}

// Get yesterday's highlights from memory
function getYesterdayHighlights() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  const memPath = join(ROOT, `memory/${dateStr}.md`);
  
  if (!existsSync(memPath)) return null;
  
  const content = readFileSync(memPath, 'utf-8');
  
  // Extract first few bullet points or completed items
  const lines = content.split('\n');
  const highlights = [];
  
  for (const line of lines) {
    if (line.match(/^- \[x\]|^- ✅|^\* /)) {
      const clean = line.replace(/^- \[x\]|^- ✅|^\* /, '').trim();
      if (clean && clean.length > 5) {
        highlights.push(clean);
      }
    }
    if (highlights.length >= 3) break;
  }
  
  return highlights.length > 0 ? highlights : null;
}

// Get a random quote/thought
function getInspiration() {
  const quotes = [
    "Ship fast, fix later.",
    "The best time to plant a tree was 20 years ago. The second best time is now.",
    "Simplicity is the ultimate sophistication.",
    "Done is better than perfect.",
    "Focus on what matters, ignore the rest.",
    "Small steps lead to big changes.",
    "Build something people want.",
    "The obstacle is the way.",
    "Progress, not perfection.",
    "Make it work, make it right, make it fast.",
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

// Get day info
function getDayInfo() {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return {
    dayName: days[now.getDay()],
    date: `${months[now.getMonth()]} ${now.getDate()}`,
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
  };
}

// Post to Discord
async function postToDiscord(message) {
  const webhook = process.env.DISCORD_LOGS_WEBHOOK || 
    'https://discord.com/api/webhooks/1464653461915435049/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj';
  
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Arc',
        content: message,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Main
async function main() {
  const day = getDayInfo();
  const weather = await getWeather();
  const tasks = getActiveTasks();
  const yesterday = getYesterdayHighlights();
  const quote = getInspiration();
  
  // Build briefing
  const lines = [];
  
  // Header
  lines.push(`☀️ **Good morning!** ${day.dayName}, ${day.date}`);
  lines.push('');
  
  // Weather
  if (weather) {
    lines.push(`**Tallinn:** ${weather}`);
    lines.push('');
  }
  
  // Yesterday's wins
  if (yesterday && yesterday.length > 0) {
    lines.push('**Yesterday:**');
    for (const h of yesterday) {
      lines.push(`• ${h.slice(0, 60)}${h.length > 60 ? '...' : ''}`);
    }
    lines.push('');
  }
  
  // Today's focus
  if (tasks.length > 0) {
    const inProgress = tasks.filter(t => t.type === 'in-progress');
    const high = tasks.filter(t => t.type === 'high');
    
    if (inProgress.length > 0) {
      lines.push('**In Progress:**');
      for (const t of inProgress) {
        lines.push(`• ${t.text.slice(0, 60)}${t.text.length > 60 ? '...' : ''}`);
      }
      lines.push('');
    }
    
    if (high.length > 0) {
      lines.push('**Up Next:**');
      for (const t of high.slice(0, 2)) {
        lines.push(`• ${t.text.slice(0, 60)}${t.text.length > 60 ? '...' : ''}`);
      }
      lines.push('');
    }
  }
  
  // Quote
  lines.push(`> _${quote}_`);
  
  const briefing = lines.join('\n');
  
  console.log(briefing);
  
  if (shouldPost) {
    const ok = await postToDiscord(briefing);
    console.log(ok ? '\n✅ Posted to Discord' : '\n❌ Failed to post to Discord');
  }
}

main().catch(console.error);

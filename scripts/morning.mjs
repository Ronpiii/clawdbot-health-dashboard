#!/usr/bin/env node

/**
 * arc morning — Morning briefing
 * 
 * Shows weather, priorities, and recent activity.
 * Perfect for starting the day with context.
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Config
const LOCATION = 'Tallinn';  // Ron's location
const TZ_OFFSET = 2;         // GMT+2

// Get local time
function getLocalTime() {
  const now = new Date();
  now.setHours(now.getHours() + TZ_OFFSET);
  return now;
}

// Get weather
async function getWeather() {
  try {
    const response = await fetch(`https://wttr.in/${LOCATION}?format=%c+%t+%h+%w`);
    if (response.ok) {
      return (await response.text()).trim();
    }
  } catch (e) {}
  return null;
}

// Get priorities from tasks
function getPriorities() {
  const activePath = join(ROOT, 'tasks', 'active.md');
  if (!existsSync(activePath)) return { inProgress: [], high: [] };
  
  const content = readFileSync(activePath, 'utf8');
  const inProgress = content.match(/^- \[~\] .+$/gm) || [];
  const high = content.match(/^- \[!\] .+$/gm) || [];
  
  return {
    inProgress: inProgress.map(t => t.replace(/^- \[~\] /, '')),
    high: high.slice(0, 3).map(t => t.replace(/^- \[!\] /, ''))
  };
}

// Get yesterday's summary
function getYesterdaySummary() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  const logPath = join(ROOT, 'memory', `${dateStr}.md`);
  if (!existsSync(logPath)) return null;
  
  const content = readFileSync(logPath, 'utf8');
  const sections = content.match(/^## .+$/gm) || [];
  return sections.slice(0, 3).map(s => s.replace(/^## /, ''));
}

// Get recent commits
function getRecentCommits() {
  try {
    const commits = execSync(
      'git log --oneline -3 --since="24 hours ago" 2>/dev/null',
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    return commits ? commits.split('\n') : [];
  } catch (e) {
    return [];
  }
}

// Get open ideas count
function getIdeasCount() {
  const ideasPath = join(ROOT, 'ideas', 'IDEAS.md');
  if (!existsSync(ideasPath)) return 0;
  
  const content = readFileSync(ideasPath, 'utf8');
  const open = content.match(/^- \[ \]/gm) || [];
  return open.length;
}

// Format greeting based on time
function getGreeting() {
  const hour = getLocalTime().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

// Main
async function main() {
  const localTime = getLocalTime();
  const timeStr = localTime.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  const dateStr = localTime.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  });
  
  console.log(`\n☀️ ${getGreeting()}, Ron!`);
  console.log(`📅 ${dateStr} • ${timeStr}\n`);
  
  // Weather
  const weather = await getWeather();
  if (weather) {
    console.log(`🌤️ ${LOCATION}: ${weather}`);
    console.log();
  }
  
  // Priorities
  const { inProgress, high } = getPriorities();
  
  if (inProgress.length > 0) {
    console.log('🔄 In Progress:');
    inProgress.forEach(t => console.log(`   • ${t}`));
    console.log();
  }
  
  if (high.length > 0) {
    console.log('⚡ Up Next:');
    high.forEach(t => console.log(`   • ${t}`));
    console.log();
  }
  
  // Yesterday
  const yesterday = getYesterdaySummary();
  if (yesterday && yesterday.length > 0) {
    console.log('📝 Yesterday:');
    yesterday.forEach(s => console.log(`   • ${s}`));
    console.log();
  }
  
  // Quick stats
  const commits = getRecentCommits();
  const ideas = getIdeasCount();
  
  const stats = [];
  if (commits.length > 0) stats.push(`${commits.length} recent commits`);
  if (ideas > 0) stats.push(`${ideas} open ideas`);
  
  if (stats.length > 0) {
    console.log(`📊 ${stats.join(' • ')}`);
    console.log();
  }
  
  console.log('─'.repeat(40));
  console.log('arc today • arc standup • arc task list');
  console.log();
}

main().catch(console.error);

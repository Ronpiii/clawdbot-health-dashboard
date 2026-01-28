#!/usr/bin/env node

/**
 * arc today — Quick context for what happened today
 * 
 * Shows:
 * - Today's log file (if exists)
 * - Git commits from today
 * - Ideas captured today
 * - Quick stats
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Get today's date in various formats
const now = new Date();
const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
const shortDate = `${now.getMonth() + 1}/${now.getDate()}`; // M/D

console.log(`\n📅 Today: ${dateStr}\n`);

// 1. Today's log file
const logPath = join(ROOT, 'memory', `${dateStr}.md`);
if (existsSync(logPath)) {
  const content = readFileSync(logPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines.filter(l => l.startsWith('#'));
  
  console.log('📝 Daily Log:');
  if (headers.length > 0) {
    headers.slice(0, 5).forEach(h => console.log(`   ${h.replace(/^#+\s*/, '• ')}`));
    if (headers.length > 5) console.log(`   ... and ${headers.length - 5} more sections`);
  } else {
    console.log(`   ${lines.length} lines logged`);
  }
  console.log();
} else {
  console.log('📝 Daily Log: (not started yet)\n');
}

// 2. Git commits from today
try {
  const commits = execSync(
    `git log --oneline --since="${dateStr} 00:00:00" --until="${dateStr} 23:59:59" 2>/dev/null || git log --oneline -5 --since="24 hours ago" 2>/dev/null`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  
  if (commits) {
    console.log('🔨 Commits:');
    commits.split('\n').slice(0, 5).forEach(c => console.log(`   ${c}`));
    console.log();
  }
} catch (e) {
  // No commits or git error
}

// 3. Ideas captured today
const ideasPath = join(ROOT, 'ideas', 'IDEAS.md');
if (existsSync(ideasPath)) {
  const ideas = readFileSync(ideasPath, 'utf8');
  const todayPattern = new RegExp(`^- \\[ \\] .*\\(${dateStr}`, 'gm');
  const todayIdeas = ideas.match(todayPattern) || [];
  
  if (todayIdeas.length > 0) {
    console.log('💡 Ideas captured today:');
    todayIdeas.slice(0, 5).forEach(i => {
      const text = i.replace(/^- \[ \] /, '').replace(/\s*\(\d{4}-.*$/, '');
      console.log(`   • ${text}`);
    });
    console.log();
  }
}

// 4. Files modified today
try {
  const modified = execSync(
    `find . -name "*.md" -mtime 0 -type f 2>/dev/null | grep -v node_modules | head -10`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  
  if (modified) {
    const files = modified.split('\n').filter(f => f);
    console.log(`📁 Files touched today: ${files.length}`);
    files.slice(0, 5).forEach(f => console.log(`   ${f}`));
    if (files.length > 5) console.log(`   ... and ${files.length - 5} more`);
    console.log();
  }
} catch (e) {
  // find error
}

// 5. Quick stats
try {
  const gitStatus = execSync('git status --porcelain 2>/dev/null', { cwd: ROOT, encoding: 'utf8' });
  const uncommitted = gitStatus.trim().split('\n').filter(l => l).length;
  if (uncommitted > 0) {
    console.log(`⚠️  Uncommitted changes: ${uncommitted}`);
  }
} catch (e) {
  // git error
}

// Check for active tasks
const activePath = join(ROOT, 'tasks', 'active.md');
if (existsSync(activePath)) {
  const active = readFileSync(activePath, 'utf8');
  const inProgress = (active.match(/^- \[~\]/gm) || []).length;
  if (inProgress > 0) {
    console.log(`🔄 Tasks in progress: ${inProgress}`);
  }
}

console.log();

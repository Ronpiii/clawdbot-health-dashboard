#!/usr/bin/env node

/**
 * arc recap — 30-day (or custom) recap of work
 * 
 * Comprehensive summary: commits, projects, learnings, stats
 * 
 * Usage:
 *   arc recap           30 days
 *   arc recap 7         7 days
 *   arc recap 90        90 days
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');

// Parse args
const days = parseInt(process.argv[2]) || 30;

// Get date range
const endDate = new Date();
const startDate = new Date();
startDate.setDate(startDate.getDate() - days);

const startStr = startDate.toISOString().split('T')[0];
const endStr = endDate.toISOString().split('T')[0];

console.log(`\n📊 ${days}-Day Recap`);
console.log(`   ${startStr} → ${endStr}\n`);
console.log('═'.repeat(50));

// 1. Git Stats
console.log('\n📈 Git Activity\n');

try {
  // Total commits
  const commits = execSync(
    `git log --oneline --since="${startStr}" 2>/dev/null | wc -l`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  
  // Files changed
  const filesChanged = execSync(
    `git log --stat --since="${startStr}" 2>/dev/null | grep -E "^ .+\\|" | wc -l`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  
  // Lines added/removed
  const diffStats = execSync(
    `git log --numstat --since="${startStr}" 2>/dev/null | awk 'NF==3 {add+=$1; del+=$2} END {print add, del}'`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim().split(' ');
  
  const linesAdded = parseInt(diffStats[0]) || 0;
  const linesRemoved = parseInt(diffStats[1]) || 0;
  
  console.log(`   Commits:       ${commits}`);
  console.log(`   Files changed: ${filesChanged}`);
  console.log(`   Lines added:   +${linesAdded.toLocaleString()}`);
  console.log(`   Lines removed: -${linesRemoved.toLocaleString()}`);
  
  // Most active days
  console.log('\n   Most active days:');
  const dayStats = execSync(
    `git log --format="%ad" --date=short --since="${startStr}" 2>/dev/null | sort | uniq -c | sort -rn | head -5`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  
  if (dayStats) {
    dayStats.split('\n').forEach(line => {
      const match = line.trim().match(/(\d+)\s+(.+)/);
      if (match) {
        console.log(`     ${match[2]}: ${match[1]} commits`);
      }
    });
  }
} catch (e) {
  console.log('   (git stats unavailable)');
}

// 2. Memory Logs
console.log('\n📝 Daily Logs\n');

const logFiles = [];
if (existsSync(MEMORY_DIR)) {
  const files = readdirSync(MEMORY_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
    .filter(f => f >= `${startStr}.md` && f <= `${endStr}.md`)
    .sort();
  logFiles.push(...files);
}

console.log(`   Days logged: ${logFiles.length}`);

// Extract key sections and items
const allSections = [];
const allCompleted = [];
const allLearnings = [];

for (const file of logFiles) {
  const content = readFileSync(join(MEMORY_DIR, file), 'utf8');
  
  // Sections
  const sections = content.match(/^## .+$/gm) || [];
  allSections.push(...sections.map(s => s.replace(/^## /, '')));
  
  // Completed items
  const completed = content.match(/^- (?:created|added|built|updated|fixed|shipped|completed|finished|deployed) .+$/gim) || [];
  allCompleted.push(...completed.map(c => c.replace(/^- /, '')));
  
  // Learnings
  const learnings = content.match(/^- .+learned.+$|^- .+lesson.+$|^- .+realized.+$/gim) || [];
  allLearnings.push(...learnings.map(l => l.replace(/^- /, '')));
}

console.log(`   Completed items: ${allCompleted.length}`);

// 3. Projects Touched
console.log('\n🗂️  Projects Touched\n');

try {
  const projectChanges = execSync(
    `git log --name-only --since="${startStr}" 2>/dev/null | grep -E "^projects/" | cut -d'/' -f2 | sort | uniq -c | sort -rn`,
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  
  if (projectChanges) {
    projectChanges.split('\n').slice(0, 5).forEach(line => {
      const match = line.trim().match(/(\d+)\s+(.+)/);
      if (match) {
        console.log(`   ${match[2]}: ${match[1]} changes`);
      }
    });
  } else {
    console.log('   (no project changes)');
  }
} catch (e) {
  console.log('   (project stats unavailable)');
}

// 4. Key Themes (common sections)
console.log('\n🎯 Key Themes\n');

const sectionCounts = {};
for (const section of allSections) {
  const normalized = section.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  if (normalized && normalized.length > 2) {
    sectionCounts[normalized] = (sectionCounts[normalized] || 0) + 1;
  }
}

const topThemes = Object.entries(sectionCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

if (topThemes.length > 0) {
  topThemes.forEach(([theme, count]) => {
    console.log(`   ${theme}: ${count}x`);
  });
} else {
  console.log('   (no themes detected)');
}

// 5. Highlights (sample of completed items)
console.log('\n✨ Highlights\n');

const highlights = allCompleted
  .filter(c => c.length > 20)
  .slice(0, 8);

if (highlights.length > 0) {
  highlights.forEach(h => {
    const truncated = h.length > 70 ? h.slice(0, 67) + '...' : h;
    console.log(`   • ${truncated}`);
  });
} else {
  console.log('   (no highlights captured)');
}

// 6. Ideas & Tasks
console.log('\n💡 Ideas & Tasks\n');

const ideasPath = join(ROOT, 'ideas', 'IDEAS.md');
if (existsSync(ideasPath)) {
  const ideas = readFileSync(ideasPath, 'utf8');
  const openIdeas = (ideas.match(/^- \[ \]/gm) || []).length;
  const doneIdeas = (ideas.match(/^- \[x\]/gm) || []).length;
  console.log(`   Ideas: ${openIdeas} open, ${doneIdeas} completed`);
}

const activePath = join(ROOT, 'tasks', 'active.md');
if (existsSync(activePath)) {
  const tasks = readFileSync(activePath, 'utf8');
  const inProgress = (tasks.match(/^- \[~\]/gm) || []).length;
  const backlog = (tasks.match(/^- \[!\]/gm) || []).length;
  const done = (tasks.match(/^- \[x\]/gm) || []).length;
  console.log(`   Tasks: ${inProgress} in progress, ${backlog} backlog, ${done} done`);
}

// Summary
console.log('\n' + '═'.repeat(50));
console.log(`\n📋 Summary: ${days} days, ${logFiles.length} logs, ${allCompleted.length} items shipped\n`);

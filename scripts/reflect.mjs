#!/usr/bin/env node
/**
 * reflect.mjs - generate reflection prompts for self-improvement
 * 
 * analyzes recent activity and suggests areas for reflection
 * 
 * usage: node scripts/reflect.mjs [days=7]
 */

import { readFile, readdir } from 'fs/promises';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = '/data02/virt137413/clawd';

async function getRecentLogs(days = 7) {
  const memoryDir = join(WORKSPACE, 'memory');
  const files = await readdir(memoryDir);
  
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const logs = [];
  
  for (const file of files) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    
    const fileDate = new Date(match[1]).getTime();
    if (fileDate >= cutoff) {
      const content = await readFile(join(memoryDir, file), 'utf-8');
      logs.push({ date: match[1], content });
    }
  }
  
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

async function getCommitStats(days = 7) {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    const log = execSync(
      `git log --oneline --since="${since}"`,
      { cwd: WORKSPACE, encoding: 'utf-8' }
    );
    
    return log.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function getCompletedTasks(days = 7) {
  try {
    const content = await readFile(join(WORKSPACE, 'tasks/done.md'), 'utf-8');
    const lines = content.split('\n');
    
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    let inRange = false;
    const tasks = [];
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        const date = line.replace('## ', '').trim();
        inRange = date >= cutoff;
      } else if (inRange && line.match(/^- \[x\]/)) {
        tasks.push(line.replace(/^- \[x\] /, ''));
      }
    }
    
    return tasks;
  } catch {
    return [];
  }
}

async function getSearchGaps() {
  const logFile = join(WORKSPACE, 'memory', 'search-log.jsonl');
  if (!existsSync(logFile)) return [];
  
  try {
    const content = await readFile(logFile, 'utf-8');
    const searches = content.trim().split('\n')
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    
    return [...new Set(searches.filter(s => s.n === 0).map(s => s.q))];
  } catch {
    return [];
  }
}

// main
const days = parseInt(process.argv[2]) || 7;

console.log(`\n🔮 reflection prompts (last ${days} days)\n`);

const [logs, commits, tasks, gaps] = await Promise.all([
  getRecentLogs(days),
  getCommitStats(days),
  getCompletedTasks(days),
  getSearchGaps()
]);

console.log(`📊 activity summary:`);
console.log(`   ${commits} commits`);
console.log(`   ${tasks.length} tasks completed`);
console.log(`   ${logs.length} days logged`);
console.log('');

console.log(`✅ what went well?`);
if (tasks.length > 0) {
  console.log(`   completed: ${tasks.slice(0, 3).join(', ')}`);
}
console.log('');

console.log(`🤔 reflection questions:`);
console.log(`   • what was the most impactful work done?`);
console.log(`   • what patterns are emerging in the work?`);
console.log(`   • what could be automated or improved?`);
console.log(`   • are there any blockers that have been sitting too long?`);
console.log('');

if (gaps.length > 0) {
  console.log(`🔍 memory gaps (searches with no results):`);
  gaps.slice(0, 5).forEach(g => console.log(`   • "${g}"`));
  console.log('   → consider adding this information to memory');
  console.log('');
}

console.log(`📝 suggested actions:`);
console.log(`   • run: ./scripts/arc compress 7   (review old logs)`);
console.log(`   • run: ./scripts/arc summary --post   (share progress)`);
console.log(`   • update: MEMORY.md with key learnings`);
console.log('');

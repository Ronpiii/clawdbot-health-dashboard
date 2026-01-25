#!/usr/bin/env node
/**
 * status.mjs - quick workspace status check
 * 
 * usage: node scripts/status.mjs
 */

import { readFile, stat } from 'fs/promises';
import { execSync } from 'child_process';
import { join } from 'path';

const WORKSPACE = '/data02/virt137413/clawd';

async function getGitStatus() {
  try {
    const status = execSync('git status --short', { cwd: WORKSPACE, encoding: 'utf-8' });
    const lines = status.trim().split('\n').filter(Boolean);
    return {
      uncommitted: lines.length,
      files: lines.slice(0, 5).map(l => l.trim())
    };
  } catch {
    return { uncommitted: 0, files: [] };
  }
}

async function getLastCommit() {
  try {
    return execSync('git log --oneline -1', { cwd: WORKSPACE, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function getActiveTasks() {
  try {
    const content = await readFile(join(WORKSPACE, 'tasks/active.md'), 'utf-8');
    const inProgress = content.match(/^- \[~\].+$/gm) || [];
    const todo = content.match(/^- \[ \].+$/gm) || [];
    return {
      inProgress: inProgress.map(t => t.replace(/^- \[~\] /, '')),
      backlog: todo.length
    };
  } catch {
    return { inProgress: [], backlog: 0 };
  }
}

async function getMemoryStats() {
  try {
    const index = JSON.parse(await readFile(join(WORKSPACE, 'memory/keyword-index.json'), 'utf-8'));
    return {
      terms: Object.keys(index.terms).length,
      files: Object.keys(index.files).length,
      built: index.built
    };
  } catch {
    return { terms: 0, files: 0, built: 'never' };
  }
}

async function getRecentMemory() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const files = [];
  for (const date of [today, yesterday]) {
    try {
      const s = await stat(join(WORKSPACE, `memory/${date}.md`));
      files.push({ date, size: s.size, modified: s.mtime });
    } catch {}
  }
  return files;
}

// main
const [git, lastCommit, tasks, memory, recentMemory] = await Promise.all([
  getGitStatus(),
  getLastCommit(),
  getActiveTasks(),
  getMemoryStats(),
  getRecentMemory()
]);

console.log('=== workspace status ===\n');

console.log('git:');
console.log(`  last commit: ${lastCommit}`);
console.log(`  uncommitted: ${git.uncommitted} files`);
if (git.files.length) {
  git.files.forEach(f => console.log(`    ${f}`));
}

console.log('\ntasks:');
if (tasks.inProgress.length) {
  console.log('  in progress:');
  tasks.inProgress.forEach(t => console.log(`    - ${t}`));
}
console.log(`  backlog: ${tasks.backlog} items`);

console.log('\nmemory index:');
console.log(`  ${memory.terms} terms, ${memory.files} files`);
console.log(`  built: ${memory.built}`);

console.log('\nrecent memory files:');
recentMemory.forEach(f => {
  console.log(`  ${f.date}: ${f.size} bytes, modified ${f.modified.toISOString()}`);
});

console.log('\n========================');

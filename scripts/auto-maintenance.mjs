#!/usr/bin/env node
/**
 * auto-maintenance.mjs - automated workspace maintenance
 * 
 * runs during idle periods to keep workspace healthy:
 * - rebuilds index if stale
 * - commits routine changes
 * - checks for issues
 * 
 * usage: node scripts/auto-maintenance.mjs
 */

import { readFile, stat } from 'fs/promises';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = '/data02/virt137413/clawd';

async function rebuildIndexIfNeeded() {
  const indexPath = join(WORKSPACE, 'memory', 'keyword-index.json');
  const memoryPath = join(WORKSPACE, 'MEMORY.md');
  
  try {
    const indexStat = await stat(indexPath);
    const memoryStat = await stat(memoryPath);
    
    // rebuild if MEMORY.md is newer than index
    if (memoryStat.mtime > indexStat.mtime) {
      console.log('rebuilding index (MEMORY.md changed)...');
      execSync('node scripts/memory-index.mjs build', { cwd: WORKSPACE });
      return true;
    }
    
    // check memory/*.md files
    const memoryDir = join(WORKSPACE, 'memory');
    const today = new Date().toISOString().split('T')[0];
    const todayLog = join(memoryDir, `${today}.md`);
    
    if (existsSync(todayLog)) {
      const todayStat = await stat(todayLog);
      if (todayStat.mtime > indexStat.mtime) {
        console.log('rebuilding index (daily log changed)...');
        execSync('node scripts/memory-index.mjs build', { cwd: WORKSPACE });
        return true;
      }
    }
    
    console.log('index is current');
    return false;
  } catch (err) {
    console.log('rebuilding index (missing or error)...');
    execSync('node scripts/memory-index.mjs build', { cwd: WORKSPACE });
    return true;
  }
}

function commitRoutineChanges() {
  try {
    // check for uncommitted changes
    const status = execSync('git status --short', { cwd: WORKSPACE, encoding: 'utf-8' });
    const lines = status.trim().split('\n').filter(Boolean);
    
    // filter for routine files we can auto-commit
    const routinePatterns = [
      /memory\/heartbeat-state\.json/,
      /memory\/keyword-index\.json/,
      /memory\/\d{4}-\d{2}-\d{2}\.md/
    ];
    
    const routineFiles = [];
    const otherFiles = [];
    
    for (const line of lines) {
      const file = line.slice(3).trim();
      if (routinePatterns.some(p => p.test(file))) {
        routineFiles.push(file);
      } else if (!line.startsWith(' m ')) { // ignore submodule changes
        otherFiles.push(file);
      }
    }
    
    if (routineFiles.length > 0) {
      console.log(`auto-committing ${routineFiles.length} routine files...`);
      for (const file of routineFiles) {
        execSync(`git add "${file}"`, { cwd: WORKSPACE });
      }
      execSync('git commit -m "Auto-maintenance: sync routine files"', { cwd: WORKSPACE });
      return true;
    }
    
    if (otherFiles.length > 0) {
      console.log(`${otherFiles.length} non-routine files need manual commit`);
    }
    
    return false;
  } catch (err) {
    // no changes or error
    return false;
  }
}

function checkHealth() {
  const issues = [];
  
  // check disk space (simple heuristic)
  try {
    const df = execSync('df -h . | tail -1', { cwd: WORKSPACE, encoding: 'utf-8' });
    const parts = df.trim().split(/\s+/);
    const usePercent = parseInt(parts[4]);
    if (usePercent > 90) {
      issues.push(`disk usage high: ${usePercent}%`);
    }
  } catch {}
  
  // check for stale tasks
  try {
    const active = execSync('grep -c "\\[~\\]" tasks/active.md || echo 0', { 
      cwd: WORKSPACE, 
      encoding: 'utf-8' 
    });
    const inProgress = parseInt(active.trim());
    if (inProgress > 5) {
      issues.push(`${inProgress} tasks in progress - may need review`);
    }
  } catch {}
  
  return issues;
}

// main
console.log('=== auto-maintenance ===\n');

const indexRebuilt = await rebuildIndexIfNeeded();
const committed = commitRoutineChanges();
const issues = checkHealth();

console.log('\n--- summary ---');
console.log(`index: ${indexRebuilt ? 'rebuilt' : 'current'}`);
console.log(`auto-commit: ${committed ? 'yes' : 'no changes'}`);

if (issues.length > 0) {
  console.log('\n⚠️ issues:');
  issues.forEach(i => console.log(`  - ${i}`));
} else {
  console.log('health: ok');
}

console.log('\n=== done ===');

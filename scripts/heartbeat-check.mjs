#!/usr/bin/env node
/**
 * heartbeat-check.mjs - consolidated heartbeat checks
 * 
 * runs all standard heartbeat checks and returns actionable items
 * 
 * usage: node scripts/heartbeat-check.mjs
 */

import { readFile, writeFile, stat } from 'fs/promises';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = '/data02/virt137413/clawd';
const STATE_FILE = join(WORKSPACE, 'memory', 'heartbeat-state.json');

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf-8'));
  } catch {
    return { lastChecks: {}, lastHeartbeat: 0 };
  }
}

async function saveState(state) {
  state.lastHeartbeat = Date.now();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function hoursSince(timestamp) {
  if (!timestamp) return Infinity;
  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

async function checkGit() {
  try {
    const status = execSync('git status --short', { cwd: WORKSPACE, encoding: 'utf-8' });
    const lines = status.trim().split('\n').filter(Boolean);
    const uncommitted = lines.filter(l => !l.startsWith(' m ')); // ignore submodule changes
    return {
      hasChanges: uncommitted.length > 0,
      count: uncommitted.length,
      files: uncommitted.slice(0, 5)
    };
  } catch {
    return { hasChanges: false, count: 0, files: [] };
  }
}

async function checkTasks() {
  try {
    const content = await readFile(join(WORKSPACE, 'tasks/active.md'), 'utf-8');
    const inProgress = (content.match(/^- \[~\].+$/gm) || []).map(t => t.replace(/^- \[~\] /, ''));
    const blocked = inProgress.filter(t => /waiting|blocked/i.test(t));
    const actionable = inProgress.filter(t => !/waiting|blocked/i.test(t));
    return { inProgress, blocked, actionable };
  } catch {
    return { inProgress: [], blocked: [], actionable: [] };
  }
}

async function checkMemoryIndex() {
  try {
    const indexPath = join(WORKSPACE, 'memory', 'keyword-index.json');
    const indexStat = await stat(indexPath);
    const index = JSON.parse(await readFile(indexPath, 'utf-8'));
    
    // check if any memory files are newer than index
    const memoryFiles = ['MEMORY.md', 'memory/'];
    let needsRebuild = false;
    
    for (const file of memoryFiles) {
      try {
        const fileStat = await stat(join(WORKSPACE, file));
        if (fileStat.mtime > indexStat.mtime) {
          needsRebuild = true;
          break;
        }
      } catch {}
    }
    
    return {
      terms: Object.keys(index.terms).length,
      files: Object.keys(index.files).length,
      built: index.built,
      needsRebuild
    };
  } catch {
    return { terms: 0, files: 0, built: null, needsRebuild: true };
  }
}

async function runChecks() {
  const state = await loadState();
  const actions = [];
  const info = [];

  // git check
  const git = await checkGit();
  if (git.hasChanges) {
    actions.push(`git: ${git.count} uncommitted changes`);
  } else {
    info.push('git: clean');
  }

  // tasks check
  const tasks = await checkTasks();
  if (tasks.actionable.length > 0) {
    actions.push(`tasks: ${tasks.actionable.length} actionable in progress`);
  }
  if (tasks.blocked.length > 0) {
    info.push(`tasks: ${tasks.blocked.length} blocked/waiting`);
  }

  // memory index check
  const memory = await checkMemoryIndex();
  if (memory.needsRebuild) {
    actions.push('memory: index needs rebuild');
  } else {
    info.push(`memory: ${memory.terms} terms indexed`);
  }

  // time since last heartbeat
  const hoursSinceLast = hoursSince(state.lastHeartbeat);
  if (hoursSinceLast > 4) {
    info.push(`last heartbeat: ${hoursSinceLast.toFixed(1)}h ago`);
  }

  // save state
  state.lastChecks.git = Date.now();
  state.lastChecks.tasks = Date.now();
  state.lastChecks.memory = Date.now();
  await saveState(state);

  return { actions, info };
}

// main
const { actions, info } = await runChecks();

if (actions.length === 0) {
  console.log('HEARTBEAT_OK');
  if (info.length > 0) {
    console.log('\ninfo:');
    info.forEach(i => console.log(`  • ${i}`));
  }
} else {
  console.log('NEEDS ATTENTION:\n');
  actions.forEach(a => console.log(`  ⚠️  ${a}`));
  if (info.length > 0) {
    console.log('\ninfo:');
    info.forEach(i => console.log(`  • ${i}`));
  }
}

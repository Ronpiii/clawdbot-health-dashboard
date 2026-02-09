#!/usr/bin/env node
/**
 * arc diff — workspace changelog since last check
 * 
 * answers: "what changed while i was away?"
 * scans all git repos for commits, memory files for changes,
 * tasks for completions, and shows a unified diff summary.
 * 
 * usage:
 *   arc diff                    since yesterday (24h)
 *   arc diff --hours 8          last 8 hours
 *   arc diff --days 3           last 3 days
 *   arc diff --since 2026-02-07 since specific date
 *   arc diff --short            one-line summary
 *   arc diff --json             machine-readable
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, basename, relative } from 'path';

const WORKSPACE = process.env.CLAWD_WORKSPACE || '/data02/virt137413/clawd';
const MAX_DEPTH = 3;

// ── parse args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
let hours = 24;
let sinceDate = null;
const shortMode = args.includes('--short');
const jsonMode = args.includes('--json');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--hours' && args[i + 1]) {
    hours = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--days' && args[i + 1]) {
    hours = parseInt(args[i + 1], 10) * 24;
    i++;
  } else if (args[i] === '--since' && args[i + 1]) {
    sinceDate = args[i + 1];
    i++;
  }
}

const since = sinceDate
  ? new Date(sinceDate + 'T00:00:00Z')
  : new Date(Date.now() - hours * 60 * 60 * 1000);

const sinceISO = since.toISOString();
const sinceStr = sinceDate || `${hours}h ago`;

// ── git helpers ─────────────────────────────────────────────────────
function git(repoPath, cmd) {
  try {
    return execSync(`git -C "${repoPath}" ${cmd}`, {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch { return ''; }
}

function findGitRepos(dir, depth = 0) {
  const repos = [];
  if (depth > MAX_DEPTH) return repos;
  try {
    if (existsSync(join(dir, '.git')) && statSync(join(dir, '.git')).isDirectory()) {
      repos.push(dir);
    }
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      repos.push(...findGitRepos(join(dir, entry.name), depth + 1));
    }
  } catch { /* skip */ }
  return repos;
}

// ── gather git changes ──────────────────────────────────────────────
function getRepoChanges(repoPath) {
  const name = relative(WORKSPACE, repoPath) || basename(repoPath);
  
  // commits since cutoff
  const logRaw = git(repoPath, `log --since="${sinceISO}" --format="%H|%s|%an|%ci" --no-merges`);
  const commits = logRaw ? logRaw.split('\n').filter(Boolean).map(line => {
    const [hash, msg, author, date] = line.split('|');
    return { hash: hash?.slice(0, 7), msg, author, date };
  }) : [];
  
  if (commits.length === 0) return null;
  
  // diffstat for the period
  const firstCommit = commits[commits.length - 1]?.hash;
  const lastCommit = commits[0]?.hash;
  let insertions = 0, deletions = 0, filesChanged = 0;
  
  if (firstCommit && lastCommit) {
    // get stat from parent of first commit to last commit
    const parentRef = `${firstCommit}~1`;
    const diffStat = git(repoPath, `diff --shortstat ${parentRef}..${lastCommit} 2>/dev/null`)
      || git(repoPath, `diff --shortstat ${firstCommit}..${lastCommit} 2>/dev/null`);
    
    if (diffStat) {
      const filesMatch = diffStat.match(/(\d+) files? changed/);
      const insMatch = diffStat.match(/(\d+) insertions?/);
      const delMatch = diffStat.match(/(\d+) deletions?/);
      filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
      insertions = insMatch ? parseInt(insMatch[1]) : 0;
      deletions = delMatch ? parseInt(delMatch[1]) : 0;
    }
  }
  
  // changed file paths (for categorization)
  const changedFiles = git(repoPath, 
    `diff --name-only ${firstCommit}~1..${lastCommit} 2>/dev/null`)
    || git(repoPath, `diff --name-only ${firstCommit}..${lastCommit} 2>/dev/null`);
  const files = changedFiles ? changedFiles.split('\n').filter(Boolean) : [];
  
  return {
    name, commits, insertions, deletions, filesChanged,
    files, path: repoPath
  };
}

// ── gather memory changes ───────────────────────────────────────────
function getMemoryChanges() {
  const memDir = join(WORKSPACE, 'memory');
  if (!existsSync(memDir)) return { created: [], modified: [] };
  
  const created = [];
  const modified = [];
  
  try {
    const entries = readdirSync(memDir).filter(f => f.endsWith('.md'));
    for (const file of entries) {
      const fullPath = join(memDir, file);
      const stat = statSync(fullPath);
      const birthTime = stat.birthtime || stat.ctime;
      const modTime = stat.mtime;
      
      if (birthTime >= since) {
        created.push({ file, time: birthTime });
      } else if (modTime >= since) {
        modified.push({ file, time: modTime });
      }
    }
  } catch { /* skip */ }
  
  // also check MEMORY.md
  const memoryMd = join(WORKSPACE, 'MEMORY.md');
  if (existsSync(memoryMd)) {
    const stat = statSync(memoryMd);
    if (stat.mtime >= since) {
      modified.push({ file: 'MEMORY.md', time: stat.mtime });
    }
  }
  
  return { created, modified };
}

// ── gather task changes ─────────────────────────────────────────────
function getTaskChanges() {
  const results = { completed: [], added: [] };
  
  // check tasks/done.md for recently completed items
  const donePath = join(WORKSPACE, 'tasks', 'done.md');
  if (existsSync(donePath)) {
    try {
      const content = readFileSync(donePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        // look for date patterns near done items
        const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const itemDate = new Date(dateMatch[1] + 'T12:00:00Z');
          if (itemDate >= since) {
            results.completed.push(line.replace(/^[-*]\s*(\[x\]\s*)?/, '').trim());
          }
        }
      }
    } catch { /* skip */ }
  }
  
  return results;
}

// ── categorize changes ──────────────────────────────────────────────
function categorizeFiles(files) {
  const categories = {
    scripts: 0,
    config: 0,
    docs: 0,
    src: 0,
    styles: 0,
    tests: 0,
    other: 0
  };
  
  for (const f of files) {
    if (f.match(/scripts?\//i) || f.endsWith('.mjs') || f.endsWith('.sh')) categories.scripts++;
    else if (f.match(/\.(json|yml|yaml|toml|env|config)/i)) categories.config++;
    else if (f.match(/\.(md|txt|doc)/i)) categories.docs++;
    else if (f.match(/\.(css|scss|less)/i)) categories.styles++;
    else if (f.match(/test|spec/i)) categories.tests++;
    else if (f.match(/\.(js|ts|jsx|tsx|mjs)/i)) categories.src++;
    else categories.other++;
  }
  
  return Object.fromEntries(Object.entries(categories).filter(([_, v]) => v > 0));
}

// ── format helpers ──────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgDim: '\x1b[48;5;236m',
};

function diffBar(insertions, deletions, width = 20) {
  const total = insertions + deletions;
  if (total === 0) return '';
  const insWidth = Math.round((insertions / total) * width) || (insertions > 0 ? 1 : 0);
  const delWidth = Math.round((deletions / total) * width) || (deletions > 0 ? 1 : 0);
  return `${C.green}${'█'.repeat(insWidth)}${C.red}${'█'.repeat(delWidth)}${C.reset}`;
}

function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── main ────────────────────────────────────────────────────────────
function main() {
  const repos = findGitRepos(WORKSPACE);
  const repoChanges = repos.map(getRepoChanges).filter(Boolean);
  const memChanges = getMemoryChanges();
  const taskChanges = getTaskChanges();
  
  // totals
  const totalCommits = repoChanges.reduce((s, r) => s + r.commits.length, 0);
  const totalInsertions = repoChanges.reduce((s, r) => s + r.insertions, 0);
  const totalDeletions = repoChanges.reduce((s, r) => s + r.deletions, 0);
  const totalFiles = repoChanges.reduce((s, r) => s + r.filesChanged, 0);
  const totalMemory = memChanges.created.length + memChanges.modified.length;
  const totalTasks = taskChanges.completed.length;
  
  // json mode
  if (jsonMode) {
    console.log(JSON.stringify({
      since: sinceISO,
      sinceLabel: sinceStr,
      repos: repoChanges,
      memory: memChanges,
      tasks: taskChanges,
      totals: { commits: totalCommits, insertions: totalInsertions, 
                deletions: totalDeletions, files: totalFiles,
                memoryChanges: totalMemory, tasksCompleted: totalTasks }
    }, null, 2));
    return;
  }
  
  // short mode
  if (shortMode) {
    const parts = [];
    if (totalCommits) parts.push(`${totalCommits} commits`);
    if (totalFiles) parts.push(`${totalFiles} files`);
    if (totalInsertions) parts.push(`+${totalInsertions}`);
    if (totalDeletions) parts.push(`-${totalDeletions}`);
    if (totalMemory) parts.push(`${totalMemory} memory files`);
    if (totalTasks) parts.push(`${totalTasks} tasks done`);
    if (parts.length === 0) {
      console.log(`nothing changed since ${sinceStr}`);
    } else {
      console.log(`since ${sinceStr}: ${parts.join(', ')}`);
    }
    return;
  }
  
  // full mode
  const hasAnything = totalCommits || totalMemory || totalTasks;
  
  console.log();
  console.log(`${C.bold}${C.cyan}  WORKSPACE DIFF${C.reset}  ${C.dim}since ${sinceStr} (${since.toISOString().slice(0, 16)}Z)${C.reset}`);
  console.log(`${C.dim}  ${'─'.repeat(55)}${C.reset}`);
  
  if (!hasAnything) {
    console.log();
    console.log(`  ${C.dim}nothing changed. quiet period.${C.reset}`);
    console.log();
    return;
  }
  
  // ── overview bar ────────────────────────────────────────────────
  console.log();
  const overviewParts = [];
  if (totalCommits) overviewParts.push(`${C.bold}${totalCommits}${C.reset} commits`);
  if (totalFiles) overviewParts.push(`${C.bold}${totalFiles}${C.reset} files`);
  if (totalInsertions || totalDeletions) {
    overviewParts.push(`${C.green}+${totalInsertions}${C.reset} ${C.red}-${totalDeletions}${C.reset}`);
  }
  if (repoChanges.length > 1) overviewParts.push(`across ${C.bold}${repoChanges.length}${C.reset} repos`);
  console.log(`  ${overviewParts.join('  |  ')}`);
  if (totalInsertions || totalDeletions) {
    console.log(`  ${diffBar(totalInsertions, totalDeletions, 40)}`);
  }
  
  // ── per-repo breakdown ──────────────────────────────────────────
  for (const repo of repoChanges) {
    console.log();
    console.log(`  ${C.bold}${C.yellow}${repo.name}${C.reset}  ${C.dim}(${repo.commits.length} commits, ${repo.filesChanged} files)${C.reset}`);
    console.log(`  ${C.green}+${repo.insertions}${C.reset} ${C.red}-${repo.deletions}${C.reset}  ${diffBar(repo.insertions, repo.deletions, 25)}`);
    
    // show file categories
    const cats = categorizeFiles(repo.files);
    if (Object.keys(cats).length > 0) {
      const catStr = Object.entries(cats)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
        .join('  ');
      console.log(`  ${C.dim}${catStr}${C.reset}`);
    }
    
    // show commits (last 8 max)
    const showCommits = repo.commits.slice(0, 8);
    for (const c of showCommits) {
      const age = timeAgo(c.date);
      const msg = c.msg?.length > 60 ? c.msg.slice(0, 57) + '...' : c.msg;
      console.log(`  ${C.dim}${c.hash}${C.reset}  ${msg}  ${C.dim}${age}${C.reset}`);
    }
    if (repo.commits.length > 8) {
      console.log(`  ${C.dim}... and ${repo.commits.length - 8} more${C.reset}`);
    }
  }
  
  // ── memory changes ──────────────────────────────────────────────
  if (totalMemory > 0) {
    console.log();
    console.log(`  ${C.bold}${C.magenta}memory${C.reset}`);
    
    for (const f of memChanges.created) {
      console.log(`  ${C.green}+ ${f.file}${C.reset}  ${C.dim}created${C.reset}`);
    }
    for (const f of memChanges.modified) {
      console.log(`  ${C.yellow}~ ${f.file}${C.reset}  ${C.dim}modified${C.reset}`);
    }
  }
  
  // ── task completions ──────────────────────────────────────────
  if (totalTasks > 0) {
    console.log();
    console.log(`  ${C.bold}${C.green}completed tasks${C.reset}`);
    for (const t of taskChanges.completed.slice(0, 10)) {
      const display = t.length > 70 ? t.slice(0, 67) + '...' : t;
      console.log(`  ${C.green}[x]${C.reset} ${display}`);
    }
    if (taskChanges.completed.length > 10) {
      console.log(`  ${C.dim}... and ${taskChanges.completed.length - 10} more${C.reset}`);
    }
  }
  
  // ── activity heatmap (by hour) ────────────────────────────────
  if (totalCommits >= 3) {
    const hourBuckets = new Array(24).fill(0);
    for (const repo of repoChanges) {
      for (const c of repo.commits) {
        const h = new Date(c.date).getUTCHours();
        hourBuckets[h]++;
      }
    }
    
    const maxBucket = Math.max(...hourBuckets);
    if (maxBucket > 0) {
      console.log();
      console.log(`  ${C.bold}activity${C.reset}  ${C.dim}(UTC hours)${C.reset}`);
      
      const blocks = [' ', '░', '▒', '▓', '█'];
      let heatLine = '  ';
      for (let h = 0; h < 24; h++) {
        const intensity = Math.round((hourBuckets[h] / maxBucket) * 4);
        heatLine += `${C.cyan}${blocks[intensity]}${C.reset}`;
      }
      console.log(heatLine);
      console.log(`  ${C.dim}0         8         16        23${C.reset}`);
    }
  }
  
  console.log();
}

main();

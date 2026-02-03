#!/usr/bin/env node
/**
 * arc git — multi-repo git dashboard
 * 
 * scans all git repos in workspace, shows:
 * - branch, uncommitted changes, unpushed commits
 * - last commit age, author
 * - stale branch warnings
 * 
 * usage:
 *   arc git              full dashboard
 *   arc git --short      one-liner per repo
 *   arc git --json       machine-readable output
 *   arc git <repo>       filter to one repo
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, basename, relative } from 'path';

const WORKSPACE = process.env.CLAWD_WORKSPACE || join(process.cwd());
const MAX_DEPTH = 3;
const STALE_DAYS = 14;

const args = process.argv.slice(2);
const shortMode = args.includes('--short');
const jsonMode = args.includes('--json');
const filterRepo = args.find(a => !a.startsWith('--'));

// ── find all .git dirs ──────────────────────────────────────────────
function findGitRepos(dir, depth = 0) {
  const repos = [];
  if (depth > MAX_DEPTH) return repos;
  
  try {
    const gitDir = join(dir, '.git');
    if (existsSync(gitDir) && statSync(gitDir).isDirectory()) {
      repos.push(dir);
      // keep scanning subdirs for nested repos (e.g. projects/anivia has its own .git)
    }
    
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      repos.push(...findGitRepos(join(dir, entry.name), depth + 1));
    }
  } catch { /* permission errors etc */ }
  
  return repos;
}

// ── git helpers ─────────────────────────────────────────────────────
function git(repoPath, cmd) {
  try {
    return execSync(`git -C "${repoPath}" ${cmd}`, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch { return ''; }
}

function getRepoInfo(repoPath) {
  const name = relative(WORKSPACE, repoPath) || basename(repoPath);
  const branch = git(repoPath, 'rev-parse --abbrev-ref HEAD') || '(detached)';
  
  // uncommitted changes
  const status = git(repoPath, 'status --porcelain');
  const changes = status ? status.split('\n').filter(Boolean) : [];
  const staged = changes.filter(l => l[0] !== ' ' && l[0] !== '?').length;
  const unstaged = changes.filter(l => l[0] === ' ' || l[0] === 'M' && l[1] === 'M').length;
  const untracked = changes.filter(l => l.startsWith('??')).length;
  
  // unpushed commits
  const upstream = git(repoPath, `rev-parse --abbrev-ref ${branch}@{upstream} 2>/dev/null`);
  let unpushed = 0;
  if (upstream) {
    const count = git(repoPath, `rev-list --count ${upstream}..${branch}`);
    unpushed = parseInt(count) || 0;
  } else {
    // no upstream — all commits are "unpushed" conceptually, but just flag it
    unpushed = -1; // sentinel: no remote
  }
  
  // last commit
  const lastCommitDate = git(repoPath, 'log -1 --format=%ci');
  const lastCommitMsg = git(repoPath, 'log -1 --format=%s');
  const lastCommitAuthor = git(repoPath, 'log -1 --format=%an');
  const lastCommitAge = lastCommitDate ? ageString(new Date(lastCommitDate)) : 'no commits';
  const lastCommitDays = lastCommitDate ? daysSince(new Date(lastCommitDate)) : Infinity;
  
  // branches
  const branchList = git(repoPath, 'branch --format="%(refname:short)|%(committerdate:iso)"');
  const branches = branchList ? branchList.split('\n').map(b => {
    const [bName, bDate] = b.split('|');
    return { name: bName, days: bDate ? daysSince(new Date(bDate)) : 0 };
  }) : [];
  const staleBranches = branches.filter(b => b.name !== branch && b.days > STALE_DAYS);
  
  // remote url
  const remote = git(repoPath, 'remote get-url origin 2>/dev/null');
  
  return {
    name, branch, changes: changes.length, staged, unstaged, untracked,
    unpushed, lastCommitMsg, lastCommitAuthor, lastCommitAge, lastCommitDays,
    staleBranches, remote, isStale: lastCommitDays > STALE_DAYS,
    isClean: changes.length === 0 && unpushed === 0,
    path: repoPath
  };
}

function daysSince(date) {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function ageString(date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── display ─────────────────────────────────────────────────────────
function statusIcon(repo) {
  if (repo.changes > 0 && repo.unpushed > 0) return '◆'; // dirty + unpushed
  if (repo.changes > 0) return '●'; // dirty
  if (repo.unpushed > 0) return '▲'; // unpushed
  if (repo.unpushed === -1) return '○'; // no remote
  return '✓'; // clean
}

function statusColor(repo) {
  if (repo.changes > 0) return '\x1b[33m'; // yellow
  if (repo.unpushed > 0) return '\x1b[36m'; // cyan
  if (repo.isStale) return '\x1b[90m'; // dim
  return '\x1b[32m'; // green
}

function printShort(repos) {
  const maxName = Math.max(...repos.map(r => r.name.length), 10);
  
  for (const r of repos) {
    const icon = statusIcon(r);
    const color = statusColor(r);
    const reset = '\x1b[0m';
    const parts = [];
    
    if (r.changes > 0) parts.push(`${r.changes} changed`);
    if (r.unpushed > 0) parts.push(`${r.unpushed} unpushed`);
    if (r.unpushed === -1) parts.push('no remote');
    if (r.isStale) parts.push(`stale ${r.lastCommitAge}`);
    if (parts.length === 0) parts.push('clean');
    
    console.log(`${color}${icon}${reset} ${r.name.padEnd(maxName)}  ${r.branch.padEnd(12)}  ${parts.join(', ')}  ${'\x1b[90m'}${r.lastCommitAge}${reset}`);
  }
}

function printFull(repos) {
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const dim = '\x1b[90m';
  const yellow = '\x1b[33m';
  const cyan = '\x1b[36m';
  const green = '\x1b[32m';
  const red = '\x1b[31m';
  
  console.log(`${bold}arc git${reset} — workspace repository dashboard`);
  console.log(`${dim}${'─'.repeat(60)}${reset}`);
  
  // summary line
  const dirty = repos.filter(r => r.changes > 0).length;
  const withUnpushed = repos.filter(r => r.unpushed > 0).length;
  const clean = repos.filter(r => r.isClean).length;
  console.log(`${repos.length} repos: ${green}${clean} clean${reset}${dirty ? `, ${yellow}${dirty} dirty${reset}` : ''}${withUnpushed ? `, ${cyan}${withUnpushed} unpushed${reset}` : ''}`);
  console.log();
  
  for (const r of repos) {
    const icon = statusIcon(r);
    const color = statusColor(r);
    
    console.log(`${color}${icon} ${bold}${r.name}${reset}  ${dim}(${r.branch})${reset}`);
    
    if (r.lastCommitMsg) {
      console.log(`  last: "${r.lastCommitMsg}" ${dim}— ${r.lastCommitAuthor}, ${r.lastCommitAge}${reset}`);
    }
    
    if (r.changes > 0) {
      const parts = [];
      if (r.staged > 0) parts.push(`${r.staged} staged`);
      if (r.unstaged > 0) parts.push(`${r.unstaged} modified`);
      if (r.untracked > 0) parts.push(`${r.untracked} untracked`);
      console.log(`  ${yellow}changes: ${parts.join(', ')}${reset}`);
    }
    
    if (r.unpushed > 0) {
      console.log(`  ${cyan}▲ ${r.unpushed} commit${r.unpushed > 1 ? 's' : ''} ahead of remote${reset}`);
    } else if (r.unpushed === -1) {
      console.log(`  ${dim}○ no upstream remote configured${reset}`);
    }
    
    if (r.staleBranches.length > 0) {
      const names = r.staleBranches.map(b => `${b.name} (${b.days}d)`).join(', ');
      console.log(`  ${dim}stale branches: ${names}${reset}`);
    }
    
    if (r.isStale) {
      console.log(`  ${red}⚠ no commits in ${r.lastCommitDays} days${reset}`);
    }
    
    console.log();
  }
  
  // action items
  const actions = [];
  repos.filter(r => r.changes > 0).forEach(r => 
    actions.push(`commit or stash changes in ${r.name}`));
  repos.filter(r => r.unpushed > 0).forEach(r => 
    actions.push(`push ${r.unpushed} commit${r.unpushed > 1 ? 's' : ''} in ${r.name}`));
  repos.filter(r => r.staleBranches.length > 0).forEach(r =>
    actions.push(`clean ${r.staleBranches.length} stale branch${r.staleBranches.length > 1 ? 'es' : ''} in ${r.name}`));
  
  if (actions.length > 0) {
    console.log(`${bold}actions:${reset}`);
    actions.forEach(a => console.log(`  → ${a}`));
  } else {
    console.log(`${green}all repos clean and pushed ✓${reset}`);
  }
}

// ── main ────────────────────────────────────────────────────────────
const repos = findGitRepos(WORKSPACE)
  .map(getRepoInfo)
  .filter(r => !filterRepo || r.name.includes(filterRepo))
  .sort((a, b) => {
    // dirty first, then unpushed, then by name
    if (a.changes > 0 && b.changes === 0) return -1;
    if (a.changes === 0 && b.changes > 0) return 1;
    if (a.unpushed > 0 && b.unpushed <= 0) return -1;
    if (a.unpushed <= 0 && b.unpushed > 0) return 1;
    return a.name.localeCompare(b.name);
  });

if (repos.length === 0) {
  console.log(filterRepo ? `no repos matching "${filterRepo}"` : 'no git repos found');
  process.exit(1);
}

if (jsonMode) {
  console.log(JSON.stringify(repos, null, 2));
} else if (shortMode) {
  printShort(repos);
} else {
  printFull(repos);
}

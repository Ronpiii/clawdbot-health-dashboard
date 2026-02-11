#!/usr/bin/env node
/**
 * arc clean — workspace hygiene scanner
 * 
 * finds cruft, waste, and cleanup opportunities across the workspace:
 * - large files (>5MB outside node_modules/.git/.next)
 * - stale git branches (merged or >30 days old)
 * - orphaned node_modules (no package.json sibling)
 * - .next build caches
 * - empty directories
 * - temp/junk files (.DS_Store, *.swp, *~, *.bak, thumbs.db)
 * - duplicate package installs
 * - git gc opportunities (large .git dirs)
 * 
 * usage:
 *   arc clean              scan and report
 *   arc clean --fix        apply safe cleanups (with confirmation summary)
 *   arc clean --short      one-liner summary
 *   arc clean --json       machine-readable output
 * 
 * safety: --fix only touches truly safe things:
 *   - temp files (.DS_Store, thumbs.db, *.swp)
 *   - empty directories
 *   - .next caches (regenerated on next build)
 *   - git gc (non-destructive compression)
 *   branches and node_modules are NEVER auto-deleted
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join, basename, dirname, relative } from 'path';

const WORKSPACE = process.env.CLAWD_WORKSPACE || join(dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const SHORT = args.includes('--short');
const JSON_OUT = args.includes('--json');

// ── helpers ──────────────────────────────────────────────────────────────────

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: WORKSPACE, encoding: 'utf8', timeout: 15000, ...opts }).trim();
  } catch { return ''; }
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}G`;
}

function parseSize(sizeStr) {
  const match = sizeStr.match(/^([\d.]+)([KMGT]?)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || '').toUpperCase();
  const multipliers = { '': 1, 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4 };
  return num * (multipliers[unit] || 1);
}

function duSize(path) {
  const out = sh(`du -sb "${path}" 2>/dev/null`);
  if (!out) return 0;
  return parseInt(out.split('\t')[0]) || 0;
}

// ── scanners ─────────────────────────────────────────────────────────────────

function scanLargeFiles() {
  const raw = sh(`find "${WORKSPACE}" -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/.git/*' -not -path '*/cache/*' -type f -size +5M 2>/dev/null`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(f => {
    const size = duSize(f);
    return { path: relative(WORKSPACE, f), size, human: humanSize(size) };
  }).sort((a, b) => b.size - a.size);
}

function scanTempFiles() {
  const patterns = ['.DS_Store', 'Thumbs.db', '*.swp', '*.swo', '*~', '*.bak', '*.tmp', '*.orig'];
  const findArgs = patterns.map((p, i) => `${i > 0 ? '-o ' : ''}-name "${p}"`).join(' ');
  const raw = sh(`find "${WORKSPACE}" -not -path '*/node_modules/*' -not -path '*/.git/*' \\( ${findArgs} \\) -type f 2>/dev/null`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(f => ({
    path: relative(WORKSPACE, f),
    size: duSize(f),
    name: basename(f)
  }));
}

function scanEmptyDirs() {
  const raw = sh(`find "${WORKSPACE}" -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -empty -type d 2>/dev/null`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(d => relative(WORKSPACE, d));
}

function scanNodeModules() {
  const raw = sh(`find "${WORKSPACE}" -name "node_modules" -type d -maxdepth 4 2>/dev/null`);
  if (!raw) return [];
  
  // only top-level node_modules (not nested within other node_modules)
  const dirs = raw.split('\n').filter(Boolean).filter(d => {
    const rel = relative(WORKSPACE, d);
    const parts = rel.split('/');
    // count how many times "node_modules" appears
    return parts.filter(p => p === 'node_modules').length === 1;
  });
  
  return dirs.map(d => {
    const size = duSize(d);
    const rel = relative(WORKSPACE, d);
    const parent = dirname(d);
    const hasPkg = existsSync(join(parent, 'package.json'));
    const hasLock = existsSync(join(parent, 'package-lock.json')) || 
                    existsSync(join(parent, 'yarn.lock')) ||
                    existsSync(join(parent, 'pnpm-lock.yaml'));
    return { path: rel, size, human: humanSize(size), hasPkg, hasLock };
  }).sort((a, b) => b.size - a.size);
}

function scanNextCaches() {
  const raw = sh(`find "${WORKSPACE}" -name ".next" -type d -maxdepth 4 2>/dev/null`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(d => {
    const size = duSize(d);
    return { path: relative(WORKSPACE, d), size, human: humanSize(size) };
  }).sort((a, b) => b.size - a.size);
}

function scanStaleBranches() {
  // find all git repos
  const repos = sh(`find "${WORKSPACE}" -name ".git" -maxdepth 4 2>/dev/null`);
  if (!repos) return [];
  
  const results = [];
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  for (const gitDir of repos.split('\n').filter(Boolean)) {
    const repoDir = dirname(gitDir);
    // skip nested .git in node_modules
    if (repoDir.includes('node_modules')) continue;
    
    const repoName = relative(WORKSPACE, repoDir) || '.';
    const currentBranch = sh(`git -C "${repoDir}" branch --show-current 2>/dev/null`);
    const branchRaw = sh(`git -C "${repoDir}" for-each-ref --format='%(refname:short)|%(committerdate:unix)|%(committerdate:relative)' refs/heads/ 2>/dev/null`);
    
    if (!branchRaw) continue;
    
    for (const line of branchRaw.split('\n').filter(Boolean)) {
      const [branch, unixStr, age] = line.split('|');
      const unix = parseInt(unixStr) * 1000;
      
      if (branch === currentBranch) continue; // skip current
      if (branch === 'main' || branch === 'master') continue; // skip default
      
      // check if merged into current
      const merged = sh(`git -C "${repoDir}" branch --merged ${currentBranch} 2>/dev/null`);
      const isMerged = merged.split('\n').map(b => b.trim().replace('* ', '')).includes(branch);
      
      const isStale = unix < thirtyDaysAgo;
      
      if (isMerged || isStale) {
        results.push({ repo: repoName, branch, age, isMerged, isStale });
      }
    }
  }
  
  return results;
}

function scanGitSize() {
  const repos = sh(`find "${WORKSPACE}" -name ".git" -type d -maxdepth 4 2>/dev/null`);
  if (!repos) return [];
  
  return repos.split('\n').filter(Boolean)
    .filter(d => !d.includes('node_modules'))
    .map(gitDir => {
      const repoDir = dirname(gitDir);
      const size = duSize(gitDir);
      const repoName = relative(WORKSPACE, repoDir) || '.';
      
      // check if gc would help
      const looseCount = sh(`git -C "${repoDir}" count-objects 2>/dev/null`);
      const looseMatch = looseCount.match(/(\d+) objects/);
      const loose = looseMatch ? parseInt(looseMatch[1]) : 0;
      
      return { repo: repoName, path: relative(WORKSPACE, gitDir), size, human: humanSize(size), looseObjects: loose };
    })
    .sort((a, b) => b.size - a.size);
}

function getDiskUsage() {
  const total = sh(`du -sb "${WORKSPACE}" 2>/dev/null`);
  return total ? parseInt(total.split('\t')[0]) : 0;
}

// ── fixers ───────────────────────────────────────────────────────────────────

function fixTempFiles(files) {
  let cleaned = 0;
  let bytes = 0;
  for (const f of files) {
    try {
      unlinkSync(join(WORKSPACE, f.path));
      cleaned++;
      bytes += f.size;
    } catch {}
  }
  return { cleaned, bytes };
}

function fixEmptyDirs(dirs) {
  let cleaned = 0;
  // sort by depth (deepest first) to handle nested empties
  const sorted = [...dirs].sort((a, b) => b.split('/').length - a.split('/').length);
  for (const d of sorted) {
    try {
      rmdirSync(join(WORKSPACE, d));
      cleaned++;
    } catch {}
  }
  return { cleaned };
}

function fixNextCaches(caches) {
  let cleaned = 0;
  let bytes = 0;
  for (const c of caches) {
    try {
      sh(`rm -rf "${join(WORKSPACE, c.path)}"`);
      cleaned++;
      bytes += c.size;
    } catch {}
  }
  return { cleaned, bytes };
}

function fixGitGc(repos) {
  let cleaned = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  for (const r of repos) {
    if (r.looseObjects < 50) continue; // not worth it
    bytesBefore += r.size;
    try {
      sh(`git -C "${join(WORKSPACE, r.repo === '.' ? '' : r.repo)}" gc --quiet 2>/dev/null`, { timeout: 30000 });
      cleaned++;
      bytesAfter += duSize(join(WORKSPACE, r.path));
    } catch {
      bytesAfter += r.size;
    }
  }
  return { cleaned, saved: bytesBefore - bytesAfter };
}

// ── report ───────────────────────────────────────────────────────────────────

async function main() {
  const totalSize = getDiskUsage();
  
  // run all scans
  const largeFiles = scanLargeFiles();
  const tempFiles = scanTempFiles();
  const emptyDirs = scanEmptyDirs();
  const nodeModules = scanNodeModules();
  const nextCaches = scanNextCaches();
  const staleBranches = scanStaleBranches();
  const gitDirs = scanGitSize();
  
  // calculate totals
  const nmTotal = nodeModules.reduce((s, n) => s + n.size, 0);
  const nextTotal = nextCaches.reduce((s, n) => s + n.size, 0);
  const tempTotal = tempFiles.reduce((s, f) => s + f.size, 0);
  const gitTotal = gitDirs.reduce((s, g) => s + g.size, 0);
  const largeTotal = largeFiles.reduce((s, f) => s + f.size, 0);
  
  // reclaimable = things --fix can clean safely
  const reclaimable = nextTotal + tempTotal;
  // advisable = things you could clean manually
  const advisable = nmTotal + largeTotal;
  
  const issueCount = largeFiles.length + tempFiles.length + emptyDirs.length + 
                     staleBranches.length + (nextCaches.length > 0 ? nextCaches.length : 0);
  
  // ── json output ──
  if (JSON_OUT) {
    console.log(JSON.stringify({
      workspace: { total: totalSize, human: humanSize(totalSize) },
      largeFiles, tempFiles, emptyDirs, nodeModules, nextCaches, staleBranches, gitDirs,
      summary: {
        issues: issueCount,
        reclaimable: { bytes: reclaimable, human: humanSize(reclaimable) },
        advisable: { bytes: advisable, human: humanSize(advisable) },
        nodeModules: { bytes: nmTotal, human: humanSize(nmTotal) },
        nextCaches: { bytes: nextTotal, human: humanSize(nextTotal) }
      }
    }, null, 2));
    return;
  }
  
  // ── short output ──
  if (SHORT) {
    const parts = [];
    if (tempFiles.length) parts.push(`${tempFiles.length} temp files`);
    if (emptyDirs.length) parts.push(`${emptyDirs.length} empty dirs`);
    if (staleBranches.length) parts.push(`${staleBranches.length} stale branches`);
    if (nextCaches.length) parts.push(`${humanSize(nextTotal)} in .next caches`);
    parts.push(`${humanSize(nmTotal)} in node_modules`);
    
    if (parts.length === 0) {
      console.log(`workspace clean (${humanSize(totalSize)} total)`);
    } else {
      console.log(`${humanSize(totalSize)} total | ${parts.join(', ')} | ${humanSize(reclaimable)} safely reclaimable`);
    }
    return;
  }
  
  // ── fix mode ──
  if (FIX) {
    console.log('arc clean --fix');
    console.log('═'.repeat(50));
    console.log();
    
    let totalSaved = 0;
    
    if (tempFiles.length) {
      const result = fixTempFiles(tempFiles);
      totalSaved += result.bytes;
      console.log(`✓ removed ${result.cleaned} temp files (${humanSize(result.bytes)})`);
    }
    
    if (emptyDirs.length) {
      const result = fixEmptyDirs(emptyDirs);
      console.log(`✓ removed ${result.cleaned} empty directories`);
    }
    
    if (nextCaches.length) {
      const result = fixNextCaches(nextCaches);
      totalSaved += result.bytes;
      console.log(`✓ cleared ${result.cleaned} .next caches (${humanSize(result.bytes)})`);
    }
    
    const gcCandidates = gitDirs.filter(g => g.looseObjects >= 50);
    if (gcCandidates.length) {
      const result = fixGitGc(gcCandidates);
      totalSaved += result.saved;
      if (result.cleaned) {
        console.log(`✓ git gc on ${result.cleaned} repos (${humanSize(result.saved)} saved)`);
      }
    }
    
    console.log();
    console.log(`total reclaimed: ${humanSize(totalSaved)}`);
    
    if (staleBranches.length) {
      console.log();
      console.log(`note: ${staleBranches.length} stale branches found (not auto-deleted — review with 'arc clean')`);
    }
    
    if (nodeModules.length) {
      const orphaned = nodeModules.filter(n => !n.hasPkg);
      if (orphaned.length) {
        console.log(`note: ${orphaned.length} orphaned node_modules found (no package.json) — review manually`);
      }
    }
    
    return;
  }
  
  // ── full report ──
  console.log('arc clean — workspace hygiene report');
  console.log('═'.repeat(50));
  console.log();
  
  // disk overview
  console.log(`workspace: ${humanSize(totalSize)}`);
  const breakdown = [];
  if (nmTotal > 0) breakdown.push(`node_modules: ${humanSize(nmTotal)}`);
  if (nextTotal > 0) breakdown.push(`.next: ${humanSize(nextTotal)}`);
  if (gitTotal > 0) breakdown.push(`.git: ${humanSize(gitTotal)}`);
  if (breakdown.length) console.log(`  ${breakdown.join('  |  ')}`);
  console.log();
  
  // node_modules
  if (nodeModules.length) {
    console.log(`── node_modules (${nodeModules.length} installs, ${humanSize(nmTotal)} total)`);
    for (const nm of nodeModules) {
      const flags = [];
      if (!nm.hasPkg) flags.push('⚠ no package.json');
      if (!nm.hasLock) flags.push('no lockfile');
      console.log(`  ${nm.human.padStart(7)}  ${nm.path}${flags.length ? '  ' + flags.join(', ') : ''}`);
    }
    console.log();
  }
  
  // .next caches
  if (nextCaches.length) {
    console.log(`── .next caches (${humanSize(nextTotal)} reclaimable)`);
    for (const c of nextCaches) {
      console.log(`  ${c.human.padStart(7)}  ${c.path}`);
    }
    console.log(`  → run 'arc clean --fix' to clear (regenerated on next build)`);
    console.log();
  }
  
  // stale branches
  if (staleBranches.length) {
    console.log(`── stale branches (${staleBranches.length})`);
    for (const b of staleBranches) {
      const flags = [];
      if (b.isMerged) flags.push('merged');
      if (b.isStale) flags.push(`${b.age}`);
      console.log(`  ${b.repo.padEnd(20)} ${b.branch.padEnd(35)} ${flags.join(', ')}`);
    }
    console.log(`  → delete manually: git -C <repo> branch -d <branch>`);
    console.log();
  }
  
  // large files
  if (largeFiles.length) {
    console.log(`── large files (${largeFiles.length} files > 5MB)`);
    for (const f of largeFiles) {
      console.log(`  ${f.human.padStart(7)}  ${f.path}`);
    }
    console.log();
  }
  
  // temp files
  if (tempFiles.length) {
    console.log(`── temp files (${tempFiles.length})`);
    const grouped = {};
    for (const f of tempFiles) {
      const type = f.name;
      if (!grouped[type]) grouped[type] = 0;
      grouped[type]++;
    }
    for (const [type, count] of Object.entries(grouped)) {
      console.log(`  ${String(count).padStart(3)}x  ${type}`);
    }
    console.log(`  → run 'arc clean --fix' to remove`);
    console.log();
  }
  
  // empty dirs
  if (emptyDirs.length) {
    console.log(`── empty directories (${emptyDirs.length})`);
    for (const d of emptyDirs.slice(0, 10)) {
      console.log(`  ${d}`);
    }
    if (emptyDirs.length > 10) console.log(`  ... and ${emptyDirs.length - 10} more`);
    console.log(`  → run 'arc clean --fix' to remove`);
    console.log();
  }
  
  // git repos
  if (gitDirs.length) {
    const gcNeeded = gitDirs.filter(g => g.looseObjects >= 50);
    if (gcNeeded.length) {
      console.log(`── git repos needing gc`);
      for (const g of gcNeeded) {
        console.log(`  ${g.human.padStart(7)}  ${g.repo} (${g.looseObjects} loose objects)`);
      }
      console.log(`  → run 'arc clean --fix' to gc`);
      console.log();
    }
  }
  
  // ── summary bar ──
  console.log('─'.repeat(50));
  
  const score = Math.max(0, 100 - 
    (tempFiles.length * 2) - 
    (emptyDirs.length * 1) - 
    (staleBranches.length * 5) - 
    (nextCaches.length > 0 ? 10 : 0) -
    (largeFiles.length * 3)
  );
  
  const barLen = 20;
  const filled = Math.round((score / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  const label = score >= 80 ? 'clean' : score >= 60 ? 'ok' : score >= 40 ? 'needs attention' : 'messy';
  
  console.log(`hygiene: [${bar}] ${score}/100 (${label})`);
  
  if (reclaimable > 0) {
    console.log(`safely reclaimable: ${humanSize(reclaimable)} (run 'arc clean --fix')`);
  }
  if (staleBranches.length) {
    console.log(`manual review: ${staleBranches.length} stale branches`);
  }
  
  console.log();
}

main().catch(e => { console.error(e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * PR Summary Generator
 * Generates a summary of changes for PR descriptions or commit messages
 * 
 * Usage:
 *   node scripts/pr-summary.mjs                    # summarize staged changes
 *   node scripts/pr-summary.mjs HEAD~3..HEAD       # summarize commit range
 *   node scripts/pr-summary.mjs main..feature      # compare branches
 *   node scripts/pr-summary.mjs --full             # include file-by-file breakdown
 */

import { execSync } from 'child_process';
import { basename } from 'path';

const args = process.argv.slice(2);
const fullMode = args.includes('--full');
const range = args.find(a => !a.startsWith('--')) || null;

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return '';
  }
}

function getChanges() {
  if (range) {
    // Commit range or branch comparison
    return {
      stat: run(`git diff --stat ${range}`),
      files: run(`git diff --name-status ${range}`),
      diff: run(`git diff ${range}`),
      commits: run(`git log --oneline ${range}`),
    };
  } else {
    // Staged changes (or working tree if nothing staged)
    const staged = run('git diff --cached --stat');
    if (staged) {
      return {
        stat: staged,
        files: run('git diff --cached --name-status'),
        diff: run('git diff --cached'),
        commits: null,
      };
    } else {
      return {
        stat: run('git diff --stat'),
        files: run('git diff --name-status'),
        diff: run('git diff'),
        commits: null,
      };
    }
  }
}

function categorizeFiles(fileStatus) {
  const categories = {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
  };
  
  for (const line of fileStatus.split('\n').filter(Boolean)) {
    const [status, ...rest] = line.split('\t');
    const file = rest.join('\t');
    
    if (status.startsWith('A')) categories.added.push(file);
    else if (status.startsWith('M')) categories.modified.push(file);
    else if (status.startsWith('D')) categories.deleted.push(file);
    else if (status.startsWith('R')) categories.renamed.push(file);
  }
  
  return categories;
}

function detectChangeType(files, diff) {
  const allFiles = [...files.added, ...files.modified].join(' ').toLowerCase();
  const diffLower = diff.toLowerCase();
  
  // Detect type based on patterns
  if (allFiles.includes('test') || diffLower.includes('describe(') || diffLower.includes('it(')) {
    return 'test';
  }
  if (allFiles.includes('readme') || allFiles.match(/\.md$/)) {
    return 'docs';
  }
  if (allFiles.includes('package.json') || allFiles.includes('config')) {
    return 'chore';
  }
  if (diffLower.includes('fix') || diffLower.includes('bug')) {
    return 'fix';
  }
  if (files.added.length > files.modified.length) {
    return 'feat';
  }
  if (files.deleted.length > files.added.length) {
    return 'refactor';
  }
  return 'update';
}

function detectScope(files) {
  const allFiles = [...files.added, ...files.modified, ...files.deleted];
  
  // Find common directory
  const dirs = allFiles
    .map(f => f.split('/').slice(0, -1))
    .filter(d => d.length > 0);
  
  if (dirs.length === 0) return null;
  
  // Check if all files share a common prefix
  const firstDir = dirs[0];
  for (let i = 0; i < firstDir.length; i++) {
    const common = firstDir.slice(0, i + 1).join('/');
    if (dirs.every(d => d.slice(0, i + 1).join('/') === common)) {
      // Found common prefix
      const scope = firstDir[i];
      if (scope && !['src', 'lib', 'app'].includes(scope)) {
        return scope;
      }
    }
  }
  
  return null;
}

function summarizeChanges(files, diff) {
  const summary = [];
  
  // Key changes detection
  const patterns = [
    { regex: /\+.*function\s+(\w+)/g, desc: 'new function' },
    { regex: /\+.*class\s+(\w+)/g, desc: 'new class' },
    { regex: /\+.*export\s+(const|function|class)\s+(\w+)/g, desc: 'new export' },
    { regex: /\+.*interface\s+(\w+)/g, desc: 'new interface' },
    { regex: /-.*function\s+(\w+)/g, desc: 'removed function' },
    { regex: /\+.*import.*from\s+['"]([^'"]+)['"]/g, desc: 'new dependency' },
  ];
  
  const seen = new Set();
  for (const { regex, desc } of patterns) {
    const matches = diff.matchAll(regex);
    for (const match of matches) {
      const name = match[2] || match[1];
      const key = `${desc}:${name}`;
      if (!seen.has(key) && name) {
        seen.add(key);
        summary.push(`${desc}: ${name}`);
      }
    }
  }
  
  return summary.slice(0, 10); // Limit to 10 items
}

function generateSummary() {
  const changes = getChanges();
  
  if (!changes.stat) {
    console.log('No changes detected.');
    return;
  }
  
  const files = categorizeFiles(changes.files);
  const changeType = detectChangeType(files, changes.diff);
  const scope = detectScope(files);
  
  // Stats
  const statLines = changes.stat.split('\n');
  const summaryLine = statLines[statLines.length - 1] || '';
  const statsMatch = summaryLine.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?)?(?:,\s+(\d+)\s+deletions?)?/);
  const fileCount = statsMatch?.[1] || '?';
  const insertions = statsMatch?.[2] || '0';
  const deletions = statsMatch?.[3] || '0';
  
  // Generate title
  const scopePart = scope ? `(${scope})` : '';
  let title = `${changeType}${scopePart}: `;
  
  if (files.added.length === 1 && files.modified.length === 0) {
    title += `add ${basename(files.added[0])}`;
  } else if (files.modified.length === 1 && files.added.length === 0) {
    title += `update ${basename(files.modified[0])}`;
  } else if (files.deleted.length > 0 && files.added.length === 0 && files.modified.length === 0) {
    title += `remove ${files.deleted.length} files`;
  } else {
    title += `update ${fileCount} files`;
  }
  
  console.log('## PR Summary\n');
  console.log(`**Title:** \`${title}\`\n`);
  console.log(`**Stats:** ${fileCount} files, +${insertions}/-${deletions}\n`);
  
  // File breakdown
  if (files.added.length > 0) {
    console.log(`**Added (${files.added.length}):**`);
    files.added.slice(0, 10).forEach(f => console.log(`  - ${f}`));
    if (files.added.length > 10) console.log(`  - ... and ${files.added.length - 10} more`);
    console.log('');
  }
  
  if (files.modified.length > 0) {
    console.log(`**Modified (${files.modified.length}):**`);
    files.modified.slice(0, 10).forEach(f => console.log(`  - ${f}`));
    if (files.modified.length > 10) console.log(`  - ... and ${files.modified.length - 10} more`);
    console.log('');
  }
  
  if (files.deleted.length > 0) {
    console.log(`**Deleted (${files.deleted.length}):**`);
    files.deleted.slice(0, 5).forEach(f => console.log(`  - ${f}`));
    console.log('');
  }
  
  // Key changes
  const keyChanges = summarizeChanges(files, changes.diff);
  if (keyChanges.length > 0) {
    console.log('**Key changes:**');
    keyChanges.forEach(c => console.log(`  - ${c}`));
    console.log('');
  }
  
  // Commits (if range)
  if (changes.commits) {
    const commitLines = changes.commits.split('\n').filter(Boolean);
    console.log(`**Commits (${commitLines.length}):**`);
    commitLines.slice(0, 10).forEach(c => console.log(`  - ${c}`));
    if (commitLines.length > 10) console.log(`  - ... and ${commitLines.length - 10} more`);
    console.log('');
  }
  
  // Full diff stats
  if (fullMode) {
    console.log('**Full stats:**');
    console.log('```');
    console.log(changes.stat);
    console.log('```');
  }
}

generateSummary();

#!/usr/bin/env node
/**
 * Auto-commit script
 * Commits staged/unstaged changes with AI-generated commit message
 * 
 * Usage:
 *   node scripts/auto-commit.mjs           # commit current dir
 *   node scripts/auto-commit.mjs [path]    # commit specific repo
 *   node scripts/auto-commit.mjs --dry-run # preview without committing
 *   node scripts/auto-commit.mjs --push    # commit and push
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const shouldPush = args.includes('--push');
const targetPath = args.find(a => !a.startsWith('--')) || '.';

const repoPath = path.resolve(targetPath);

// Check if it's a git repo
function isGitRepo(dir) {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Get git diff for commit message generation
function getDiff(dir) {
  try {
    // First try staged changes
    let diff = execSync('git diff --cached --stat', { cwd: dir, encoding: 'utf-8' });
    if (diff.trim()) {
      const fullDiff = execSync('git diff --cached', { cwd: dir, encoding: 'utf-8', maxBuffer: 50 * 1024 });
      return { staged: true, stat: diff, diff: fullDiff.slice(0, 4000) };
    }
    
    // Fall back to unstaged changes
    diff = execSync('git diff --stat', { cwd: dir, encoding: 'utf-8' });
    if (diff.trim()) {
      const fullDiff = execSync('git diff', { cwd: dir, encoding: 'utf-8', maxBuffer: 50 * 1024 });
      return { staged: false, stat: diff, diff: fullDiff.slice(0, 4000) };
    }
    
    // Check for untracked files
    const untracked = execSync('git ls-files --others --exclude-standard', { cwd: dir, encoding: 'utf-8' });
    if (untracked.trim()) {
      return { staged: false, stat: `New files:\n${untracked}`, diff: '', untracked: true };
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// Generate commit message using simple heuristics (no API needed)
function generateCommitMessage(diffInfo) {
  const { stat, diff, untracked } = diffInfo;
  
  // Parse stat to get file info
  const lines = stat.trim().split('\n');
  const files = [];
  let insertions = 0;
  let deletions = 0;
  
  for (const line of lines) {
    // Match file lines like: " src/foo.ts | 10 ++"
    const fileMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)/);
    if (fileMatch) {
      files.push(fileMatch[1].trim());
    }
    // Match summary line like: " 3 files changed, 45 insertions(+), 12 deletions(-)"
    const summaryMatch = line.match(/(\d+)\s+insertion|(\d+)\s+deletion/g);
    if (summaryMatch) {
      for (const m of summaryMatch) {
        if (m.includes('insertion')) insertions += parseInt(m);
        if (m.includes('deletion')) deletions += parseInt(m);
      }
    }
  }
  
  if (untracked) {
    const newFiles = stat.replace('New files:\n', '').trim().split('\n');
    if (newFiles.length === 1) {
      return `add ${path.basename(newFiles[0])}`;
    }
    return `add ${newFiles.length} new files`;
  }
  
  // Determine type based on files and diff content
  let type = 'chore';
  let scope = '';
  let subject = '';
  
  // Check for common patterns
  const allFiles = files.join(' ').toLowerCase();
  const diffLower = diff.toLowerCase();
  
  if (allFiles.includes('test') || diffLower.includes('describe(') || diffLower.includes('it(')) {
    type = 'test';
  } else if (allFiles.includes('readme') || allFiles.includes('.md') || allFiles.includes('docs/')) {
    type = 'docs';
  } else if (allFiles.includes('package.json') || allFiles.includes('tsconfig') || allFiles.includes('config')) {
    type = 'chore';
  } else if (diffLower.includes('fix') || diffLower.includes('bug') || diffLower.includes('error')) {
    type = 'fix';
  } else if (insertions > deletions * 2) {
    type = 'feat';
  } else if (deletions > insertions * 2) {
    type = 'refactor';
  }
  
  // Determine scope from common directory
  if (files.length > 0) {
    const dirs = files.map(f => f.split('/')[0]).filter(d => d && !d.includes('.'));
    const uniqueDirs = [...new Set(dirs)];
    if (uniqueDirs.length === 1 && uniqueDirs[0] !== 'src') {
      scope = uniqueDirs[0];
    } else if (files.every(f => f.startsWith('src/'))) {
      const srcDirs = files.map(f => f.split('/')[1]).filter(Boolean);
      const uniqueSrcDirs = [...new Set(srcDirs)];
      if (uniqueSrcDirs.length === 1) {
        scope = uniqueSrcDirs[0];
      }
    }
  }
  
  // Generate subject
  if (files.length === 1) {
    const fileName = path.basename(files[0], path.extname(files[0]));
    subject = `update ${fileName}`;
  } else if (files.length <= 3) {
    const fileNames = files.map(f => path.basename(f, path.extname(f)));
    subject = `update ${fileNames.join(', ')}`;
  } else {
    subject = `update ${files.length} files`;
  }
  
  // Build message
  const scopePart = scope ? `(${scope})` : '';
  return `${type}${scopePart}: ${subject}`;
}

// Main
async function main() {
  console.log(`📁 Repository: ${repoPath}`);
  
  if (!existsSync(repoPath)) {
    console.error('❌ Path does not exist');
    process.exit(1);
  }
  
  if (!isGitRepo(repoPath)) {
    console.error('❌ Not a git repository');
    process.exit(1);
  }
  
  const diffInfo = getDiff(repoPath);
  
  if (!diffInfo) {
    console.log('✨ Working tree clean — nothing to commit');
    process.exit(0);
  }
  
  console.log('\n📊 Changes:');
  console.log(diffInfo.stat);
  
  const message = generateCommitMessage(diffInfo);
  console.log(`\n💬 Generated message: "${message}"`);
  
  if (dryRun) {
    console.log('\n🔍 Dry run — no changes made');
    process.exit(0);
  }
  
  // Stage if needed
  if (!diffInfo.staged) {
    console.log('\n📦 Staging changes...');
    execSync('git add -A', { cwd: repoPath, stdio: 'inherit' });
  }
  
  // Commit
  console.log('\n✅ Committing...');
  try {
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: repoPath, stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Commit failed');
    process.exit(1);
  }
  
  // Push if requested
  if (shouldPush) {
    console.log('\n🚀 Pushing...');
    try {
      execSync('git push', { cwd: repoPath, stdio: 'inherit' });
    } catch (e) {
      console.error('❌ Push failed');
      process.exit(1);
    }
  }
  
  console.log('\n✨ Done!');
}

main().catch(console.error);

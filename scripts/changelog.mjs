#!/usr/bin/env node
/**
 * changelog.mjs - generate readable changelog from git commits
 * 
 * usage:
 *   node scripts/changelog.mjs                    # last 7 days
 *   node scripts/changelog.mjs --days 30          # last 30 days
 *   node scripts/changelog.mjs --since 2026-01-25 # since date
 *   node scripts/changelog.mjs --project anivia   # specific project
 *   node scripts/changelog.mjs --format md        # markdown output
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, basename } from 'path';

const WORKSPACE = process.env.CLAWD_WORKSPACE || '/data02/virt137413/clawd';

// Parse args
const args = process.argv.slice(2);
let days = 7;
let since = null;
let project = null;
let format = 'text';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days' && args[i + 1]) {
    days = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--since' && args[i + 1]) {
    since = args[i + 1];
    i++;
  } else if (args[i] === '--project' && args[i + 1]) {
    project = args[i + 1];
    i++;
  } else if (args[i] === '--format' && args[i + 1]) {
    format = args[i + 1];
    i++;
  }
}

// Determine git directory
let gitDir = WORKSPACE;
if (project) {
  const projectDir = join(WORKSPACE, 'projects', project);
  if (existsSync(join(projectDir, '.git'))) {
    gitDir = projectDir;
  } else {
    console.error(`Project ${project} not found or has no git repo`);
    process.exit(1);
  }
}

// Get commits
const sinceArg = since ? `--since="${since}"` : `--since="${days} days ago"`;
let commits;
try {
  const raw = execSync(
    `git log ${sinceArg} --pretty=format:"%H|%s|%ad|%an" --date=short`,
    { cwd: gitDir, encoding: 'utf-8' }
  ).trim();
  
  if (!raw) {
    console.log('No commits in the specified range.');
    process.exit(0);
  }
  
  commits = raw.split('\n').map(line => {
    const [hash, subject, date, author] = line.split('|');
    return { hash: hash.slice(0, 7), subject, date, author };
  });
} catch (e) {
  console.error('Failed to get git log:', e.message);
  process.exit(1);
}

// Categorize commits by type
const categories = {
  feat: [],
  fix: [],
  refactor: [],
  docs: [],
  chore: [],
  other: [],
};

const typePatterns = [
  { pattern: /^feat(\(.+\))?:?\s*/i, type: 'feat' },
  { pattern: /^fix(\(.+\))?:?\s*/i, type: 'fix' },
  { pattern: /^refactor(\(.+\))?:?\s*/i, type: 'refactor' },
  { pattern: /^docs(\(.+\))?:?\s*/i, type: 'docs' },
  { pattern: /^chore(\(.+\))?:?\s*/i, type: 'chore' },
  { pattern: /^style(\(.+\))?:?\s*/i, type: 'chore' },
  { pattern: /^test(\(.+\))?:?\s*/i, type: 'chore' },
];

// Also detect common patterns without conventional commit prefix
const featureKeywords = ['add', 'implement', 'create', 'build', 'new'];
const fixKeywords = ['fix', 'bug', 'patch', 'resolve', 'correct'];
const refactorKeywords = ['refactor', 'restructure', 'reorganize', 'clean'];
const docsKeywords = ['doc', 'readme', 'comment', 'memory'];

for (const commit of commits) {
  let matched = false;
  let cleanSubject = commit.subject;
  
  // Try conventional commit patterns
  for (const { pattern, type } of typePatterns) {
    if (pattern.test(commit.subject)) {
      cleanSubject = commit.subject.replace(pattern, '');
      categories[type].push({ ...commit, cleanSubject });
      matched = true;
      break;
    }
  }
  
  // If no conventional match, try keyword detection
  if (!matched) {
    const lower = commit.subject.toLowerCase();
    if (featureKeywords.some(k => lower.startsWith(k))) {
      categories.feat.push({ ...commit, cleanSubject });
    } else if (fixKeywords.some(k => lower.startsWith(k))) {
      categories.fix.push({ ...commit, cleanSubject });
    } else if (refactorKeywords.some(k => lower.includes(k))) {
      categories.refactor.push({ ...commit, cleanSubject });
    } else if (docsKeywords.some(k => lower.includes(k))) {
      categories.docs.push({ ...commit, cleanSubject });
    } else {
      categories.other.push({ ...commit, cleanSubject });
    }
  }
}

// Group by date
const byDate = {};
for (const commit of commits) {
  if (!byDate[commit.date]) byDate[commit.date] = [];
  byDate[commit.date].push(commit);
}

// Output
const projectName = project || basename(gitDir);
const dateRange = since || `last ${days} days`;

if (format === 'md') {
  console.log(`# Changelog: ${projectName}`);
  console.log(`\n_${dateRange} • ${commits.length} commits_\n`);
  
  const labels = {
    feat: '✨ Features',
    fix: '🐛 Bug Fixes',
    refactor: '♻️ Refactoring',
    docs: '📝 Documentation',
    chore: '🔧 Maintenance',
    other: '📦 Other Changes',
  };
  
  for (const [type, label] of Object.entries(labels)) {
    if (categories[type].length > 0) {
      console.log(`## ${label}\n`);
      for (const c of categories[type]) {
        console.log(`- ${c.cleanSubject} (\`${c.hash}\`)`);
      }
      console.log();
    }
  }
  
  // Timeline
  console.log('## Timeline\n');
  const dates = Object.keys(byDate).sort().reverse();
  for (const date of dates) {
    console.log(`### ${date}`);
    for (const c of byDate[date]) {
      console.log(`- ${c.subject}`);
    }
    console.log();
  }
} else {
  // Plain text
  console.log(`\n📋 CHANGELOG: ${projectName.toUpperCase()}`);
  console.log(`   ${dateRange} • ${commits.length} commits\n`);
  
  const labels = {
    feat: '✨ Features',
    fix: '🐛 Fixes',
    refactor: '♻️ Refactored',
    docs: '📝 Docs',
    chore: '🔧 Chores',
    other: '📦 Other',
  };
  
  for (const [type, label] of Object.entries(labels)) {
    if (categories[type].length > 0) {
      console.log(`${label}:`);
      for (const c of categories[type]) {
        console.log(`  • ${c.cleanSubject}`);
      }
      console.log();
    }
  }
}

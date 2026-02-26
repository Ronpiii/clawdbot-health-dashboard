#!/usr/bin/env node
/**
 * arc review — diff-aware code quality gate
 * 
 * Unlike `arc debt` (snapshot of all debt), `arc review` checks what you
 * JUST changed. Scans recent commits or uncommitted changes for quality
 * signals: new console.logs, TODO additions, `any` types introduced,
 * large diffs, missing error handling, complexity increases.
 * 
 * Think of it as a local code review bot that catches issues before push.
 * 
 * Usage:
 *   node scripts/review.mjs                    # review uncommitted changes
 *   node scripts/review.mjs --commits N        # review last N commits
 *   node scripts/review.mjs --since YYYY-MM-DD # review since date
 *   node scripts/review.mjs --project <name>   # filter to one project
 *   node scripts/review.mjs --strict           # stricter checks (nitpick mode)
 *   node scripts/review.mjs --short            # one-liner verdict
 *   node scripts/review.mjs --json             # machine-readable
 * 
 * Aliases: arc review, arc cr, arc codereview
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, basename, extname } from 'path';
import { execSync } from 'child_process';

const ROOT = process.env.WORKSPACE || join(import.meta.dirname, '..');
const PROJECTS_DIR = join(ROOT, 'projects');

const args = process.argv.slice(2);
const shortMode = args.includes('--short');
const jsonMode = args.includes('--json');
const strictMode = args.includes('--strict');
const commitsIdx = args.indexOf('--commits');
const sinceIdx = args.indexOf('--since');
const projectIdx = args.indexOf('--project');

const commitCount = commitsIdx >= 0 ? parseInt(args[commitsIdx + 1]) || 5 : 0;
const sinceDate = sinceIdx >= 0 ? args[sinceIdx + 1] : null;
const filterProject = projectIdx >= 0 ? args[projectIdx + 1] : args.find(a => !a.startsWith('--'));

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgGreen: '\x1b[42m',
};

// ─── Finding Repos ───────────────────────────────────────────────

function findRepos() {
  const repos = [];
  
  // Root repo
  if (existsSync(join(ROOT, '.git'))) {
    repos.push({ name: 'clawd', path: ROOT });
  }
  
  // Project repos
  if (existsSync(PROJECTS_DIR)) {
    for (const name of readdirSync(PROJECTS_DIR)) {
      const p = join(PROJECTS_DIR, name);
      if (existsSync(join(p, '.git'))) {
        repos.push({ name, path: p });
      }
    }
  }
  
  if (filterProject) {
    const aliases = {
      mundo: 'tuner', cm: 'context-memory', vsite: 'ventok-site',
      discord: 'discord-voice-bot',
    };
    const target = aliases[filterProject] || filterProject;
    return repos.filter(r => r.name === target || r.name.includes(target));
  }
  
  return repos;
}

// ─── Getting Diff ────────────────────────────────────────────────

function getDiff(repoPath) {
  try {
    let diffCmd;
    if (sinceDate) {
      diffCmd = `git log --since="${sinceDate}" -p --diff-filter=ACMR --no-merges`;
    } else if (commitCount > 0) {
      diffCmd = `git log -${commitCount} -p --diff-filter=ACMR --no-merges`;
    } else {
      // Uncommitted: staged + unstaged
      const staged = execSync('git diff --cached', { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      const unstaged = execSync('git diff', { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      const untracked = getUntrackedContent(repoPath);
      return staged + '\n' + unstaged + '\n' + untracked;
    }
    return execSync(diffCmd, { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch {
    return '';
  }
}

function getUntrackedContent(repoPath) {
  try {
    const files = execSync('git ls-files --others --exclude-standard', { cwd: repoPath, encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean);
    
    let result = '';
    for (const file of files) {
      const ext = extname(file);
      if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.json', '.md'].includes(ext)) continue;
      try {
        const content = readFileSync(join(repoPath, file), 'utf-8');
        result += `\ndiff --git a/${file} b/${file}\nnew file\n--- /dev/null\n+++ b/${file}\n`;
        content.split('\n').forEach(line => { result += `+${line}\n`; });
      } catch { /* skip unreadable files */ }
    }
    return result;
  } catch {
    return '';
  }
}

function getCommitInfo(repoPath) {
  try {
    let cmd;
    if (sinceDate) {
      cmd = `git log --since="${sinceDate}" --oneline --no-merges`;
    } else if (commitCount > 0) {
      cmd = `git log -${commitCount} --oneline --no-merges`;
    } else {
      return null; // uncommitted mode
    }
    const out = execSync(cmd, { cwd: repoPath, encoding: 'utf-8' }).trim();
    return out ? out.split('\n') : [];
  } catch {
    return [];
  }
}

// ─── Parsing Diff into Hunks ─────────────────────────────────────

function parseDiff(diffText) {
  const files = [];
  let currentFile = null;
  let lineNum = 0;
  
  for (const line of diffText.split('\n')) {
    // New file
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = { path: fileMatch[1], additions: [], deletions: [], addedLines: 0, deletedLines: 0 };
      files.push(currentFile);
      lineNum = 0;
      continue;
    }
    
    // Hunk header
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      lineNum = parseInt(hunkMatch[1]) - 1;
      continue;
    }
    
    if (!currentFile) continue;
    
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNum++;
      currentFile.additions.push({ line: lineNum, content: line.substring(1) });
      currentFile.addedLines++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentFile.deletions.push({ content: line.substring(1) });
      currentFile.deletedLines++;
    } else if (!line.startsWith('\\')) {
      lineNum++;
    }
  }
  
  return files;
}

// ─── Check Definitions ──────────────────────────────────────────

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SCRIPT_EXTS = new Set(['.mjs', '.cjs']); // CLI scripts — console.log is OK

function isCodeFile(path) {
  return CODE_EXTS.has(extname(path));
}

function isCliScript(path) {
  return SCRIPT_EXTS.has(extname(path)) || path.includes('scripts/') || path.includes('cli/');
}

function runChecks(files) {
  const findings = [];
  
  for (const file of files) {
    if (!isCodeFile(file.path)) continue;
    const isCli = isCliScript(file.path);
    
    for (const add of file.additions) {
      const content = add.content;
      const trimmed = content.trim();
      
      // Skip empty lines and imports
      if (!trimmed || trimmed.startsWith('import ') || trimmed.startsWith('//')) continue;
      
      // 1. Console.log additions (skip CLI scripts)
      if (!isCli && /console\.(log|debug|info)\s*\(/.test(content) && !content.includes('// keep')) {
        findings.push({
          file: file.path,
          line: add.line,
          check: 'console-log',
          severity: 'medium',
          message: 'new console.log added',
          code: trimmed.substring(0, 80),
        });
      }
      
      // 2. TODO/FIXME additions
      if (/\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(content)) {
        const match = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)\b/i);
        const tag = match[1].toUpperCase();
        findings.push({
          file: file.path,
          line: add.line,
          check: 'todo-added',
          severity: tag === 'HACK' || tag === 'XXX' ? 'high' : 'low',
          message: `new ${tag} comment`,
          code: trimmed.substring(0, 80),
        });
      }
      
      // 3. TypeScript `any` type (skip regex patterns and string checks)
      if ((/:\s*any\b/.test(content) || /as\s+any\b/.test(content) || /<any>/.test(content))
          && !content.includes('.test(') && !content.includes('.match(') && !/['"].*any.*['"]/.test(content)
          && !content.includes('RegExp')) {
        findings.push({
          file: file.path,
          line: add.line,
          check: 'any-type',
          severity: 'medium',
          message: 'TypeScript `any` type added',
          code: trimmed.substring(0, 80),
        });
      }
      
      // 4. Empty catch blocks (skip regex patterns checking for the pattern itself)
      if ((/catch\s*\([^)]*\)\s*\{\s*\}/.test(content) || /catch\s*\{\s*\}/.test(content))
          && !content.includes('.test(') && !content.includes('.match(') && !content.includes('RegExp')) {
        findings.push({
          file: file.path,
          line: add.line,
          check: 'empty-catch',
          severity: 'high',
          message: 'empty catch block — errors silently swallowed',
          code: trimmed.substring(0, 80),
        });
      }
      
      // 5. Hardcoded secrets/tokens (quick patterns)
      if (/(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(content)) {
        // Exclude template variables and examples
        if (!/process\.env|import\.meta|example|placeholder|\$\{|<your/i.test(content)) {
          findings.push({
            file: file.path,
            line: add.line,
            check: 'hardcoded-secret',
            severity: 'critical',
            message: 'possible hardcoded secret/token',
            code: trimmed.substring(0, 60) + '...',
          });
        }
      }
      
      // 6. Disabled eslint rules (skip string literals checking for the pattern)
      if (/eslint-disable/.test(content) && !content.includes('.test(') && !content.includes("'eslint") && !content.includes('"eslint')) {
        findings.push({
          file: file.path,
          line: add.line,
          check: 'lint-disable',
          severity: 'low',
          message: 'eslint rule disabled',
          code: trimmed.substring(0, 80),
        });
      }
      
      // 7. Non-null assertions (TypeScript !)
      if (strictMode && /\w+!\.\w+/.test(content) && !/\.filter\b/.test(content)) {
        findings.push({
          file: file.path,
          line: add.line,
          check: 'non-null-assert',
          severity: 'low',
          message: 'non-null assertion (!.) — consider proper null check',
          code: trimmed.substring(0, 80),
        });
      }
      
      // 8. Magic numbers (strict mode)
      if (strictMode && /(?<![.\w])(?:[2-9]\d{2,}|[1-9]\d{3,})(?![.\w])/.test(content)) {
        // Skip common patterns: array indices, ports, HTTP status, CSS values
        if (!/\[\d+\]|:\s*\d+|status|port|padding|margin|width|height|size|timeout|delay|max-age|0x/i.test(content)) {
          findings.push({
            file: file.path,
            line: add.line,
            check: 'magic-number',
            severity: 'info',
            message: 'magic number — consider extracting to a named constant',
            code: trimmed.substring(0, 80),
          });
        }
      }
      
      // 9. Nested ternaries (real ones, not regex/nullish coalescing)
      // Count actual ternary operators: ? followed by : in non-regex, non-?? context
      if (/\?[^?.].*\?[^?.]/.test(content) && !/\/.*\?/.test(content) && !/\?\?/.test(content) && !/\.test\(/.test(content) && !/\.match\(/.test(content)) {
        findings.push({
          file: file.path,
          line: add.line,
          check: 'nested-ternary',
          severity: 'medium',
          message: 'nested ternary — consider if/else or early return',
          code: trimmed.substring(0, 80),
        });
      }
      
      // 10. setTimeout/setInterval without cleanup
      if (/set(Timeout|Interval)\s*\(/.test(content) && !/clear(Timeout|Interval)/.test(content)) {
        // Only flag in React components
        if (file.path.endsWith('.tsx') || file.path.endsWith('.jsx')) {
          findings.push({
            file: file.path,
            line: add.line,
            check: 'timer-leak',
            severity: 'medium',
            message: 'timer in component — ensure cleanup in useEffect return',
            code: trimmed.substring(0, 80),
          });
        }
      }
      
      // 11. Blocking sync operations in async context
      if (/(readFileSync|writeFileSync|execSync)\s*\(/.test(content)) {
        // Flag in API routes / server components, not scripts
        if (!isCli && (file.path.includes('api/') || file.path.includes('server'))) {
          findings.push({
            file: file.path,
            line: add.line,
            check: 'sync-in-async',
            severity: 'medium',
            message: 'sync I/O in server context — consider async alternative',
            code: trimmed.substring(0, 80),
          });
        }
      }
      
      // 12. alert() / debugger (skip string literals containing the word)
      if (/\balert\s*\(/.test(content) && !/['"].*alert.*['"]/.test(content)) {
        findings.push({
          file: file.path, line: add.line, check: 'debug-artifact',
          severity: 'high', message: 'alert() call',
          code: trimmed.substring(0, 80),
        });
      }
      if (/^\s*debugger\s*;?\s*$/.test(content)) {
        findings.push({
          file: file.path, line: add.line, check: 'debug-artifact',
          severity: 'high', message: 'debugger statement',
          code: trimmed.substring(0, 80),
        });
      }
    }
    
    // File-level checks
    // 13. Large diff (>300 lines added to a single file)
    if (file.addedLines > 300) {
      findings.push({
        file: file.path,
        line: 0,
        check: 'large-diff',
        severity: 'medium',
        message: `${file.addedLines} lines added — consider splitting into smaller changes`,
        code: '',
      });
    }
    
    // 14. Large deletion without explanation (>100 lines removed, 0 added)
    if (file.deletedLines > 100 && file.addedLines === 0) {
      findings.push({
        file: file.path,
        line: 0,
        check: 'mass-delete',
        severity: 'info',
        message: `${file.deletedLines} lines deleted — verify this was intentional`,
        code: '',
      });
    }
    
    // 15. Check if test file was modified alongside source (strict)
    // (we track this globally below)
  }
  
  return findings;
}

// ─── Diff Stats ──────────────────────────────────────────────────

function getDiffStats(files) {
  let totalAdded = 0;
  let totalDeleted = 0;
  let filesChanged = files.length;
  
  for (const f of files) {
    totalAdded += f.addedLines;
    totalDeleted += f.deletedLines;
  }
  
  return { totalAdded, totalDeleted, filesChanged };
}

// ─── Test Coverage Check ─────────────────────────────────────────

function checkTestCoverage(files) {
  const sourceFiles = new Set();
  const testFiles = new Set();
  
  for (const f of files) {
    if (f.path.includes('.test.') || f.path.includes('.spec.') || f.path.includes('__tests__')) {
      testFiles.add(f.path);
    } else if (isCodeFile(f.path)) {
      sourceFiles.add(f.path);
    }
  }
  
  // If source changed but no tests changed — flag it
  if (sourceFiles.size > 0 && testFiles.size === 0 && strictMode) {
    return {
      check: 'no-tests',
      severity: 'info',
      message: `${sourceFiles.size} source file(s) changed but no test files touched`,
      files: [...sourceFiles].slice(0, 5),
    };
  }
  return null;
}

// ─── Score Calculation ───────────────────────────────────────────

const SEVERITY_WEIGHTS = { critical: 20, high: 10, medium: 5, low: 2, info: 0 };

function calculateScore(findings) {
  const totalWeight = findings.reduce((sum, f) => sum + (SEVERITY_WEIGHTS[f.severity] || 0), 0);
  // Score: 100 minus weighted findings, floor at 0
  return Math.max(0, Math.round(100 - totalWeight));
}

function scoreBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const color = score >= 80 ? c.green : score >= 60 ? c.yellow : score >= 40 ? c.yellow : c.red;
  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset} ${score}/100`;
}

function severityIcon(s) {
  switch (s) {
    case 'critical': return `${c.bgRed}${c.bold} CRIT ${c.reset}`;
    case 'high': return `${c.red}HIGH${c.reset}`;
    case 'medium': return `${c.yellow}MED ${c.reset}`;
    case 'low': return `${c.blue}LOW ${c.reset}`;
    case 'info': return `${c.dim}INFO${c.reset}`;
    default: return s;
  }
}

// ─── Verdict ─────────────────────────────────────────────────────

function verdict(score, findingCount) {
  if (findingCount === 0) return `${c.green}${c.bold}LGTM${c.reset} — clean diff, ship it`;
  if (score >= 90) return `${c.green}looks good${c.reset} — minor nits only`;
  if (score >= 75) return `${c.green}acceptable${c.reset} — a few things to consider`;
  if (score >= 60) return `${c.yellow}needs attention${c.reset} — review before pushing`;
  if (score >= 40) return `${c.yellow}concerning${c.reset} — several quality issues`;
  return `${c.red}needs work${c.reset} — significant issues found`;
}

// ─── Display ─────────────────────────────────────────────────────

function display(results) {
  const allFindings = [];
  const repoStats = [];
  
  for (const { repo, findings, stats, commits, testCoverage } of results) {
    if (stats.filesChanged === 0 && !commits) continue;
    
    allFindings.push(...findings);
    if (testCoverage) {
      allFindings.push(testCoverage);
    }
    repoStats.push({ repo, findings: findings.length, stats, commits });
  }
  
  const score = calculateScore(allFindings);
  const totalFiles = repoStats.reduce((s, r) => s + r.stats.filesChanged, 0);
  const totalAdded = repoStats.reduce((s, r) => s + r.stats.totalAdded, 0);
  const totalDeleted = repoStats.reduce((s, r) => s + r.stats.totalDeleted, 0);
  
  // JSON mode
  if (jsonMode) {
    console.log(JSON.stringify({
      score,
      findings: allFindings,
      stats: { files: totalFiles, added: totalAdded, deleted: totalDeleted },
      repos: repoStats.map(r => r.repo),
    }, null, 2));
    return { score, findings: allFindings };
  }
  
  // Short mode
  if (shortMode) {
    const icon = score >= 80 ? '✓' : score >= 60 ? '!' : '✗';
    const mode = sinceDate ? `since ${sinceDate}` : commitCount > 0 ? `last ${commitCount} commits` : 'uncommitted';
    console.log(`${icon} review: ${score}/100 | ${allFindings.length} findings | ${totalFiles} files (${mode})`);
    return { score, findings: allFindings };
  }
  
  // Full display
  const mode = sinceDate ? `since ${sinceDate}` : commitCount > 0 ? `last ${commitCount} commits` : 'uncommitted changes';
  
  console.log();
  console.log(`${c.bold}┌─ CODE REVIEW ─────────────────────────────────────┐${c.reset}`);
  console.log(`${c.bold}│${c.reset} scope: ${mode}`);
  console.log(`${c.bold}│${c.reset} files: ${totalFiles}  added: ${c.green}+${totalAdded}${c.reset}  deleted: ${c.red}-${totalDeleted}${c.reset}`);
  
  // Show repos
  if (repoStats.length > 1) {
    console.log(`${c.bold}│${c.reset} repos: ${repoStats.map(r => {
      const icon = r.findings > 0 ? c.yellow + '●' : c.green + '●';
      return `${icon} ${r.repo}${c.reset}`;
    }).join('  ')}`);
  }
  
  console.log(`${c.bold}│${c.reset}`);
  console.log(`${c.bold}│${c.reset} score: ${scoreBar(score)}`);
  console.log(`${c.bold}│${c.reset} verdict: ${verdict(score, allFindings.length)}`);
  console.log(`${c.bold}└───────────────────────────────────────────────────┘${c.reset}`);
  
  if (allFindings.length === 0) {
    console.log(`\n  ${c.dim}no issues found — clean code${c.reset}\n`);
    return { score, findings: allFindings };
  }
  
  // Group by severity
  const bySeverity = {};
  for (const f of allFindings) {
    const s = f.severity || 'info';
    if (!bySeverity[s]) bySeverity[s] = [];
    bySeverity[s].push(f);
  }
  
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  
  for (const sev of order) {
    const group = bySeverity[sev];
    if (!group || group.length === 0) continue;
    
    console.log(`\n  ${severityIcon(sev)} ${c.bold}${group.length} finding${group.length > 1 ? 's' : ''}${c.reset}`);
    
    for (const f of group) {
      const loc = f.line ? `${c.dim}:${f.line}${c.reset}` : '';
      const file = f.file || (f.files ? f.files[0] : '');
      console.log(`    ${c.cyan}${file}${loc}${c.reset}`);
      console.log(`    ${f.message}`);
      if (f.code) {
        console.log(`    ${c.dim}${f.code}${c.reset}`);
      }
      console.log();
    }
  }
  
  // Summary by check type
  const byCheck = {};
  for (const f of allFindings) {
    byCheck[f.check] = (byCheck[f.check] || 0) + 1;
  }
  
  console.log(`  ${c.bold}breakdown:${c.reset}`);
  for (const [check, count] of Object.entries(byCheck).sort((a, b) => b[1] - a[1])) {
    const bar = '▪'.repeat(Math.min(count, 20));
    console.log(`    ${c.dim}${check.padEnd(18)}${c.reset} ${bar} ${count}`);
  }
  console.log();
  
  return { score, findings: allFindings };
}

// ─── Main ────────────────────────────────────────────────────────

const repos = findRepos();
const results = [];

for (const repo of repos) {
  const diffText = getDiff(repo.path);
  if (!diffText.trim()) {
    results.push({ repo: repo.name, findings: [], stats: { totalAdded: 0, totalDeleted: 0, filesChanged: 0 }, commits: null, testCoverage: null });
    continue;
  }
  
  const files = parseDiff(diffText);
  const findings = runChecks(files);
  const stats = getDiffStats(files);
  const commits = getCommitInfo(repo.path);
  const testCoverage = checkTestCoverage(files);
  
  results.push({ repo: repo.name, findings, stats, commits, testCoverage });
}

const { score, findings } = display(results);

// Exit code for CI integration
if (!jsonMode && !shortMode) {
  if (score < 40) {
    process.exit(1);
  }
}

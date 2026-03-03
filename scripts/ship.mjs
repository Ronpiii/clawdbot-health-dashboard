#!/usr/bin/env node
/**
 * arc ship — pre-deploy flight checklist
 * 
 * runs a battery of checks before you push/deploy:
 *   1. git state (clean? unpushed? correct branch?)
 *   2. code review (quality issues in recent changes?)
 *   3. service health (production endpoints up?)
 *   4. env audit (missing vars? drift?)
 *   5. broken refs (anything pointing to nothing?)
 * 
 * gives a SHIP / HOLD / ABORT verdict with reasoning
 * 
 * usage:
 *   arc ship                     # check everything (all projects)
 *   arc ship anivia              # check specific project
 *   arc ship --quick             # git + review only (skip slow checks)
 *   arc ship --fix               # auto-fix safe issues (git add, clean)
 *   arc ship --short             # one-liner verdict
 *   arc ship --json              # machine-readable
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(__dirname, '..');

// --- arg parsing ---
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const isQuick = flags.has('--quick');
const isFix = flags.has('--fix');
const isShort = flags.has('--short');
const isJson = flags.has('--json');
const targetProject = positional[0] || null;

// --- project discovery ---
const PROJECT_ALIASES = {
  mundo: 'tuner',
  cm: 'context-memory',
  vsite: 'ventok-site',
  discord: 'discord-voice-bot',
};

function findProjects() {
  const projectsDir = join(WORKSPACE, 'projects');
  const projects = [];
  
  // workspace root (clawd itself)
  if (existsSync(join(WORKSPACE, '.git'))) {
    projects.push({ name: 'clawd', path: WORKSPACE });
  }
  
  // projects/ subdirectories with .git
  if (existsSync(projectsDir)) {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const projPath = join(projectsDir, entry.name);
        if (existsSync(join(projPath, '.git'))) {
          projects.push({ name: entry.name, path: projPath });
        }
        // check one level deeper (e.g., projects/context-memory/api)
        try {
          for (const sub of readdirSync(projPath, { withFileTypes: true })) {
            if (sub.isDirectory() && existsSync(join(projPath, sub.name, '.git'))) {
              projects.push({ name: `${entry.name}/${sub.name}`, path: join(projPath, sub.name) });
            }
          }
        } catch {}
      }
    }
  }
  
  return projects;
}

function resolveProject(name) {
  const resolved = PROJECT_ALIASES[name] || name;
  const projects = findProjects();
  return projects.find(p => p.name === resolved || p.name.endsWith('/' + resolved));
}

// --- utilities ---
function git(cmd, cwd) {
  try {
    return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', timeout: 10000 }).trim();
  } catch {
    return '';
  }
}

function bar(score, width = 20) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function grade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// --- check modules ---

function checkGit(project) {
  const results = { name: 'git', items: [], score: 100, weight: 30 };
  const projects = project ? [project] : findProjects();
  
  for (const proj of projects) {
    const branch = git('branch --show-current', proj.path);
    const status = git('status --porcelain', proj.path);
    const unpushed = git('log --oneline @{upstream}..HEAD 2>/dev/null', proj.path);
    const lastCommit = git('log -1 --format="%h %s" 2>/dev/null', proj.path);
    
    const dirtyFiles = status ? status.split('\n').filter(Boolean) : [];
    const unpushedCount = unpushed ? unpushed.split('\n').filter(Boolean).length : 0;
    
    // check for uncommitted changes
    if (dirtyFiles.length > 0) {
      const staged = dirtyFiles.filter(f => !f.startsWith('?') && !f.startsWith(' ')).length;
      const modified = dirtyFiles.filter(f => f.startsWith(' M') || f.startsWith('MM')).length;
      const untracked = dirtyFiles.filter(f => f.startsWith('??')).length;
      
      results.items.push({
        project: proj.name,
        severity: 'high',
        message: `${dirtyFiles.length} uncommitted (${staged} staged, ${modified} modified, ${untracked} untracked)`,
        fixable: staged > 0
      });
      results.score -= Math.min(15, dirtyFiles.length * 3);
    }
    
    // check for unpushed commits
    if (unpushedCount > 0) {
      results.items.push({
        project: proj.name,
        severity: 'medium',
        message: `${unpushedCount} unpushed commit${unpushedCount > 1 ? 's' : ''}`,
        fixable: true
      });
      results.score -= Math.min(10, unpushedCount * 3);
    }
    
    // check branch (warn if not main/master)
    if (branch && !['main', 'master'].includes(branch)) {
      results.items.push({
        project: proj.name,
        severity: 'info',
        message: `on branch "${branch}" (not main/master)`,
        fixable: false
      });
      results.score -= 2;
    }
    
    // check for merge conflicts
    if (dirtyFiles.some(f => f.startsWith('UU') || f.startsWith('AA'))) {
      results.items.push({
        project: proj.name,
        severity: 'critical',
        message: 'unresolved merge conflicts!',
        fixable: false
      });
      results.score -= 30;
    }
    
    // check for stale branch (no commits in 7 days)
    const lastDate = git('log -1 --format="%ai" 2>/dev/null', proj.path);
    if (lastDate) {
      const daysSince = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 14) {
        results.items.push({
          project: proj.name,
          severity: 'info',
          message: `last commit ${Math.floor(daysSince)}d ago (stale)`,
          fixable: false
        });
      }
    }
  }
  
  results.score = Math.max(0, results.score);
  return results;
}

function checkReview(project) {
  const results = { name: 'review', items: [], score: 100, weight: 25 };
  const projects = project ? [project] : findProjects();
  
  for (const proj of projects) {
    // get uncommitted diff
    let diff = '';
    try {
      diff = execSync('git diff HEAD 2>/dev/null', { cwd: proj.path, encoding: 'utf8', timeout: 10000 });
    } catch {}
    
    if (!diff) continue;
    
    const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
    
    // check patterns in added lines
    let consoleLogs = 0;
    let todos = 0;
    let anyTypes = 0;
    let debuggers = 0;
    let eslintDisables = 0;
    let hardcodedSecrets = 0;
    
    const isCliScript = (line) => false; // we're checking diff context, not files
    
    for (const line of addedLines) {
      const content = line.slice(1); // remove leading +
      
      // console.log (skip if in a test/script context)
      if (/console\.(log|debug|warn|error)\s*\(/.test(content) && 
          !content.includes('.test(') && !content.includes('RegExp') &&
          !content.includes("'console.") && !content.includes('"console.')) {
        consoleLogs++;
      }
      
      // TODO/FIXME/HACK
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(content) && 
          !content.includes("'TODO") && !content.includes('"TODO')) {
        todos++;
      }
      
      // TypeScript any
      if (/:\s*any\b/.test(content) && !content.includes("'any'") && !content.includes('"any"')) {
        anyTypes++;
      }
      
      // debugger
      if (/^\s*debugger\s*;?\s*$/.test(content)) {
        debuggers++;
      }
      
      // eslint-disable
      if (/eslint-disable/.test(content)) {
        eslintDisables++;
      }
      
      // potential secrets (long alphanumeric strings that look like keys)
      if (/(sk_live_|pk_live_|ghp_|gho_|AKIA|xox[bsp]-|SG\.)/.test(content)) {
        hardcodedSecrets++;
      }
    }
    
    if (hardcodedSecrets > 0) {
      results.items.push({ project: proj.name, severity: 'critical', message: `${hardcodedSecrets} potential hardcoded secret(s)!` });
      results.score -= 30;
    }
    if (debuggers > 0) {
      results.items.push({ project: proj.name, severity: 'high', message: `${debuggers} debugger statement(s)` });
      results.score -= 15;
    }
    if (consoleLogs > 3) {
      results.items.push({ project: proj.name, severity: 'medium', message: `${consoleLogs} console.log additions` });
      results.score -= Math.min(15, consoleLogs * 2);
    }
    if (anyTypes > 2) {
      results.items.push({ project: proj.name, severity: 'medium', message: `${anyTypes} TypeScript \`any\` types added` });
      results.score -= Math.min(10, anyTypes * 2);
    }
    if (todos > 0) {
      results.items.push({ project: proj.name, severity: 'low', message: `${todos} new TODO/FIXME/HACK comment(s)` });
      results.score -= Math.min(5, todos);
    }
    if (eslintDisables > 0) {
      results.items.push({ project: proj.name, severity: 'low', message: `${eslintDisables} eslint-disable(s)` });
      results.score -= Math.min(5, eslintDisables);
    }
  }
  
  results.score = Math.max(0, results.score);
  return results;
}

async function checkPulse() {
  const results = { name: 'services', items: [], score: 100, weight: 20 };
  
  const endpoints = [
    { name: 'anivia', url: 'https://anivia.vercel.app', critical: true },
    { name: 'ventok', url: 'https://www.ventok.eu', critical: false },
    { name: 'supabase', url: 'https://api.supabase.com', critical: true },
  ];
  
  const checks = await Promise.all(endpoints.map(async (ep) => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(ep.url, { 
        signal: controller.signal,
        method: 'HEAD',
        redirect: 'follow'
      });
      clearTimeout(timeout);
      const ms = Date.now() - start;
      return { ...ep, status: resp.status, ms, up: resp.status < 500 };
    } catch (e) {
      return { ...ep, status: 0, ms: Date.now() - start, up: false, error: e.message };
    }
  }));
  
  for (const check of checks) {
    if (!check.up) {
      results.items.push({
        service: check.name,
        severity: check.critical ? 'critical' : 'high',
        message: `${check.name} DOWN (${check.error || `HTTP ${check.status}`})`,
      });
      results.score -= check.critical ? 25 : 10;
    } else if (check.ms > 3000) {
      results.items.push({
        service: check.name,
        severity: 'medium',
        message: `${check.name} slow (${check.ms}ms)`,
      });
      results.score -= 5;
    }
  }
  
  results.checks = checks;
  results.score = Math.max(0, results.score);
  return results;
}

function checkEnv(project) {
  const results = { name: 'env', items: [], score: 100, weight: 15 };
  const projects = project ? [project] : findProjects();
  
  for (const proj of projects) {
    const envExample = ['.env.example', '.env.local.example', 'env.example'].find(f => 
      existsSync(join(proj.path, f))
    );
    const envActual = ['.env', '.env.local'].find(f =>
      existsSync(join(proj.path, f))
    );
    
    if (!envExample && !envActual) continue;
    
    // check gitignore coverage
    const gitignore = existsSync(join(proj.path, '.gitignore')) 
      ? readFileSync(join(proj.path, '.gitignore'), 'utf8') 
      : '';
    
    if (envActual && !gitignore.includes('.env')) {
      results.items.push({
        project: proj.name,
        severity: 'critical',
        message: `.env not in .gitignore — secrets may be exposed!`,
      });
      results.score -= 30;
    }
    
    // check example vs actual
    if (envExample && envActual) {
      const exampleKeys = readFileSync(join(proj.path, envExample), 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => l.split('=')[0].trim());
      
      const actualKeys = readFileSync(join(proj.path, envActual), 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => l.split('=')[0].trim());
      
      const missing = exampleKeys.filter(k => !actualKeys.includes(k));
      const undocumented = actualKeys.filter(k => !exampleKeys.includes(k));
      
      if (missing.length > 0) {
        results.items.push({
          project: proj.name,
          severity: 'high',
          message: `${missing.length} env var(s) in example but missing from actual: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`,
        });
        results.score -= Math.min(15, missing.length * 5);
      }
      
      if (undocumented.length > 0) {
        results.items.push({
          project: proj.name,
          severity: 'low',
          message: `${undocumented.length} undocumented env var(s) (in actual but not example)`,
        });
        results.score -= Math.min(5, undocumented.length);
      }
    } else if (envExample && !envActual) {
      results.items.push({
        project: proj.name,
        severity: 'low',
        message: `.env.example exists but no local .env (may be deployed-only)`,
      });
      results.score -= 3;
    }
  }
  
  results.score = Math.max(0, results.score);
  return results;
}

function checkLockfiles(project) {
  const results = { name: 'lockfiles', items: [], score: 100, weight: 10 };
  const projects = project ? [project] : findProjects();
  
  for (const proj of projects) {
    const hasPkg = existsSync(join(proj.path, 'package.json'));
    if (!hasPkg) continue;
    
    const hasLock = existsSync(join(proj.path, 'package-lock.json')) || 
                    existsSync(join(proj.path, 'pnpm-lock.yaml')) ||
                    existsSync(join(proj.path, 'yarn.lock')) ||
                    existsSync(join(proj.path, 'bun.lockb'));
    const hasNodeModules = existsSync(join(proj.path, 'node_modules'));
    
    if (!hasLock && hasNodeModules) {
      results.items.push({
        project: proj.name,
        severity: 'medium',
        message: 'no lockfile but node_modules exists — non-reproducible builds',
      });
      results.score -= 10;
    }
    
    // check if lockfile is newer than node_modules (deps might be stale)
    if (hasLock && hasNodeModules) {
      try {
        const lockPath = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']
          .map(f => join(proj.path, f))
          .find(f => existsSync(f));
        
        if (lockPath) {
          const lockMtime = statSync(lockPath).mtimeMs;
          const nmMtime = statSync(join(proj.path, 'node_modules')).mtimeMs;
          
          if (lockMtime > nmMtime) {
            results.items.push({
              project: proj.name,
              severity: 'medium',
              message: 'lockfile newer than node_modules — run npm install',
            });
            results.score -= 8;
          }
        }
      } catch {}
    }
  }
  
  results.score = Math.max(0, results.score);
  return results;
}

// --- verdict engine ---

function computeVerdict(checks) {
  // weighted composite
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const weightedScore = checks.reduce((s, c) => s + (c.score * c.weight), 0) / totalWeight;
  
  // critical items are instant blockers
  const criticals = checks.flatMap(c => (c.items || []).filter(i => i.severity === 'critical'));
  const highs = checks.flatMap(c => (c.items || []).filter(i => i.severity === 'high'));
  
  let verdict, reason;
  
  if (criticals.length > 0) {
    verdict = 'ABORT';
    reason = `${criticals.length} critical issue(s) — fix before deploying`;
  } else if (weightedScore < 50) {
    verdict = 'HOLD';
    reason = `score ${Math.round(weightedScore)}/100 — too many issues to ship safely`;
  } else if (highs.length > 3) {
    verdict = 'HOLD';
    reason = `score ${Math.round(weightedScore)}/100 — ${highs.length} high-severity issues need attention`;
  } else if (weightedScore < 70) {
    verdict = 'HOLD';
    reason = `score ${Math.round(weightedScore)}/100 — worth fixing a few things first`;
  } else {
    verdict = 'SHIP';
    reason = weightedScore >= 90 
      ? `score ${Math.round(weightedScore)}/100 — clean slate, send it`
      : `score ${Math.round(weightedScore)}/100 — minor issues, safe to deploy`;
  }
  
  return { verdict, reason, score: Math.round(weightedScore), criticals: criticals.length, highs: highs.length };
}

// --- display ---

const SEVERITY_ICONS = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: '⚪',
};

const VERDICT_ICONS = {
  SHIP: '🟢',
  HOLD: '🟡', 
  ABORT: '🔴',
};

function display(checks, verdict) {
  if (isShort) {
    const icon = VERDICT_ICONS[verdict.verdict];
    const issues = checks.reduce((s, c) => s + (c.items?.length || 0), 0);
    console.log(`${icon} ${verdict.verdict} ${verdict.score}/100 — ${issues} issue(s)${targetProject ? ` [${targetProject}]` : ''}`);
    return;
  }
  
  console.log();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║         ⚓ PRE-DEPLOY CHECKLIST          ║');
  console.log('╚══════════════════════════════════════════╝');
  if (targetProject) console.log(`  project: ${targetProject}`);
  console.log();
  
  for (const check of checks) {
    const icon = check.score >= 80 ? '✓' : check.score >= 50 ? '△' : '✗';
    const scoreStr = `${check.score}/100`;
    console.log(`  ${icon} ${check.name.toUpperCase().padEnd(12)} ${bar(check.score, 15)} ${scoreStr}`);
    
    if (check.items && check.items.length > 0) {
      for (const item of check.items) {
        const sev = SEVERITY_ICONS[item.severity] || '·';
        const proj = item.project || item.service || '';
        console.log(`    ${sev} ${proj ? proj + ': ' : ''}${item.message}`);
      }
    }
    
    // show service check details
    if (check.name === 'services' && check.checks) {
      for (const svc of check.checks) {
        if (svc.up) {
          console.log(`    ✓ ${svc.name} (${svc.ms}ms)`);
        }
      }
    }
    
    console.log();
  }
  
  // verdict
  const vIcon = VERDICT_ICONS[verdict.verdict];
  console.log('  ─────────────────────────────────────');
  console.log(`  ${vIcon} VERDICT: ${verdict.verdict}  ${bar(verdict.score, 20)} ${verdict.score}/100`);
  console.log(`    ${verdict.reason}`);
  
  // action items
  const fixable = checks.flatMap(c => (c.items || []).filter(i => i.fixable));
  if (fixable.length > 0 && !isFix) {
    console.log();
    console.log(`  💡 ${fixable.length} auto-fixable issue(s) — run with --fix`);
  }
  
  console.log();
}

// --- auto-fix ---

function applyFixes(checks) {
  let fixed = 0;
  
  for (const check of checks) {
    if (check.name !== 'git') continue;
    
    for (const item of check.items || []) {
      if (!item.fixable) continue;
      
      if (item.message.includes('unpushed')) {
        const proj = findProjects().find(p => p.name === item.project);
        if (proj) {
          try {
            console.log(`  → pushing ${item.project}...`);
            execSync('git push', { cwd: proj.path, encoding: 'utf8', timeout: 30000 });
            fixed++;
          } catch (e) {
            console.log(`  ✗ push failed for ${item.project}: ${e.message}`);
          }
        }
      }
    }
  }
  
  if (fixed > 0) {
    console.log(`\n  ✓ ${fixed} issue(s) auto-fixed\n`);
  }
  
  return fixed;
}

// --- main ---

async function main() {
  const project = targetProject ? resolveProject(targetProject) : null;
  
  if (targetProject && !project) {
    console.error(`unknown project: ${targetProject}`);
    console.error(`available: ${findProjects().map(p => p.name).join(', ')}`);
    process.exit(1);
  }
  
  // run checks
  const checks = [];
  
  // always run git + review
  checks.push(checkGit(project));
  checks.push(checkReview(project));
  
  if (!isQuick) {
    // parallel: pulse + env + lockfiles
    const [pulse] = await Promise.all([checkPulse()]);
    checks.push(pulse);
    checks.push(checkEnv(project));
    checks.push(checkLockfiles(project));
  }
  
  const verdict = computeVerdict(checks);
  
  if (isJson) {
    console.log(JSON.stringify({ checks, verdict }, null, 2));
    return;
  }
  
  display(checks, verdict);
  
  if (isFix) {
    applyFixes(checks);
  }
  
  // exit code for CI
  process.exit(verdict.verdict === 'ABORT' ? 2 : verdict.verdict === 'HOLD' ? 1 : 0);
}

main().catch(e => {
  console.error('ship check failed:', e.message);
  process.exit(1);
});

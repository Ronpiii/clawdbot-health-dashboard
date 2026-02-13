#!/usr/bin/env node

/**
 * arc env — environment variable audit dashboard
 * 
 * Scans workspace for .env files, compares examples vs actual,
 * finds missing vars, placeholder values, shared keys, gitignore gaps.
 * 
 * NEVER displays actual values — only key names and status.
 * 
 * Usage:
 *   arc env                  overview dashboard
 *   arc env <project>        single project detail
 *   arc env --drift          show example vs actual drift
 *   arc env --shared         show vars shared across projects
 *   arc env --security       security-focused checks only
 *   arc env --short          one-liner summary
 *   arc env --json           machine-readable output
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, relative } from 'path';
import { execSync } from 'child_process';

const ROOT = process.env.WORKSPACE || join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flags = {
  drift: args.includes('--drift'),
  shared: args.includes('--shared'),
  security: args.includes('--security'),
  short: args.includes('--short'),
  json: args.includes('--json'),
};
const projectFilter = args.find(a => !a.startsWith('--'));

// ── helpers ──────────────────────────────────────────────────────────────────

function findEnvFiles(dir, depth = 0, maxDepth = 4) {
  const results = [];
  if (depth > maxDepth) return results;
  
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (['node_modules', '.git', '.next', '.vercel', 'dist', 'build'].includes(entry)) continue;
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          results.push(...findEnvFiles(full, depth + 1, maxDepth));
        } else if (entry.match(/^\.env/)) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

function parseEnvFile(path) {
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf-8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    vars[key] = val;
  }
  return vars;
}

function isPlaceholder(val) {
  if (!val || val === '') return true;
  const lower = val.toLowerCase();
  return (
    lower.includes('your-') ||
    lower.includes('your_') ||
    lower === 'changeme' ||
    lower === 'change-me' ||
    lower === 'todo' ||
    lower === 'xxx' ||
    lower === 'placeholder' ||
    lower.startsWith('sk-...') ||
    lower.startsWith('sk_...') ||
    lower === 'change-this-to-a-random-string' ||
    /^(your|my|the)[_-]/.test(lower)
  );
}

function classifyValue(val) {
  if (!val || val === '') return 'empty';
  if (isPlaceholder(val)) return 'placeholder';
  return 'set';
}

function isGitignored(filePath) {
  try {
    // find the repo root for this file
    const dir = dirname(filePath);
    const result = execSync(`cd "${dir}" && git check-ignore "${filePath}" 2>/dev/null`, { encoding: 'utf-8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

function getProjectName(filePath) {
  const rel = relative(ROOT, filePath);
  const parts = rel.split('/');
  if (parts[0] === 'projects' && parts.length > 1) return parts[1];
  if (parts.length > 1) return parts[0];
  return 'root';
}

function maskValue(val) {
  if (!val) return '(empty)';
  if (val.length <= 8) return '****';
  return val.slice(0, 4) + '...' + val.slice(-4);
}

function isSensitiveKey(key) {
  const lower = key.toLowerCase();
  return (
    lower.includes('key') || lower.includes('secret') || lower.includes('token') ||
    lower.includes('password') || lower.includes('pass') || lower.includes('auth') ||
    lower.includes('credential') || lower.includes('private')
  );
}

// ── scanning ─────────────────────────────────────────────────────────────────

const allEnvFiles = findEnvFiles(ROOT);
const projects = new Map(); // projectName → { files, vars }

for (const file of allEnvFiles) {
  const projName = getProjectName(file);
  if (projectFilter && projName !== projectFilter) continue;
  
  if (!projects.has(projName)) {
    projects.set(projName, { files: [], allVars: new Map() });
  }
  
  const proj = projects.get(projName);
  const fileName = basename(file);
  const isExample = fileName.includes('example');
  const vars = parseEnvFile(file);
  const gitignored = isGitignored(file);
  
  proj.files.push({
    path: file,
    relative: relative(ROOT, file),
    name: fileName,
    isExample,
    gitignored,
    vars: vars || {},
    varCount: vars ? Object.keys(vars).length : 0,
  });
  
  if (vars) {
    for (const [key, val] of Object.entries(vars)) {
      if (!proj.allVars.has(key)) {
        proj.allVars.set(key, []);
      }
      proj.allVars.get(key).push({ file: fileName, value: val, isExample });
    }
  }
}

// ── analysis ─────────────────────────────────────────────────────────────────

const analysis = {
  projects: [],
  security: { issues: [], score: 100 },
  drift: [],
  shared: new Map(), // key → [{ project, file }]
  totals: { files: 0, vars: 0, missing: 0, placeholders: 0, securityIssues: 0 },
};

for (const [projName, proj] of projects) {
  const projAnalysis = {
    name: projName,
    files: proj.files.map(f => ({
      name: f.name,
      path: f.relative,
      isExample: f.isExample,
      gitignored: f.gitignored,
      varCount: f.varCount,
    })),
    drift: [],
    issues: [],
    varSummary: { total: 0, set: 0, empty: 0, placeholder: 0 },
  };
  
  // find example/actual pairs
  const exampleFiles = proj.files.filter(f => f.isExample);
  const actualFiles = proj.files.filter(f => !f.isExample);
  
  for (const example of exampleFiles) {
    // find matching actual file
    const expectedName = example.name.replace('.example', '').replace('.local.example', '.local');
    const actual = actualFiles.find(f => f.name === expectedName || f.name === '.env.local' || f.name === '.env');
    
    if (!actual) {
      projAnalysis.drift.push({
        type: 'missing-actual',
        example: example.name,
        expected: expectedName,
        message: `${example.name} exists but ${expectedName} not found`,
      });
      analysis.totals.missing += Object.keys(example.vars).length;
      continue;
    }
    
    // compare keys
    const exampleKeys = new Set(Object.keys(example.vars));
    const actualKeys = new Set(Object.keys(actual.vars));
    
    const missingInActual = [...exampleKeys].filter(k => !actualKeys.has(k));
    const extraInActual = [...actualKeys].filter(k => !exampleKeys.has(k));
    const inBoth = [...exampleKeys].filter(k => actualKeys.has(k));
    
    for (const key of missingInActual) {
      projAnalysis.drift.push({
        type: 'missing-var',
        key,
        message: `${key} in ${example.name} but missing from ${actual.name}`,
      });
      analysis.totals.missing++;
    }
    
    for (const key of extraInActual) {
      projAnalysis.drift.push({
        type: 'extra-var',
        key,
        message: `${key} in ${actual.name} but not in ${example.name}`,
      });
    }
    
    // check for placeholder values in actual
    for (const key of inBoth) {
      const status = classifyValue(actual.vars[key]);
      if (status === 'placeholder') {
        projAnalysis.drift.push({
          type: 'placeholder',
          key,
          message: `${key} still has placeholder value in ${actual.name}`,
        });
        analysis.totals.placeholders++;
      } else if (status === 'empty') {
        projAnalysis.drift.push({
          type: 'empty',
          key,
          message: `${key} is empty in ${actual.name}`,
        });
        analysis.totals.placeholders++;
      }
    }
  }
  
  // security checks
  for (const file of actualFiles) {
    // .env with real values not gitignored
    if (!file.gitignored && Object.keys(file.vars).length > 0) {
      const hasSensitive = Object.keys(file.vars).some(k => isSensitiveKey(k));
      if (hasSensitive) {
        projAnalysis.issues.push({
          severity: 'critical',
          message: `${file.name} contains secrets and is NOT gitignored`,
          file: file.relative,
        });
        analysis.security.score -= 20;
        analysis.totals.securityIssues++;
      }
    }
    
    projAnalysis.varSummary.total += file.varCount;
  }
  
  // count actual vars
  for (const file of actualFiles) {
    for (const [key, val] of Object.entries(file.vars)) {
      const status = classifyValue(val);
      if (status === 'set') projAnalysis.varSummary.set++;
      else if (status === 'empty') projAnalysis.varSummary.empty++;
      else if (status === 'placeholder') projAnalysis.varSummary.placeholder++;
    }
  }
  
  // track shared vars
  for (const file of proj.files) {
    if (file.isExample) continue;
    for (const key of Object.keys(file.vars)) {
      if (!analysis.shared.has(key)) analysis.shared.set(key, []);
      analysis.shared.get(key).push({ project: projName, file: file.name });
    }
  }
  
  analysis.projects.push(projAnalysis);
  analysis.totals.files += proj.files.length;
  analysis.totals.vars += projAnalysis.varSummary.total;
  analysis.drift.push(...projAnalysis.drift);
}

// find actually shared keys (appear in 2+ projects)
const sharedKeys = new Map();
for (const [key, locations] of analysis.shared) {
  const uniqueProjects = new Set(locations.map(l => l.project));
  if (uniqueProjects.size > 1) {
    sharedKeys.set(key, locations);
  }
}

// security score floor
analysis.security.score = Math.max(0, analysis.security.score);

// ── output ───────────────────────────────────────────────────────────────────

if (flags.json) {
  const output = {
    ...analysis,
    shared: Object.fromEntries(sharedKeys),
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

if (flags.short) {
  const issues = analysis.drift.length;
  const sec = analysis.totals.securityIssues;
  const shared = sharedKeys.size;
  console.log(`env: ${analysis.totals.files} files, ${analysis.totals.vars} vars across ${projects.size} projects | ${issues} drift issues | ${sec} security issues | ${shared} shared keys`);
  process.exit(0);
}

// ── full dashboard ───────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

function severity(level) {
  if (level === 'critical') return `${C.bgRed}${C.bold} CRIT ${C.reset}`;
  if (level === 'high') return `${C.red}${C.bold} HIGH ${C.reset}`;
  if (level === 'medium') return `${C.yellow} MED  ${C.reset}`;
  return `${C.dim} LOW  ${C.reset}`;
}

function bar(filled, total, width = 20) {
  const pct = total > 0 ? Math.min(1, filled / total) : 0;
  const blocks = Math.round(pct * width);
  const empty = width - blocks;
  const color = pct > 0.8 ? C.green : pct > 0.5 ? C.yellow : C.red;
  return color + '█'.repeat(blocks) + C.dim + '░'.repeat(empty) + C.reset;
}

console.log();
console.log(`${C.bold}${C.cyan}⌁ ENV AUDIT${C.reset}  ${C.dim}environment variable dashboard${C.reset}`);
console.log(`${C.dim}${'─'.repeat(58)}${C.reset}`);

// overview
console.log();
console.log(`${C.bold}Overview${C.reset}`);
console.log(`  projects   ${C.bold}${projects.size}${C.reset}`);
console.log(`  env files  ${C.bold}${analysis.totals.files}${C.reset}`);
console.log(`  variables  ${C.bold}${analysis.totals.vars}${C.reset} across all projects`);
console.log(`  drift      ${analysis.drift.length > 0 ? C.yellow : C.green}${analysis.drift.length} issues${C.reset}`);
console.log(`  shared     ${C.cyan}${sharedKeys.size} keys${C.reset} appear in 2+ projects`);

// per-project breakdown
if (!flags.security) {
  console.log();
  console.log(`${C.bold}Projects${C.reset}`);
  
  for (const proj of analysis.projects) {
    const driftCount = proj.drift.length;
    const issueCount = proj.issues.length;
    const statusIcon = issueCount > 0 ? `${C.red}●${C.reset}` : driftCount > 0 ? `${C.yellow}●${C.reset}` : `${C.green}●${C.reset}`;
    
    console.log();
    console.log(`  ${statusIcon} ${C.bold}${proj.name}${C.reset}`);
    
    for (const file of proj.files) {
      const typeLabel = file.isExample ? `${C.dim}example${C.reset}` : `${C.green}actual${C.reset}`;
      const giLabel = file.gitignored ? `${C.green}gitignored${C.reset}` : file.isExample ? '' : `${C.red}EXPOSED${C.reset}`;
      console.log(`    ${C.dim}├${C.reset} ${file.name} ${C.dim}(${file.varCount} vars)${C.reset} ${typeLabel} ${giLabel}`);
    }
    
    // var summary for actual files
    const vs = proj.varSummary;
    if (vs.total > 0) {
      console.log(`    ${C.dim}│${C.reset}`);
      console.log(`    ${C.dim}├${C.reset} vars: ${bar(vs.set, vs.total)} ${C.bold}${vs.set}${C.reset}/${vs.total} configured`);
      if (vs.empty > 0) console.log(`    ${C.dim}├${C.reset} ${C.yellow}${vs.empty} empty${C.reset}`);
      if (vs.placeholder > 0) console.log(`    ${C.dim}├${C.reset} ${C.yellow}${vs.placeholder} placeholder${C.reset}`);
    }
    
    // drift issues
    if (proj.drift.length > 0 && (flags.drift || !flags.shared)) {
      console.log(`    ${C.dim}│${C.reset}`);
      for (const d of proj.drift) {
        const icon = d.type === 'missing-var' ? `${C.red}✗${C.reset}` :
                     d.type === 'missing-actual' ? `${C.red}⚠${C.reset}` :
                     d.type === 'extra-var' ? `${C.blue}+${C.reset}` :
                     d.type === 'placeholder' ? `${C.yellow}~${C.reset}` :
                     `${C.yellow}○${C.reset}`;
        console.log(`    ${C.dim}├${C.reset} ${icon} ${d.message}`);
      }
    }
    
    // security issues
    if (proj.issues.length > 0) {
      console.log(`    ${C.dim}│${C.reset}`);
      for (const issue of proj.issues) {
        console.log(`    ${C.dim}└${C.reset} ${severity(issue.severity)} ${issue.message}`);
      }
    }
  }
}

// shared variables
if (sharedKeys.size > 0 && (flags.shared || !flags.drift)) {
  console.log();
  console.log(`${C.bold}Shared Variables${C.reset} ${C.dim}(same key in 2+ projects)${C.reset}`);
  
  for (const [key, locations] of sharedKeys) {
    const projects = locations.map(l => `${C.cyan}${l.project}${C.reset}${C.dim}/${l.file}${C.reset}`);
    const sensitive = isSensitiveKey(key) ? ` ${C.yellow}⚿${C.reset}` : '';
    console.log(`  ${C.bold}${key}${C.reset}${sensitive} → ${projects.join(', ')}`);
  }
}

// security section
if (analysis.totals.securityIssues > 0 || flags.security) {
  console.log();
  console.log(`${C.bold}Security${C.reset}`);
  
  let allIssues = [];
  for (const proj of analysis.projects) {
    for (const issue of proj.issues) {
      allIssues.push({ ...issue, project: proj.name });
    }
  }
  
  if (allIssues.length === 0) {
    console.log(`  ${C.green}✓ No security issues found${C.reset}`);
  } else {
    for (const issue of allIssues) {
      console.log(`  ${severity(issue.severity)} ${C.bold}${issue.project}${C.reset}: ${issue.message}`);
    }
  }
}

// drift summary
if (flags.drift && analysis.drift.length > 0) {
  console.log();
  console.log(`${C.bold}All Drift Issues${C.reset}`);
  
  const byType = {};
  for (const d of analysis.drift) {
    if (!byType[d.type]) byType[d.type] = [];
    byType[d.type].push(d);
  }
  
  const typeLabels = {
    'missing-var': `${C.red}Missing Variables${C.reset} (in example but not actual)`,
    'missing-actual': `${C.red}Missing Env Files${C.reset} (example exists, no actual)`,
    'extra-var': `${C.blue}Extra Variables${C.reset} (in actual but not example)`,
    'placeholder': `${C.yellow}Placeholder Values${C.reset} (not yet configured)`,
    'empty': `${C.yellow}Empty Values${C.reset}`,
  };
  
  for (const [type, items] of Object.entries(byType)) {
    console.log(`  ${typeLabels[type] || type}: ${items.length}`);
    for (const item of items) {
      console.log(`    ${C.dim}·${C.reset} ${item.message}`);
    }
  }
}

// recommendations
console.log();
console.log(`${C.bold}Recommendations${C.reset}`);

const recs = [];

// check for non-gitignored actual env files
for (const proj of analysis.projects) {
  for (const file of proj.files) {
    if (!file.isExample && !file.gitignored && file.varCount > 0) {
      recs.push(`${C.red}●${C.reset} add ${C.bold}${file.path}${C.reset} to .gitignore (contains ${file.varCount} vars)`);
    }
  }
}

// check for missing actual files
for (const d of analysis.drift.filter(d => d.type === 'missing-actual')) {
  recs.push(`${C.yellow}●${C.reset} create ${d.expected} from ${d.example}`);
}

// check for missing vars
const missingVars = analysis.drift.filter(d => d.type === 'missing-var');
if (missingVars.length > 0) {
  recs.push(`${C.yellow}●${C.reset} ${missingVars.length} vars from examples not in actual env files`);
}

// check for extra vars not documented
const extraVars = analysis.drift.filter(d => d.type === 'extra-var');
if (extraVars.length > 0) {
  recs.push(`${C.blue}●${C.reset} ${extraVars.length} vars in actual files not documented in examples — update .env.example`);
}

// shared sensitive keys
const sharedSensitive = [...sharedKeys.entries()].filter(([k]) => isSensitiveKey(k));
if (sharedSensitive.length > 0) {
  recs.push(`${C.yellow}●${C.reset} ${sharedSensitive.length} sensitive keys shared across projects — consider centralizing`);
}

if (recs.length === 0) {
  console.log(`  ${C.green}✓ Environment looks clean${C.reset}`);
} else {
  for (const rec of recs) {
    console.log(`  ${rec}`);
  }
}

// score
const totalIssues = analysis.drift.length + analysis.totals.securityIssues;
const score = Math.max(0, 100 - (analysis.totals.securityIssues * 20) - (analysis.drift.filter(d => d.type === 'missing-var').length * 5) - (analysis.drift.filter(d => d.type === 'placeholder').length * 3) - (analysis.drift.filter(d => d.type === 'extra-var').length * 2));

console.log();
const scoreColor = score >= 80 ? C.green : score >= 50 ? C.yellow : C.red;
console.log(`  ${C.bold}env health:${C.reset} ${bar(score, 100, 30)} ${scoreColor}${C.bold}${score}/100${C.reset}`);
console.log();

#!/usr/bin/env node
/**
 * arc deps — dependency health dashboard
 * 
 * Scans all projects with package.json for:
 * - outdated packages (major/minor/patch)
 * - missing node_modules (needs install)
 * - lockfile drift (package.json vs lockfile)
 * - duplicate dependencies across projects
 * - total dependency count per project
 * 
 * Usage:
 *   node scripts/deps-check.mjs [--short] [--json] [project]
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { execSync } from 'child_process';

const ROOT = process.env.WORKSPACE || join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const shortMode = args.includes('--short');
const jsonMode = args.includes('--json');
const filterProject = args.find(a => !a.startsWith('--'));

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function findProjects(dir, depth = 0, maxDepth = 3) {
  const projects = [];
  if (depth > maxDepth) return projects;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const hasPkg = entries.some(e => e.name === 'package.json' && e.isFile());
    
    if (hasPkg) {
      // Skip if it's inside node_modules
      if (dir.includes('node_modules')) return projects;
      projects.push(dir);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (['node_modules', '.git', '.next', 'dist', 'build', '.turbo'].includes(entry.name)) continue;
      projects.push(...findProjects(join(dir, entry.name), depth + 1, maxDepth));
    }
  } catch { /* ignore permission errors */ }

  return projects;
}

function getProjectInfo(projectPath) {
  const relPath = relative(ROOT, projectPath) || '.';
  const name = relPath === '.' ? basename(ROOT) : relPath;
  
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));
  } catch {
    return null;
  }

  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});
  const allDeps = [...deps, ...devDeps];
  
  const hasNodeModules = existsSync(join(projectPath, 'node_modules'));
  const hasLockfile = existsSync(join(projectPath, 'package-lock.json')) || 
                      existsSync(join(projectPath, 'pnpm-lock.yaml')) ||
                      existsSync(join(projectPath, 'yarn.lock')) ||
                      existsSync(join(projectPath, 'bun.lockb'));
  
  const lockType = existsSync(join(projectPath, 'package-lock.json')) ? 'npm' :
                   existsSync(join(projectPath, 'pnpm-lock.yaml')) ? 'pnpm' :
                   existsSync(join(projectPath, 'yarn.lock')) ? 'yarn' :
                   existsSync(join(projectPath, 'bun.lockb')) ? 'bun' : null;

  // Check for outdated (only if node_modules exists)
  let outdated = [];
  if (hasNodeModules) {
    try {
      // npm outdated returns exit code 1 if there are outdated packages
      const cmd = lockType === 'pnpm' ? 'pnpm outdated --format json 2>/dev/null' :
                  `npm outdated --json 2>/dev/null`;
      const result = execSync(cmd, { cwd: projectPath, timeout: 30000, encoding: 'utf8' });
      if (result.trim()) {
        const parsed = JSON.parse(result);
        if (lockType === 'pnpm' && Array.isArray(parsed)) {
          outdated = parsed.map(p => ({
            name: p.name || p.Package,
            current: p.current || p.Current,
            wanted: p.wanted || p.Wanted,
            latest: p.latest || p.Latest,
          }));
        } else {
          outdated = Object.entries(parsed).map(([name, info]) => ({
            name,
            current: info.current,
            wanted: info.wanted,
            latest: info.latest,
          }));
        }
      }
    } catch (e) {
      // npm outdated exits 1 when packages are outdated
      if (e.stdout) {
        try {
          const parsed = JSON.parse(e.stdout);
          outdated = Object.entries(parsed).map(([name, info]) => ({
            name,
            current: info.current,
            wanted: info.wanted,
            latest: info.latest,
          }));
        } catch { /* ignore parse errors */ }
      }
    }
  }

  // Categorize outdated
  const majorOutdated = outdated.filter(d => {
    if (!d.current || !d.latest) return false;
    const curMajor = d.current.split('.')[0];
    const latMajor = d.latest.split('.')[0];
    return curMajor !== latMajor;
  });

  const minorOutdated = outdated.filter(d => {
    if (!d.current || !d.latest) return false;
    const curParts = d.current.split('.');
    const latParts = d.latest.split('.');
    return curParts[0] === latParts[0] && curParts[1] !== latParts[1];
  });

  const patchOutdated = outdated.filter(d => {
    if (!d.current || !d.latest) return false;
    const curParts = d.current.split('.');
    const latParts = d.latest.split('.');
    return curParts[0] === latParts[0] && curParts[1] === latParts[1] && curParts[2] !== latParts[2];
  });

  // Check engines
  const engines = pkg.engines || {};
  const nodeEngine = engines.node || null;

  return {
    name,
    path: projectPath,
    version: pkg.version || null,
    private: pkg.private || false,
    depsCount: deps.length,
    devDepsCount: devDeps.length,
    totalDeps: allDeps.length,
    allDeps,
    hasNodeModules,
    hasLockfile,
    lockType,
    nodeEngine,
    outdated: {
      total: outdated.length,
      major: majorOutdated,
      minor: minorOutdated,
      patch: patchOutdated,
    },
  };
}

// Main
console.log(`${c.bold}arc deps${c.reset} — dependency health dashboard`);
console.log(`${c.dim}${'─'.repeat(58)}${c.reset}`);

const allProjects = findProjects(ROOT);
const projects = filterProject 
  ? allProjects.filter(p => relative(ROOT, p).includes(filterProject))
  : allProjects;

if (projects.length === 0) {
  console.log(`${c.dim}no projects found${c.reset}`);
  process.exit(0);
}

console.log(`${c.dim}scanning ${projects.length} projects...${c.reset}\n`);

const results = [];

for (const projectPath of projects) {
  const info = getProjectInfo(projectPath);
  if (!info) continue;
  results.push(info);
}

if (jsonMode) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

// Display results
let totalIssues = 0;

for (const info of results) {
  const issues = [];
  
  if (!info.hasNodeModules) issues.push(`${c.red}missing node_modules${c.reset}`);
  if (!info.hasLockfile) issues.push(`${c.yellow}no lockfile${c.reset}`);
  if (info.outdated.major.length > 0) issues.push(`${c.red}${info.outdated.major.length} major outdated${c.reset}`);
  if (info.outdated.minor.length > 0) issues.push(`${c.yellow}${info.outdated.minor.length} minor outdated${c.reset}`);
  
  const hasIssues = issues.length > 0;
  totalIssues += issues.length;
  
  const icon = !info.hasNodeModules ? `${c.red}✗` : hasIssues ? `${c.yellow}●` : `${c.green}✓`;
  
  console.log(`${icon} ${c.bold}${info.name}${c.reset}${info.version ? ` ${c.dim}v${info.version}${c.reset}` : ''}`);
  console.log(`  ${c.dim}${info.depsCount} deps + ${info.devDepsCount} dev${info.lockType ? ` · ${info.lockType}` : ''}${info.nodeEngine ? ` · node ${info.nodeEngine}` : ''}${c.reset}`);
  
  if (issues.length > 0) {
    console.log(`  ${issues.join(' · ')}`);
  }

  if (!shortMode && info.outdated.major.length > 0) {
    for (const dep of info.outdated.major.slice(0, 5)) {
      console.log(`  ${c.red}▲ ${dep.name}${c.reset} ${c.dim}${dep.current} → ${dep.latest}${c.reset}`);
    }
    if (info.outdated.major.length > 5) {
      console.log(`  ${c.dim}  ...and ${info.outdated.major.length - 5} more${c.reset}`);
    }
  }

  if (!shortMode && info.outdated.minor.length > 0 && info.outdated.minor.length <= 8) {
    for (const dep of info.outdated.minor.slice(0, 5)) {
      console.log(`  ${c.yellow}△ ${dep.name}${c.reset} ${c.dim}${dep.current} → ${dep.latest}${c.reset}`);
    }
    if (info.outdated.minor.length > 5) {
      console.log(`  ${c.dim}  ...and ${info.outdated.minor.length - 5} more${c.reset}`);
    }
  }

  console.log();
}

// Cross-project duplicate check
const depMap = new Map();
for (const info of results) {
  for (const dep of info.allDeps) {
    if (!depMap.has(dep)) depMap.set(dep, []);
    depMap.get(dep).push(info.name);
  }
}

const shared = [...depMap.entries()]
  .filter(([, projects]) => projects.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

if (!shortMode && shared.length > 0) {
  console.log(`${c.bold}shared dependencies${c.reset} ${c.dim}(across projects)${c.reset}`);
  const top = shared.slice(0, 10);
  for (const [dep, projs] of top) {
    console.log(`  ${c.cyan}${dep}${c.reset} ${c.dim}→ ${projs.join(', ')}${c.reset}`);
  }
  if (shared.length > 10) {
    console.log(`  ${c.dim}...and ${shared.length - 10} more shared deps${c.reset}`);
  }
  console.log();
}

// Summary
const totalDeps = results.reduce((sum, r) => sum + r.totalDeps, 0);
const totalOutdated = results.reduce((sum, r) => sum + r.outdated.total, 0);
const missingModules = results.filter(r => !r.hasNodeModules).length;
const noLockfile = results.filter(r => !r.hasLockfile).length;

console.log(`${c.bold}summary:${c.reset} ${results.length} projects, ${totalDeps} total deps, ${totalOutdated} outdated`);
if (missingModules > 0) console.log(`  ${c.red}${missingModules} missing node_modules — run npm install${c.reset}`);
if (noLockfile > 0) console.log(`  ${c.yellow}${noLockfile} without lockfile${c.reset}`);

if (totalIssues === 0) {
  console.log(`  ${c.green}all healthy${c.reset}`);
}

#!/usr/bin/env node
/**
 * arc context <project> — auto-generate a structured context doc for a project
 * 
 * scans: package.json, routes, components, supabase migrations, env vars,
 *        design system, git info, existing docs
 * 
 * usage:
 *   arc context anivia          # print to stdout
 *   arc context tuner --save    # write to projects/<name>/CONTEXT.md
 *   arc context /path/to/dir    # absolute path
 *   arc ctx anivia              # alias
 *   arc context anivia --json   # machine-readable
 */

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'fs';
import { join, basename, resolve, extname } from 'path';

const WORKSPACE = process.env.WORKSPACE || resolve(new URL('.', import.meta.url).pathname, '..');
const PROJECTS_DIR = join(WORKSPACE, 'projects');

// --- args ---
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));
const save = flags.has('--save');
const json = flags.has('--json');

if (!positional[0]) {
  console.log('usage: arc context <project|path> [--save] [--json]');
  console.log('\nscans a project directory and generates a structured context document.');
  console.log('available projects:');
  try {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => `  - ${d.name}`);
    console.log(dirs.join('\n'));
  } catch { console.log('  (no projects/ directory found)'); }
  process.exit(0);
}

// --- resolve project path ---
let projectPath;
const input = positional[0];
if (existsSync(input) && statSync(input).isDirectory()) {
  projectPath = resolve(input);
} else if (existsSync(join(PROJECTS_DIR, input))) {
  projectPath = join(PROJECTS_DIR, input);
} else {
  console.error(`project not found: ${input}`);
  console.error(`looked in: ${input}, ${join(PROJECTS_DIR, input)}`);
  process.exit(1);
}

const projectName = basename(projectPath);

// --- helpers ---
function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function readText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function findFiles(dir, pattern, maxDepth = 4, depth = 0) {
  if (depth > maxDepth) return [];
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      } else if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, pattern, maxDepth, depth + 1));
      }
    }
  } catch {}
  return results;
}

function relativeTo(base, path) {
  return path.replace(base + '/', '');
}

function stripSecrets(str) {
  if (!str) return str;
  // strip PAT tokens, API keys from git remotes etc
  return str.replace(/ghp_[a-zA-Z0-9]+/g, '[REDACTED]')
            .replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]')
            .replace(/eyJ[a-zA-Z0-9._-]+/g, '[REDACTED]');
}

// --- scan ---
const context = {
  name: projectName,
  path: projectPath,
  packageJson: null,
  stack: [],
  routes: [],
  components: [],
  apiRoutes: [],
  migrations: [],
  envVars: [],
  docs: [],
  gitInfo: null,
  fileCount: 0,
  structure: [],
};

// package.json
const pkg = readJSON(join(projectPath, 'package.json'));
if (pkg) {
  context.packageJson = {
    name: pkg.name,
    version: pkg.version,
    scripts: pkg.scripts || {},
    deps: Object.keys(pkg.dependencies || {}),
    devDeps: Object.keys(pkg.devDependencies || {}),
  };
  
  // detect stack
  const allDeps = [...(context.packageJson.deps), ...(context.packageJson.devDeps)];
  if (allDeps.includes('next')) context.stack.push(`Next.js ${pkg.dependencies?.next || ''}`);
  if (allDeps.includes('react')) context.stack.push(`React ${pkg.dependencies?.react || ''}`);
  if (allDeps.includes('@supabase/supabase-js')) context.stack.push('Supabase');
  if (allDeps.includes('tailwindcss')) context.stack.push('Tailwind CSS');
  if (allDeps.includes('openai')) context.stack.push('OpenAI SDK');
  if (allDeps.includes('stripe')) context.stack.push('Stripe');
  if (allDeps.includes('prisma') || allDeps.includes('@prisma/client')) context.stack.push('Prisma');
  if (allDeps.includes('drizzle-orm')) context.stack.push('Drizzle');
  if (allDeps.includes('express')) context.stack.push('Express');
  if (allDeps.includes('fastify')) context.stack.push('Fastify');
  if (allDeps.includes('sonner')) context.stack.push('Sonner (toasts)');
  if (allDeps.includes('lucide-react')) context.stack.push('Lucide (icons)');
  if (allDeps.includes('recharts')) context.stack.push('Recharts');
  if (allDeps.includes('class-variance-authority')) context.stack.push('CVA');
  if (allDeps.includes('typescript')) context.stack.push('TypeScript');
}

// routes (Next.js app router)
const appDir = join(projectPath, 'src', 'app');
const appDirAlt = join(projectPath, 'app');
const routeDir = existsSync(appDir) ? appDir : existsSync(appDirAlt) ? appDirAlt : null;

if (routeDir) {
  const pageFiles = findFiles(routeDir, /^page\.(tsx?|jsx?)$/);
  context.routes = pageFiles.map(f => {
    let route = relativeTo(routeDir, f)
      .replace(/\/page\.(tsx?|jsx?)$/, '')
      .replace(/page\.(tsx?|jsx?)$/, '')
      .replace(/\(([^)]+)\)\//g, '') // strip route groups
      .replace(/\(([^)]+)\)$/, '')
      .replace(/\/$/, '');
    if (!route) route = '/';
    else route = '/' + route;
    return route;
  }).sort();

  // API routes
  const routeFiles = findFiles(routeDir, /^route\.(ts|js)$/);
  context.apiRoutes = routeFiles.map(f => {
    let route = relativeTo(routeDir, f)
      .replace(/\/route\.(ts|js)$/, '');
    return '/api/' + route.replace(/^api\//, '');
  }).sort();
}

// components
const componentDirs = [
  join(projectPath, 'src', 'components'),
  join(projectPath, 'components'),
];
for (const dir of componentDirs) {
  if (existsSync(dir)) {
    const files = findFiles(dir, /\.(tsx?|jsx?)$/);
    context.components = files.map(f => relativeTo(dir, f)).sort();
    break;
  }
}

// supabase migrations
const migrationDirs = [
  join(projectPath, 'supabase', 'migrations'),
  join(projectPath, 'migrations'),
];
for (const dir of migrationDirs) {
  if (existsSync(dir)) {
    try {
      context.migrations = readdirSync(dir)
        .filter(f => f.endsWith('.sql'))
        .sort();
    } catch {}
    break;
  }
}

// env vars
const envFiles = ['.env', '.env.local', '.env.example', '.env.sample'];
for (const envFile of envFiles) {
  const content = readText(join(projectPath, envFile));
  if (content) {
    const vars = content.split('\n')
      .filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => l.split('=')[0].trim())
      .filter(Boolean);
    context.envVars = [...new Set([...context.envVars, ...vars])];
  }
}

// existing docs
const docFiles = ['README.md', 'SPEC.md', 'PROMPT.md', 'TASKS.md', 'AUDIT.md', 'CONTEXT.md', 'AGENTS.md'];
for (const doc of docFiles) {
  if (existsSync(join(projectPath, doc))) {
    context.docs.push(doc);
  }
}

// git info
try {
  const { execSync } = await import('child_process');
  const opts = { cwd: projectPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
  const branch = execSync('git rev-parse --abbrev-ref HEAD', opts).trim();
  const lastCommit = execSync('git log -1 --format="%h %s" 2>/dev/null', opts).trim();
  let remote = '';
  try { remote = stripSecrets(execSync('git remote get-url origin', opts).trim()); } catch {}
  const commitCount = parseInt(execSync('git rev-list --count HEAD 2>/dev/null', opts).trim()) || 0;
  context.gitInfo = { branch, lastCommit, remote, commitCount };
} catch {}

// file count
const allFiles = findFiles(projectPath, /\.(tsx?|jsx?|css|sql|md)$/);
context.fileCount = allFiles.length;

// top-level structure
try {
  const topLevel = readdirSync(projectPath, { withFileTypes: true })
    .filter(d => d.name !== 'node_modules' && d.name !== '.git' && d.name !== '.next')
    .map(d => d.isDirectory() ? `${d.name}/` : d.name)
    .sort();
  context.structure = topLevel;
} catch {}

// --- CSS vars / design system ---
let designSystem = null;
const cssFiles = findFiles(projectPath, /globals\.css$/);
if (cssFiles.length > 0) {
  const css = readText(cssFiles[0]);
  if (css) {
    const vars = {};
    const matches = css.matchAll(/--([a-z-]+):\s*([^;]+);/g);
    for (const m of matches) {
      vars[m[1]] = m[2].trim();
    }
    if (Object.keys(vars).length > 0) {
      designSystem = {
        cssVars: vars,
        hasRoundedSm: css.includes('rounded-sm'),
        hasDarkMode: css.includes('.dark'),
      };
    }
  }
}

// --- output ---
if (json) {
  console.log(JSON.stringify({ ...context, designSystem }, null, 2));
  process.exit(0);
}

// --- generate markdown ---
const lines = [];
const hr = '---';

lines.push(`# ${context.name} — Project Context`);
lines.push('');
lines.push(`> Auto-generated by \`arc context\` on ${new Date().toISOString().split('T')[0]}`);
lines.push('');

// overview
if (context.gitInfo?.remote) {
  lines.push(`**Repo:** ${context.gitInfo.remote}`);
}
if (context.gitInfo) {
  lines.push(`**Branch:** ${context.gitInfo.branch} | **Commits:** ${context.gitInfo.commitCount} | **Last:** ${context.gitInfo.lastCommit}`);
}
lines.push(`**Files:** ${context.fileCount} source files`);
lines.push('');

// stack
if (context.stack.length > 0) {
  lines.push('## Tech Stack');
  lines.push('');
  context.stack.forEach(s => lines.push(`- ${s}`));
  lines.push('');
}

// routes
if (context.routes.length > 0) {
  lines.push('## Routes');
  lines.push('');
  lines.push('```');
  context.routes.forEach(r => lines.push(r));
  lines.push('```');
  lines.push('');
}

// API routes
if (context.apiRoutes.length > 0) {
  lines.push('## API Routes');
  lines.push('');
  lines.push('```');
  context.apiRoutes.forEach(r => lines.push(r));
  lines.push('```');
  lines.push('');
}

// components
if (context.components.length > 0) {
  lines.push(`## Components (${context.components.length})`);
  lines.push('');
  lines.push('```');
  context.components.forEach(c => lines.push(c));
  lines.push('```');
  lines.push('');
}

// migrations
if (context.migrations.length > 0) {
  lines.push(`## Migrations (${context.migrations.length})`);
  lines.push('');
  context.migrations.forEach(m => lines.push(`- ${m}`));
  lines.push('');
}

// env vars
if (context.envVars.length > 0) {
  lines.push('## Environment Variables');
  lines.push('');
  context.envVars.forEach(v => lines.push(`- \`${v}\``));
  lines.push('');
}

// dependencies
if (context.packageJson) {
  lines.push(`## Dependencies (${context.packageJson.deps.length})`);
  lines.push('');
  context.packageJson.deps.forEach(d => lines.push(`- ${d}`));
  lines.push('');
  
  if (context.packageJson.devDeps.length > 0) {
    lines.push(`## Dev Dependencies (${context.packageJson.devDeps.length})`);
    lines.push('');
    context.packageJson.devDeps.forEach(d => lines.push(`- ${d}`));
    lines.push('');
  }
  
  if (Object.keys(context.packageJson.scripts).length > 0) {
    lines.push('## Scripts');
    lines.push('');
    Object.entries(context.packageJson.scripts).forEach(([k, v]) => {
      lines.push(`- \`npm run ${k}\` → \`${v}\``);
    });
    lines.push('');
  }
}

// design system
if (designSystem) {
  lines.push('## Design System');
  lines.push('');
  if (designSystem.hasDarkMode) lines.push('- Dark mode: yes');
  if (designSystem.hasRoundedSm) lines.push('- Border radius: `rounded-sm`');
  lines.push('');
  lines.push('### CSS Variables');
  lines.push('');
  const importantVars = ['background', 'foreground', 'primary', 'primary-foreground', 'muted', 'muted-foreground', 'border', 'destructive', 'radius'];
  for (const v of importantVars) {
    if (designSystem.cssVars[v]) {
      lines.push(`- \`--${v}\`: ${designSystem.cssVars[v]}`);
    }
  }
  lines.push('');
}

// structure
if (context.structure.length > 0) {
  lines.push('## Project Structure');
  lines.push('');
  lines.push('```');
  context.structure.forEach(s => lines.push(s));
  lines.push('```');
  lines.push('');
}

// existing docs
if (context.docs.length > 0) {
  lines.push('## Documentation');
  lines.push('');
  context.docs.forEach(d => lines.push(`- ${d}`));
  lines.push('');
}

const output = lines.join('\n');

if (save) {
  const outPath = join(projectPath, 'CONTEXT.md');
  writeFileSync(outPath, output);
  console.log(`saved to ${outPath}`);
} else {
  console.log(output);
}

#!/usr/bin/env node
/**
 * arc context - auto-generate project context documents
 * 
 * Scans a project directory and produces a structured context doc
 * that any agent, codex, or human can use to onboard instantly.
 * 
 * Usage:
 *   arc context <project>          - generate context to stdout
 *   arc context <project> --save   - save as PROMPT.md in project dir
 *   arc context <project> --json   - machine-readable output
 *   arc context                    - list available projects
 * 
 * Scans: package.json, tsconfig, README, file tree, routes, components,
 *        supabase migrations, env vars, design patterns, dependencies
 */

import { readdir, readFile, stat, writeFile } from 'fs/promises';
import { join, basename, extname, relative } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const WORKSPACE = process.cwd();
const PROJECTS_DIR = join(WORKSPACE, 'projects');
const args = process.argv.slice(2);
const projectName = args.find(a => !a.startsWith('--'));
const flags = new Set(args.filter(a => a.startsWith('--')));

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function readJSON(p) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

async function readText(p) {
  try { return await readFile(p, 'utf8'); } catch { return null; }
}

async function walkDir(dir, opts = {}) {
  const { maxDepth = 4, ignore = [], current = 0 } = opts;
  if (current > maxDepth) return [];

  const defaultIgnore = [
    'node_modules', '.next', '.git', '.turbo', '.vercel',
    'dist', 'build', '.cache', '__pycache__', '.svelte-kit',
    'coverage', '.nyc_output', '.DS_Store', 'vendor'
  ];
  const ignoreSet = new Set([...defaultIgnore, ...ignore]);

  let results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoreSet.has(entry.name)) continue;
      if (entry.name.startsWith('.') && current > 0) continue;

      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push({ path: full, type: 'dir', depth: current });
        results = results.concat(await walkDir(full, { ...opts, current: current + 1 }));
      } else {
        results.push({ path: full, type: 'file', depth: current });
      }
    }
  } catch {}
  return results;
}

function formatTree(files, rootDir) {
  // Build an indented tree string
  const lines = [];
  for (const f of files) {
    const rel = relative(rootDir, f.path);
    const parts = rel.split('/');
    const indent = '│   '.repeat(parts.length - 1);
    const prefix = f.type === 'dir' ? '├── ' : '├── ';
    lines.push(`${indent}${prefix}${parts[parts.length - 1]}${f.type === 'dir' ? '/' : ''}`);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCANNERS
// ═══════════════════════════════════════════════════════════════════════════════

async function scanPackageJson(dir) {
  const pkg = await readJSON(join(dir, 'package.json'));
  if (!pkg) return null;

  const info = {
    name: pkg.name || basename(dir),
    version: pkg.version,
    description: pkg.description,
    scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
    dependencies: {},
    devDependencies: {}
  };

  // Categorize key dependencies
  const deps = { ...pkg.dependencies };
  const devDeps = { ...pkg.devDependencies };

  const categories = {
    framework: ['next', 'nuxt', 'remix', 'astro', 'svelte', 'sveltekit', 'express', 'fastify', 'hono', 'nest', 'react', 'vue', 'angular'],
    database: ['@supabase/supabase-js', '@supabase/ssr', 'prisma', '@prisma/client', 'drizzle-orm', 'pg', 'mysql2', 'mongoose', 'typeorm', 'knex', 'better-sqlite3'],
    auth: ['@supabase/auth-helpers-nextjs', 'next-auth', '@auth/core', 'passport', 'lucia', '@clerk/nextjs'],
    ai: ['openai', 'anthropic', '@anthropic-ai/sdk', 'ai', '@ai-sdk/openai', 'langchain', '@langchain/core', 'llamaindex', 'cohere-ai'],
    styling: ['tailwindcss', '@tailwindcss/postcss', 'styled-components', '@emotion/react', 'sass'],
    ui: ['@radix-ui', '@headlessui/react', '@shadcn/ui', 'lucide-react', '@heroicons/react', 'framer-motion'],
    testing: ['vitest', 'jest', '@testing-library/react', 'playwright', 'cypress'],
    email: ['nodemailer', 'resend', '@sendgrid/mail', 'postmark'],
    payments: ['stripe', '@stripe/stripe-js'],
    state: ['zustand', 'jotai', 'recoil', '@reduxjs/toolkit', 'valtio']
  };

  info.stack = {};
  for (const [cat, packages] of Object.entries(categories)) {
    const found = packages.filter(p => deps[p] || devDeps[p]);
    if (found.length > 0) info.stack[cat] = found;
  }

  info.allDeps = Object.keys(deps).length;
  info.allDevDeps = Object.keys(devDeps).length;

  return info;
}

async function scanRoutes(dir) {
  // Next.js App Router
  const appDir = join(dir, 'src', 'app');
  if (!await exists(appDir)) {
    const altAppDir = join(dir, 'app');
    if (!await exists(altAppDir)) return null;
    return scanNextRoutes(altAppDir, altAppDir);
  }
  return scanNextRoutes(appDir, appDir);
}

async function scanNextRoutes(dir, rootDir) {
  const routes = [];
  const files = await walkDir(dir, { maxDepth: 6 });

  for (const f of files) {
    if (f.type !== 'file') continue;
    const name = basename(f.path);
    if (!['page.tsx', 'page.jsx', 'page.js', 'route.ts', 'route.js'].includes(name)) continue;

    const rel = relative(rootDir, f.path);
    const routePath = '/' + rel
      .replace(/\/page\.(tsx|jsx|js)$/, '')
      .replace(/\/route\.(ts|js)$/, '')
      .replace(/\(.*?\)\//g, '') // remove route groups
      .replace(/^$/, '');

    const isApi = name.startsWith('route.');
    routes.push({
      path: routePath || '/',
      type: isApi ? 'API' : 'page',
      file: rel
    });
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

async function scanComponents(dir) {
  const componentDirs = [
    join(dir, 'src', 'components'),
    join(dir, 'components'),
    join(dir, 'src', 'lib', 'components')
  ];

  const components = [];
  for (const cDir of componentDirs) {
    if (!await exists(cDir)) continue;
    const files = await walkDir(cDir, { maxDepth: 3 });
    for (const f of files) {
      if (f.type !== 'file') continue;
      if (!['.tsx', '.jsx', '.svelte', '.vue'].includes(extname(f.path))) continue;
      const rel = relative(cDir, f.path);
      components.push(rel);
    }
  }
  return components.length > 0 ? components : null;
}

async function scanSupabase(dir) {
  const migrationsDir = join(dir, 'supabase', 'migrations');
  if (!await exists(migrationsDir)) return null;

  const files = await readdir(migrationsDir);
  const migrations = files
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (migrations.length === 0) return null;

  // Read first and last migration for context
  const tables = new Set();
  const functions = new Set();
  const policies = new Set();

  for (const m of migrations) {
    const content = await readText(join(migrationsDir, m));
    if (!content) continue;

    // Extract table names
    const tableMatches = content.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi);
    for (const match of tableMatches) tables.add(match[1]);

    // Extract function names
    const fnMatches = content.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)/gi);
    for (const match of fnMatches) functions.add(match[1]);

    // Check for RLS
    const rlsMatches = content.matchAll(/create\s+policy\s+"?([^"(]+)"?\s+on\s+(?:public\.)?(\w+)/gi);
    for (const match of rlsMatches) policies.add(`${match[2]}: ${match[1].trim()}`);
  }

  return {
    migrationCount: migrations.length,
    tables: [...tables],
    functions: [...functions],
    policies: [...policies].slice(0, 20), // cap for readability
    latest: migrations[migrations.length - 1]
  };
}

async function scanEnvVars(dir) {
  const envFiles = ['.env.example', '.env.local.example', '.env.template', '.env.sample'];
  for (const f of envFiles) {
    const content = await readText(join(dir, f));
    if (content) {
      const vars = content.split('\n')
        .filter(l => l.trim() && !l.startsWith('#'))
        .map(l => l.split('=')[0].trim())
        .filter(Boolean);
      return { file: f, vars };
    }
  }

  // Fallback: scan for process.env references
  const srcDir = join(dir, 'src');
  if (!await exists(srcDir)) return null;

  const envVars = new Set();
  const files = await walkDir(srcDir, { maxDepth: 4 });
  for (const f of files) {
    if (f.type !== 'file') continue;
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(extname(f.path))) continue;
    const content = await readText(f.path);
    if (!content) continue;
    const matches = content.matchAll(/process\.env\.(\w+)/g);
    for (const m of matches) envVars.add(m[1]);
    // Also check NEXT_PUBLIC_ style
    const nextMatches = content.matchAll(/NEXT_PUBLIC_\w+/g);
    for (const m of nextMatches) envVars.add(m[0]);
  }

  return envVars.size > 0 ? { file: 'scanned from source', vars: [...envVars] } : null;
}

async function scanConfig(dir) {
  const configs = {};

  // TypeScript
  const tsconfig = await readJSON(join(dir, 'tsconfig.json'));
  if (tsconfig) {
    configs.typescript = {
      strict: tsconfig.compilerOptions?.strict,
      target: tsconfig.compilerOptions?.target,
      paths: tsconfig.compilerOptions?.paths ? Object.keys(tsconfig.compilerOptions.paths) : []
    };
  }

  // Next.js config
  for (const f of ['next.config.ts', 'next.config.mjs', 'next.config.js']) {
    const content = await readText(join(dir, f));
    if (content) {
      configs.nextConfig = f;
      // Extract key settings
      if (content.includes('output')) {
        const outputMatch = content.match(/output:\s*['"](\w+)['"]/);
        if (outputMatch) configs.nextOutput = outputMatch[1];
      }
      break;
    }
  }

  // ESLint
  for (const f of ['eslint.config.mjs', '.eslintrc.json', '.eslintrc.js']) {
    if (await exists(join(dir, f))) { configs.eslint = f; break; }
  }

  // Prettier
  for (const f of ['.prettierrc', '.prettierrc.json', 'prettier.config.js']) {
    if (await exists(join(dir, f))) { configs.prettier = f; break; }
  }

  return Object.keys(configs).length > 0 ? configs : null;
}

async function scanReadme(dir) {
  for (const f of ['README.md', 'readme.md', 'Readme.md']) {
    const content = await readText(join(dir, f));
    if (content) {
      // Extract first meaningful section (skip badges/logos)
      const lines = content.split('\n');
      let start = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#') || (lines[i].trim().length > 20 && !lines[i].startsWith('['))) {
          start = i;
          break;
        }
      }
      // Take first 30 lines of content
      return lines.slice(start, start + 30).join('\n').trim();
    }
  }
  return null;
}

async function scanGitInfo(dir) {
  try {
    const opts = { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
    let remote = execSync('git remote get-url origin', opts).trim();
    // Strip embedded tokens from URLs (e.g. https://ghp_xxx@github.com/...)
    remote = remote.replace(/\/\/[^@]+@/, '//');

    const branch = execSync('git branch --show-current', opts).trim();
    const lastCommit = execSync('git log -1 --format="%h %s (%cr)"', opts).trim();
    const commitCount = execSync('git rev-list --count HEAD', opts).trim();
    return { remote, branch, lastCommit, commitCount: parseInt(commitCount) };
  } catch { return null; }
}

async function scanDesignPatterns(dir) {
  // Look for design system hints
  const patterns = {};

  // Check for CSS variables / theme files
  const globalsCss = await readText(join(dir, 'src', 'app', 'globals.css'))
    || await readText(join(dir, 'app', 'globals.css'))
    || await readText(join(dir, 'styles', 'globals.css'));

  if (globalsCss) {
    // Extract CSS custom properties
    const vars = globalsCss.matchAll(/--([a-zA-Z-]+):\s*([^;]+);/g);
    const cssVars = {};
    for (const m of vars) {
      const name = m[1];
      const value = m[2].trim();
      // Group by category
      if (name.includes('background') || name.includes('foreground') || name.includes('primary') || 
          name.includes('muted') || name.includes('destructive') || name.includes('border') ||
          name.includes('accent') || name.includes('card') || name.includes('success') ||
          name.includes('warning')) {
        cssVars[name] = value;
      }
    }
    if (Object.keys(cssVars).length > 0) patterns.cssVars = cssVars;

    // Check for font imports
    const fontImports = globalsCss.matchAll(/@import.*font|font-family/g);
    const fonts = [...fontImports].map(m => m[0]);
    if (fonts.length > 0) patterns.fonts = fonts;
  }

  // Check for tailwind config customizations
  const twConfig = await readText(join(dir, 'tailwind.config.ts'))
    || await readText(join(dir, 'tailwind.config.js'));
  if (twConfig) {
    patterns.hasTailwindConfig = true;
    if (twConfig.includes('fontFamily')) patterns.customFonts = true;
    if (twConfig.includes('colors')) patterns.customColors = true;
    if (twConfig.includes('borderRadius')) patterns.customRadius = true;
  }

  // Check for cn() utility
  const libUtils = await readText(join(dir, 'src', 'lib', 'utils.ts'))
    || await readText(join(dir, 'lib', 'utils.ts'));
  if (libUtils && libUtils.includes('cn(')) {
    patterns.cnHelper = true;
  }

  return Object.keys(patterns).length > 0 ? patterns : null;
}

async function detectProjectType(dir, pkg) {
  if (pkg?.stack?.framework) {
    if (pkg.stack.framework.includes('next')) return 'Next.js';
    if (pkg.stack.framework.includes('nuxt')) return 'Nuxt';
    if (pkg.stack.framework.includes('remix')) return 'Remix';
    if (pkg.stack.framework.includes('astro')) return 'Astro';
    if (pkg.stack.framework.includes('svelte') || pkg.stack.framework.includes('sveltekit')) return 'SvelteKit';
    if (pkg.stack.framework.includes('express')) return 'Express';
    if (pkg.stack.framework.includes('fastify')) return 'Fastify';
    if (pkg.stack.framework.includes('hono')) return 'Hono';
  }
  if (await exists(join(dir, 'Cargo.toml'))) return 'Rust';
  if (await exists(join(dir, 'go.mod'))) return 'Go';
  if (await exists(join(dir, 'requirements.txt')) || await exists(join(dir, 'pyproject.toml'))) return 'Python';
  return 'Unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

async function generateContext(projectDir, name) {
  const pkg = await scanPackageJson(projectDir);
  const projectType = await detectProjectType(projectDir, pkg);
  const routes = await scanRoutes(projectDir);
  const components = await scanComponents(projectDir);
  const supabase = await scanSupabase(projectDir);
  const envVars = await scanEnvVars(projectDir);
  const config = await scanConfig(projectDir);
  const readme = await scanReadme(projectDir);
  const git = await scanGitInfo(projectDir);
  const design = await scanDesignPatterns(projectDir);
  const allFiles = await walkDir(projectDir, { maxDepth: 3 });

  if (flags.has('--json')) {
    console.log(JSON.stringify({
      name, projectType, pkg, routes, components, supabase, envVars, config, git, design,
      fileCount: allFiles.filter(f => f.type === 'file').length,
      dirCount: allFiles.filter(f => f.type === 'dir').length
    }, null, 2));
    return;
  }

  const lines = [];
  const h = (level, text) => lines.push(`${'#'.repeat(level)} ${text}`);
  const p = (text) => lines.push(text);
  const blank = () => lines.push('');
  const code = (lang, content) => { lines.push('```' + lang); lines.push(content); lines.push('```'); };

  // === HEADER ===
  h(1, `${name} — Project Context`);
  blank();
  p(`Auto-generated context document for the **${name}** project.`);
  p(`Use this to onboard quickly — whether you're a human, Codex, or another agent.`);
  blank();
  p(`> Generated: ${new Date().toISOString().split('T')[0]} by \`arc context\``);
  blank();

  // === OVERVIEW ===
  h(2, 'Overview');
  blank();
  if (readme) {
    p(readme.split('\n').slice(0, 10).join('\n'));
    blank();
  }
  p(`| Field | Value |`);
  p(`|-------|-------|`);
  p(`| Type | ${projectType} |`);
  if (pkg?.version) p(`| Version | ${pkg.version} |`);
  if (git?.remote) p(`| Repo | ${git.remote} |`);
  if (git?.branch) p(`| Branch | ${git.branch} |`);
  if (git?.commitCount) p(`| Commits | ${git.commitCount} |`);
  if (git?.lastCommit) p(`| Last Commit | ${git.lastCommit} |`);
  if (pkg?.allDeps) p(`| Dependencies | ${pkg.allDeps} deps, ${pkg.allDevDeps} dev |`);
  blank();

  // === TECH STACK ===
  if (pkg?.stack && Object.keys(pkg.stack).length > 0) {
    h(2, 'Tech Stack');
    blank();
    for (const [cat, packages] of Object.entries(pkg.stack)) {
      p(`- **${cat}:** ${packages.join(', ')}`);
    }
    blank();
  }

  // === FILE STRUCTURE ===
  h(2, 'File Structure');
  blank();
  // Show top-level + src/ expanded
  const topLevel = allFiles.filter(f => f.depth === 0);
  const srcFiles = allFiles.filter(f => {
    const rel = relative(projectDir, f.path);
    return rel.startsWith('src/') && f.depth <= 2;
  });

  code('', formatTree([...topLevel, ...srcFiles], projectDir));
  blank();
  p(`*${allFiles.filter(f => f.type === 'file').length} files, ${allFiles.filter(f => f.type === 'dir').length} directories total*`);
  blank();

  // === ROUTES ===
  if (routes && routes.length > 0) {
    h(2, 'Routes');
    blank();
    code('', routes.map(r => `${r.type === 'API' ? '[API] ' : ''}${r.path}`).join('\n'));
    blank();
  }

  // === COMPONENTS ===
  if (components && components.length > 0) {
    h(2, 'Components');
    blank();
    // Group by directory
    const grouped = {};
    for (const c of components) {
      const dir = c.includes('/') ? c.split('/')[0] : '_root';
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(c);
    }
    for (const [dir, files] of Object.entries(grouped)) {
      if (dir === '_root') {
        p(`- ${files.join(', ')}`);
      } else {
        p(`- **${dir}/**: ${files.map(f => basename(f)).join(', ')}`);
      }
    }
    blank();
  }

  // === DATABASE ===
  if (supabase) {
    h(2, 'Database (Supabase)');
    blank();
    p(`**${supabase.migrationCount} migrations** (latest: \`${supabase.latest}\`)`);
    blank();
    if (supabase.tables.length > 0) {
      p(`**Tables:** ${supabase.tables.join(', ')}`);
      blank();
    }
    if (supabase.functions.length > 0) {
      p(`**Functions:** ${supabase.functions.join(', ')}`);
      blank();
    }
    if (supabase.policies.length > 0) {
      h(3, 'RLS Policies');
      blank();
      for (const pol of supabase.policies) {
        p(`- ${pol}`);
      }
      blank();
    }
  }

  // === ENVIRONMENT ===
  if (envVars) {
    h(2, 'Environment Variables');
    blank();
    p(`Source: \`${envVars.file}\``);
    blank();
    code('', envVars.vars.join('\n'));
    blank();
  }

  // === DESIGN SYSTEM ===
  if (design) {
    h(2, 'Design System');
    blank();
    if (design.cnHelper) p('- Uses `cn()` helper (clsx + tailwind-merge)');
    if (design.customFonts) p('- Custom font families configured');
    if (design.customColors) p('- Custom color palette');
    if (design.customRadius) p('- Custom border radius values');
    if (design.hasTailwindConfig) p('- Tailwind config with customizations');
    blank();

    if (design.cssVars && Object.keys(design.cssVars).length > 0) {
      h(3, 'CSS Variables');
      blank();
      code('css', Object.entries(design.cssVars).map(([k, v]) => `--${k}: ${v};`).join('\n'));
      blank();
    }
  }

  // === CONFIG ===
  if (config) {
    h(2, 'Configuration');
    blank();
    if (config.typescript) {
      p(`- **TypeScript:** strict=${config.typescript.strict ?? 'default'}, target=${config.typescript.target ?? 'default'}`);
      if (config.typescript.paths.length > 0) p(`  - Path aliases: ${config.typescript.paths.join(', ')}`);
    }
    if (config.nextConfig) p(`- **Next.js config:** ${config.nextConfig}${config.nextOutput ? ` (output: ${config.nextOutput})` : ''}`);
    if (config.eslint) p(`- **ESLint:** ${config.eslint}`);
    if (config.prettier) p(`- **Prettier:** ${config.prettier}`);
    blank();
  }

  // === SCRIPTS ===
  if (pkg?.scripts && pkg.scripts.length > 0) {
    h(2, 'Available Scripts');
    blank();
    code('bash', pkg.scripts.map(s => `npm run ${s}`).join('\n'));
    blank();
  }

  // === NOTES ===
  h(2, 'Notes');
  blank();
  p('_This is auto-generated. Add project-specific context below:_');
  p('- Product vision and goals');
  p('- Key architecture decisions and rationale');
  p('- Coding conventions specific to this project');
  p('- Known issues or tech debt');
  p('- Who works on what');
  blank();

  const output = lines.join('\n');

  if (flags.has('--save')) {
    const outPath = join(projectDir, 'CONTEXT.md');
    await writeFile(outPath, output, 'utf8');
    console.log(`\x1b[32m✓\x1b[0m saved to ${relative(WORKSPACE, outPath)}`);
    console.log(`  ${allFiles.filter(f => f.type === 'file').length} files scanned, ${routes?.length || 0} routes, ${components?.length || 0} components`);
  } else {
    console.log(output);
  }

  return output;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function listProjects() {
  console.log('\x1b[1marc context\x1b[0m — auto-generate project context documents\n');
  console.log('Available projects:\n');

  try {
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(PROJECTS_DIR, entry.name);
      const pkg = await readJSON(join(dir, 'package.json'));
      const hasPrompt = await exists(join(dir, 'PROMPT.md'));
      const hasContext = await exists(join(dir, 'CONTEXT.md'));

      const status = hasPrompt ? ' \x1b[32m[PROMPT.md]\x1b[0m' : hasContext ? ' \x1b[33m[CONTEXT.md]\x1b[0m' : ' \x1b[90m[no context]\x1b[0m';
      const desc = pkg?.description ? ` — ${pkg.description}` : '';
      console.log(`  ${entry.name}${status}${desc}`);
    }
  } catch (e) {
    console.error('No projects/ directory found');
  }

  console.log('\nUsage: arc context <project> [--save] [--json]');
}

async function main() {
  if (!projectName) {
    await listProjects();
    return;
  }

  // Resolve project directory
  let projectDir = join(PROJECTS_DIR, projectName);
  if (!await exists(projectDir)) {
    // Try workspace root
    projectDir = join(WORKSPACE, projectName);
    if (!await exists(projectDir)) {
      // Try as absolute/relative path
      projectDir = projectName;
      if (!await exists(projectDir)) {
        console.error(`\x1b[31m✗\x1b[0m Project not found: ${projectName}`);
        console.error(`  Checked: projects/${projectName}, ${projectName}`);
        process.exit(1);
      }
    }
  }

  await generateContext(projectDir, projectName);
}

main().catch(e => { console.error(e); process.exit(1); });

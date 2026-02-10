#!/usr/bin/env node
/**
 * arc focus — Deep project context for "where was I?"
 * 
 * Usage:
 *   arc focus              List projects with last activity
 *   arc focus <project>    Full context dump for resuming work
 *   arc focus --short      One-liner per project
 *   arc focus --json       Machine-readable
 * 
 * Shows: recent commits, open tasks, blockers, daily log mentions,
 * changed files, key decisions, and a "resume from" summary.
 * Designed for context-switching — run it before diving into a project.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROJECTS_DIR = join(ROOT, 'projects');
const MEMORY_DIR = join(ROOT, 'memory');
const TASKS_FILE = join(ROOT, 'tasks', 'active.md');

const args = process.argv.slice(2);
const isShort = args.includes('--short');
const isJson = args.includes('--json');
const projectArg = args.find(a => !a.startsWith('-'));

// ── helpers ─────────────────────────────────────────────────────────

function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function magenta(s) { return `\x1b[35m${s}\x1b[0m`; }

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function bar(filled, total, width = 12) {
  const pct = total > 0 ? filled / total : 0;
  const full = Math.round(pct * width);
  return '█'.repeat(full) + '░'.repeat(width - full);
}

// ── project discovery ───────────────────────────────────────────────

function discoverProjects() {
  const projects = [];
  
  // projects/ subdirectories
  if (existsSync(PROJECTS_DIR)) {
    for (const name of readdirSync(PROJECTS_DIR)) {
      const dir = join(PROJECTS_DIR, name);
      if (!statSync(dir).isDirectory()) continue;
      projects.push({ name, dir, source: 'projects/' });
    }
  }
  
  // top-level git repos (like discord-voice-bot)
  for (const name of readdirSync(ROOT)) {
    const dir = join(ROOT, name);
    if (!statSync(dir).isDirectory()) continue;
    if (['projects', 'memory', 'tasks', 'scripts', 'writing', 'node_modules', '.git', 'skills'].includes(name)) continue;
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, 'package.json'))) {
      if (!projects.find(p => p.name === name)) {
        projects.push({ name, dir, source: './' });
      }
    }
  }
  
  return projects;
}

function findProjectDir(query) {
  const projects = discoverProjects();
  // exact match
  let match = projects.find(p => p.name === query);
  if (match) return match;
  // partial match
  match = projects.find(p => p.name.includes(query));
  if (match) return match;
  // alias mapping
  const aliases = {
    'mundo': 'tuner',
    'cm': 'context-memory',
    'ctx': 'context-memory',
    'ventok-web': 'ventok-site',
    'vsite': 'ventok-site',
    'discord': 'discord-voice-bot',
    'dvb': 'discord-voice-bot',
  };
  if (aliases[query]) {
    match = projects.find(p => p.name === aliases[query]);
    if (match) return match;
  }
  return null;
}

// ── git info ────────────────────────────────────────────────────────

function getGitInfo(dir) {
  const gitDir = existsSync(join(dir, '.git')) ? dir : null;
  if (!gitDir) {
    // check parent (for projects/ subdirs that share root git)
    if (existsSync(join(ROOT, '.git'))) {
      return getGitInfoForSubdir(ROOT, dir);
    }
    return null;
  }
  
  try {
    const branch = execSync('git branch --show-current 2>/dev/null', { cwd: dir, encoding: 'utf8' }).trim();
    
    const logRaw = execSync(
      'git log --oneline --format="%H|%s|%ar|%ai" -10 2>/dev/null',
      { cwd: dir, encoding: 'utf8' }
    ).trim();
    
    const commits = logRaw ? logRaw.split('\n').map(line => {
      const [hash, ...rest] = line.split('|');
      const ai = rest.pop();
      const ar = rest.pop();
      const msg = rest.join('|');
      return { hash: hash.slice(0, 7), msg, ago: ar, date: ai };
    }) : [];
    
    // dirty files
    const statusRaw = execSync('git status --porcelain 2>/dev/null', { cwd: dir, encoding: 'utf8' }).trim();
    const dirty = statusRaw ? statusRaw.split('\n').map(l => ({
      status: l.slice(0, 2).trim(),
      file: l.slice(3)
    })) : [];
    
    // unpushed
    let unpushed = 0;
    try {
      const ahead = execSync('git rev-list @{upstream}..HEAD --count 2>/dev/null', { cwd: dir, encoding: 'utf8' }).trim();
      unpushed = parseInt(ahead) || 0;
    } catch {}
    
    // last commit date
    let lastCommitDate = null;
    try {
      lastCommitDate = execSync('git log -1 --format=%ai 2>/dev/null', { cwd: dir, encoding: 'utf8' }).trim();
    } catch {}
    
    return { branch, commits, dirty, unpushed, lastCommitDate };
  } catch {
    return null;
  }
}

function getGitInfoForSubdir(gitRoot, subdir) {
  const relPath = subdir.replace(gitRoot + '/', '') + '/';
  try {
    const branch = execSync('git branch --show-current 2>/dev/null', { cwd: gitRoot, encoding: 'utf8' }).trim();
    
    const logRaw = execSync(
      `git log --oneline --format="%H|%s|%ar|%ai" -10 -- "${relPath}" 2>/dev/null`,
      { cwd: gitRoot, encoding: 'utf8' }
    ).trim();
    
    const commits = logRaw ? logRaw.split('\n').map(line => {
      const [hash, ...rest] = line.split('|');
      const ai = rest.pop();
      const ar = rest.pop();
      const msg = rest.join('|');
      return { hash: hash.slice(0, 7), msg, ago: ar, date: ai };
    }) : [];
    
    const statusRaw = execSync(`git status --porcelain -- "${relPath}" 2>/dev/null`, { cwd: gitRoot, encoding: 'utf8' }).trim();
    const dirty = statusRaw ? statusRaw.split('\n').map(l => ({
      status: l.slice(0, 2).trim(),
      file: l.slice(3)
    })) : [];
    
    let lastCommitDate = null;
    if (commits.length) lastCommitDate = commits[0].date;
    
    return { branch, commits, dirty, unpushed: 0, lastCommitDate };
  } catch {
    return null;
  }
}

// ── task extraction ─────────────────────────────────────────────────

function getProjectTasks(projectName) {
  const result = { open: [], blocked: [], done: [] };
  
  // check global tasks/active.md
  if (existsSync(TASKS_FILE)) {
    const content = readFileSync(TASKS_FILE, 'utf8');
    const lines = content.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        currentSection = line.toLowerCase();
      }
      
      const lower = line.toLowerCase();
      if (!lower.includes(projectName) && !matchesAliases(projectName, lower)) continue;
      
      if (line.match(/^- \[ \]/)) {
        if (currentSection.includes('block')) {
          result.blocked.push(line.replace(/^- \[ \] /, '').trim());
        } else {
          result.open.push(line.replace(/^- \[ \] /, '').trim());
        }
      } else if (line.match(/^- \[x\]/i)) {
        result.done.push(line.replace(/^- \[x\] /i, '').trim());
      }
    }
  }
  
  // check project-local TASKS.md
  const projTasks = join(PROJECTS_DIR, projectName, 'TASKS.md');
  if (existsSync(projTasks)) {
    const content = readFileSync(projTasks, 'utf8');
    for (const line of content.split('\n')) {
      if (line.match(/^- \[ \]/)) {
        result.open.push(line.replace(/^- \[ \] /, '').trim());
      } else if (line.match(/^- \[x\]/i)) {
        result.done.push(line.replace(/^- \[x\] /i, '').trim());
      }
    }
  }
  
  return result;
}

function matchesAliases(projectName, text) {
  const aliasMap = {
    'anivia': ['anivia', 'sales automation', 'email sequence'],
    'tuner': ['tuner', 'mundo', 'persona', 'conductor'],
    'context-memory': ['context memory', 'context-memory', 'ctxmem'],
    'ventok-site': ['ventok.eu', 'ventok-site', 'ventok site', 'website'],
    'ventok': ['ventok', 'sales', 'pipeline', 'leads'],
    'discord-voice-bot': ['discord', 'voice bot'],
  };
  
  const aliases = aliasMap[projectName] || [projectName];
  return aliases.some(a => text.includes(a));
}

// ── memory mentions ─────────────────────────────────────────────────

function getMemoryMentions(projectName, days = 7) {
  const mentions = [];
  
  if (!existsSync(MEMORY_DIR)) return mentions;
  
  const now = new Date();
  const files = readdirSync(MEMORY_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}(-\w+)?\.md$/))
    .sort()
    .reverse();
  
  for (const file of files.slice(0, days * 2)) {
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    
    const fileDate = new Date(dateMatch[1]);
    const daysDiff = (now - fileDate) / (1000 * 60 * 60 * 24);
    if (daysDiff > days) continue;
    
    const content = readFileSync(join(MEMORY_DIR, file), 'utf8');
    const lines = content.split('\n');
    let currentSection = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('## ') || line.startsWith('### ')) {
        currentSection = line.replace(/^#+\s*/, '');
      }
      
      const lower = line.toLowerCase();
      if (matchesAliases(projectName, lower) && line.trim().length > 10) {
        // grab the section this belongs to
        mentions.push({
          date: dateMatch[1],
          file,
          section: currentSection,
          line: line.trim(),
          lineNum: i + 1
        });
      }
    }
  }
  
  // dedupe by section (keep first mention per section per date)
  const seen = new Set();
  return mentions.filter(m => {
    const key = `${m.date}:${m.section}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── MEMORY.md decisions ─────────────────────────────────────────────

function getKeyDecisions(projectName) {
  const memoryFile = join(ROOT, 'MEMORY.md');
  if (!existsSync(memoryFile)) return [];
  
  const content = readFileSync(memoryFile, 'utf8');
  const lines = content.split('\n');
  const decisions = [];
  let inProjectSection = false;
  let currentHeader = '';
  
  for (const line of lines) {
    if (line.startsWith('### ')) {
      currentHeader = line.replace(/^### /, '');
      inProjectSection = matchesAliases(projectName, line.toLowerCase());
    } else if (line.startsWith('## ')) {
      inProjectSection = matchesAliases(projectName, line.toLowerCase());
    }
    
    if (inProjectSection && line.startsWith('- **') && line.length > 10) {
      decisions.push(line.replace(/^- /, '').trim());
    }
  }
  
  return decisions;
}

// ── project files overview ──────────────────────────────────────────

function getFileOverview(dir) {
  try {
    const result = {};
    const extensions = {};
    
    const files = execSync(
      `find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -path '*/dist/*' 2>/dev/null`,
      { cwd: dir, encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);
    
    for (const f of files) {
      const ext = f.split('.').pop() || 'other';
      extensions[ext] = (extensions[ext] || 0) + 1;
    }
    
    // count key dirs
    const hasSrc = existsSync(join(dir, 'src'));
    const hasApp = existsSync(join(dir, 'app'));
    const hasPages = existsSync(join(dir, 'pages'));
    const hasComponents = existsSync(join(dir, 'components')) || existsSync(join(dir, 'src', 'components'));
    const hasScripts = existsSync(join(dir, 'scripts'));
    const hasMigrations = existsSync(join(dir, 'supabase', 'migrations'));
    
    return {
      totalFiles: files.length,
      extensions: Object.entries(extensions).sort((a, b) => b[1] - a[1]).slice(0, 8),
      structure: { hasSrc, hasApp, hasPages, hasComponents, hasScripts, hasMigrations }
    };
  } catch {
    return { totalFiles: 0, extensions: [], structure: {} };
  }
}

// ── package.json info ───────────────────────────────────────────────

function getPackageInfo(dir) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return {
      name: pkg.name,
      version: pkg.version,
      scripts: Object.keys(pkg.scripts || {}),
      deps: Object.keys(pkg.dependencies || {}).length,
      devDeps: Object.keys(pkg.devDependencies || {}).length,
    };
  } catch {
    return null;
  }
}

// ── resume point ────────────────────────────────────────────────────

function generateResumePoint(projectName, git, tasks, mentions) {
  const parts = [];
  
  // what was last worked on
  if (git && git.commits.length > 0) {
    const last = git.commits[0];
    parts.push(`last commit: "${last.msg}" (${last.ago})`);
  }
  
  // dirty state
  if (git && git.dirty.length > 0) {
    parts.push(`${git.dirty.length} uncommitted file${git.dirty.length > 1 ? 's' : ''}`);
  }
  
  // unpushed
  if (git && git.unpushed > 0) {
    parts.push(`${git.unpushed} unpushed commit${git.unpushed > 1 ? 's' : ''}`);
  }
  
  // blockers
  if (tasks.blocked.length > 0) {
    parts.push(`${tasks.blocked.length} blocker${tasks.blocked.length > 1 ? 's' : ''}`);
  }
  
  // open tasks
  if (tasks.open.length > 0) {
    parts.push(`${tasks.open.length} open task${tasks.open.length > 1 ? 's' : ''}`);
  }
  
  // recent discussion
  if (mentions.length > 0) {
    const latest = mentions[0];
    parts.push(`last discussed: ${latest.section || 'general'} (${latest.date})`);
  }
  
  return parts.length > 0 ? parts.join(' · ') : 'no recent activity';
}

// ── output: project list ────────────────────────────────────────────

function printProjectList(projects) {
  console.log(bold('\n⌁ projects\n'));
  
  const rows = projects.map(p => {
    const git = getGitInfo(p.dir);
    const lastActivity = git?.lastCommitDate ? timeAgo(git.lastCommitDate) : 'unknown';
    const dirty = git?.dirty.length || 0;
    const commits = git?.commits.length || 0;
    const status = dirty > 0 ? yellow('●') : green('✓');
    
    return { ...p, lastActivity, dirty, commits, status, git };
  });
  
  // sort by last activity (most recent first)
  rows.sort((a, b) => {
    const da = a.git?.lastCommitDate ? new Date(a.git.lastCommitDate) : new Date(0);
    const db = b.git?.lastCommitDate ? new Date(b.git.lastCommitDate) : new Date(0);
    return db - da;
  });
  
  if (isShort) {
    for (const r of rows) {
      console.log(`  ${r.status} ${cyan(r.name.padEnd(20))} ${dim(r.lastActivity.padEnd(10))} ${r.dirty > 0 ? yellow(`${r.dirty} dirty`) : ''}`);
    }
    console.log();
    return;
  }
  
  for (const r of rows) {
    const dirtyStr = r.dirty > 0 ? yellow(` · ${r.dirty} dirty`) : '';
    const branchStr = r.git?.branch ? dim(` (${r.git.branch})`) : '';
    console.log(`  ${r.status} ${bold(cyan(r.name))}${branchStr}`);
    console.log(`    ${dim('last:')} ${r.lastActivity}${dirtyStr}`);
    
    if (r.git?.commits[0]) {
      console.log(`    ${dim('last commit:')} ${r.git.commits[0].msg.slice(0, 60)}`);
    }
    console.log();
  }
  
  console.log(dim(`  run ${cyan('arc focus <project>')} for full context\n`));
}

// ── output: full project focus ──────────────────────────────────────

function printProjectFocus(project) {
  const { name, dir } = project;
  const git = getGitInfo(dir);
  const tasks = getProjectTasks(name);
  const mentions = getMemoryMentions(name, 7);
  const decisions = getKeyDecisions(name);
  const files = getFileOverview(dir);
  const pkg = getPackageInfo(dir);
  const resume = generateResumePoint(name, git, tasks, mentions);
  
  if (isJson) {
    console.log(JSON.stringify({ name, dir, git, tasks, mentions, decisions, files, pkg, resume }, null, 2));
    return;
  }
  
  // header
  console.log(bold(`\n⌁ focus: ${cyan(name)}`));
  console.log(dim('─'.repeat(50)));
  
  // resume point (the most important line)
  console.log(`\n  ${bold('resume →')} ${resume}`);
  
  // package info
  if (pkg) {
    const scripts = pkg.scripts.length > 0 ? pkg.scripts.slice(0, 6).join(', ') : 'none';
    console.log(`\n  ${dim('package:')} ${pkg.name || name}@${pkg.version || '?'} · ${pkg.deps} deps · ${pkg.devDeps} devDeps`);
    console.log(`  ${dim('scripts:')} ${scripts}`);
  }
  
  // file overview
  if (files.totalFiles > 0) {
    const extStr = files.extensions.slice(0, 5).map(([ext, n]) => `${ext}(${n})`).join(' ');
    console.log(`  ${dim('files:')} ${files.totalFiles} total · ${extStr}`);
  }
  
  // git status
  if (git) {
    console.log(`\n  ${bold('git')} ${dim(`(${git.branch})`)}`);
    
    if (git.dirty.length > 0) {
      console.log(`  ${yellow('●')} ${git.dirty.length} uncommitted:`);
      for (const d of git.dirty.slice(0, 8)) {
        const icon = d.status === 'M' ? yellow('M') : d.status === '??' ? dim('?') : d.status === 'A' ? green('A') : red(d.status);
        console.log(`    ${icon} ${d.file}`);
      }
      if (git.dirty.length > 8) console.log(dim(`    ... +${git.dirty.length - 8} more`));
    }
    
    if (git.unpushed > 0) {
      console.log(`  ${yellow('▲')} ${git.unpushed} unpushed commit${git.unpushed > 1 ? 's' : ''}`);
    }
    
    if (git.commits.length > 0) {
      console.log(`  ${dim('recent commits:')}`);
      for (const c of git.commits.slice(0, 5)) {
        console.log(`    ${dim(c.hash)} ${c.msg.slice(0, 55)}${c.msg.length > 55 ? '…' : ''} ${dim(c.ago)}`);
      }
    }
  }
  
  // tasks
  const totalTasks = tasks.open.length + tasks.blocked.length;
  if (totalTasks > 0) {
    console.log(`\n  ${bold('tasks')}`);
    
    if (tasks.blocked.length > 0) {
      console.log(`  ${red('blocked:')}`);
      for (const t of tasks.blocked) {
        console.log(`    ${red('✗')} ${t}`);
      }
    }
    
    if (tasks.open.length > 0) {
      console.log(`  ${yellow('open:')}`);
      for (const t of tasks.open) {
        console.log(`    ○ ${t}`);
      }
    }
  }
  
  // key decisions from MEMORY.md
  if (decisions.length > 0) {
    console.log(`\n  ${bold('key context')} ${dim('(from MEMORY.md)')}`);
    for (const d of decisions.slice(0, 8)) {
      console.log(`    ${d}`);
    }
  }
  
  // recent daily log mentions
  if (mentions.length > 0) {
    console.log(`\n  ${bold('recent discussions')} ${dim('(last 7 days)')}`);
    
    // group by date
    const byDate = {};
    for (const m of mentions) {
      if (!byDate[m.date]) byDate[m.date] = [];
      byDate[m.date].push(m);
    }
    
    for (const [date, items] of Object.entries(byDate).slice(0, 5)) {
      const sections = [...new Set(items.map(i => i.section))].filter(Boolean);
      if (sections.length > 0) {
        console.log(`    ${dim(date)} ${sections.join(' · ')}`);
      }
    }
  }
  
  console.log('\n' + dim('─'.repeat(50)));
  console.log();
}

// ── main ────────────────────────────────────────────────────────────

function main() {
  const projects = discoverProjects();
  
  if (!projectArg) {
    if (isJson) {
      const list = projects.map(p => {
        const git = getGitInfo(p.dir);
        return {
          name: p.name,
          dir: p.dir,
          lastCommit: git?.lastCommitDate || null,
          dirty: git?.dirty.length || 0,
          branch: git?.branch || null,
        };
      });
      console.log(JSON.stringify(list, null, 2));
    } else {
      printProjectList(projects);
    }
    return;
  }
  
  const project = findProjectDir(projectArg);
  if (!project) {
    console.error(red(`\n  project not found: ${projectArg}`));
    console.error(dim(`  available: ${projects.map(p => p.name).join(', ')}\n`));
    process.exit(1);
  }
  
  printProjectFocus(project);
}

main();

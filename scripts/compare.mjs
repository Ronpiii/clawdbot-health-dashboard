#!/usr/bin/env node
/**
 * arc compare — side-by-side project comparison dashboard
 * 
 * compare 2+ projects across every dimension: size, activity,
 * health, tasks, dependencies, age. answers "where should i focus?"
 * with data, not gut feel.
 * 
 * usage:
 *   arc compare                          # all projects, ranked by activity
 *   arc compare anivia tuner             # compare specific projects
 *   arc compare --by size                # rank by LOC
 *   arc compare --by activity            # rank by recent commits (default)
 *   arc compare --by tasks               # rank by open task count
 *   arc compare --by age                 # rank by repo age
 *   arc compare --short                  # compact one-liner per project
 *   arc compare --json                   # machine-readable
 * 
 * nightly build 2026-02-23
 */

import { readFileSync, existsSync, readdirSync, statSync, lstatSync } from 'fs';
import { execSync } from 'child_process';
import { join, extname } from 'path';

const ROOT = join(import.meta.dirname, '..');
const PROJECTS_DIR = join(ROOT, 'projects');
const MEMORY_DIR = join(ROOT, 'memory');
const TASKS_FILE = join(ROOT, 'tasks', 'active.md');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');
const byIdx = args.indexOf('--by');
const sortBy = byIdx !== -1 ? args[byIdx + 1] : 'activity';
const projectArgs = args.filter(a => !a.startsWith('--') && a !== sortBy);

// ── helpers ─────────────────────────────────────────────────────────

function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function magenta(s) { return `\x1b[35m${s}\x1b[0m`; }
function blue(s) { return `\x1b[34m${s}\x1b[0m`; }

function bar(value, max, width = 20) {
  if (max === 0) return dim('░'.repeat(width));
  const pct = Math.min(value / max, 1);
  const full = Math.round(pct * width);
  return '█'.repeat(full) + dim('░'.repeat(width - full));
}

function sparkBar(value, max, width = 10) {
  if (max === 0) return ' '.repeat(width);
  const blocks = ' ▏▎▍▌▋▊▉█';
  const pct = Math.min(value / max, 1);
  const fullBlocks = Math.floor(pct * width);
  const remainder = (pct * width) - fullBlocks;
  const partialIdx = Math.round(remainder * 8);
  let s = '█'.repeat(fullBlocks);
  if (fullBlocks < width) {
    s += blocks[partialIdx] || ' ';
    s += ' '.repeat(width - fullBlocks - 1);
  }
  return s;
}

function pad(s, len, align = 'left') {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = len - stripped.length;
  if (diff <= 0) return s;
  if (align === 'right') return ' '.repeat(diff) + s;
  return s + ' '.repeat(diff);
}

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '?';
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function daysAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return Infinity;
  return Math.floor((now - then) / 86400000);
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// ── project discovery ───────────────────────────────────────────────

const ALIASES = {
  mundo: 'tuner', cm: 'context-memory', ctx: 'context-memory',
  'ventok-web': 'ventok-site', vsite: 'ventok-site',
  discord: 'discord-voice-bot', dvb: 'discord-voice-bot',
};

function discoverProjects() {
  const projects = [];
  if (existsSync(PROJECTS_DIR)) {
    for (const name of readdirSync(PROJECTS_DIR)) {
      const dir = join(PROJECTS_DIR, name);
      try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
      projects.push({ name, dir });
    }
  }
  for (const name of readdirSync(ROOT)) {
    const dir = join(ROOT, name);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    if (['projects', 'memory', 'tasks', 'scripts', 'writing', 'node_modules', '.git', 'skills', '.config'].includes(name)) continue;
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, 'package.json'))) {
      if (!projects.find(p => p.name === name)) {
        projects.push({ name, dir });
      }
    }
  }
  return projects;
}

function resolveProject(query) {
  const projects = discoverProjects();
  const q = ALIASES[query] || query;
  return projects.find(p => p.name === q) || projects.find(p => p.name.includes(q));
}

// ── data collectors ─────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.vercel', '.turbo',
  'dist', 'build', 'out', '.cache', '.output', 'coverage',
  '__pycache__', '.svelte-kit', '.nuxt', 'vendor',
]);

const LANG_MAP = {
  '.js': 'JS', '.mjs': 'JS', '.cjs': 'JS', '.jsx': 'JSX',
  '.ts': 'TS', '.tsx': 'TSX', '.css': 'CSS', '.scss': 'SCSS',
  '.html': 'HTML', '.json': 'JSON', '.md': 'MD', '.sql': 'SQL',
  '.sh': 'Shell', '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
  '.yml': 'YAML', '.yaml': 'YAML', '.toml': 'TOML', '.svg': 'SVG',
  '.prisma': 'Prisma', '.graphql': 'GQL',
};

const CODE_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.css', '.scss',
  '.html', '.sql', '.sh', '.py', '.go', '.rs', '.prisma', '.graphql', '.gql',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
]);

function countFiles(dir, depth = 0) {
  const result = { files: 0, codeLoc: 0, totalLoc: 0, diskBytes: 0, langs: {} };
  if (depth > 8) return result;
  
  let entries;
  try { entries = readdirSync(dir); } catch { return result; }
  
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let st;
    try { st = lstatSync(full); } catch { continue; }
    
    if (st.isDirectory()) {
      const sub = countFiles(full, depth + 1);
      result.files += sub.files;
      result.codeLoc += sub.codeLoc;
      result.totalLoc += sub.totalLoc;
      result.diskBytes += sub.diskBytes;
      for (const [lang, count] of Object.entries(sub.langs)) {
        result.langs[lang] = (result.langs[lang] || 0) + count;
      }
    } else if (st.isFile()) {
      if (SKIP_FILES.has(entry)) continue;
      result.files++;
      result.diskBytes += st.size;
      
      const ext = extname(entry).toLowerCase();
      const lang = LANG_MAP[ext];
      if (lang) {
        try {
          const content = readFileSync(full, 'utf8');
          const lines = content.split('\n').length;
          result.totalLoc += lines;
          if (CODE_EXTS.has(ext)) result.codeLoc += lines;
          result.langs[lang] = (result.langs[lang] || 0) + lines;
        } catch { /* binary or unreadable */ }
      }
    }
  }
  return result;
}

function getGitStats(dir) {
  const result = { 
    hasGit: false, branch: null, lastCommit: null, lastCommitDate: null,
    commits7d: 0, commits30d: 0, commitsTotal: 0,
    dirty: 0, unpushed: 0, contributors: 0,
    firstCommitDate: null, insertions7d: 0, deletions7d: 0,
  };
  
  // find git dir (might be project subdir under root git)
  let gitCwd = dir;
  if (!existsSync(join(dir, '.git'))) {
    if (existsSync(join(ROOT, '.git'))) {
      gitCwd = ROOT;
    } else {
      return result;
    }
  }
  result.hasGit = true;
  
  const run = (cmd) => {
    try { return execSync(cmd, { cwd: gitCwd, encoding: 'utf8', timeout: 5000 }).trim(); }
    catch { return ''; }
  };
  
  // for subdirs under root git, scope commits to that path
  const isSubdir = gitCwd === ROOT && dir !== ROOT;
  const pathFilter = isSubdir ? ` -- "${dir.replace(ROOT + '/', '')}"` : '';
  
  result.branch = run('git branch --show-current 2>/dev/null') || null;
  
  // last commit
  const lastLog = run(`git log -1 --format="%s|%ai" ${pathFilter} 2>/dev/null`);
  if (lastLog) {
    const [msg, date] = lastLog.split('|');
    result.lastCommit = msg;
    result.lastCommitDate = date;
  }
  
  // first commit (age)
  const firstLog = run(`git log --reverse --format="%ai" -1 ${pathFilter} 2>/dev/null`);
  if (firstLog) result.firstCommitDate = firstLog;
  
  // commit counts
  const c7 = run(`git log --oneline --since="7 days ago" ${pathFilter} 2>/dev/null`);
  result.commits7d = c7 ? c7.split('\n').filter(Boolean).length : 0;
  
  const c30 = run(`git log --oneline --since="30 days ago" ${pathFilter} 2>/dev/null`);
  result.commits30d = c30 ? c30.split('\n').filter(Boolean).length : 0;
  
  const cAll = run(`git log --oneline ${pathFilter} 2>/dev/null`);
  result.commitsTotal = cAll ? cAll.split('\n').filter(Boolean).length : 0;
  
  // dirty files (only for own-git repos)
  if (!isSubdir) {
    const status = run('git status --porcelain 2>/dev/null');
    result.dirty = status ? status.split('\n').filter(Boolean).length : 0;
  }
  
  // unpushed
  if (!isSubdir) {
    const unpushed = run('git log --oneline @{upstream}..HEAD 2>/dev/null');
    result.unpushed = unpushed ? unpushed.split('\n').filter(Boolean).length : 0;
  }
  
  // contributors
  const authors = run(`git log --format="%aN" ${pathFilter} 2>/dev/null`);
  if (authors) result.contributors = new Set(authors.split('\n').filter(Boolean)).size;
  
  // 7d churn
  const diffStat = run(`git log --since="7 days ago" --numstat --format="" ${pathFilter} 2>/dev/null`);
  if (diffStat) {
    for (const line of diffStat.split('\n').filter(Boolean)) {
      const [add, del] = line.split('\t');
      if (add !== '-') result.insertions7d += parseInt(add) || 0;
      if (del !== '-') result.deletions7d += parseInt(del) || 0;
    }
  }
  
  return result;
}

function getTaskInfo(projectName) {
  const result = { open: 0, blocked: 0, done: 0, items: [] };
  
  // tasks/active.md
  if (existsSync(TASKS_FILE)) {
    try {
      const content = readFileSync(TASKS_FILE, 'utf8');
      const lines = content.split('\n');
      let inBlocked = false;
      
      for (const line of lines) {
        if (line.match(/^#+.*blocked/i)) { inBlocked = true; continue; }
        if (line.match(/^#+/)) { inBlocked = false; continue; }
        
        const lower = line.toLowerCase();
        if (!lower.includes(projectName.toLowerCase()) && 
            !lower.includes(projectName.replace(/-/g, ' ').toLowerCase())) continue;
        
        if (line.match(/^\s*-\s*\[x\]/)) {
          result.done++;
        } else if (line.match(/^\s*-\s*\[\s*\]/)) {
          if (inBlocked) result.blocked++;
          else result.open++;
          result.items.push(line.replace(/^\s*-\s*\[\s*\]\s*/, '').trim());
        }
      }
    } catch {}
  }
  
  // project-local tasks
  const localTasks = join(PROJECTS_DIR, projectName, 'TASKS.md');
  if (existsSync(localTasks)) {
    try {
      const content = readFileSync(localTasks, 'utf8');
      const open = (content.match(/^\s*-\s*\[\s*\]/gm) || []).length;
      const done = (content.match(/^\s*-\s*\[x\]/gm) || []).length;
      result.open += open;
      result.done += done;
    } catch {}
  }
  
  return result;
}

function getPackageInfo(dir) {
  const result = { hasPkg: false, name: null, version: null, deps: 0, devDeps: 0, scripts: [] };
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return result;
  
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    result.hasPkg = true;
    result.name = pkg.name || null;
    result.version = pkg.version || null;
    result.deps = Object.keys(pkg.dependencies || {}).length;
    result.devDeps = Object.keys(pkg.devDependencies || {}).length;
    result.scripts = Object.keys(pkg.scripts || {});
  } catch {}
  
  return result;
}

function getMemoryMentions(projectName) {
  // count mentions in last 7 days of daily logs
  let mentions = 0;
  let lastMentioned = null;
  
  if (!existsSync(MEMORY_DIR)) return { mentions, lastMentioned };
  
  const files = readdirSync(MEMORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
    .slice(0, 7);
  
  for (const f of files) {
    try {
      const content = readFileSync(join(MEMORY_DIR, f), 'utf8').toLowerCase();
      const name = projectName.toLowerCase();
      const nameAlt = name.replace(/-/g, ' ');
      const count = (content.split(name).length - 1) + 
                    (name !== nameAlt ? content.split(nameAlt).length - 1 : 0);
      if (count > 0) {
        mentions += count;
        if (!lastMentioned) lastMentioned = f.replace('.md', '');
      }
    } catch {}
  }
  
  return { mentions, lastMentioned };
}

// ── main analysis ───────────────────────────────────────────────────

function analyzeProject(proj) {
  const files = countFiles(proj.dir);
  const git = getGitStats(proj.dir);
  const tasks = getTaskInfo(proj.name);
  const pkg = getPackageInfo(proj.dir);
  const memory = getMemoryMentions(proj.name);
  
  // compute health signals
  const staleDays = git.lastCommitDate ? daysAgo(git.lastCommitDate) : Infinity;
  const ageDays = git.firstCommitDate ? daysAgo(git.firstCommitDate) : 0;
  
  // activity score: weighted combination
  const activityScore = 
    (git.commits7d * 10) + 
    (git.commits30d * 2) + 
    (memory.mentions * 5) + 
    (tasks.open * 3) +
    (git.dirty > 0 ? 5 : 0) +
    (git.unpushed > 0 ? 5 : 0);
  
  // status determination
  let status;
  if (staleDays <= 1) status = 'active';
  else if (staleDays <= 7) status = 'recent';
  else if (staleDays <= 30) status = 'idle';
  else status = 'stale';
  
  // velocity: commits per week (30d avg)
  const velocity = git.commits30d > 0 ? (git.commits30d / 4.3).toFixed(1) : '0';
  
  // code density: codeLoc / files (higher = bigger files)
  const codeDensity = files.files > 0 ? Math.round(files.codeLoc / files.files) : 0;
  
  // top languages
  const topLangs = Object.entries(files.langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang, loc]) => ({ lang, loc }));
  
  return {
    name: proj.name,
    dir: proj.dir,
    status,
    staleDays,
    ageDays,
    activityScore,
    velocity,
    codeDensity,
    topLangs,
    files,
    git,
    tasks,
    pkg,
    memory,
  };
}

// ── output formatting ───────────────────────────────────────────────

const STATUS_ICONS = {
  active: green('●'),
  recent: yellow('●'),
  idle: dim('○'),
  stale: red('○'),
};

const STATUS_LABELS = {
  active: green('active'),
  recent: yellow('recent'),
  idle: dim('idle'),
  stale: red('stale'),
};

function sortProjects(projects, by) {
  switch (by) {
    case 'size':
    case 'loc':
      return projects.sort((a, b) => b.files.codeLoc - a.files.codeLoc);
    case 'activity':
    case 'active':
      return projects.sort((a, b) => b.activityScore - a.activityScore);
    case 'tasks':
      return projects.sort((a, b) => (b.tasks.open + b.tasks.blocked) - (a.tasks.open + a.tasks.blocked));
    case 'age':
      return projects.sort((a, b) => b.ageDays - a.ageDays);
    case 'commits':
      return projects.sort((a, b) => b.git.commits30d - a.git.commits30d);
    case 'velocity':
      return projects.sort((a, b) => parseFloat(b.velocity) - parseFloat(a.velocity));
    case 'churn':
      return projects.sort((a, b) => (b.git.insertions7d + b.git.deletions7d) - (a.git.insertions7d + a.git.deletions7d));
    default:
      return projects.sort((a, b) => b.activityScore - a.activityScore);
  }
}

function printShort(projects) {
  console.log(bold('\n  PROJECT COMPARISON') + dim(` (${projects.length} projects, sorted by ${sortBy})\n`));
  
  const maxName = Math.max(...projects.map(p => p.name.length), 8);
  
  // header
  console.log(
    '  ' + dim(pad('project', maxName + 2)) +
    dim(pad('status', 8)) +
    dim(pad('LOC', 8, 'right')) +
    dim(pad('files', 7, 'right')) +
    dim(pad('7d', 5, 'right')) +
    dim(pad('30d', 5, 'right')) +
    dim(pad('tasks', 6, 'right')) +
    dim(pad('vel/wk', 8, 'right')) +
    '  ' + dim('langs')
  );
  console.log(dim('  ' + '─'.repeat(maxName + 2 + 8 + 8 + 7 + 5 + 5 + 6 + 8 + 12)));
  
  for (const p of projects) {
    const langStr = p.topLangs.slice(0, 2).map(l => l.lang).join('+') || dim('—');
    const taskStr = p.tasks.open > 0 
      ? (p.tasks.blocked > 0 ? `${p.tasks.open}` + red(`+${p.tasks.blocked}b`) : String(p.tasks.open))
      : dim('0');
    
    console.log(
      '  ' + STATUS_ICONS[p.status] + ' ' + pad(bold(p.name), maxName) + '  ' +
      pad(STATUS_LABELS[p.status], 8 + 9) +  // +9 for ansi color codes
      pad(formatNum(p.files.codeLoc), 8, 'right') +
      pad(String(p.files.files), 7, 'right') +
      pad(String(p.git.commits7d), 5, 'right') +
      pad(String(p.git.commits30d), 5, 'right') +
      pad(taskStr, 6 + (p.tasks.blocked > 0 ? 9 : 0), 'right') +
      pad(p.velocity, 8, 'right') +
      '  ' + langStr
    );
  }
  console.log();
}

function printDetailed(projects) {
  const maxActivity = Math.max(...projects.map(p => p.activityScore), 1);
  const maxLoc = Math.max(...projects.map(p => p.files.codeLoc), 1);
  const maxCommits = Math.max(...projects.map(p => p.git.commits30d), 1);
  const maxChurn = Math.max(...projects.map(p => p.git.insertions7d + p.git.deletions7d), 1);
  
  console.log(bold('\n  ⚖  PROJECT COMPARISON'));
  console.log(dim(`  ${projects.length} projects · sorted by ${sortBy} · ${new Date().toISOString().split('T')[0]}\n`));
  
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const rank = i + 1;
    
    // header line
    console.log(`  ${dim(rank + '.')} ${STATUS_ICONS[p.status]} ${bold(p.name)} ${dim('—')} ${STATUS_LABELS[p.status]}${p.staleDays < Infinity ? dim(` (${timeAgo(p.git.lastCommitDate)} ago)`) : ''}`);
    
    // activity bar
    console.log(`     ${dim('activity')}  ${cyan(bar(p.activityScore, maxActivity, 16))} ${dim(String(p.activityScore))}`);
    
    // size
    const langStr = p.topLangs.map(l => `${l.lang} ${dim(formatNum(l.loc))}`).join(dim(' · ')) || dim('—');
    const diskStr = p.files.diskBytes >= 1048576 
      ? (p.files.diskBytes / 1048576).toFixed(1) + 'MB'
      : Math.round(p.files.diskBytes / 1024) + 'KB';
    console.log(`     ${dim('size')}      ${formatNum(p.files.codeLoc)} LOC ${dim('/')} ${p.files.files} files ${dim('/')} ${diskStr}`);
    console.log(`     ${dim('langs')}     ${langStr}`);
    
    // git
    if (p.git.hasGit) {
      const commitBar = bar(p.git.commits30d, maxCommits, 10);
      const churn = p.git.insertions7d + p.git.deletions7d;
      const churnBar = bar(churn, maxChurn, 10);
      console.log(`     ${dim('commits')}   ${dim('7d')} ${bold(String(p.git.commits7d))} ${dim('·')} ${dim('30d')} ${bold(String(p.git.commits30d))} ${commitBar} ${dim('·')} ${dim('vel')} ${p.velocity}/wk`);
      console.log(`     ${dim('churn')}     ${green('+' + formatNum(p.git.insertions7d))} ${red('-' + formatNum(p.git.deletions7d))} ${churnBar}${p.git.dirty > 0 ? '  ' + yellow(`${p.git.dirty} dirty`) : ''}${p.git.unpushed > 0 ? '  ' + yellow(`${p.git.unpushed} unpushed`) : ''}`);
      if (p.git.lastCommit) {
        console.log(`     ${dim('last')}      ${dim(p.git.lastCommit.slice(0, 50))}`);
      }
    } else {
      console.log(`     ${dim('git')}       ${dim('no git history')}`);
    }
    
    // tasks
    if (p.tasks.open + p.tasks.blocked + p.tasks.done > 0) {
      const parts = [];
      if (p.tasks.open) parts.push(cyan(`${p.tasks.open} open`));
      if (p.tasks.blocked) parts.push(red(`${p.tasks.blocked} blocked`));
      if (p.tasks.done) parts.push(green(`${p.tasks.done} done`));
      console.log(`     ${dim('tasks')}     ${parts.join(dim(' · '))}`);
    }
    
    // deps
    if (p.pkg.hasPkg) {
      console.log(`     ${dim('deps')}      ${p.pkg.deps} prod ${dim('+')} ${p.pkg.devDeps} dev${p.pkg.version ? dim(` · v${p.pkg.version}`) : ''}`);
    }
    
    // memory mentions
    if (p.memory.mentions > 0) {
      console.log(`     ${dim('mentions')}  ${p.memory.mentions}x in last 7d of logs${p.memory.lastMentioned ? dim(` (last: ${p.memory.lastMentioned})`) : ''}`);
    }
    
    // age
    if (p.ageDays > 0) {
      console.log(`     ${dim('age')}       ${p.ageDays}d${p.git.commitsTotal > 0 ? dim(` · ${p.git.commitsTotal} total commits`) : ''}`);
    }
    
    if (i < projects.length - 1) console.log();
  }
  
  // ── comparison summary ──────────────────────────────────────────
  
  if (projects.length >= 2) {
    console.log(dim('\n  ─────────────────────────────────────────'));
    console.log(bold('\n  COMPARISON SUMMARY\n'));
    
    // find superlatives
    const biggest = [...projects].sort((a, b) => b.files.codeLoc - a.files.codeLoc)[0];
    const busiest = [...projects].sort((a, b) => b.git.commits7d - a.git.commits7d)[0];
    const stalest = [...projects].sort((a, b) => b.staleDays - a.staleDays)[0];
    const mostTasks = [...projects].sort((a, b) => (b.tasks.open + b.tasks.blocked) - (a.tasks.open + a.tasks.blocked))[0];
    const heaviest = [...projects].sort((a, b) => (b.pkg.deps + b.pkg.devDeps) - (a.pkg.deps + a.pkg.devDeps))[0];
    const churniest = [...projects].sort((a, b) => (b.git.insertions7d + b.git.deletions7d) - (a.git.insertions7d + a.git.deletions7d))[0];
    
    const superlatives = [];
    if (biggest.files.codeLoc > 0) superlatives.push(`${dim('biggest codebase:')}  ${bold(biggest.name)} ${dim(`(${formatNum(biggest.files.codeLoc)} LOC)`)}`);
    if (busiest.git.commits7d > 0) superlatives.push(`${dim('most active (7d):')}  ${bold(busiest.name)} ${dim(`(${busiest.git.commits7d} commits)`)}`);
    if (stalest.staleDays > 7 && stalest.staleDays < Infinity) superlatives.push(`${dim('most stale:')}       ${bold(stalest.name)} ${dim(`(${stalest.staleDays}d idle)`)}`);
    if (mostTasks.tasks.open + mostTasks.tasks.blocked > 0) superlatives.push(`${dim('most tasks:')}       ${bold(mostTasks.name)} ${dim(`(${mostTasks.tasks.open} open${mostTasks.tasks.blocked > 0 ? `, ${mostTasks.tasks.blocked} blocked` : ''})`)}`);
    if (heaviest.pkg.deps + heaviest.pkg.devDeps > 0) superlatives.push(`${dim('heaviest deps:')}    ${bold(heaviest.name)} ${dim(`(${heaviest.pkg.deps + heaviest.pkg.devDeps} packages)`)}`);
    
    const churn = churniest.git.insertions7d + churniest.git.deletions7d;
    if (churn > 0) superlatives.push(`${dim('most churn (7d):')}  ${bold(churniest.name)} ${dim(`(+${formatNum(churniest.git.insertions7d)}/-${formatNum(churniest.git.deletions7d)})`)}`);
    
    for (const s of superlatives) console.log(`  ${s}`);
    
    // totals
    const totalLoc = projects.reduce((s, p) => s + p.files.codeLoc, 0);
    const totalFiles = projects.reduce((s, p) => s + p.files.files, 0);
    const totalCommits7d = projects.reduce((s, p) => s + p.git.commits7d, 0);
    const totalCommits30d = projects.reduce((s, p) => s + p.git.commits30d, 0);
    const totalDisk = projects.reduce((s, p) => s + p.files.diskBytes, 0);
    const activeCount = projects.filter(p => p.status === 'active' || p.status === 'recent').length;
    const staleCount = projects.filter(p => p.status === 'stale').length;
    
    console.log();
    console.log(`  ${dim('totals:')} ${formatNum(totalLoc)} LOC · ${totalFiles} files · ${(totalDisk / 1048576).toFixed(1)}MB`);
    console.log(`  ${dim('velocity:')} ${totalCommits7d} commits/7d · ${totalCommits30d} commits/30d`);
    console.log(`  ${dim('health:')} ${green(activeCount + ' active')}${staleCount > 0 ? dim(' · ') + red(staleCount + ' stale') : ''} of ${projects.length} projects`);
    
    // focus suggestion
    if (projects.length >= 2) {
      // score: high activity + open tasks = needs attention, stale + no tasks = can ignore
      const needsAttention = [...projects]
        .filter(p => p.status !== 'stale')
        .sort((a, b) => {
          const aScore = (a.tasks.open * 10) + (a.tasks.blocked * 15) + (a.git.dirty * 5) + (a.git.unpushed * 5);
          const bScore = (b.tasks.open * 10) + (b.tasks.blocked * 15) + (b.git.dirty * 5) + (b.git.unpushed * 5);
          return bScore - aScore;
        })[0];
      
      if (needsAttention && (needsAttention.tasks.open + needsAttention.git.dirty + needsAttention.git.unpushed > 0)) {
        const reasons = [];
        if (needsAttention.tasks.open) reasons.push(`${needsAttention.tasks.open} open tasks`);
        if (needsAttention.tasks.blocked) reasons.push(`${needsAttention.tasks.blocked} blocked`);
        if (needsAttention.git.dirty) reasons.push(`${needsAttention.git.dirty} dirty files`);
        if (needsAttention.git.unpushed) reasons.push(`${needsAttention.git.unpushed} unpushed`);
        console.log(`\n  ${dim('→')} ${bold(needsAttention.name)} needs attention: ${reasons.join(', ')}`);
      }
    }
  }
  
  console.log();
}

// ── main ────────────────────────────────────────────────────────────

const allProjects = discoverProjects();
let targets;

if (projectArgs.length > 0) {
  targets = [];
  for (const arg of projectArgs) {
    const p = resolveProject(arg);
    if (p) targets.push(p);
    else console.error(red(`  project not found: ${arg}`));
  }
  if (targets.length === 0) process.exit(1);
} else {
  targets = allProjects;
}

// analyze all
const analyzed = targets.map(p => analyzeProject(p));
sortProjects(analyzed, sortBy);

if (jsonMode) {
  console.log(JSON.stringify(analyzed, null, 2));
} else if (shortMode) {
  printShort(analyzed);
} else {
  printDetailed(analyzed);
}

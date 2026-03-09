#!/usr/bin/env node

/**
 * arc eod — End of Day closing ritual
 * 
 * Complements `arc brief` (morning) with an evening counterpart:
 * - Summarizes today's accomplishments (git + log + tasks)
 * - Captures loose threads / unfinished work
 * - Generates tomorrow's top 3 priorities
 * - Tracks daily closure rate over time
 * 
 * Usage:
 *   arc eod              - full end of day ritual
 *   arc eod --quick      - just accomplishments + tomorrow
 *   arc eod --append     - append summary to daily log
 *   arc eod --post       - post to discord #logs
 *   arc eod --json       - machine-readable output
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Parse args
const args = process.argv.slice(2);
const flags = {
  quick: args.includes('--quick'),
  append: args.includes('--append'),
  post: args.includes('--post'),
  json: args.includes('--json'),
  short: args.includes('--short'),
  help: args.includes('--help') || args.includes('-h')
};

if (flags.help) {
  console.log(`
arc eod — End of Day closing ritual

USAGE
  arc eod              full ritual
  arc eod --quick      accomplishments + tomorrow only
  arc eod --append     append summary to daily log
  arc eod --post       post to discord #logs
  arc eod --short      one-liner summary
  arc eod --json       machine-readable

WHAT IT DOES
  1. Summarizes today's work (commits, completed tasks, log sections)
  2. Surfaces loose threads (in-progress tasks, dirty repos, TODOs added)
  3. Generates tomorrow's top 3 priorities
  4. Tracks closure rate (completed vs started)
  5. Optionally saves to daily log or posts to Discord
`);
  process.exit(0);
}

// Helpers
const today = new Date().toISOString().split('T')[0];
const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
const todayLogPath = join(ROOT, 'memory', `${today}.md`);

function getRepoPath(name) {
  const paths = [
    join(ROOT, 'projects', name),
    join(ROOT, 'projects', name.toLowerCase()),
    join(ROOT, '..', name),
    join(ROOT, '..', name.toLowerCase())
  ];
  for (const p of paths) {
    if (existsSync(join(p, '.git'))) return p;
  }
  return null;
}

function getAllRepos() {
  const repos = [];
  // Check workspace itself
  if (existsSync(join(ROOT, '.git'))) {
    repos.push({ name: 'clawd', path: ROOT });
  }
  // Check projects/
  const projectsDir = join(ROOT, 'projects');
  if (existsSync(projectsDir)) {
    for (const dir of readdirSync(projectsDir)) {
      const p = join(projectsDir, dir);
      if (existsSync(join(p, '.git'))) {
        repos.push({ name: dir, path: p });
      }
    }
  }
  return repos;
}

function getTodayCommits() {
  const repos = getAllRepos();
  const commits = [];
  
  for (const repo of repos) {
    try {
      const log = execSync(
        `git log --oneline --since="${today} 00:00:00" --format="%h|%s" 2>/dev/null`,
        { cwd: repo.path, encoding: 'utf8' }
      ).trim();
      
      if (log) {
        for (const line of log.split('\n')) {
          const [hash, ...msgParts] = line.split('|');
          const message = msgParts.join('|');
          commits.push({ repo: repo.name, hash, message });
        }
      }
    } catch (e) {}
  }
  
  return commits;
}

function getGitStats() {
  const repos = getAllRepos();
  let totalInsertions = 0;
  let totalDeletions = 0;
  
  for (const repo of repos) {
    try {
      const stat = execSync(
        `git diff --shortstat HEAD~10 HEAD 2>/dev/null || echo "0"`,
        { cwd: repo.path, encoding: 'utf8' }
      ).trim();
      
      const insMatch = stat.match(/(\d+) insertion/);
      const delMatch = stat.match(/(\d+) deletion/);
      
      if (insMatch) totalInsertions += parseInt(insMatch[1]);
      if (delMatch) totalDeletions += parseInt(delMatch[1]);
    } catch (e) {}
  }
  
  return { insertions: totalInsertions, deletions: totalDeletions };
}

function getDirtyRepos() {
  const repos = getAllRepos();
  const dirty = [];
  
  for (const repo of repos) {
    try {
      const status = execSync('git status --porcelain 2>/dev/null', { 
        cwd: repo.path, 
        encoding: 'utf8' 
      }).trim();
      
      if (status) {
        const files = status.split('\n').length;
        dirty.push({ name: repo.name, files });
      }
    } catch (e) {}
  }
  
  return dirty;
}

function getUnpushedRepos() {
  const repos = getAllRepos();
  const unpushed = [];
  
  for (const repo of repos) {
    try {
      const count = execSync(
        'git rev-list @{upstream}..HEAD 2>/dev/null | wc -l',
        { cwd: repo.path, encoding: 'utf8' }
      ).trim();
      
      if (parseInt(count) > 0) {
        unpushed.push({ name: repo.name, commits: parseInt(count) });
      }
    } catch (e) {}
  }
  
  return unpushed;
}

function getCompletedTasks() {
  const completed = [];
  
  if (existsSync(todayLogPath)) {
    const content = readFileSync(todayLogPath, 'utf8');
    const matches = content.match(/^- \[x\] .+$/gm) || [];
    
    for (const m of matches) {
      completed.push(m.replace(/^- \[x\] /, ''));
    }
  }
  
  return completed;
}

function getInProgressTasks() {
  const inProgress = [];
  
  // From daily log
  if (existsSync(todayLogPath)) {
    const content = readFileSync(todayLogPath, 'utf8');
    const matches = content.match(/^- \[~\] .+$/gm) || [];
    
    for (const m of matches) {
      inProgress.push({ source: 'log', task: m.replace(/^- \[~\] /, '') });
    }
  }
  
  // From tasks/active.md
  const activePath = join(ROOT, 'tasks', 'active.md');
  if (existsSync(activePath)) {
    const content = readFileSync(activePath, 'utf8');
    const matches = content.match(/^- \[~\] .+$/gm) || [];
    
    for (const m of matches) {
      const task = m.replace(/^- \[~\] /, '');
      // Avoid duplicates
      if (!inProgress.find(t => t.task === task)) {
        inProgress.push({ source: 'active', task });
      }
    }
  }
  
  return inProgress;
}

function getOpenTasks() {
  const open = [];
  
  // From tasks/active.md - unchecked items
  const activePath = join(ROOT, 'tasks', 'active.md');
  if (existsSync(activePath)) {
    const content = readFileSync(activePath, 'utf8');
    const lines = content.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      if (line.match(/^## /)) {
        currentSection = line.replace(/^## /, '').toLowerCase();
      }
      
      const match = line.match(/^- \[ \] (.+)$/);
      if (match) {
        open.push({
          task: match[1],
          section: currentSection,
          priority: getPriority(currentSection, match[1])
        });
      }
    }
  }
  
  return open.sort((a, b) => b.priority - a.priority);
}

function getPriority(section, task) {
  let score = 50;
  
  // Section-based priority
  if (section.includes('priority') || section.includes('urgent')) score += 30;
  if (section.includes('next') || section.includes('soon')) score += 20;
  if (section.includes('backlog')) score -= 10;
  
  // Content-based priority
  const lower = task.toLowerCase();
  if (lower.includes('revenue') || lower.includes('client') || lower.includes('customer')) score += 20;
  if (lower.includes('launch') || lower.includes('ship') || lower.includes('release')) score += 15;
  if (lower.includes('bug') || lower.includes('fix') || lower.includes('broken')) score += 10;
  if (lower.includes('meeting') || lower.includes('call')) score += 10;
  if (lower.includes('docs') || lower.includes('document')) score -= 5;
  if (lower.includes('nice to have') || lower.includes('later')) score -= 10;
  
  return Math.min(100, Math.max(0, score));
}

function getLogSections() {
  if (!existsSync(todayLogPath)) return [];
  
  const content = readFileSync(todayLogPath, 'utf8');
  const sections = [];
  
  const matches = content.match(/^## .+$/gm) || [];
  for (const m of matches) {
    sections.push(m.replace(/^## /, ''));
  }
  
  return sections;
}

function getTodosAddedToday() {
  const repos = getAllRepos();
  const todos = [];
  
  for (const repo of repos) {
    try {
      const diff = execSync(
        `git diff --since="${today} 00:00:00" -U0 2>/dev/null || git diff HEAD~5 -U0 2>/dev/null`,
        { cwd: repo.path, encoding: 'utf8' }
      );
      
      const matches = diff.match(/^\+.*(?:TODO|FIXME|HACK|XXX).*$/gm) || [];
      for (const m of matches) {
        if (!m.includes('+++')) {
          todos.push({ repo: repo.name, line: m.replace(/^\+/, '').trim() });
        }
      }
    } catch (e) {}
  }
  
  return todos;
}

function calculateClosureRate(completed, inProgress, addedTodos) {
  const finished = completed.length;
  const started = finished + inProgress.length + addedTodos.length;
  
  if (started === 0) return { rate: 100, finished, started };
  
  return {
    rate: Math.round((finished / started) * 100),
    finished,
    started
  };
}

function generateTomorrowPriorities(openTasks, inProgress, dirtyRepos) {
  const priorities = [];
  
  // In-progress tasks should continue
  for (const t of inProgress.slice(0, 2)) {
    priorities.push({
      task: t.task,
      reason: 'continue in-progress'
    });
  }
  
  // Dirty repos need commits
  for (const r of dirtyRepos.slice(0, 1)) {
    priorities.push({
      task: `commit ${r.name} (${r.files} files uncommitted)`,
      reason: 'git hygiene'
    });
  }
  
  // Top open tasks by priority
  for (const t of openTasks) {
    if (priorities.length >= 3) break;
    if (!priorities.find(p => p.task.includes(t.task.substring(0, 20)))) {
      priorities.push({
        task: t.task,
        reason: t.section || 'backlog'
      });
    }
  }
  
  return priorities.slice(0, 3);
}

function makeBar(value, max, width = 10) {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// Collect all data
const commits = getTodayCommits();
const completedTasks = getCompletedTasks();
const inProgressTasks = getInProgressTasks();
const dirtyRepos = getDirtyRepos();
const unpushedRepos = getUnpushedRepos();
const openTasks = getOpenTasks();
const logSections = getLogSections();
const todosAdded = getTodosAddedToday();
const closure = calculateClosureRate(completedTasks, inProgressTasks, todosAdded);
const tomorrow = generateTomorrowPriorities(openTasks, inProgressTasks, dirtyRepos);

// Build output
const result = {
  date: today,
  dayOfWeek,
  accomplishments: {
    commits: commits.length,
    commitDetails: commits.slice(0, 10),
    tasksCompleted: completedTasks.length,
    taskDetails: completedTasks,
    logSections
  },
  looseThreads: {
    inProgress: inProgressTasks,
    dirtyRepos,
    unpushedRepos,
    todosAdded
  },
  closure: {
    rate: closure.rate,
    finished: closure.finished,
    started: closure.started
  },
  tomorrow: tomorrow
};

if (flags.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (flags.short) {
  const status = closure.rate >= 80 ? '✓' : closure.rate >= 50 ? '~' : '○';
  const threads = inProgressTasks.length + dirtyRepos.length;
  console.log(`eod: ${status} ${closure.rate}% closure · ${commits.length} commits · ${completedTasks.length} done · ${threads} loose threads → ${tomorrow[0]?.task || 'rest'}`);
  process.exit(0);
}

// Full output
console.log();
console.log(`╭${'─'.repeat(58)}╮`);
console.log(`│  🌙 END OF DAY — ${today} (${dayOfWeek})${' '.repeat(Math.max(0, 24 - dayOfWeek.length))}│`);
console.log(`╰${'─'.repeat(58)}╯`);

// Accomplishments
console.log('\n📊 TODAY\'S WORK\n');

if (commits.length > 0) {
  const byRepo = {};
  for (const c of commits) {
    byRepo[c.repo] = (byRepo[c.repo] || 0) + 1;
  }
  const repoSummary = Object.entries(byRepo)
    .map(([repo, count]) => `${repo}(${count})`)
    .join(' ');
  
  console.log(`   commits: ${commits.length} — ${repoSummary}`);
  
  if (!flags.quick) {
    for (const c of commits.slice(0, 5)) {
      console.log(`            ${c.hash} ${c.message.substring(0, 45)}${c.message.length > 45 ? '...' : ''}`);
    }
    if (commits.length > 5) {
      console.log(`            ... and ${commits.length - 5} more`);
    }
  }
}

if (completedTasks.length > 0) {
  console.log(`   completed: ${completedTasks.length} tasks`);
  if (!flags.quick) {
    for (const t of completedTasks.slice(0, 5)) {
      console.log(`              ✓ ${t.substring(0, 50)}${t.length > 50 ? '...' : ''}`);
    }
  }
}

if (logSections.length > 0) {
  console.log(`   logged: ${logSections.slice(0, 4).join(', ')}${logSections.length > 4 ? '...' : ''}`);
}

if (commits.length === 0 && completedTasks.length === 0 && logSections.length === 0) {
  console.log('   (quiet day — no commits, tasks, or log entries)');
}

// Loose threads
if (!flags.quick) {
  const hasLooseThreads = inProgressTasks.length > 0 || dirtyRepos.length > 0 || 
                          unpushedRepos.length > 0 || todosAdded.length > 0;
  
  if (hasLooseThreads) {
    console.log('\n🔄 LOOSE THREADS\n');
    
    if (inProgressTasks.length > 0) {
      console.log(`   in-progress (${inProgressTasks.length}):`);
      for (const t of inProgressTasks.slice(0, 3)) {
        console.log(`      ~ ${t.task.substring(0, 50)}${t.task.length > 50 ? '...' : ''}`);
      }
    }
    
    if (dirtyRepos.length > 0) {
      const dirtyList = dirtyRepos.map(r => `${r.name}(${r.files})`).join(', ');
      console.log(`   uncommitted: ${dirtyList}`);
    }
    
    if (unpushedRepos.length > 0) {
      const unpushedList = unpushedRepos.map(r => `${r.name}(${r.commits})`).join(', ');
      console.log(`   unpushed: ${unpushedList}`);
    }
    
    if (todosAdded.length > 0) {
      console.log(`   new TODOs: ${todosAdded.length}`);
      for (const t of todosAdded.slice(0, 2)) {
        const snippet = t.line.substring(0, 45);
        console.log(`      ${t.repo}: ${snippet}...`);
      }
    }
  }
}

// Closure rate
console.log('\n📈 CLOSURE\n');
const closureBar = makeBar(closure.rate, 100, 20);
const closureIcon = closure.rate >= 80 ? '🎯' : closure.rate >= 50 ? '📊' : '⚠️';
console.log(`   ${closureIcon} ${closure.rate}% ${closureBar}  (${closure.finished}/${closure.started})`);

const closureVerdict = closure.rate >= 80 ? 'clean close — threads tied up' 
  : closure.rate >= 50 ? 'decent day — some threads carry over'
  : 'open-heavy — lots carrying forward';
console.log(`      ${closureVerdict}`);

// Tomorrow
console.log('\n🌅 TOMORROW\'S TOP 3\n');

if (tomorrow.length > 0) {
  for (let i = 0; i < tomorrow.length; i++) {
    const p = tomorrow[i];
    const num = i + 1;
    console.log(`   ${num}. ${p.task.substring(0, 50)}${p.task.length > 50 ? '...' : ''}`);
    console.log(`      └─ ${p.reason}`);
  }
} else {
  console.log('   (no priorities detected — enjoy the rest!)');
}

// Closing
console.log('\n' + '─'.repeat(60));
const closers = [
  'good work today. rest well.',
  'threads logged, context saved. see you tomorrow.',
  'day complete. context will persist.',
  'work captured. go recharge.',
  'tomorrow\'s priorities are ready. sleep well.',
  'closure logged. the work will wait.'
];
const closer = closers[Math.floor(Math.random() * closers.length)];
console.log(`\n${closer}\n`);

// Optional: append to daily log
if (flags.append && existsSync(todayLogPath)) {
  const summary = `
## eod summary

**closure:** ${closure.rate}% (${closure.finished}/${closure.started})
**commits:** ${commits.length}
**completed:** ${completedTasks.length}

### tomorrow
${tomorrow.map((p, i) => `${i + 1}. ${p.task}`).join('\n')}
`;
  
  appendFileSync(todayLogPath, '\n' + summary);
  console.log('📝 summary appended to daily log');
}

// Optional: post to Discord
if (flags.post) {
  try {
    const webhook = 'https://discord.com/api/webhooks/1464653051552993473/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj';
    
    const postSummary = [
      `**EOD ${today}**`,
      `📊 ${commits.length} commits · ${completedTasks.length} tasks · ${closure.rate}% closure`,
      '',
      '**Tomorrow:**',
      ...tomorrow.map((p, i) => `${i + 1}. ${p.task.substring(0, 50)}`)
    ].join('\n');
    
    execSync(`curl -s -X POST -H "Content-Type: application/json" -d '${JSON.stringify({ content: postSummary })}' "${webhook}"`, {
      encoding: 'utf8'
    });
    
    console.log('📤 posted to discord #logs');
  } catch (e) {
    console.log('⚠️  discord post failed');
  }
}

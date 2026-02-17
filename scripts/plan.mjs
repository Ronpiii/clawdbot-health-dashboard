#!/usr/bin/env node
/**
 * arc plan — daily action planner
 * 
 * Synthesizes tasks, git state, blockers, recent activity, and momentum
 * into a ranked "what to work on today" list. Not just a task list —
 * a prioritized plan with reasoning.
 * 
 * Usage:
 *   arc plan              # full plan
 *   arc plan --short      # top 3 one-liners
 *   arc plan --json       # machine-readable
 *   arc plan --week       # plan for the week (broader view)
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';

const ROOT = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');
const weekMode = args.includes('--week');

// ── helpers ──────────────────────────────────────────────────────────

function readFile(path) {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

function today() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function dayOfWeek() {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
}

// ── data collection ──────────────────────────────────────────────────

function getActiveTasks() {
  const content = readFile(join(ROOT, 'tasks/active.md'));
  if (!content) return [];

  const tasks = [];
  let currentSection = '';

  for (const line of content.split('\n')) {
    const sectionMatch = line.match(/^##\s+(.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase();
      continue;
    }

    const taskMatch = line.match(/^- \[([ x~])\]\s+(.+)/);
    if (taskMatch) {
      const done = taskMatch[1] === 'x';
      const inProgress = taskMatch[1] === '~';
      const text = taskMatch[2].trim();

      if (done) continue; // skip completed

      // parse task code if present (e.g., ERR-001)
      const codeMatch = text.match(/^([A-Z]+-\d+)\s*/);
      const code = codeMatch ? codeMatch[1] : null;
      const cleanText = code ? text.replace(codeMatch[0], '') : text;

      // extract project hint from em-dash pattern: "project — description"
      const projMatch = cleanText.match(/^(\w[\w\s]*?)\s*[—–-]\s+(.+)/);
      const project = projMatch ? projMatch[1].trim().toLowerCase() : null;
      const description = projMatch ? projMatch[2].trim() : cleanText;

      tasks.push({
        text: cleanText,
        description,
        project,
        code,
        section: currentSection,
        inProgress,
        blocked: currentSection.includes('block'),
        priority: sectionToScore(currentSection),
      });
    }
  }

  return tasks;
}

function sectionToScore(section) {
  if (section.includes('in progress')) return 90;
  if (section.includes('priority') && section.includes('business')) return 85;
  if (section.includes('priority') && section.includes('high')) return 80;
  if (section.includes('priority')) return 75;
  if (section.includes('next')) return 60;
  if (section.includes('backlog')) return 40;
  if (section.includes('block')) return 30; // blocked = deprioritized
  if (section.includes('idea')) return 20;
  return 50;
}

function getGitState() {
  const repos = [];
  
  function findGitRepos(dir, depth = 0) {
    if (depth > 3) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      const hasGit = entries.some(e => e.name === '.git' && e.isDirectory());
      if (hasGit) {
        repos.push(dir);
        // still recurse into subdirs — there may be nested repos (projects/)
      }
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
        if (e.isDirectory()) {
          findGitRepos(join(dir, e.name), depth + 1);
        }
      }
    } catch {}
  }

  findGitRepos(ROOT);

  return repos.map(repoPath => {
    const name = basename(repoPath) === 'clawd' ? 'clawd' : basename(repoPath);
    try {
      const status = execSync('git status --porcelain 2>/dev/null', { cwd: repoPath, encoding: 'utf-8' }).trim();
      const branch = execSync('git branch --show-current 2>/dev/null', { cwd: repoPath, encoding: 'utf-8' }).trim();
      const lastCommit = execSync('git log -1 --format="%s|%ar" 2>/dev/null', { cwd: repoPath, encoding: 'utf-8' }).trim();
      const unpushed = execSync('git rev-list @{upstream}..HEAD 2>/dev/null || true', { cwd: repoPath, encoding: 'utf-8' }).trim();
      
      const dirty = status.split('\n').filter(l => l.trim()).length;
      const [commitMsg, commitAge] = lastCommit.split('|');
      const unpushedCount = unpushed ? unpushed.split('\n').filter(l => l.trim()).length : 0;

      return {
        name,
        branch,
        dirty,
        unpushed: unpushedCount,
        lastCommit: commitMsg,
        lastCommitAge: commitAge,
        path: repoPath,
      };
    } catch {
      return { name, branch: '?', dirty: 0, unpushed: 0, lastCommit: '?', lastCommitAge: '?', path: repoPath };
    }
  });
}

function getRecentActivity() {
  const todayLog = readFile(join(ROOT, `memory/${today()}.md`));
  const yesterdayLog = readFile(join(ROOT, `memory/${yesterday()}.md`));

  // extract section headers as activity signals
  const sections = [];
  for (const [date, content] of [[today(), todayLog], [yesterday(), yesterdayLog]]) {
    if (!content) continue;
    for (const line of content.split('\n')) {
      const match = line.match(/^##\s+(.+)/);
      if (match) {
        sections.push({ date, topic: match[1].trim() });
      }
    }
  }

  return { todayLog, yesterdayLog, sections };
}

function getBlockers() {
  const content = readFile(join(ROOT, 'tasks/active.md'));
  const blockers = [];

  let inBlocked = false;
  for (const line of content.split('\n')) {
    if (line.match(/^##.*block/i)) { inBlocked = true; continue; }
    if (line.match(/^##/)) { inBlocked = false; continue; }

    if (inBlocked) {
      const match = line.match(/^- \[ \]\s+(.+)/);
      if (match) blockers.push(match[1].trim());
    }
  }

  // also scan MEMORY.md for blockers
  const memory = readFile(join(ROOT, 'MEMORY.md'));
  const memBlockers = memory.match(/\*\*blocker[s]?\*\*[:\s]*(.+)/gi) || [];
  for (const b of memBlockers) {
    const clean = b.replace(/\*\*blocker[s]?\*\*[:\s]*/i, '').trim();
    if (clean && !blockers.includes(clean)) blockers.push(clean);
  }

  return blockers;
}

function getIdeas() {
  const ideasPath = join(ROOT, 'tasks/ideas.md');
  if (!existsSync(ideasPath)) return [];

  const content = readFile(ideasPath);
  const ideas = [];

  for (const line of content.split('\n')) {
    const match = line.match(/^- \[ \]\s+(.+)/);
    if (match) {
      ideas.push(match[1].trim());
    }
  }

  return ideas.slice(0, 5); // top 5 most recent
}

function getStaleProjects() {
  // projects that haven't been touched in >7 days
  const stale = [];
  const gitRepos = getGitState();

  for (const repo of gitRepos) {
    if (repo.name === 'clawd') continue; // always active
    try {
      const lastDate = execSync(`git log -1 --format="%ai" 2>/dev/null`, { cwd: repo.path, encoding: 'utf-8' }).trim();
      const lastTs = new Date(lastDate).getTime();
      const daysSince = Math.floor((Date.now() - lastTs) / 86400000);
      if (daysSince > 7) {
        stale.push({ name: repo.name, daysSince, lastCommit: repo.lastCommit });
      }
    } catch {}
  }

  return stale;
}

// ── scoring engine ───────────────────────────────────────────────────

function scoreAction(action) {
  let score = action.baseScore || 50;

  // boost in-progress items (momentum)
  if (action.inProgress) score += 25;

  // boost items with recent activity (yesterday/today)
  if (action.recentlyActive) score += 15;

  // boost business-impact items
  if (action.tags?.includes('revenue')) score += 20;
  if (action.tags?.includes('client')) score += 15;
  if (action.tags?.includes('launch')) score += 10;

  // penalize blocked items
  if (action.blocked) score -= 40;

  // boost low-effort items (quick wins)
  if (action.effort === 'low') score += 10;

  // boost stale items slightly (they've been waiting)
  if (action.staleDays > 7) score += 5;
  if (action.staleDays > 14) score += 5;

  // day-of-week heuristics
  const dow = new Date().getDay();
  if (dow === 1 && action.tags?.includes('planning')) score += 10; // monday = planning
  if (dow === 5 && action.tags?.includes('cleanup')) score += 10; // friday = cleanup

  return Math.min(100, Math.max(0, score));
}

function tagAction(text) {
  const lower = text.toLowerCase();
  const tags = [];

  if (/revenue|mrr|sales|pipeline|client|lead|outreach/.test(lower)) tags.push('revenue');
  if (/client|customer|meeting|proposal/.test(lower)) tags.push('client');
  if (/launch|deploy|ship|release/.test(lower)) tags.push('launch');
  if (/plan|strategy|roadmap|review/.test(lower)) tags.push('planning');
  if (/clean|refactor|debt|fix|bug/.test(lower)) tags.push('cleanup');
  if (/doc|readme|write/.test(lower)) tags.push('docs');
  if (/test|spec|ci/.test(lower)) tags.push('testing');

  return tags;
}

function estimateEffort(text) {
  const lower = text.toLowerCase();
  if (/quick|simple|small|trivial|minor|update|tweak/.test(lower)) return 'low';
  if (/mvp|prototype|draft|prep|start/.test(lower)) return 'medium';
  if (/full|migrate|rewrite|major|complete|build/.test(lower)) return 'high';
  return 'medium';
}

// ── plan generation ──────────────────────────────────────────────────

function generatePlan() {
  const tasks = getActiveTasks();
  const gitState = getGitState();
  const activity = getRecentActivity();
  const blockers = getBlockers();
  const ideas = getIdeas();
  const stale = getStaleProjects();

  // build action candidates
  const actions = [];

  // 1. tasks from active.md
  for (const task of tasks) {
    if (task.blocked) continue; // skip blocked, will show separately

    const tags = tagAction(task.text);
    const effort = estimateEffort(task.text);
    const recentlyActive = activity.sections.some(s =>
      task.project && s.topic.toLowerCase().includes(task.project)
    );

    actions.push({
      source: 'task',
      text: task.text,
      description: task.description,
      project: task.project,
      baseScore: task.priority,
      inProgress: task.inProgress,
      blocked: false,
      tags,
      effort,
      recentlyActive,
      staleDays: 0,
      reason: buildReason(task, recentlyActive, tags, effort),
    });
  }

  // 2. dirty git repos = unfinished work
  for (const repo of gitState) {
    if (repo.dirty > 0 && repo.name !== 'clawd') {
      // check if there's already a task for this project
      const existingTask = actions.find(a => a.project === repo.name);
      // check if this project is blocked
      const isBlocked = blockers.some(b => b.toLowerCase().includes(repo.name));
      if (!existingTask && !isBlocked) {
        actions.push({
          source: 'git',
          text: `${repo.name} — ${repo.dirty} uncommitted change${repo.dirty > 1 ? 's' : ''} on ${repo.branch}`,
          description: `uncommitted work in ${repo.name}`,
          project: repo.name,
          baseScore: 40, // lower than real tasks — git hygiene is secondary
          inProgress: false,
          blocked: false,
          tags: ['cleanup'],
          effort: 'low',
          recentlyActive: false,
          staleDays: 0,
          reason: 'dirty working tree — commit or stash',
        });
      }
    }

    if (repo.unpushed > 0) {
      const isBlocked = blockers.some(b => b.toLowerCase().includes(repo.name));
      if (isBlocked) continue;
      actions.push({
        source: 'git',
        text: `${repo.name} — ${repo.unpushed} unpushed commit${repo.unpushed > 1 ? 's' : ''}`,
        description: `unpushed work in ${repo.name}`,
        project: repo.name,
        baseScore: 45,
        inProgress: false,
        blocked: false,
        tags: ['cleanup'],
        effort: 'low',
        recentlyActive: false,
        staleDays: 0,
        reason: 'local commits not pushed — risk of work loss',
      });
    }
  }

  // 3. stale projects = things that might need attention
  for (const proj of stale) {
    const existingTask = actions.find(a => a.project === proj.name);
    if (!existingTask) {
      actions.push({
        source: 'stale',
        text: `${proj.name} — inactive for ${proj.daysSince} days`,
        description: `no commits in ${proj.daysSince} days`,
        project: proj.name,
        baseScore: 30,
        inProgress: false,
        blocked: false,
        tags: ['planning'],
        effort: 'low',
        recentlyActive: false,
        staleDays: proj.daysSince,
        reason: `${proj.daysSince}d inactive — needs decision: continue, park, or archive`,
      });
    }
  }

  // score and sort
  for (const action of actions) {
    action.score = scoreAction(action);
  }

  actions.sort((a, b) => b.score - a.score);

  return {
    actions,
    blockers,
    ideas,
    gitState,
    stale,
    activity,
    meta: {
      date: today(),
      day: dayOfWeek(),
      totalTasks: tasks.length,
      blockedCount: blockers.length,
      dirtyRepos: gitState.filter(r => r.dirty > 0).length,
      staleProjects: stale.length,
    },
  };
}

function buildReason(task, recentlyActive, tags, effort) {
  const parts = [];

  if (task.inProgress) parts.push('already in progress');
  if (recentlyActive) parts.push('recent momentum');
  if (tags.includes('revenue')) parts.push('revenue impact');
  if (tags.includes('client')) parts.push('client-facing');
  if (effort === 'low') parts.push('quick win');
  if (task.section.includes('priority')) parts.push('high priority');

  return parts.join(', ') || 'in backlog';
}

// ── display ──────────────────────────────────────────────────────────

function effortIcon(effort) {
  if (effort === 'low') return '⚡';
  if (effort === 'medium') return '🔧';
  if (effort === 'high') return '🏗️';
  return '?';
}

function scoreBar(score) {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function displayPlan(plan) {
  if (jsonMode) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const { actions, blockers, ideas, meta } = plan;
  const topActions = actions.slice(0, weekMode ? 8 : 5);

  if (shortMode) {
    console.log(`\n  ${meta.day} ${meta.date} — top ${Math.min(3, topActions.length)} actions:\n`);
    for (let i = 0; i < Math.min(3, topActions.length); i++) {
      const a = topActions[i];
      console.log(`  ${i + 1}. ${a.text}`);
    }
    console.log('');
    return;
  }

  // header
  const w = 62;
  console.log('');
  console.log('  ┌' + '─'.repeat(w) + '┐');
  console.log('  │' + `  DAILY PLAN — ${meta.day} ${meta.date}`.padEnd(w) + '│');
  console.log('  │' + `  ${meta.totalTasks} tasks · ${meta.blockedCount} blocked · ${meta.dirtyRepos} dirty repos`.padEnd(w) + '│');
  console.log('  ├' + '─'.repeat(w) + '┤');

  // top actions
  console.log('  │' + ''.padEnd(w) + '│');
  console.log('  │' + '  RECOMMENDED ACTIONS (ranked by priority)'.padEnd(w) + '│');
  console.log('  │' + ''.padEnd(w) + '│');

  for (let i = 0; i < topActions.length; i++) {
    const a = topActions[i];
    const num = `  ${i + 1}.`;
    const icon = effortIcon(a.effort);
    const bar = scoreBar(a.score);

    // main line
    const mainLine = `${num} ${icon} ${truncate(a.text, w - 8)}`;
    console.log('  │' + mainLine.padEnd(w) + '│');

    // score + reason line
    const detail = `     ${bar} ${a.score}  ${a.reason}`;
    console.log('  │' + truncate(detail, w).padEnd(w) + '│');

    if (i < topActions.length - 1) {
      console.log('  │' + ''.padEnd(w) + '│');
    }
  }

  // blockers section
  if (blockers.length > 0) {
    console.log('  │' + ''.padEnd(w) + '│');
    console.log('  ├' + '─'.repeat(w) + '┤');
    console.log('  │' + ''.padEnd(w) + '│');
    console.log('  │' + '  BLOCKED (needs external input)'.padEnd(w) + '│');
    console.log('  │' + ''.padEnd(w) + '│');
    for (const b of blockers.slice(0, 4)) {
      console.log('  │' + `  ⊘ ${truncate(b, w - 6)}`.padEnd(w) + '│');
    }
  }

  // ideas to consider (if it's planning day)
  const dow = new Date().getDay();
  if (ideas.length > 0 && (dow === 1 || weekMode)) {
    console.log('  │' + ''.padEnd(w) + '│');
    console.log('  ├' + '─'.repeat(w) + '┤');
    console.log('  │' + ''.padEnd(w) + '│');
    console.log('  │' + '  IDEAS TO CONSIDER'.padEnd(w) + '│');
    console.log('  │' + ''.padEnd(w) + '│');
    for (const idea of ideas.slice(0, 3)) {
      console.log('  │' + `  ◇ ${truncate(idea, w - 6)}`.padEnd(w) + '│');
    }
  }

  // stale projects warning
  if (plan.stale.length > 0) {
    console.log('  │' + ''.padEnd(w) + '│');
    console.log('  ├' + '─'.repeat(w) + '┤');
    console.log('  │' + ''.padEnd(w) + '│');
    console.log('  │' + '  GOING COLD'.padEnd(w) + '│');
    console.log('  │' + ''.padEnd(w) + '│');
    for (const s of plan.stale.slice(0, 3)) {
      console.log('  │' + `  ◌ ${s.name} — ${s.daysSince}d idle`.padEnd(w) + '│');
    }
  }

  // footer
  console.log('  │' + ''.padEnd(w) + '│');
  console.log('  └' + '─'.repeat(w) + '┘');

  // daily advice
  const advice = getDayAdvice(dow, meta);
  if (advice) {
    console.log(`\n  ${advice}`);
  }
  console.log('');
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function getDayAdvice(dow, meta) {
  if (dow === 1) return 'monday — good day for planning and unblocking';
  if (dow === 2) return 'tuesday — deep work day, minimize meetings';
  if (dow === 3) return 'wednesday — midweek, push through the hardest thing';
  if (dow === 4) return 'thursday — start wrapping up the week\'s goals';
  if (dow === 5) return 'friday — clean up, push, prep for next week';
  if (dow === 6) return 'saturday — if you\'re here, keep it light';
  if (dow === 0) return 'sunday — recharge or explore, no pressure';
  return null;
}

// ── main ─────────────────────────────────────────────────────────────

const plan = generatePlan();
displayPlan(plan);

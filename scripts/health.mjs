#!/usr/bin/env node
/**
 * arc health - unified workspace health dashboard
 * 
 * Combines: memory coverage, git hygiene, task velocity, project activity
 * One command to see if you're keeping up with your own systems.
 * 
 * Usage:
 *   arc health          - full dashboard
 *   arc health --short  - one-line summary
 *   arc health --json   - machine-readable
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

const WORKSPACE = process.cwd();

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

async function getMemoryHealth() {
  const memoryDir = join(WORKSPACE, 'memory');
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  try {
    const files = await readdir(memoryDir);
    const dailyLogs = files.filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
    
    // days logged this month
    const thisMonthLogs = dailyLogs.filter(f => f.startsWith(currentMonth));
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const expectedDays = dayOfMonth; // can only log up to today
    const coverage = thisMonthLogs.length / expectedDays;
    
    // streak: consecutive days logged
    let streak = 0;
    const today = now.toISOString().split('T')[0];
    let checkDate = new Date(now);
    
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (dailyLogs.includes(`${dateStr}.md`)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    // total memory size
    let totalSize = 0;
    for (const file of dailyLogs) {
      const s = await stat(join(memoryDir, file));
      totalSize += s.size;
    }
    
    // last log date
    const sortedLogs = dailyLogs.sort().reverse();
    const lastLog = sortedLogs[0]?.replace('.md', '') || 'never';
    
    return {
      daysThisMonth: thisMonthLogs.length,
      expectedDays,
      coverage: Math.round(coverage * 100),
      streak,
      totalLogs: dailyLogs.length,
      totalSize: Math.round(totalSize / 1024), // KB
      lastLog,
      score: Math.min(100, Math.round(coverage * 80 + Math.min(streak, 7) / 7 * 20))
    };
  } catch {
    return { daysThisMonth: 0, expectedDays: 0, coverage: 0, streak: 0, totalLogs: 0, totalSize: 0, lastLog: 'never', score: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GIT HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

async function getGitHealth() {
  const repos = [];
  
  // find git repos up to 3 levels deep
  async function findRepos(dir, depth = 0) {
    if (depth > 3) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') && entry.name !== '.git') continue;
        if (entry.name === 'node_modules') continue;
        
        const fullPath = join(dir, entry.name);
        if (entry.name === '.git') {
          repos.push(dir);
        } else {
          await findRepos(fullPath, depth + 1);
        }
      }
    } catch {}
  }
  
  await findRepos(WORKSPACE);
  
  let dirtyCount = 0;
  let unpushedCount = 0;
  let staleCount = 0;
  const repoStatus = [];
  
  for (const repo of repos) {
    try {
      const name = repo.split('/').pop();
      
      // check for uncommitted changes
      const status = execSync('git status --porcelain', { cwd: repo, encoding: 'utf-8' });
      const isDirty = status.trim().length > 0;
      if (isDirty) dirtyCount++;
      
      // check for unpushed commits
      let unpushed = 0;
      try {
        const ahead = execSync('git rev-list --count @{u}..HEAD 2>/dev/null || echo 0', { cwd: repo, encoding: 'utf-8' });
        unpushed = parseInt(ahead.trim()) || 0;
        if (unpushed > 0) unpushedCount++;
      } catch {}
      
      // last commit age
      let lastCommitDays = 999;
      try {
        const lastCommit = execSync('git log -1 --format=%ct 2>/dev/null', { cwd: repo, encoding: 'utf-8' });
        const timestamp = parseInt(lastCommit.trim());
        lastCommitDays = Math.floor((Date.now() / 1000 - timestamp) / 86400);
        if (lastCommitDays > 14) staleCount++;
      } catch {}
      
      repoStatus.push({ name, isDirty, unpushed, lastCommitDays });
    } catch {}
  }
  
  // score: penalize dirty repos, unpushed commits, stale repos
  const totalRepos = repos.length || 1;
  const cleanRatio = (totalRepos - dirtyCount) / totalRepos;
  const pushedRatio = (totalRepos - unpushedCount) / totalRepos;
  const freshRatio = (totalRepos - staleCount) / totalRepos;
  const score = Math.round(cleanRatio * 40 + pushedRatio * 40 + freshRatio * 20);
  
  return {
    totalRepos: repos.length,
    dirtyCount,
    unpushedCount,
    staleCount,
    repos: repoStatus,
    score
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TASK HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

async function getTaskHealth() {
  const tasksFile = join(WORKSPACE, 'tasks', 'active.md');
  
  try {
    const content = await readFile(tasksFile, 'utf-8');
    const lines = content.split('\n');
    
    let open = 0;
    let done = 0;
    let blocked = 0;
    
    for (const line of lines) {
      if (/^\s*-\s*\[\s*\]/.test(line)) open++;
      if (/^\s*-\s*\[x\]/i.test(line)) done++;
      if (/blocked|waiting|stuck/i.test(line)) blocked++;
    }
    
    const total = open + done;
    const velocity = total > 0 ? Math.round((done / total) * 100) : 0;
    
    // score based on completion ratio and low blocked count
    const blockedPenalty = Math.min(blocked * 10, 30);
    const score = Math.max(0, Math.round(velocity - blockedPenalty));
    
    return { open, done, blocked, velocity, score };
  } catch {
    return { open: 0, done: 0, blocked: 0, velocity: 0, score: 50 }; // neutral if no tasks file
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT ACTIVITY
// ═══════════════════════════════════════════════════════════════════════════════

async function getProjectActivity() {
  const projectsDir = join(WORKSPACE, 'projects');
  const projects = [];
  
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const projectPath = join(projectsDir, entry.name);
      
      // find most recent file modification
      let lastModified = 0;
      
      async function scanDir(dir) {
        try {
          const files = await readdir(dir, { withFileTypes: true });
          for (const file of files) {
            if (file.name.startsWith('.') || file.name === 'node_modules') continue;
            const fullPath = join(dir, file.name);
            if (file.isDirectory()) {
              await scanDir(fullPath);
            } else {
              const s = await stat(fullPath);
              if (s.mtimeMs > lastModified) lastModified = s.mtimeMs;
            }
          }
        } catch {}
      }
      
      await scanDir(projectPath);
      
      const daysAgo = Math.floor((Date.now() - lastModified) / (1000 * 60 * 60 * 24));
      projects.push({ name: entry.name, lastModified, daysAgo });
    }
    
    projects.sort((a, b) => b.lastModified - a.lastModified);
    
    const active = projects.filter(p => p.daysAgo <= 7).length;
    const stale = projects.filter(p => p.daysAgo > 30).length;
    const total = projects.length || 1;
    
    const score = Math.round((active / total) * 70 + ((total - stale) / total) * 30);
    
    return { projects, active, stale, total: projects.length, score };
  } catch {
    return { projects: [], active: 0, stale: 0, total: 0, score: 50 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERALL HEALTH SCORE
// ═══════════════════════════════════════════════════════════════════════════════

function calculateOverallHealth(memory, git, tasks, projects) {
  // weighted average
  const weights = { memory: 0.25, git: 0.35, tasks: 0.25, projects: 0.15 };
  
  const overall = Math.round(
    memory.score * weights.memory +
    git.score * weights.git +
    tasks.score * weights.tasks +
    projects.score * weights.projects
  );
  
  return overall;
}

function getHealthEmoji(score) {
  if (score >= 90) return '💚';
  if (score >= 70) return '💛';
  if (score >= 50) return '🟠';
  return '🔴';
}

function getHealthLabel(score) {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'needs attention';
}

function progressBar(value, max = 100, width = 20) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const isShort = args.includes('--short') || args.includes('-s');
  const isJson = args.includes('--json') || args.includes('-j');
  
  const [memory, git, tasks, projects] = await Promise.all([
    getMemoryHealth(),
    getGitHealth(),
    getTaskHealth(),
    getProjectActivity()
  ]);
  
  const overall = calculateOverallHealth(memory, git, tasks, projects);
  
  if (isJson) {
    console.log(JSON.stringify({ overall, memory, git, tasks, projects }, null, 2));
    return;
  }
  
  if (isShort) {
    const emoji = getHealthEmoji(overall);
    const label = getHealthLabel(overall);
    console.log(`${emoji} workspace health: ${overall}/100 (${label}) | memory: ${memory.score} | git: ${git.score} | tasks: ${tasks.score} | projects: ${projects.score}`);
    return;
  }
  
  // full dashboard
  const emoji = getHealthEmoji(overall);
  const label = getHealthLabel(overall);
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    WORKSPACE HEALTH                          ║
╠══════════════════════════════════════════════════════════════╣
║  ${emoji} Overall: ${String(overall).padStart(3)}/100 (${label.padEnd(15)})                      ║
║     ${progressBar(overall)}                           ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Memory section
  console.log(`📝 MEMORY                                         score: ${memory.score}/100`);
  console.log(`   ${progressBar(memory.score)}`);
  console.log(`   days logged this month: ${memory.daysThisMonth}/${memory.expectedDays} (${memory.coverage}% coverage)`);
  console.log(`   current streak: ${memory.streak} days`);
  console.log(`   total logs: ${memory.totalLogs} files (${memory.totalSize} KB)`);
  console.log(`   last log: ${memory.lastLog}`);
  console.log();

  // Git section
  console.log(`🔧 GIT                                            score: ${git.score}/100`);
  console.log(`   ${progressBar(git.score)}`);
  console.log(`   repositories: ${git.totalRepos}`);
  console.log(`   dirty (uncommitted): ${git.dirtyCount}`);
  console.log(`   unpushed commits: ${git.unpushedCount}`);
  console.log(`   stale (>14 days): ${git.staleCount}`);
  
  if (git.dirtyCount > 0 || git.unpushedCount > 0) {
    console.log();
    console.log('   action items:');
    for (const repo of git.repos) {
      if (repo.isDirty) console.log(`     • ${repo.name}: uncommitted changes`);
      if (repo.unpushed > 0) console.log(`     • ${repo.name}: ${repo.unpushed} unpushed commit(s)`);
    }
  }
  console.log();

  // Tasks section
  console.log(`✅ TASKS                                          score: ${tasks.score}/100`);
  console.log(`   ${progressBar(tasks.score)}`);
  console.log(`   open: ${tasks.open} | done: ${tasks.done} | blocked: ${tasks.blocked}`);
  console.log(`   velocity: ${tasks.velocity}% complete`);
  console.log();

  // Projects section
  console.log(`📁 PROJECTS                                       score: ${projects.score}/100`);
  console.log(`   ${progressBar(projects.score)}`);
  console.log(`   total: ${projects.total} | active (≤7d): ${projects.active} | stale (>30d): ${projects.stale}`);
  console.log();
  
  if (projects.projects.length > 0) {
    console.log('   recent activity:');
    const top5 = projects.projects.slice(0, 5);
    for (const p of top5) {
      const indicator = p.daysAgo <= 7 ? '●' : p.daysAgo <= 30 ? '○' : '·';
      const age = p.daysAgo === 0 ? 'today' : p.daysAgo === 1 ? 'yesterday' : `${p.daysAgo}d ago`;
      console.log(`     ${indicator} ${p.name.padEnd(20)} ${age}`);
    }
    console.log();
  }

  // recommendations
  const recommendations = [];
  
  if (memory.coverage < 50) recommendations.push('log more days — memory coverage is low');
  if (memory.streak === 0) recommendations.push('start a logging streak — no entry for today');
  if (git.dirtyCount > 2) recommendations.push('commit your changes — multiple dirty repos');
  if (git.unpushedCount > 0) recommendations.push('push your commits — work is at risk locally');
  if (tasks.blocked > 3) recommendations.push('unblock tasks — too many items stuck');
  if (tasks.velocity < 30) recommendations.push('close some tasks — low completion rate');
  if (projects.stale > projects.active) recommendations.push('revisit stale projects or archive them');
  
  if (recommendations.length > 0) {
    console.log('💡 RECOMMENDATIONS');
    for (const rec of recommendations) {
      console.log(`   → ${rec}`);
    }
    console.log();
  }
  
  // motivational closer
  const closers = [
    'small systems compound.',
    'healthy workspace, healthy mind.',
    'consistency beats intensity.',
    'your future self will thank you.',
    'keep the machine running smooth.'
  ];
  console.log(`   ${closers[Math.floor(Math.random() * closers.length)]}`);
}

main().catch(console.error);

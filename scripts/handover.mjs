#!/usr/bin/env node
/**
 * arc handover — auto-generate session handover context
 * 
 * Addresses the handover protocol from AGENTS.md:
 * - What was discussed
 * - What was decided
 * - Pending tasks with exact details
 * - Current state of any in-progress work
 * - Next steps remaining
 * 
 * Usage:
 *   arc handover              - generate handover for today
 *   arc handover --hours N    - last N hours of activity
 *   arc handover --append     - append to today's daily log
 *   arc handover --json       - machine-readable output
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');
const TASKS_FILE = join(ROOT, 'tasks', 'active.md');

// --- Colors ---
const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

// --- Parse Args ---
const args = process.argv.slice(2);
const flags = {
  hours: 8,
  append: args.includes('--append'),
  json: args.includes('--json'),
  help: args.includes('--help') || args.includes('-h')
};

const hoursIdx = args.indexOf('--hours');
if (hoursIdx !== -1 && args[hoursIdx + 1]) {
  flags.hours = parseInt(args[hoursIdx + 1], 10) || 8;
}

if (flags.help) {
  console.log(`
${c.bold}arc handover${c.reset} — auto-generate session handover context

${c.cyan}USAGE${c.reset}
  arc handover              generate handover for today
  arc handover --hours N    last N hours of activity (default: 8)
  arc handover --append     append to today's daily log
  arc handover --json       machine-readable output

${c.cyan}OUTPUTS${c.reset}
  • recent commits with file categories
  • files touched (by category)
  • decisions extracted from today's log
  • open/in-progress tasks
  • next steps derived from context

${c.cyan}WORKFLOW${c.reset}
  run before long breaks or model switches
  review the draft, add context, paste to daily log
`);
  process.exit(0);
}

// --- Helpers ---
function getToday() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function getTodayLog() {
  const path = join(MEMORY_DIR, `${getToday()}.md`);
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function getRecentCommits(hours) {
  const since = `${hours} hours ago`;
  try {
    // scan all repos
    const repos = findGitRepos();
    const commits = [];
    
    for (const repo of repos) {
      try {
        const raw = execSync(
          `git log --since="${since}" --pretty=format:"%h|%s|%ar|%an" --name-only 2>/dev/null`,
          { cwd: repo, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        ).trim();
        
        if (!raw) continue;
        
        const repoName = repo.split('/').pop();
        const parts = raw.split('\n\n');
        
        for (const part of parts) {
          const lines = part.trim().split('\n');
          if (!lines[0]) continue;
          
          const [hash, message, age, author] = lines[0].split('|');
          const files = lines.slice(1).filter(f => f.trim());
          
          commits.push({
            repo: repoName,
            hash,
            message,
            age,
            author,
            files
          });
        }
      } catch (e) {
        // skip repos with no recent commits
      }
    }
    
    return commits;
  } catch (e) {
    return [];
  }
}

function findGitRepos() {
  const repos = [];
  
  // root
  if (existsSync(join(ROOT, '.git'))) {
    repos.push(ROOT);
  }
  
  // projects/
  const projectsDir = join(ROOT, 'projects');
  if (existsSync(projectsDir)) {
    for (const name of readdirSync(projectsDir)) {
      const path = join(projectsDir, name);
      if (existsSync(join(path, '.git'))) {
        repos.push(path);
      }
    }
  }
  
  return repos;
}

function categorizeFile(file) {
  if (file.match(/\.(test|spec)\.[jt]sx?$/)) return 'test';
  if (file.match(/\.md$/)) return 'docs';
  if (file.match(/\.(css|scss|less)$/)) return 'styles';
  if (file.match(/\.(json|ya?ml|toml|env)$/)) return 'config';
  if (file.match(/^scripts?\//)) return 'scripts';
  if (file.match(/migrations?\//)) return 'database';
  if (file.match(/components?\//)) return 'component';
  if (file.match(/^(src|app|lib)\//)) return 'source';
  return 'other';
}

function extractDecisions(log) {
  const decisions = [];
  const lines = log.split('\n');
  
  // patterns that indicate decisions
  const patterns = [
    /(?:decided|decision|chose|going with|picked|verdict|conclusion)[:—]\s*(.+)/i,
    /\*\*([^*]+)\*\*\s*[-—]\s*(.+)/,  // **Thing** — explanation
    /^-\s*✓\s*(.+)/,  // - ✓ decided item
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const text = match[2] || match[1];
        if (text && text.length > 10 && text.length < 200) {
          decisions.push(text.trim());
        }
        break;
      }
    }
    
    // also check for "Key Decisions" section
    if (line.match(/^##\s*Key Decisions/i)) {
      // grab bullets until next section
      for (let j = i + 1; j < lines.length && j < i + 20; j++) {
        if (lines[j].match(/^##/)) break;
        const bullet = lines[j].match(/^[-*]\s*\*\*([^*]+)\*\*\s*[-—]\s*(.+)/);
        if (bullet) {
          decisions.push(`${bullet[1]}: ${bullet[2]}`);
        }
      }
    }
  }
  
  return [...new Set(decisions)];
}

function extractInProgress(log) {
  const items = [];
  const lines = log.split('\n');
  
  // look for WIP, in progress, working on
  for (const line of lines) {
    if (line.match(/\b(WIP|in progress|working on|started)\b/i)) {
      const clean = line.replace(/^[-*#\s]+/, '').trim();
      if (clean.length > 5 && clean.length < 150) {
        items.push(clean);
      }
    }
  }
  
  return [...new Set(items)].slice(0, 5);
}

function getOpenTasks() {
  if (!existsSync(TASKS_FILE)) return [];
  
  const content = readFileSync(TASKS_FILE, 'utf-8');
  const tasks = [];
  const lines = content.split('\n');
  
  let currentSection = '';
  let isActiveSection = false;
  
  for (const line of lines) {
    // track sections
    if (line.match(/^##\s+/)) {
      currentSection = line.replace(/^##\s+/, '').trim();
      isActiveSection = currentSection.match(/in.?progress|active|current|next/i);
    }
    
    // unchecked items in active sections
    if (isActiveSection && line.match(/^-\s*\[\s*\]/)) {
      const task = line.replace(/^-\s*\[\s*\]\s*/, '').trim();
      if (task) {
        tasks.push({ task, section: currentSection });
      }
    }
  }
  
  return tasks.slice(0, 10);
}

function deriveNextSteps(commits, decisions, tasks, inProgress) {
  const steps = [];
  
  // from in-progress items
  for (const item of inProgress.slice(0, 2)) {
    steps.push(`Continue: ${item.substring(0, 80)}`);
  }
  
  // from open tasks
  for (const t of tasks.slice(0, 2)) {
    steps.push(`Task: ${t.task.substring(0, 80)}`);
  }
  
  // from recent commit patterns
  const recentFiles = commits.flatMap(c => c.files);
  const categories = {};
  for (const f of recentFiles) {
    const cat = categorizeFile(f);
    categories[cat] = (categories[cat] || 0) + 1;
  }
  
  // suggest based on what was being worked on
  const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  if (topCat && topCat[1] >= 3) {
    steps.push(`Review: ${topCat[0]} changes from this session`);
  }
  
  return steps.slice(0, 5);
}

// --- Main ---
async function main() {
  const todayLog = getTodayLog();
  const commits = getRecentCommits(flags.hours);
  const decisions = extractDecisions(todayLog);
  const inProgress = extractInProgress(todayLog);
  const tasks = getOpenTasks();
  const nextSteps = deriveNextSteps(commits, decisions, tasks, inProgress);
  
  // aggregate files by category
  const filesByCategory = {};
  for (const commit of commits) {
    for (const file of commit.files) {
      const cat = categorizeFile(file);
      if (!filesByCategory[cat]) filesByCategory[cat] = new Set();
      filesByCategory[cat].add(`${commit.repo}/${file}`);
    }
  }
  
  // build the handover document
  const data = {
    generated: new Date().toISOString(),
    hours: flags.hours,
    commits: commits.length,
    sections: {
      discussed: commits.map(c => `${c.repo}: ${c.message}`).slice(0, 10),
      decided: decisions,
      files: Object.fromEntries(
        Object.entries(filesByCategory).map(([k, v]) => [k, [...v].slice(0, 10)])
      ),
      inProgress,
      tasks: tasks.map(t => t.task),
      nextSteps
    }
  };
  
  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  
  // format as markdown
  const md = formatMarkdown(data);
  
  if (flags.append) {
    const logPath = join(MEMORY_DIR, `${getToday()}.md`);
    appendFileSync(logPath, '\n\n' + md);
    console.log(`${c.green}✓${c.reset} Appended handover to ${logPath}`);
  } else {
    console.log(md);
    console.log(`${c.dim}---${c.reset}`);
    console.log(`${c.dim}Use --append to add this to today's daily log${c.reset}`);
  }
}

function formatMarkdown(data) {
  const lines = [];
  
  lines.push(`## HANDOVER — ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`);
  lines.push('');
  
  // what was discussed (commits)
  if (data.sections.discussed.length > 0) {
    lines.push('### What Was Discussed');
    for (const item of data.sections.discussed) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  
  // decisions
  if (data.sections.decided.length > 0) {
    lines.push('### What Was Decided');
    for (const d of data.sections.decided) {
      lines.push(`- ${d}`);
    }
    lines.push('');
  }
  
  // files touched
  const fileCats = Object.entries(data.sections.files);
  if (fileCats.length > 0) {
    lines.push('### Files Touched');
    for (const [cat, files] of fileCats) {
      lines.push(`**${cat}:** ${files.length} files`);
    }
    lines.push('');
  }
  
  // in progress
  if (data.sections.inProgress.length > 0) {
    lines.push('### In Progress');
    for (const item of data.sections.inProgress) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  
  // pending tasks
  if (data.sections.tasks.length > 0) {
    lines.push('### Pending Tasks');
    for (const t of data.sections.tasks) {
      lines.push(`- [ ] ${t}`);
    }
    lines.push('');
  }
  
  // next steps
  if (data.sections.nextSteps.length > 0) {
    lines.push('### Next Steps');
    for (const step of data.sections.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

main().catch(e => {
  console.error(`${c.yellow}error:${c.reset}`, e.message);
  process.exit(1);
});

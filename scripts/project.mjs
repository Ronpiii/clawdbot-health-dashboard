#!/usr/bin/env node

/**
 * arc project — Quick project context loading
 * 
 * Usage:
 *   arc project list          Show all projects
 *   arc project <name>        Show context for project
 *   arc project <name> open   Open project README
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROJECTS_DIR = join(ROOT, 'projects');

// Get all project directories
function getProjects() {
  if (!existsSync(PROJECTS_DIR)) return [];
  return readdirSync(PROJECTS_DIR)
    .filter(f => statSync(join(PROJECTS_DIR, f)).isDirectory())
    .map(name => {
      const dir = join(PROJECTS_DIR, name);
      const readme = existsSync(join(dir, 'README.md'));
      const tasks = existsSync(join(dir, 'TASKS.md'));
      return { name, dir, readme, tasks };
    });
}

// Get project summary from README
function getProjectSummary(dir) {
  const readmePath = join(dir, 'README.md');
  if (!existsSync(readmePath)) return null;
  
  const content = readFileSync(readmePath, 'utf8');
  const lines = content.split('\n');
  
  // Get title and first paragraph
  const title = lines.find(l => l.startsWith('# '))?.replace(/^# /, '') || basename(dir);
  const descStart = lines.findIndex(l => l && !l.startsWith('#'));
  let description = '';
  if (descStart !== -1) {
    for (let i = descStart; i < lines.length && i < descStart + 5; i++) {
      if (!lines[i]) break;
      description += lines[i] + ' ';
    }
  }
  
  return { title, description: description.trim().slice(0, 200) };
}

// Get recent activity for project
function getRecentActivity(dir) {
  try {
    const files = execSync(
      `find . -type f -name "*.md" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.mjs" | xargs ls -lt 2>/dev/null | head -5`,
      { cwd: dir, encoding: 'utf8' }
    ).trim();
    return files.split('\n').filter(l => l).map(l => {
      const parts = l.split(/\s+/);
      return parts[parts.length - 1];
    });
  } catch (e) {
    return [];
  }
}

// Get git commits for project
function getRecentCommits(dir) {
  try {
    const commits = execSync(
      `git log --oneline -5 -- "${dir}" 2>/dev/null`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    return commits ? commits.split('\n') : [];
  } catch (e) {
    return [];
  }
}

// Show project details
function showProject(name) {
  const projects = getProjects();
  const project = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  
  if (!project) {
    // Fuzzy match
    const matches = projects.filter(p => 
      p.name.toLowerCase().includes(name.toLowerCase())
    );
    if (matches.length === 1) {
      return showProject(matches[0].name);
    }
    console.log(`\n❌ Project not found: ${name}`);
    console.log('Available projects:', projects.map(p => p.name).join(', '));
    return;
  }
  
  const summary = getProjectSummary(project.dir);
  const recentFiles = getRecentActivity(project.dir);
  const commits = getRecentCommits(project.dir);
  
  console.log(`\n📁 ${summary?.title || project.name}`);
  console.log('─'.repeat(50));
  
  if (summary?.description) {
    console.log(`\n${summary.description}${summary.description.length >= 200 ? '...' : ''}`);
  }
  
  console.log(`\n📍 Location: ${project.dir.replace(ROOT, '.')}`);
  
  // Key files
  console.log('\n📄 Key files:');
  if (project.readme) console.log('   • README.md');
  if (project.tasks) console.log('   • TASKS.md');
  
  const docsDir = join(project.dir, 'docs');
  if (existsSync(docsDir)) {
    const docs = readdirSync(docsDir).filter(f => f.endsWith('.md')).slice(0, 3);
    docs.forEach(d => console.log(`   • docs/${d}`));
  }
  
  // Recent commits
  if (commits.length > 0) {
    console.log('\n🔨 Recent commits:');
    commits.slice(0, 3).forEach(c => console.log(`   ${c}`));
  }
  
  // Check MEMORY.md for project info
  const memoryPath = join(ROOT, 'MEMORY.md');
  if (existsSync(memoryPath)) {
    const memory = readFileSync(memoryPath, 'utf8');
    const projectSection = memory.match(new RegExp(`### ${name}[\\s\\S]*?(?=###|$)`, 'i'));
    if (projectSection) {
      const status = projectSection[0].match(/status:\*\* (.+)/i)?.[1];
      if (status) console.log(`\n📊 Status: ${status}`);
    }
  }
  
  console.log();
}

// List all projects
function listProjects() {
  const projects = getProjects();
  
  if (projects.length === 0) {
    console.log('\nNo projects found in projects/');
    return;
  }
  
  console.log('\n📁 Projects\n');
  
  for (const project of projects) {
    const summary = getProjectSummary(project.dir);
    const title = summary?.title || project.name;
    const desc = summary?.description?.slice(0, 60) || '';
    
    console.log(`  ${project.name.padEnd(20)} ${desc}${desc.length >= 60 ? '...' : ''}`);
  }
  
  console.log('\nUse: arc project <name> for details');
  console.log();
}

// CLI
const [,, cmd, ...args] = process.argv;

if (!cmd || cmd === 'list' || cmd === 'ls') {
  listProjects();
} else {
  showProject(cmd);
}

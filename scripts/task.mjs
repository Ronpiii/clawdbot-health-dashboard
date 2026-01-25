#!/usr/bin/env node
/**
 * task.mjs - simple task management
 * 
 * usage:
 *   node scripts/task.mjs list [active|done|ideas]
 *   node scripts/task.mjs add "task description" [--priority high|normal]
 *   node scripts/task.mjs done "partial task match"
 *   node scripts/task.mjs start "partial task match"
 *   node scripts/task.mjs block "partial task match"
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const WORKSPACE = '/data02/virt137413/clawd';
const TASKS_DIR = join(WORKSPACE, 'tasks');

const FILES = {
  active: join(TASKS_DIR, 'active.md'),
  done: join(TASKS_DIR, 'done.md'),
  ideas: join(TASKS_DIR, 'ideas.md')
};

const STATUSES = {
  todo: '[ ]',
  progress: '[~]',
  done: '[x]',
  blocked: '[!]'
};

async function readTasks(file = 'active') {
  const content = await readFile(FILES[file], 'utf-8');
  const lines = content.split('\n');
  const tasks = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^- \[(.)\] (.+)$/);
    if (match) {
      tasks.push({
        line: i,
        status: match[1],
        text: match[2],
        raw: line
      });
    }
  }
  
  return { content, lines, tasks };
}

async function list(file = 'active') {
  const { tasks } = await readTasks(file);
  
  if (tasks.length === 0) {
    console.log(`no tasks in ${file}`);
    return;
  }

  const statusLabels = {
    ' ': 'todo',
    '~': 'in progress',
    'x': 'done',
    '!': 'blocked',
    '?': 'needs clarification'
  };

  console.log(`\n=== ${file} ===\n`);
  
  for (const task of tasks) {
    const label = statusLabels[task.status] || task.status;
    console.log(`[${label}] ${task.text}`);
  }
  
  console.log(`\ntotal: ${tasks.length}`);
}

async function add(text, priority = 'normal') {
  const { content, lines } = await readTasks('active');
  
  // find the right section to add to
  let insertLine = -1;
  
  if (priority === 'high') {
    // find "## High Priority" section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('high priority')) {
        insertLine = i + 2; // after header and blank line
        break;
      }
    }
  }
  
  if (insertLine === -1) {
    // find "## Backlog" or add at end
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('backlog')) {
        insertLine = i + 2;
        break;
      }
    }
  }
  
  if (insertLine === -1) {
    insertLine = lines.length;
  }
  
  const newTask = `- [ ] ${text}`;
  lines.splice(insertLine, 0, newTask);
  
  await writeFile(FILES.active, lines.join('\n'));
  console.log(`added: ${newTask}`);
}

async function updateStatus(pattern, newStatus) {
  const { content, lines, tasks } = await readTasks('active');
  
  const matches = tasks.filter(t => 
    t.text.toLowerCase().includes(pattern.toLowerCase())
  );
  
  if (matches.length === 0) {
    console.log(`no tasks matching "${pattern}"`);
    return;
  }
  
  if (matches.length > 1) {
    console.log(`multiple matches for "${pattern}":`);
    matches.forEach(m => console.log(`  - ${m.text}`));
    console.log('be more specific');
    return;
  }
  
  const task = matches[0];
  const newLine = `- [${newStatus}] ${task.text}`;
  lines[task.line] = newLine;
  
  await writeFile(FILES.active, lines.join('\n'));
  console.log(`updated: ${newLine}`);
  
  // if done, move to done.md
  if (newStatus === 'x') {
    const doneContent = await readFile(FILES.done, 'utf-8');
    const today = new Date().toISOString().split('T')[0];
    
    // find or create today's section
    let doneLines = doneContent.split('\n');
    let todaySection = doneLines.findIndex(l => l.includes(today));
    
    if (todaySection === -1) {
      // add new section at top (after header)
      const headerEnd = doneLines.findIndex(l => l.startsWith('## '));
      if (headerEnd === -1) {
        doneLines.push('', `## ${today}`, '');
        todaySection = doneLines.length;
      } else {
        doneLines.splice(headerEnd, 0, `## ${today}`, '', '');
        todaySection = headerEnd + 2;
      }
    } else {
      todaySection += 2; // after header and blank
    }
    
    doneLines.splice(todaySection, 0, `- [x] ${task.text}`);
    await writeFile(FILES.done, doneLines.join('\n'));
    
    // remove from active
    lines.splice(task.line, 1);
    await writeFile(FILES.active, lines.join('\n'));
    
    console.log(`moved to done.md`);
  }
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'list':
  case 'ls':
    await list(args[0] || 'active');
    break;
    
  case 'add':
    const text = args.filter(a => !a.startsWith('--')).join(' ');
    const priority = args.includes('--priority') ? args[args.indexOf('--priority') + 1] : 
                     args.includes('--high') ? 'high' : 'normal';
    await add(text, priority);
    break;
    
  case 'done':
  case 'complete':
    await updateStatus(args.join(' '), 'x');
    break;
    
  case 'start':
  case 'progress':
    await updateStatus(args.join(' '), '~');
    break;
    
  case 'block':
  case 'blocked':
    await updateStatus(args.join(' '), '!');
    break;
    
  default:
    console.log(`usage: task.mjs <list|add|done|start|block> [args]`);
    console.log('');
    console.log('  list [active|done|ideas]  - list tasks');
    console.log('  add "text" [--high]       - add new task');
    console.log('  done "pattern"            - mark as done');
    console.log('  start "pattern"           - mark in progress');
    console.log('  block "pattern"           - mark blocked');
}

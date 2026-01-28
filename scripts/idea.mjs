#!/usr/bin/env node
/**
 * idea.mjs - quick idea capture
 * 
 * usage:
 *   arc idea "thought here"
 *   arc idea list
 *   arc idea clear
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IDEAS_DIR = join(ROOT, 'ideas');
const IDEAS_FILE = join(IDEAS_DIR, 'IDEAS.md');

// ensure ideas directory exists
if (!existsSync(IDEAS_DIR)) {
  mkdirSync(IDEAS_DIR, { recursive: true });
}

// ensure IDEAS.md exists
if (!existsSync(IDEAS_FILE)) {
  writeFileSync(IDEAS_FILE, `# Ideas

Quick captures. Review periodically and promote to projects or discard.

---

`);
}

function formatDate(d = new Date()) {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function addIdea(text) {
  const content = readFileSync(IDEAS_FILE, 'utf8');
  const entry = `- [ ] ${text} _(${formatDate()})_\n`;
  
  // insert after the --- separator
  const separatorIdx = content.indexOf('---');
  if (separatorIdx === -1) {
    writeFileSync(IDEAS_FILE, content + entry);
  } else {
    const insertIdx = separatorIdx + 4; // after "---\n"
    const updated = content.slice(0, insertIdx) + '\n' + entry + content.slice(insertIdx);
    writeFileSync(IDEAS_FILE, updated);
  }
  
  console.log(`✓ captured: "${text}"`);
}

function listIdeas() {
  const content = readFileSync(IDEAS_FILE, 'utf8');
  const lines = content.split('\n');
  const ideas = lines.filter(l => l.match(/^- \[[ x]\]/));
  
  if (ideas.length === 0) {
    console.log('no ideas captured yet');
    return;
  }
  
  console.log(`${ideas.length} idea${ideas.length === 1 ? '' : 's'}:\n`);
  
  const open = ideas.filter(l => l.startsWith('- [ ]'));
  const done = ideas.filter(l => l.startsWith('- [x]'));
  
  if (open.length > 0) {
    open.forEach(l => console.log(l));
  }
  
  if (done.length > 0) {
    console.log(`\n(${done.length} completed)`);
  }
}

function clearDone() {
  const content = readFileSync(IDEAS_FILE, 'utf8');
  const lines = content.split('\n');
  const filtered = lines.filter(l => !l.startsWith('- [x]'));
  writeFileSync(IDEAS_FILE, filtered.join('\n'));
  console.log('✓ cleared completed ideas');
}

// CLI
const [,, cmd, ...rest] = process.argv;

if (!cmd) {
  console.log(`usage:
  arc idea "your thought"   - capture idea
  arc idea list             - show ideas
  arc idea clear            - remove completed`);
  process.exit(0);
}

switch (cmd) {
  case 'list':
  case 'ls':
    listIdeas();
    break;
    
  case 'clear':
  case 'clean':
    clearDone();
    break;
    
  default:
    // treat as idea text
    const text = [cmd, ...rest].join(' ');
    if (text.trim()) {
      addIdea(text.trim());
    } else {
      console.log('usage: arc idea "your thought"');
    }
}

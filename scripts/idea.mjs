#!/usr/bin/env node
/**
 * idea.mjs - quick idea capture with tags
 * 
 * usage:
 *   arc idea "thought here #tag1 #tag2"
 *   arc idea list [#tag]
 *   arc idea tags
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
Use #tags to organize: \`arc idea "thought #project #category"\`

---

`);
}

function formatDate(d = new Date()) {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

// extract #tags from text
function extractTags(text) {
  const tags = text.match(/#[\w-]+/g) || [];
  return tags.map(t => t.toLowerCase());
}

// parse an idea line
function parseIdea(line) {
  const match = line.match(/^- \[([x ])\] (.+?) _\((.+?)\)_/);
  if (!match) return null;
  
  const done = match[1] === 'x';
  const text = match[2];
  const date = match[3];
  const tags = extractTags(text);
  
  return { done, text, date, tags, raw: line };
}

function addIdea(text) {
  const tags = extractTags(text);
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
  
  const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
  console.log(`✓ captured: "${text}"${tagStr}`);
}

function listIdeas(filterTag = null) {
  const content = readFileSync(IDEAS_FILE, 'utf8');
  const lines = content.split('\n');
  let ideas = lines
    .map(parseIdea)
    .filter(i => i !== null);
  
  // filter by tag if provided
  if (filterTag) {
    const tag = '#' + filterTag.toLowerCase().replace(/^#/, '');
    ideas = ideas.filter(i => i.tags.includes(tag));
  }
  
  if (ideas.length === 0) {
    console.log(filterTag ? `no ideas with tag ${filterTag}` : 'no ideas captured yet');
    return;
  }
  
  const open = ideas.filter(i => !i.done);
  const done = ideas.filter(i => i.done);
  
  console.log(`${ideas.length} idea${ideas.length === 1 ? '' : 's'}${filterTag ? ` tagged ${filterTag}` : ''}:\n`);
  
  if (open.length > 0) {
    open.forEach(i => console.log(i.raw));
  }
  
  if (done.length > 0) {
    console.log(`\n(${done.length} completed)`);
  }
}

function showTags() {
  const content = readFileSync(IDEAS_FILE, 'utf8');
  const lines = content.split('\n');
  const ideas = lines.map(parseIdea).filter(i => i !== null && !i.done);
  
  const tagCounts = {};
  for (const idea of ideas) {
    for (const tag of idea.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  
  if (sorted.length === 0) {
    console.log('no tags yet. use: arc idea "thought #tag"');
    return;
  }
  
  console.log('tags:\n');
  for (const [tag, count] of sorted) {
    console.log(`  ${tag.padEnd(20)} (${count})`);
  }
  console.log(`\nfilter: arc idea list #tagname`);
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
  arc idea "thought #tag"   - capture with optional tags
  arc idea list [#tag]      - show ideas (optionally filter by tag)
  arc idea tags             - show all tags
  arc idea clear            - remove completed`);
  process.exit(0);
}

switch (cmd) {
  case 'list':
  case 'ls':
    listIdeas(rest[0]);
    break;
    
  case 'tags':
    showTags();
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

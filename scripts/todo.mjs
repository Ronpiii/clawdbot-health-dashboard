#!/usr/bin/env node
/**
 * arc todo — find all unchecked TODOs across workspace markdown files
 * 
 * usage:
 *   arc todo              — list all unchecked items grouped by file
 *   arc todo count        — just show counts per file
 *   arc todo <query>      — filter items containing query text
 *   arc todo done         — show checked items (completed)
 *   arc todo all          — show both checked and unchecked
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, relative, basename } from 'path';

const ROOT = process.env.CLAWD_ROOT || join(new URL('.', import.meta.url).pathname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.vercel', 'vendor', '.cache']);

async function findMarkdownFiles(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch { return files; }

  for (const e of entries) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await findMarkdownFiles(full, files);
    } else if (e.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function extractTodos(content, filePath, { showDone = false, showAll = false, query = null } = {}) {
  const lines = content.split('\n');
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const unchecked = /^(\s*)-\s*\[\s\]\s+(.+)/.exec(line);
    const checked = /^(\s*)-\s*\[x\]\s+(.+)/i.exec(line);

    if (unchecked && !showDone) {
      items.push({ text: unchecked[2].trim(), done: false, line: i + 1 });
    } else if (checked && (showDone || showAll)) {
      items.push({ text: checked[2].trim(), done: true, line: i + 1 });
    } else if (unchecked && showAll) {
      items.push({ text: unchecked[2].trim(), done: false, line: i + 1 });
    }
  }

  // filter by query if given
  if (query) {
    const q = query.toLowerCase();
    return items.filter(it => it.text.toLowerCase().includes(q));
  }
  return items;
}

function prioritySort(items) {
  // sort: items with priority markers first, then alphabetical
  return items.sort((a, b) => {
    const aPri = /^(!+|P[0-3]|URGENT|CRITICAL)/i.test(a.text) ? 0 : 1;
    const bPri = /^(!+|P[0-3]|URGENT|CRITICAL)/i.test(b.text) ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;
    return a.text.localeCompare(b.text);
  });
}

function fileLabel(filePath) {
  const rel = relative(ROOT, filePath);
  // shorten common paths
  if (rel.startsWith('memory/')) return `📝 ${rel}`;
  if (rel.startsWith('tasks/')) return `✅ ${rel}`;
  if (rel.startsWith('projects/')) return `📦 ${rel}`;
  if (rel.startsWith('scripts/')) return `🔧 ${rel}`;
  return `📄 ${rel}`;
}

async function main() {
  const args = process.argv.slice(2);
  const countOnly = args[0] === 'count';
  const showDone = args[0] === 'done';
  const showAll = args[0] === 'all';
  const query = (!countOnly && !showDone && !showAll && args[0]) ? args.join(' ') : null;

  const files = await findMarkdownFiles(ROOT);
  const results = [];
  let totalItems = 0;
  let totalDone = 0;

  for (const f of files.sort()) {
    const content = await readFile(f, 'utf8');
    const items = extractTodos(content, f, { showDone, showAll, query });
    if (items.length === 0) continue;

    const done = items.filter(i => i.done).length;
    const open = items.length - done;
    totalItems += open;
    totalDone += done;

    results.push({ file: f, items, open, done: done });
  }

  if (results.length === 0) {
    if (query) {
      console.log(`no TODOs matching "${query}"`);
    } else if (showDone) {
      console.log('no completed items found');
    } else {
      console.log('✨ zero open TODOs — inbox zero vibes');
    }
    return;
  }

  // header
  const label = showDone ? 'completed' : showAll ? 'all' : 'open';
  const total = showDone ? totalDone : showAll ? (totalItems + totalDone) : totalItems;
  console.log(`\n📋 ${total} ${label} TODO${total !== 1 ? 's' : ''} across ${results.length} file${results.length !== 1 ? 's' : ''}${query ? ` matching "${query}"` : ''}\n`);

  if (countOnly) {
    // compact view
    const maxLen = Math.max(...results.map(r => relative(ROOT, r.file).length));
    for (const r of results) {
      const rel = relative(ROOT, r.file).padEnd(maxLen);
      console.log(`  ${rel}  ${r.open} open${r.done ? `, ${r.done} done` : ''}`);
    }
    console.log('');
    return;
  }

  // detailed view
  for (const r of results) {
    console.log(`${fileLabel(r.file)} (${r.open} open${r.done ? `, ${r.done} done` : ''})`);
    const sorted = prioritySort(r.items);
    for (const item of sorted) {
      const mark = item.done ? '✓' : '○';
      const dim = item.done ? '\x1b[2m' : '';
      const reset = item.done ? '\x1b[0m' : '';
      console.log(`  ${dim}${mark} ${item.text}${reset}`);
    }
    console.log('');
  }

  // summary bar
  if (showAll && totalDone > 0) {
    const pct = Math.round((totalDone / (totalItems + totalDone)) * 100);
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    console.log(`progress: [${bar}] ${pct}% (${totalDone}/${totalItems + totalDone})`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });

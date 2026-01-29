#!/usr/bin/env node
/**
 * arc triage — categorize TODOs by actionability
 * 
 * Classifies open TODOs into:
 *   🔴 blocked   — explicitly blocked or needs external input
 *   🟢 actionable — can be worked on now
 *   📄 documentation — checklist items in docs/readmes (not real tasks)
 *   🪦 stale — in old memory files or completed sections
 * 
 * usage:
 *   arc triage              — full triage report
 *   arc triage actionable   — only actionable items
 *   arc triage summary      — counts only
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

const ROOT = process.env.CLAWD_ROOT || join(new URL('.', import.meta.url).pathname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.vercel', 'vendor', '.cache']);

// patterns for classification
const BLOCKED_PATTERNS = [
  /block/i, /needs?\s+(ron|ellie|server|udp|api|key|domain|infra|config)/i,
  /waiting/i, /deferred/i, /can't/i, /cannot/i
];

const DOC_PATHS = [
  /README\.md$/i, /SETUP_GUIDE\.md$/i, /ARCHITECTURE\.md$/i,
  /DEPLOY_CHECKLIST\.md$/i, /\.md$/ // refined below
];

const DOC_CONTEXT_PATHS = [
  /discord-voice-bot\//,    // blocked project
  /docs\/ARCHITECTURE/,      // design doc
  /DEPLOY_CHECKLIST/,        // deployment steps (not actionable without infra)
  /SETUP_GUIDE/,             // setup docs
  /outreach-sequence\.md/,   // template (checklist is per-send)
  /products\//,              // product specs
  /research\//,              // research notes
];

const STALE_PATHS = [
  /memory\/2026-01-2[0-6]\.md/,  // old memory logs
];

async function findMarkdownFiles(dir, files = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return files; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await findMarkdownFiles(full, files);
    else if (e.name.endsWith('.md')) files.push(full);
  }
  return files;
}

function classify(text, filePath) {
  const rel = relative(ROOT, filePath);
  
  // blocked?
  if (BLOCKED_PATTERNS.some(p => p.test(text))) return 'blocked';
  
  // stale memory?
  if (STALE_PATHS.some(p => p.test(rel))) return 'stale';
  
  // documentation checklist?
  if (DOC_CONTEXT_PATHS.some(p => p.test(rel))) return 'documentation';
  
  // tasks/active.md, tasks/ideas.md, HEARTBEAT.md, ideas/ → actionable
  if (/^tasks\/|^ideas\/|^HEARTBEAT/i.test(rel)) return 'actionable';
  
  // memory files (recent) → actionable reminders
  if (/^memory\//.test(rel)) return 'stale';
  
  // project TASKS.md → actionable
  if (/TASKS\.md$/.test(rel)) return 'actionable';
  
  // everything else from project docs → documentation
  if (/^projects\//.test(rel)) return 'documentation';
  
  return 'actionable';
}

const CATEGORY = {
  blocked:       { emoji: '🔴', label: 'Blocked', desc: 'needs external input or is explicitly blocked' },
  actionable:    { emoji: '🟢', label: 'Actionable', desc: 'can be worked on now' },
  documentation: { emoji: '📄', label: 'Documentation', desc: 'checklist items in docs — not standalone tasks' },
  stale:         { emoji: '🪦', label: 'Stale', desc: 'old notes or context that lingered as open items' },
};

async function main() {
  const args = process.argv.slice(2);
  const filter = args[0]; // 'actionable', 'blocked', 'summary', etc.

  const files = await findMarkdownFiles(ROOT);
  const buckets = { blocked: [], actionable: [], documentation: [], stale: [] };

  for (const f of files.sort()) {
    const content = await readFile(f, 'utf8');
    for (const line of content.split('\n')) {
      const m = /^\s*-\s*\[\s\]\s+(.+)/.exec(line);
      if (!m) continue;
      const text = m[1].trim();
      const cat = classify(text, f);
      buckets[cat].push({ text, file: relative(ROOT, f) });
    }
  }

  const total = Object.values(buckets).reduce((s, b) => s + b.length, 0);
  console.log(`\n⚡ TODO Triage: ${total} open items\n`);

  // summary bar
  for (const [cat, items] of Object.entries(buckets)) {
    const { emoji, label } = CATEGORY[cat];
    console.log(`  ${emoji} ${label}: ${items.length}`);
  }
  console.log('');

  if (filter === 'summary') return;

  const show = filter ? [filter] : Object.keys(CATEGORY);
  
  for (const cat of show) {
    const items = buckets[cat];
    if (!items || items.length === 0) continue;
    const { emoji, label, desc } = CATEGORY[cat];
    
    console.log(`${emoji} ${label} (${items.length}) — ${desc}`);
    
    // group by file
    const byFile = {};
    for (const it of items) {
      (byFile[it.file] ??= []).push(it.text);
    }
    
    for (const [file, texts] of Object.entries(byFile)) {
      console.log(`  ${file}:`);
      for (const t of texts) {
        console.log(`    ○ ${t}`);
      }
    }
    console.log('');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * arc fortune — wisdom from your past self
 * 
 * Extracts lessons, insights, and key findings from memory files
 * and surfaces one randomly. Like a fortune cookie, but it's YOUR wisdom.
 * 
 * Usage:
 *   arc fortune              — one random insight
 *   arc fortune --all        — list everything
 *   arc fortune --category   — group by category
 *   arc fortune --stats      — collection stats
 *   arc fortune --add "..."  — manually add a fortune
 *   arc fortune --refresh    — rebuild cache from memory files
 *   arc fortune --search Q   — search fortunes
 *   arc fortune --json       — machine-readable
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');
const MEMORY_FILE = join(ROOT, 'MEMORY.md');
const CACHE_FILE = join(MEMORY_DIR, 'fortunes.json');

// ─── extraction patterns ────────────────────────────────────────────

const PATTERNS = [
  // explicit lessons/learnings
  { regex: /^[-*]\s+\*\*lesson:\*\*\s*(.+)/i, category: 'lesson' },
  { regex: /^[-*]\s+\*\*learning:\*\*\s*(.+)/i, category: 'lesson' },
  { regex: /^[-*]\s+\*\*takeaway:\*\*\s*(.+)/i, category: 'lesson' },
  
  // key insights and findings
  { regex: /^[-*]\s+key insight:\s*(.+)/i, category: 'insight' },
  { regex: /^[-*]\s+key finding:\s*(.+)/i, category: 'insight' },
  { regex: /^[-*]\s+\*\*key insight:\*\*\s*(.+)/i, category: 'insight' },
  
  // technical patterns
  { regex: /^[-*]\s+\*\*security:\*\*\s*(.+)/i, category: 'security' },
  { regex: /^[-*]\s+\*\*supabase[^:]*:\*\*\s*(.+)/i, category: 'technical' },
  { regex: /^[-*]\s+\*\*race conditions:\*\*\s*(.+)/i, category: 'technical' },
  { regex: /^[-*]\s+\*\*email tracking:\*\*\s*(.+)/i, category: 'technical' },
  
  // wisdom-shaped bullets (under ## lessons or ## learnings headers)
  { regex: /^[-*]\s+(.+[>→].+)/, category: 'principle', requireSection: /^##\s*(lessons|learnings|key insights|patterns|reflections)/i },
  
  // standalone principles (X > Y pattern)
  { regex: /^[-*]\s+(small composable .+)/i, category: 'principle' },
  { regex: /^[-*]\s+(explicit .+ > .+)/i, category: 'principle' },
  { regex: /^[-*]\s+(optimistic .+)/i, category: 'technical' },
  
  // reflection-style insights
  { regex: /^[-*]\s+\*\*reflection:\*\*\s*(.+)/i, category: 'reflection' },
  { regex: /^[-*]\s+\*\*note:\*\*\s*(.+)/i, category: 'reflection' },
  
  // decisions captured
  { regex: /^[-*]\s+\*\*decision:\*\*\s*(.+)/i, category: 'decision' },
  
  // rule/strict patterns  
  { regex: /^[-*]\s+\*\*strict rule:\*\*\s*(.+)/i, category: 'rule' },
  
  // things from MEMORY.md learnings section
  { regex: /^[-*]\s+(.+(?:—|–).+)/, category: 'lesson', requireSection: /^##\s*learnings/i },
];

// things to skip — too meta, too short, or not wisdom
const SKIP_PATTERNS = [
  /^see\s/i,
  /^https?:/,
  /^\*\*\w+:\*\*\s*\d/,           // metrics like "**current MRR:** €72"
  /^\*\*\w+:\*\*\s*\[/,           // links
  /^\*\*\w+:\*\*\s*https?:/,
  /^tasks?\//,
  /^projects?\//,
  /\.md$/,
  /^\*\*\w+:\*\*\s*$/,
  /NEVER|STRICT RULES/i,          // security rules, not wisdom
  /credentials|api.?key|token/i,  // security-adjacent
  /don't reveal|don't share/i,    // security directives, not wisdom
  /^['"]\.\/scripts/,             // tool references, not wisdom
  /^arc\s/,                       // tool aliases
];

// ─── extraction engine ──────────────────────────────────────────────

async function extractFromFile(filePath, fileName) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const fortunes = [];
  let currentSection = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // track section headers
    if (line.startsWith('#')) {
      currentSection = line;
      continue;
    }
    
    if (!line.startsWith('-') && !line.startsWith('*')) continue;
    
    for (const pattern of PATTERNS) {
      // check section requirement
      if (pattern.requireSection && !pattern.requireSection.test(currentSection)) continue;
      
      const match = line.match(pattern.regex);
      if (!match) continue;
      
      let text = match[1].trim();
      
      // clean up markdown artifacts
      text = text.replace(/\*\*/g, '').replace(/`/g, "'").trim();
      
      // skip if too short, too long, or matches skip patterns
      if (text.length < 15) break;
      if (text.length > 300) break;
      if (SKIP_PATTERNS.some(p => p.test(text))) break;
      
      // extract date from filename if daily log
      const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : null;
      
      fortunes.push({
        text,
        category: pattern.category,
        source: fileName,
        date,
        section: currentSection.replace(/^#+\s*/, ''),
      });
      
      break; // one match per line
    }
  }
  
  return fortunes;
}

async function extractAll() {
  const fortunes = [];
  
  // scan MEMORY.md
  try {
    const memFortunes = await extractFromFile(MEMORY_FILE, 'MEMORY.md');
    fortunes.push(...memFortunes);
  } catch {}
  
  // scan daily logs
  try {
    const files = await readdir(MEMORY_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md') && f.match(/^\d{4}-/));
    
    for (const file of mdFiles) {
      try {
        const fileFortunes = await extractFromFile(join(MEMORY_DIR, file), file);
        fortunes.push(...fileFortunes);
      } catch {}
    }
  } catch {}
  
  // deduplicate by text similarity (fuzzy — strips common prefixes)
  const seen = new Set();
  const unique = fortunes.filter(f => {
    let key = f.text.toLowerCase().replace(/\s+/g, ' ');
    // strip common prefixes that create false duplicates
    key = key.replace(/^(pattern|note|lesson|insight|learning|finding):\s*/i, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  return unique;
}

async function loadCache() {
  try {
    const data = await readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveCache(fortunes) {
  const cache = {
    version: 1,
    generated: new Date().toISOString(),
    count: fortunes.length,
    fortunes,
  };
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  return cache;
}

async function needsRefresh() {
  try {
    const cacheStat = await stat(CACHE_FILE);
    const cacheTime = cacheStat.mtimeMs;
    
    // check if any memory file is newer than cache
    const memStat = await stat(MEMORY_FILE);
    if (memStat.mtimeMs > cacheTime) return true;
    
    const files = await readdir(MEMORY_DIR);
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const fStat = await stat(join(MEMORY_DIR, f));
      if (fStat.mtimeMs > cacheTime) return true;
    }
    
    return false;
  } catch {
    return true; // no cache = needs refresh
  }
}

// ─── display ────────────────────────────────────────────────────────

const CATEGORY_ICONS = {
  lesson: 'L',
  insight: 'I',
  technical: 'T',
  security: 'S',
  principle: 'P',
  reflection: 'R',
  decision: 'D',
  rule: '!',
  manual: '*',
};

function formatFortune(f, opts = {}) {
  const icon = CATEGORY_ICONS[f.category] || '?';
  const source = f.date || f.source;
  
  if (opts.compact) {
    return `  [${icon}] ${f.text}  (${source})`;
  }
  
  const lines = [];
  lines.push('');
  lines.push('  ' + wrapText(f.text, 70, '  '));
  lines.push('');
  lines.push(`  — ${f.category}${f.date ? ', ' + f.date : ''}${f.section ? ' / ' + f.section : ''}`);
  lines.push('');
  return lines.join('\n');
}

function wrapText(text, width, indent = '') {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  
  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  
  return lines.join('\n' + indent);
}

function showOne(fortunes) {
  const f = fortunes[Math.floor(Math.random() * fortunes.length)];
  const W = 59; // inner width
  
  console.log();
  console.log('  ┌' + '─'.repeat(W) + '┐');
  
  const wrapped = wrapText(f.text, W - 4);
  const wLines = wrapped.split('\n');
  for (const line of wLines) {
    console.log('  │  ' + line.padEnd(W - 4) + '  │');
  }
  
  console.log('  │' + ' '.repeat(W) + '│');
  const attr = `— ${f.category}${f.date ? ', ' + f.date : ''}`;
  console.log('  │  ' + attr.padEnd(W - 4) + '  │');
  console.log('  └' + '─'.repeat(W) + '┘');
  console.log();
  console.log(`  ${fortunes.length} fortunes in collection. run "arc fortune --all" to see them all.`);
  console.log();
}

function showAll(fortunes) {
  console.log();
  console.log(`  fortune collection — ${fortunes.length} entries`);
  console.log('  ' + '─'.repeat(55));
  console.log();
  
  for (const f of fortunes) {
    console.log(formatFortune(f, { compact: true }));
  }
  
  console.log();
}

function showByCategory(fortunes) {
  const groups = {};
  for (const f of fortunes) {
    if (!groups[f.category]) groups[f.category] = [];
    groups[f.category].push(f);
  }
  
  console.log();
  console.log(`  fortune collection — ${fortunes.length} entries`);
  console.log('  ' + '─'.repeat(55));
  
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  
  for (const [cat, items] of sorted) {
    const icon = CATEGORY_ICONS[cat] || '?';
    console.log();
    console.log(`  [${icon}] ${cat} (${items.length})`);
    for (const f of items) {
      const source = f.date || f.source;
      console.log(`      ${f.text.substring(0, 70)}${f.text.length > 70 ? '...' : ''}  (${source})`);
    }
  }
  
  console.log();
}

function showStats(fortunes) {
  const cats = {};
  const sources = {};
  const months = {};
  
  for (const f of fortunes) {
    cats[f.category] = (cats[f.category] || 0) + 1;
    sources[f.source] = (sources[f.source] || 0) + 1;
    if (f.date) {
      const month = f.date.substring(0, 7);
      months[month] = (months[month] || 0) + 1;
    }
  }
  
  console.log();
  console.log('  fortune stats');
  console.log('  ' + '─'.repeat(40));
  console.log();
  console.log(`  total: ${fortunes.length} entries`);
  console.log();
  
  console.log('  by category:');
  const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(...sortedCats.map(([, v]) => v));
  for (const [cat, count] of sortedCats) {
    const bar = '█'.repeat(Math.ceil(count / maxCat * 20));
    const icon = CATEGORY_ICONS[cat] || '?';
    console.log(`    [${icon}] ${cat.padEnd(12)} ${bar} ${count}`);
  }
  
  console.log();
  console.log('  by month:');
  const sortedMonths = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0]));
  const maxMonth = Math.max(...sortedMonths.map(([, v]) => v));
  for (const [month, count] of sortedMonths) {
    const bar = '█'.repeat(Math.ceil(count / maxMonth * 20));
    console.log(`    ${month}  ${bar} ${count}`);
  }
  
  console.log();
  console.log(`  sources: ${Object.keys(sources).length} files`);
  console.log(`  oldest: ${fortunes.filter(f => f.date).sort((a, b) => a.date.localeCompare(b.date))[0]?.date || 'n/a'}`);
  console.log(`  newest: ${fortunes.filter(f => f.date).sort((a, b) => b.date.localeCompare(a.date))[0]?.date || 'n/a'}`);
  console.log();
}

function showSearch(fortunes, query) {
  const terms = query.toLowerCase().split(/\s+/);
  const results = fortunes.filter(f => {
    const text = (f.text + ' ' + f.category + ' ' + (f.section || '')).toLowerCase();
    return terms.every(t => text.includes(t));
  });
  
  if (results.length === 0) {
    console.log(`\n  no fortunes matching "${query}"\n`);
    return;
  }
  
  console.log();
  console.log(`  ${results.length} fortune${results.length === 1 ? '' : 's'} matching "${query}":`);
  console.log();
  
  for (const f of results) {
    console.log(formatFortune(f, { compact: true }));
  }
  console.log();
}

// ─── manual add ─────────────────────────────────────────────────────

async function addFortune(text, fortunes) {
  fortunes.push({
    text,
    category: 'manual',
    source: 'manual',
    date: new Date().toISOString().split('T')[0],
    section: '',
  });
  
  await saveCache(fortunes);
  console.log(`\n  added fortune. collection now has ${fortunes.length} entries.\n`);
}

// ─── main ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const positional = args.filter(a => !a.startsWith('--'));
  
  const isJson = flags.has('--json');
  const isRefresh = flags.has('--refresh');
  const isAll = flags.has('--all');
  const isCategory = flags.has('--category') || flags.has('--categories');
  const isStats = flags.has('--stats');
  const isShort = flags.has('--short');
  
  // handle --add
  if (flags.has('--add')) {
    const text = positional.join(' ');
    if (!text) {
      console.error('  usage: arc fortune --add "your wisdom here"');
      process.exit(1);
    }
    let cache = await loadCache();
    let fortunes = cache?.fortunes || await extractAll();
    if (!cache) await saveCache(fortunes);
    await addFortune(text, fortunes);
    return;
  }
  
  // handle --search
  if (flags.has('--search')) {
    const query = positional.join(' ');
    if (!query) {
      console.error('  usage: arc fortune --search <query>');
      process.exit(1);
    }
    let fortunes;
    const cache = await loadCache();
    if (cache && !await needsRefresh()) {
      fortunes = cache.fortunes;
    } else {
      fortunes = await extractAll();
      await saveCache(fortunes);
    }
    showSearch(fortunes, query);
    return;
  }
  
  // load or build cache
  let fortunes;
  
  if (isRefresh || await needsRefresh()) {
    fortunes = await extractAll();
    
    // preserve manual entries from existing cache
    const oldCache = await loadCache();
    if (oldCache?.fortunes) {
      const manuals = oldCache.fortunes.filter(f => f.source === 'manual');
      fortunes.push(...manuals);
    }
    
    await saveCache(fortunes);
    if (isRefresh) {
      console.log(`\n  refreshed. ${fortunes.length} fortunes extracted from memory files.\n`);
      if (!isAll && !isCategory && !isStats) return;
    }
  } else {
    const cache = await loadCache();
    fortunes = cache.fortunes;
  }
  
  if (fortunes.length === 0) {
    console.log('\n  no fortunes found. write more lessons in your daily logs!\n');
    return;
  }
  
  // json mode
  if (isJson) {
    if (isStats) {
      const cats = {};
      for (const f of fortunes) cats[f.category] = (cats[f.category] || 0) + 1;
      console.log(JSON.stringify({ total: fortunes.length, categories: cats, fortunes }));
    } else {
      console.log(JSON.stringify(fortunes, null, 2));
    }
    return;
  }
  
  // short mode (one-liner)
  if (isShort) {
    const f = fortunes[Math.floor(Math.random() * fortunes.length)];
    console.log(`fortune: "${f.text}" — ${f.category}${f.date ? ', ' + f.date : ''}`);
    return;
  }
  
  // display modes
  if (isStats) return showStats(fortunes);
  if (isCategory) return showByCategory(fortunes);
  if (isAll) return showAll(fortunes);
  
  // default: one random fortune
  showOne(fortunes);
}

main().catch(e => {
  console.error('error:', e.message);
  process.exit(1);
});

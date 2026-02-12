#!/usr/bin/env node
/**
 * arc snip — personal code snippet library
 * 
 * Save, search, and retrieve code snippets from your workspace.
 * Snippets live in memory/snippets.json — portable, greppable, no external deps.
 * 
 * Usage:
 *   arc snip                          List all snippets (grouped by tag)
 *   arc snip list                     List all snippets
 *   arc snip save <name> <file> [lines]  Save a snippet from a file
 *   arc snip get <name>               Output a snippet's content
 *   arc snip search <query>           Search snippets by name, tag, or content
 *   arc snip tag <name> <tags...>     Add tags to a snippet
 *   arc snip delete <name>            Remove a snippet
 *   arc snip stats                    Show library statistics
 * 
 * Options:
 *   --tag <tag>    Tag when saving (repeatable: --tag sql --tag supabase)
 *   --desc <text>  Description when saving
 *   --json         JSON output
 *   --copy         Copy snippet to stdout (for piping)
 * 
 * Line ranges:
 *   10-25          Lines 10 through 25
 *   10:15          Line 10, 15 lines total
 *   10             From line 10 to end of file
 * 
 * Examples:
 *   arc snip save rls-helper projects/anivia/supabase/migrations/0001.sql 5-20 --tag sql --tag supabase
 *   arc snip save next-middleware src/middleware.ts --desc "auth middleware pattern"
 *   arc snip get rls-helper
 *   arc snip search supabase
 *   arc snip tag rls-helper auth security
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, extname, basename, relative } from 'path';

const ROOT = process.env.WORKSPACE || join(import.meta.dirname, '..');
const SNIPPETS_FILE = join(ROOT, 'memory', 'snippets.json');

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgDim: '\x1b[48;5;236m',
};

// Parse args
const rawArgs = process.argv.slice(2);
const flags = {
  json: rawArgs.includes('--json'),
  copy: rawArgs.includes('--copy'),
  tags: [],
  desc: null,
};

// Extract --tag values
let i = 0;
const positional = [];
while (i < rawArgs.length) {
  if (rawArgs[i] === '--tag' && i + 1 < rawArgs.length) {
    flags.tags.push(rawArgs[i + 1].toLowerCase());
    i += 2;
  } else if (rawArgs[i] === '--desc' && i + 1 < rawArgs.length) {
    flags.desc = rawArgs[i + 1];
    i += 2;
  } else if (rawArgs[i].startsWith('--')) {
    i++;
  } else {
    positional.push(rawArgs[i]);
    i++;
  }
}

const [cmd, ...cmdArgs] = positional;

// Load snippets
function loadSnippets() {
  if (!existsSync(SNIPPETS_FILE)) return { snippets: {}, version: 1 };
  try {
    return JSON.parse(readFileSync(SNIPPETS_FILE, 'utf8'));
  } catch {
    return { snippets: {}, version: 1 };
  }
}

function saveSnippets(data) {
  const dir = dirname(SNIPPETS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SNIPPETS_FILE, JSON.stringify(data, null, 2));
}

// Detect language from file extension
function detectLang(filepath) {
  const ext = extname(filepath).toLowerCase();
  const map = {
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript',
    '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
    '.sql': 'sql', '.sh': 'bash', '.bash': 'bash', '.zsh': 'zsh',
    '.css': 'css', '.scss': 'scss', '.html': 'html', '.vue': 'vue',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.md': 'markdown', '.mdx': 'mdx',
    '.dockerfile': 'dockerfile', '.env': 'env',
    '.xml': 'xml', '.graphql': 'graphql', '.gql': 'graphql',
    '.prisma': 'prisma', '.svelte': 'svelte',
  };
  return map[ext] || ext.replace('.', '') || 'text';
}

// Parse line range: "10-25", "10:15", "10"
function parseLineRange(spec) {
  if (!spec) return null;
  
  if (spec.includes('-')) {
    const [start, end] = spec.split('-').map(Number);
    if (isNaN(start) || isNaN(end)) return null;
    return { start, end };
  }
  
  if (spec.includes(':')) {
    const [start, count] = spec.split(':').map(Number);
    if (isNaN(start) || isNaN(count)) return null;
    return { start, end: start + count - 1 };
  }
  
  const start = Number(spec);
  if (isNaN(start)) return null;
  return { start, end: Infinity };
}

// Auto-detect tags from content and filepath
function autoTags(filepath, content) {
  const tags = new Set();
  const lang = detectLang(filepath);
  if (lang && lang !== 'text') tags.add(lang);
  
  // Path-based
  if (filepath.includes('supabase') || filepath.includes('migration')) tags.add('supabase');
  if (filepath.includes('middleware')) tags.add('middleware');
  if (filepath.includes('api/')) tags.add('api');
  if (filepath.includes('components/')) tags.add('component');
  if (filepath.includes('hooks/')) tags.add('hook');
  if (filepath.includes('scripts/')) tags.add('script');
  
  // Content-based (lightweight)
  if (content.includes('CREATE TABLE') || content.includes('ALTER TABLE')) tags.add('ddl');
  if (content.includes('RLS') || content.includes('POLICY')) tags.add('rls');
  if (content.includes('useEffect') || content.includes('useState')) tags.add('react');
  if (content.includes('async function') || content.includes('await ')) tags.add('async');
  if (content.includes('supabase')) tags.add('supabase');
  if (content.includes('stripe')) tags.add('stripe');
  if (content.includes('next/')) tags.add('nextjs');
  
  return [...tags];
}

// Format snippet for display
function formatSnippet(name, snip, showContent = false) {
  const tagStr = snip.tags.length > 0 
    ? snip.tags.map(t => `${c.cyan}#${t}${c.reset}`).join(' ')
    : `${c.dim}no tags${c.reset}`;
  
  const lines = snip.content.split('\n').length;
  const age = timeSince(snip.savedAt);
  
  console.log(`${c.bold}${c.green}${name}${c.reset} ${c.dim}(${snip.lang}, ${lines} lines, ${age})${c.reset}`);
  if (snip.description) {
    console.log(`  ${c.dim}${snip.description}${c.reset}`);
  }
  console.log(`  ${tagStr}`);
  console.log(`  ${c.dim}from: ${snip.source}${snip.lineRange ? ` [${snip.lineRange}]` : ''}${c.reset}`);
  
  if (showContent) {
    console.log();
    const contentLines = snip.content.split('\n');
    const startLine = snip.startLine || 1;
    const gutterWidth = String(startLine + contentLines.length).length;
    
    for (let i = 0; i < contentLines.length; i++) {
      const lineNum = String(startLine + i).padStart(gutterWidth);
      console.log(`  ${c.dim}${lineNum}│${c.reset} ${contentLines[i]}`);
    }
  }
}

function timeSince(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

// Commands
function doSave(name, filepath, lineSpec) {
  if (!name || !filepath) {
    console.log(`${c.red}usage: arc snip save <name> <file> [lines]${c.reset}`);
    console.log(`${c.dim}  lines: 10-25 (range), 10:15 (start:count), 10 (from line 10)${c.reset}`);
    process.exit(1);
  }
  
  // Resolve filepath
  const resolvedPath = filepath.startsWith('/') ? filepath : join(process.cwd(), filepath);
  if (!existsSync(resolvedPath)) {
    // Try relative to workspace root
    const rootPath = join(ROOT, filepath);
    if (!existsSync(rootPath)) {
      console.log(`${c.red}file not found: ${filepath}${c.reset}`);
      process.exit(1);
    }
    filepath = rootPath;
  } else {
    filepath = resolvedPath;
  }
  
  const fileContent = readFileSync(filepath, 'utf8');
  const allLines = fileContent.split('\n');
  
  let content;
  let startLine = 1;
  let lineRange = null;
  
  const range = parseLineRange(lineSpec);
  if (range) {
    const start = Math.max(1, range.start);
    const end = Math.min(allLines.length, range.end);
    content = allLines.slice(start - 1, end).join('\n');
    startLine = start;
    lineRange = `${start}-${end === Infinity ? allLines.length : end}`;
  } else {
    content = fileContent;
    lineRange = null;
  }
  
  // Trim trailing whitespace
  content = content.replace(/\s+$/, '');
  
  const lang = detectLang(filepath);
  const relSource = relative(ROOT, filepath);
  const detectedTags = autoTags(filepath, content);
  const allTags = [...new Set([...flags.tags, ...detectedTags])];
  
  const data = loadSnippets();
  
  const isUpdate = !!data.snippets[name];
  
  data.snippets[name] = {
    content,
    source: relSource,
    lineRange,
    startLine,
    lang,
    tags: allTags,
    description: flags.desc || (isUpdate ? data.snippets[name].description : null),
    savedAt: new Date().toISOString(),
    lines: content.split('\n').length,
  };
  
  saveSnippets(data);
  
  const lines = content.split('\n').length;
  console.log(`${c.green}${isUpdate ? 'updated' : 'saved'}${c.reset} ${c.bold}${name}${c.reset} — ${lines} lines from ${c.cyan}${relSource}${c.reset}${lineRange ? ` [${lineRange}]` : ''}`);
  console.log(`  tags: ${allTags.map(t => `${c.cyan}#${t}${c.reset}`).join(' ')}`);
}

function doGet(name) {
  if (!name) {
    console.log(`${c.red}usage: arc snip get <name>${c.reset}`);
    process.exit(1);
  }
  
  const data = loadSnippets();
  const snip = data.snippets[name];
  
  if (!snip) {
    // Fuzzy match
    const names = Object.keys(data.snippets);
    const matches = names.filter(n => n.includes(name) || name.includes(n));
    if (matches.length > 0) {
      console.log(`${c.yellow}not found: ${name}${c.reset}`);
      console.log(`${c.dim}did you mean: ${matches.join(', ')}?${c.reset}`);
    } else {
      console.log(`${c.red}snippet not found: ${name}${c.reset}`);
    }
    process.exit(1);
  }
  
  if (flags.copy || flags.json) {
    if (flags.json) {
      console.log(JSON.stringify({ name, ...snip }, null, 2));
    } else {
      console.log(snip.content);
    }
    return;
  }
  
  formatSnippet(name, snip, true);
}

function doList() {
  const data = loadSnippets();
  const entries = Object.entries(data.snippets);
  
  if (entries.length === 0) {
    console.log(`${c.dim}no snippets yet. save one:${c.reset}`);
    console.log(`  ${c.cyan}arc snip save <name> <file> [lines]${c.reset}`);
    return;
  }
  
  if (flags.json) {
    console.log(JSON.stringify(data.snippets, null, 2));
    return;
  }
  
  // Group by primary tag
  const groups = new Map();
  for (const [name, snip] of entries) {
    const primary = snip.tags[0] || 'untagged';
    if (!groups.has(primary)) groups.set(primary, []);
    groups.get(primary).push([name, snip]);
  }
  
  console.log(`${c.bold}arc snip${c.reset} — ${entries.length} snippet${entries.length === 1 ? '' : 's'}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  
  for (const [tag, snippets] of [...groups.entries()].sort()) {
    console.log(`\n${c.cyan}#${tag}${c.reset} ${c.dim}(${snippets.length})${c.reset}`);
    
    for (const [name, snip] of snippets.sort((a, b) => a[0].localeCompare(b[0]))) {
      const lines = snip.content.split('\n').length;
      const desc = snip.description ? ` — ${snip.description}` : '';
      const otherTags = snip.tags.filter(t => t !== tag);
      const tagSuffix = otherTags.length > 0 ? ` ${c.dim}${otherTags.map(t => `#${t}`).join(' ')}${c.reset}` : '';
      
      console.log(`  ${c.green}${name}${c.reset} ${c.dim}(${lines}L, ${snip.lang})${c.reset}${desc}${tagSuffix}`);
    }
  }
  
  console.log(`\n${c.dim}use: arc snip get <name> to view content${c.reset}`);
}

function doSearch(query) {
  if (!query) {
    console.log(`${c.red}usage: arc snip search <query>${c.reset}`);
    process.exit(1);
  }
  
  const data = loadSnippets();
  const q = query.toLowerCase();
  
  const results = Object.entries(data.snippets)
    .map(([name, snip]) => {
      let score = 0;
      
      // Name match (highest weight)
      if (name.toLowerCase().includes(q)) score += 10;
      if (name.toLowerCase() === q) score += 20;
      
      // Tag match
      if (snip.tags.some(t => t.includes(q))) score += 8;
      if (snip.tags.includes(q)) score += 5;
      
      // Description match
      if (snip.description && snip.description.toLowerCase().includes(q)) score += 5;
      
      // Source path match
      if (snip.source.toLowerCase().includes(q)) score += 3;
      
      // Content match (lower weight, more common)
      const contentMatches = (snip.content.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (contentMatches > 0) score += Math.min(contentMatches, 5);
      
      // Language match
      if (snip.lang === q) score += 6;
      
      return { name, snip, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
  
  if (flags.json) {
    console.log(JSON.stringify(results.map(r => ({ name: r.name, score: r.score, ...r.snip })), null, 2));
    return;
  }
  
  if (results.length === 0) {
    console.log(`${c.dim}no snippets matching "${query}"${c.reset}`);
    return;
  }
  
  console.log(`${c.bold}${results.length} result${results.length === 1 ? '' : 's'}${c.reset} for "${c.cyan}${query}${c.reset}"`);
  console.log();
  
  for (const { name, snip, score } of results) {
    formatSnippet(name, snip, false);
    console.log();
  }
}

function doTag(name, ...newTags) {
  if (!name || newTags.length === 0) {
    console.log(`${c.red}usage: arc snip tag <name> <tags...>${c.reset}`);
    process.exit(1);
  }
  
  const data = loadSnippets();
  if (!data.snippets[name]) {
    console.log(`${c.red}snippet not found: ${name}${c.reset}`);
    process.exit(1);
  }
  
  const existing = new Set(data.snippets[name].tags);
  const added = newTags.filter(t => !existing.has(t.toLowerCase()));
  
  for (const t of added) {
    data.snippets[name].tags.push(t.toLowerCase());
  }
  
  saveSnippets(data);
  console.log(`${c.green}tagged${c.reset} ${c.bold}${name}${c.reset} — ${data.snippets[name].tags.map(t => `${c.cyan}#${t}${c.reset}`).join(' ')}`);
  if (added.length === 0) {
    console.log(`${c.dim}(all tags already existed)${c.reset}`);
  }
}

function doDelete(name) {
  if (!name) {
    console.log(`${c.red}usage: arc snip delete <name>${c.reset}`);
    process.exit(1);
  }
  
  const data = loadSnippets();
  if (!data.snippets[name]) {
    console.log(`${c.red}snippet not found: ${name}${c.reset}`);
    process.exit(1);
  }
  
  delete data.snippets[name];
  saveSnippets(data);
  console.log(`${c.green}deleted${c.reset} ${c.bold}${name}${c.reset}`);
}

function doStats() {
  const data = loadSnippets();
  const entries = Object.entries(data.snippets);
  
  if (entries.length === 0) {
    console.log(`${c.dim}no snippets yet${c.reset}`);
    return;
  }
  
  if (flags.json) {
    const stats = {
      total: entries.length,
      totalLines: entries.reduce((sum, [, s]) => sum + s.content.split('\n').length, 0),
      languages: {},
      tags: {},
      sources: {},
    };
    for (const [, snip] of entries) {
      stats.languages[snip.lang] = (stats.languages[snip.lang] || 0) + 1;
      for (const t of snip.tags) stats.tags[t] = (stats.tags[t] || 0) + 1;
      const proj = snip.source.split('/')[0];
      stats.sources[proj] = (stats.sources[proj] || 0) + 1;
    }
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  
  const totalLines = entries.reduce((sum, [, s]) => sum + s.content.split('\n').length, 0);
  const totalBytes = entries.reduce((sum, [, s]) => sum + s.content.length, 0);
  
  // Language breakdown
  const langs = {};
  for (const [, snip] of entries) {
    langs[snip.lang] = (langs[snip.lang] || 0) + 1;
  }
  
  // Tag breakdown
  const tags = {};
  for (const [, snip] of entries) {
    for (const t of snip.tags) tags[t] = (tags[t] || 0) + 1;
  }
  
  // Source projects
  const sources = {};
  for (const [, snip] of entries) {
    const proj = snip.source.split('/')[0] || 'root';
    sources[proj] = (sources[proj] || 0) + 1;
  }
  
  console.log(`${c.bold}arc snip stats${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log(`  snippets: ${c.bold}${entries.length}${c.reset}`);
  console.log(`  total lines: ${c.bold}${totalLines}${c.reset}`);
  console.log(`  total size: ${c.bold}${(totalBytes / 1024).toFixed(1)}KB${c.reset}`);
  
  console.log(`\n${c.bold}languages${c.reset}`);
  for (const [lang, count] of Object.entries(langs).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / entries.length * 20));
    console.log(`  ${c.cyan}${lang.padEnd(12)}${c.reset} ${bar} ${count}`);
  }
  
  console.log(`\n${c.bold}top tags${c.reset}`);
  for (const [tag, count] of Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${c.green}#${tag.padEnd(15)}${c.reset} ${count}`);
  }
  
  console.log(`\n${c.bold}sources${c.reset}`);
  for (const [src, count] of Object.entries(sources).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.dim}${src.padEnd(20)}${c.reset} ${count}`);
  }
}

// Main
console.log(`${c.bold}arc snip${c.reset} — personal code snippet library`);
console.log(`${c.dim}${'─'.repeat(45)}${c.reset}\n`);

switch (cmd) {
  case 'save':
  case 'add':
  case 's':
    doSave(cmdArgs[0], cmdArgs[1], cmdArgs[2]);
    break;
    
  case 'get':
  case 'show':
  case 'g':
    doGet(cmdArgs[0]);
    break;
    
  case 'search':
  case 'find':
  case 'q':
    doSearch(cmdArgs.join(' '));
    break;
    
  case 'tag':
  case 't':
    doTag(cmdArgs[0], ...cmdArgs.slice(1));
    break;
    
  case 'delete':
  case 'rm':
  case 'remove':
    doDelete(cmdArgs[0]);
    break;
    
  case 'stats':
  case 'info':
    doStats();
    break;
    
  case 'list':
  case 'ls':
  case undefined:
    doList();
    break;
    
  default:
    // If no subcommand, treat as a search
    doSearch([cmd, ...cmdArgs].join(' '));
    break;
}

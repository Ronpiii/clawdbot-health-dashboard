#!/usr/bin/env node
/**
 * arc size — project size analyzer & code cartography
 * 
 * shows where your code actually lives: LOC by language, file counts,
 * biggest files, project comparisons, and growth signals.
 * born from the 207K inode surprise (2026-02-18).
 * 
 * usage:
 *   arc size                       # all projects summary
 *   arc size <project>             # deep dive into one project
 *   arc size --top N               # top N biggest files (default 10)
 *   arc size --lang                # breakdown by language only
 *   arc size --tree                # visual treemap
 *   arc size --short               # one-liner per project
 *   arc size --json                # machine-readable
 * 
 * nightly build 2026-02-19
 */

import { readFileSync, readdirSync, existsSync, statSync, lstatSync } from 'fs';
import { join, basename, extname, relative } from 'path';

const ROOT = join(import.meta.dirname, '..');
const PROJECTS_DIR = join(ROOT, 'projects');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');
const langMode = args.includes('--lang');
const treeMode = args.includes('--tree');
const topIdx = args.indexOf('--top');
const topN = topIdx !== -1 ? parseInt(args[topIdx + 1]) || 10 : 10;
const projectFilter = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a));

// ── language detection ───────────────────────────────────────────────

const LANG_MAP = {
  '.js': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.jsx': 'React JSX',
  '.ts': 'TypeScript',
  '.tsx': 'React TSX',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.mdx': 'MDX',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.toml': 'TOML',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.lua': 'Lua',
  '.svg': 'SVG',
  '.xml': 'XML',
  '.env': 'Env',
  '.dockerfile': 'Docker',
  '.prisma': 'Prisma',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
};

// files to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.vercel', '.turbo',
  'dist', 'build', 'out', '.cache', '.output',
  'coverage', '__pycache__', '.svelte-kit', '.nuxt',
  'vendor', 'bower_components', '.parcel-cache',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb', '.DS_Store', 'thumbs.db',
]);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.sqlite', '.db',
]);

// ── colors ───────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bg: {
    cyan: '\x1b[46m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    red: '\x1b[41m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
  }
};

// language colors (for visual distinction)
const LANG_COLORS = {
  'JavaScript': c.yellow,
  'TypeScript': c.blue,
  'React JSX': c.cyan,
  'React TSX': c.cyan,
  'CSS': c.magenta,
  'SCSS': c.magenta,
  'HTML': c.red,
  'JSON': c.dim,
  'Markdown': c.white,
  'MDX': c.white,
  'SQL': c.green,
  'Shell': c.green,
  'Python': c.yellow,
  'YAML': c.dim,
  'SVG': c.magenta,
  'Env': c.dim,
};

// ── file scanning ────────────────────────────────────────────────────

function scanDir(dir, results = [], relBase = dir, depth = 0) {
  if (depth > 15) return results; // safety
  
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  
  for (const entry of entries) {
    const name = entry.name;
    const fullPath = join(dir, name);
    
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
      scanDir(fullPath, results, relBase, depth + 1);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(name)) continue;
      
      const ext = extname(name).toLowerCase();
      if (BINARY_EXT.has(ext)) {
        // track binary files for size but don't count LOC
        try {
          const stat = statSync(fullPath);
          results.push({
            path: fullPath,
            rel: relative(relBase, fullPath),
            ext,
            lang: 'Binary',
            lines: 0,
            bytes: stat.size,
            binary: true,
          });
        } catch {}
        continue;
      }
      
      try {
        const stat = statSync(fullPath);
        if (stat.size > 5 * 1024 * 1024) continue; // skip files >5MB
        
        const content = readFileSync(fullPath, 'utf8');
        const lines = content.split('\n').length;
        const lang = LANG_MAP[ext] || (name === 'Dockerfile' ? 'Docker' : null) || (name === 'Makefile' ? 'Makefile' : null) || null;
        
        results.push({
          path: fullPath,
          rel: relative(relBase, fullPath),
          ext: ext || name,
          lang: lang || `Other (${ext || name})`,
          lines,
          bytes: stat.size,
          binary: false,
        });
      } catch {}
    }
  }
  
  return results;
}

// ── formatting helpers ───────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatNum(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

function bar(value, max, width = 20, filled = '█', empty = '░') {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const filledCount = Math.round(ratio * width);
  return filled.repeat(filledCount) + empty.repeat(width - filledCount);
}

function percent(part, total) {
  if (total === 0) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

// ── treemap visualization ────────────────────────────────────────────

function renderTreemap(langStats, totalLines) {
  // proportional block visualization
  const WIDTH = 50;
  const sorted = [...langStats].sort((a, b) => b[1].lines - a[1].lines);
  const out = [];
  
  out.push(`${c.bold}  code treemap${c.reset} ${c.dim}(proportional by LOC)${c.reset}`);
  out.push('');
  
  // render each language as a proportional row
  for (const [lang, stats] of sorted) {
    if (stats.lines === 0) continue;
    const pct = stats.lines / totalLines;
    const blocks = Math.max(1, Math.round(pct * WIDTH));
    const color = LANG_COLORS[lang] || c.dim;
    const label = `${lang}`.padEnd(14);
    const count = `${formatNum(stats.lines)} LOC`.padStart(10);
    const pctStr = percent(stats.lines, totalLines).padStart(6);
    
    out.push(`  ${color}${label}${c.reset} ${color}${'█'.repeat(blocks)}${c.reset} ${c.dim}${count} ${pctStr}${c.reset}`);
  }
  
  return out.join('\n');
}

// ── directory depth treemap ──────────────────────────────────────────

function renderDirTree(files, projectRoot, maxDepth = 2) {
  // group files by directory (depth-limited)
  const dirMap = new Map();
  
  for (const f of files) {
    const parts = f.rel.split('/');
    const dirParts = parts.slice(0, Math.min(parts.length - 1, maxDepth));
    const dir = dirParts.length > 0 ? dirParts.join('/') : '.';
    
    if (!dirMap.has(dir)) dirMap.set(dir, { lines: 0, bytes: 0, files: 0 });
    const d = dirMap.get(dir);
    d.lines += f.lines;
    d.bytes += f.bytes;
    d.files++;
  }
  
  const sorted = [...dirMap.entries()].sort((a, b) => b[1].lines - a[1].lines);
  const totalLines = sorted.reduce((s, [, d]) => s + d.lines, 0);
  const out = [];
  
  out.push(`${c.bold}  directory map${c.reset} ${c.dim}(by LOC, depth ≤${maxDepth})${c.reset}`);
  out.push('');
  
  const maxBarLines = sorted[0]?.[1].lines || 1;
  
  for (const [dir, stats] of sorted.slice(0, 15)) {
    const dirLabel = (dir === '.' ? '(root)' : dir).padEnd(28);
    const b = bar(stats.lines, maxBarLines, 15);
    const pctStr = percent(stats.lines, totalLines).padStart(6);
    
    out.push(`  ${c.cyan}${dirLabel}${c.reset} ${b} ${c.dim}${formatNum(stats.lines)} LOC ${pctStr} (${stats.files} files)${c.reset}`);
  }
  
  if (sorted.length > 15) {
    out.push(`  ${c.dim}  ... and ${sorted.length - 15} more directories${c.reset}`);
  }
  
  return out.join('\n');
}

// ── project discovery ────────────────────────────────────────────────

function findProjects() {
  const projects = [];
  
  // check projects/ directory
  if (existsSync(PROJECTS_DIR)) {
    for (const name of readdirSync(PROJECTS_DIR)) {
      const dir = join(PROJECTS_DIR, name);
      try {
        if (statSync(dir).isDirectory()) {
          projects.push({ name, dir, source: 'projects/' });
        }
      } catch {}
    }
  }
  
  // check workspace root for additional repos
  for (const name of readdirSync(ROOT)) {
    if (name === 'projects' || name === 'node_modules' || name.startsWith('.')) continue;
    const dir = join(ROOT, name);
    try {
      if (statSync(dir).isDirectory() && existsSync(join(dir, '.git'))) {
        if (!projects.find(p => p.name === name)) {
          projects.push({ name, dir, source: 'workspace/' });
        }
      }
    } catch {}
  }
  
  // also include workspace root (clawd itself) — scripts, memory, etc.
  projects.push({ name: 'clawd', dir: ROOT, source: 'workspace/' });
  
  return projects;
}

// ── project aliases ──────────────────────────────────────────────────

const ALIASES = {
  'mundo': 'tuner',
  'cm': 'context-memory',
  'vsite': 'ventok-site',
  'discord': 'discord-voice-bot',
};

function resolveProject(name) {
  return ALIASES[name] || name;
}

// ── main ─────────────────────────────────────────────────────────────

function analyzeProject(project) {
  const files = scanDir(project.dir, [], project.dir);
  
  // aggregate by language
  const langMap = new Map();
  let totalLines = 0;
  let totalBytes = 0;
  let totalFiles = files.length;
  let codeLines = 0;
  
  for (const f of files) {
    if (!langMap.has(f.lang)) langMap.set(f.lang, { lines: 0, bytes: 0, files: 0 });
    const l = langMap.get(f.lang);
    l.lines += f.lines;
    l.bytes += f.bytes;
    l.files++;
    totalLines += f.lines;
    totalBytes += f.bytes;
    if (!f.binary && f.lang !== 'JSON' && f.lang !== 'Markdown' && !f.lang.startsWith('Other')) {
      codeLines += f.lines;
    }
  }
  
  // sort languages by LOC
  const langStats = [...langMap.entries()].sort((a, b) => b[1].lines - a[1].lines);
  
  // find biggest files (non-binary)
  const biggestFiles = files
    .filter(f => !f.binary)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, topN);
  
  // file extension distribution
  const extMap = new Map();
  for (const f of files) {
    const key = f.ext || '(none)';
    if (!extMap.has(key)) extMap.set(key, 0);
    extMap.set(key, extMap.get(key) + 1);
  }
  
  return {
    name: project.name,
    dir: project.dir,
    files,
    totalFiles,
    totalLines,
    totalBytes,
    codeLines,
    langStats,
    biggestFiles,
    extMap,
  };
}

function renderProjectSummary(analysis) {
  const { name, totalFiles, totalLines, totalBytes, codeLines, langStats, biggestFiles } = analysis;
  const out = [];
  
  out.push(`${c.bold}${c.cyan}  ╭─ ${name} ${'─'.repeat(Math.max(1, 45 - name.length))}╮${c.reset}`);
  out.push(`${c.cyan}  │${c.reset}  ${c.bold}${formatNum(totalFiles)}${c.reset} files  ${c.bold}${formatNum(totalLines)}${c.reset} LOC  ${c.bold}${formatBytes(totalBytes)}${c.reset} on disk  ${c.dim}(${formatNum(codeLines)} code)${c.reset}`);
  out.push(`${c.cyan}  ╰${'─'.repeat(49)}╯${c.reset}`);
  out.push('');
  
  // top languages
  const maxLangLines = langStats[0]?.[1].lines || 1;
  
  out.push(`${c.bold}  languages${c.reset}`);
  for (const [lang, stats] of langStats.slice(0, 8)) {
    if (stats.lines === 0 && !stats.files) continue;
    const color = LANG_COLORS[lang] || c.dim;
    const label = lang.padEnd(14);
    const b = bar(stats.lines, maxLangLines, 15);
    const count = `${formatNum(stats.lines)} LOC`.padStart(10);
    const pctStr = percent(stats.lines, totalLines).padStart(6);
    const fCount = `${stats.files} files`.padStart(9);
    
    out.push(`  ${color}  ${label}${c.reset} ${b} ${c.dim}${count} ${pctStr} ${fCount}${c.reset}`);
  }
  if (langStats.length > 8) {
    const rest = langStats.slice(8);
    const restLines = rest.reduce((s, [, v]) => s + v.lines, 0);
    const restFiles = rest.reduce((s, [, v]) => s + v.files, 0);
    out.push(`  ${c.dim}  + ${rest.length} more       ${formatNum(restLines)} LOC (${restFiles} files)${c.reset}`);
  }
  out.push('');
  
  // biggest files
  out.push(`${c.bold}  biggest files${c.reset} ${c.dim}(by LOC)${c.reset}`);
  for (let i = 0; i < biggestFiles.length; i++) {
    const f = biggestFiles[i];
    const rank = `${i + 1}.`.padStart(4);
    const lineStr = `${formatNum(f.lines)} LOC`.padStart(10);
    const sizeStr = formatBytes(f.bytes).padStart(7);
    const color = LANG_COLORS[f.lang] || c.dim;
    
    out.push(`  ${c.dim}${rank}${c.reset} ${color}${f.rel}${c.reset} ${c.dim}${lineStr} ${sizeStr}${c.reset}`);
  }
  
  return out.join('\n');
}

function renderShort(analysis) {
  const { name, totalFiles, totalLines, totalBytes, codeLines, langStats } = analysis;
  const topLangs = langStats.slice(0, 3).map(([l]) => l).join(', ');
  return `${c.bold}${name.padEnd(20)}${c.reset} ${formatNum(totalFiles).padStart(6)} files  ${formatNum(totalLines).padStart(7)} LOC  ${formatBytes(totalBytes).padStart(7)}  ${c.dim}${topLangs}${c.reset}`;
}

function main() {
  const projects = findProjects();
  
  // filter to one project?
  const filter = projectFilter ? resolveProject(projectFilter) : null;
  const targets = filter
    ? projects.filter(p => p.name === filter || p.name.includes(filter))
    : projects;
  
  if (filter && targets.length === 0) {
    console.error(`${c.red}  project not found: ${filter}${c.reset}`);
    console.error(`${c.dim}  available: ${projects.map(p => p.name).join(', ')}${c.reset}`);
    process.exit(1);
  }
  
  const analyses = targets.map(p => analyzeProject(p));
  
  // ── json mode ────────────────────────────────────────────────────
  if (jsonMode) {
    const output = analyses.map(a => ({
      name: a.name,
      totalFiles: a.totalFiles,
      totalLines: a.totalLines,
      totalBytes: a.totalBytes,
      codeLines: a.codeLines,
      languages: Object.fromEntries(a.langStats),
      biggestFiles: a.biggestFiles.map(f => ({ path: f.rel, lines: f.lines, bytes: f.bytes, lang: f.lang })),
    }));
    console.log(JSON.stringify(filter ? output[0] : output, null, 2));
    return;
  }
  
  // ── header ───────────────────────────────────────────────────────
  if (!shortMode) {
    console.log('');
    console.log(`${c.bold}  ⬡ arc size${c.reset} ${c.dim}— code cartography${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(52)}${c.reset}`);
    console.log('');
  }
  
  // ── single project deep dive ─────────────────────────────────────
  if (filter && analyses.length === 1) {
    const a = analyses[0];
    
    if (shortMode) {
      console.log(renderShort(a));
      return;
    }
    
    console.log(renderProjectSummary(a));
    console.log('');
    
    // treemap
    if (treeMode || !shortMode) {
      console.log(renderTreemap(a.langStats, a.totalLines));
      console.log('');
      console.log(renderDirTree(a.files, a.dir));
    }
    
    return;
  }
  
  // ── multi-project overview ───────────────────────────────────────
  
  // sort by total lines (descending)
  analyses.sort((a, b) => b.totalLines - a.totalLines);
  
  if (shortMode) {
    console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
    for (const a of analyses) {
      console.log(renderShort(a));
    }
    console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
    const totFiles = analyses.reduce((s, a) => s + a.totalFiles, 0);
    const totLines = analyses.reduce((s, a) => s + a.totalLines, 0);
    const totBytes = analyses.reduce((s, a) => s + a.totalBytes, 0);
    console.log(`${c.bold}${'TOTAL'.padEnd(20)}${c.reset} ${formatNum(totFiles).padStart(6)} files  ${formatNum(totLines).padStart(7)} LOC  ${formatBytes(totBytes).padStart(7)}`);
    return;
  }
  
  // workspace totals
  const totFiles = analyses.reduce((s, a) => s + a.totalFiles, 0);
  const totLines = analyses.reduce((s, a) => s + a.totalLines, 0);
  const totBytes = analyses.reduce((s, a) => s + a.totalBytes, 0);
  const totCode = analyses.reduce((s, a) => s + a.codeLines, 0);
  
  console.log(`${c.bold}  workspace totals${c.reset}`);
  console.log(`  ${c.bold}${formatNum(totFiles)}${c.reset} files across ${c.bold}${analyses.length}${c.reset} projects`);
  console.log(`  ${c.bold}${formatNum(totLines)}${c.reset} total LOC  ${c.dim}(${formatNum(totCode)} code, ${formatNum(totLines - totCode)} data/docs)${c.reset}`);
  console.log(`  ${c.bold}${formatBytes(totBytes)}${c.reset} on disk ${c.dim}(excluding node_modules, .git, build artifacts)${c.reset}`);
  console.log('');
  
  // project comparison bars
  const maxLines = analyses[0]?.totalLines || 1;
  
  console.log(`${c.bold}  projects${c.reset} ${c.dim}(by LOC)${c.reset}`);
  console.log('');
  
  for (const a of analyses) {
    const nameStr = a.name.padEnd(20);
    const b = bar(a.totalLines, maxLines, 20);
    const stats = `${formatNum(a.totalLines)} LOC`.padStart(10);
    const size = formatBytes(a.totalBytes).padStart(7);
    const files = `${formatNum(a.totalFiles)} files`.padStart(9);
    const topLang = a.langStats[0]?.[0] || '-';
    const color = LANG_COLORS[topLang] || c.dim;
    
    console.log(`  ${c.bold}${nameStr}${c.reset} ${b} ${c.dim}${stats} ${size} ${files}${c.reset}`);
    
    // show top 3 languages in minibar
    const top3 = a.langStats.slice(0, 3);
    const langLine = top3.map(([lang, s]) => {
      const lc = LANG_COLORS[lang] || c.dim;
      return `${lc}${lang}${c.reset} ${c.dim}${percent(s.lines, a.totalLines)}${c.reset}`;
    }).join('  ');
    console.log(`  ${''.padEnd(20)} ${langLine}`);
    console.log('');
  }
  
  // ── global language breakdown ────────────────────────────────────
  const globalLangs = new Map();
  for (const a of analyses) {
    for (const [lang, stats] of a.langStats) {
      if (!globalLangs.has(lang)) globalLangs.set(lang, { lines: 0, bytes: 0, files: 0 });
      const g = globalLangs.get(lang);
      g.lines += stats.lines;
      g.bytes += stats.bytes;
      g.files += stats.files;
    }
  }
  
  const sortedGlobal = [...globalLangs.entries()].sort((a, b) => b[1].lines - a[1].lines);
  
  if (langMode || !filter) {
    console.log(`${c.dim}${'─'.repeat(52)}${c.reset}`);
    console.log('');
    console.log(renderTreemap(sortedGlobal, totLines));
    console.log('');
  }
  
  // ── biggest files across all projects ────────────────────────────
  if (!langMode) {
    const allBiggest = analyses
      .flatMap(a => a.biggestFiles.map(f => ({ ...f, project: a.name })))
      .sort((a, b) => b.lines - a.lines)
      .slice(0, topN);
    
    console.log(`${c.dim}${'─'.repeat(52)}${c.reset}`);
    console.log('');
    console.log(`${c.bold}  biggest files${c.reset} ${c.dim}(across all projects)${c.reset}`);
    for (let i = 0; i < allBiggest.length; i++) {
      const f = allBiggest[i];
      const rank = `${i + 1}.`.padStart(4);
      const lineStr = `${formatNum(f.lines)} LOC`.padStart(10);
      const color = LANG_COLORS[f.lang] || c.dim;
      const proj = c.dim + `[${f.project}]` + c.reset;
      
      console.log(`  ${c.dim}${rank}${c.reset} ${color}${f.rel}${c.reset} ${c.dim}${lineStr}${c.reset} ${proj}`);
    }
    console.log('');
  }
  
  // ── code vs data ratio ───────────────────────────────────────────
  const dataLines = totLines - totCode;
  const codeRatio = totLines > 0 ? (totCode / totLines * 100).toFixed(0) : 0;
  const codeBar = bar(totCode, totLines, 30);
  
  console.log(`${c.dim}${'─'.repeat(52)}${c.reset}`);
  console.log('');
  console.log(`${c.bold}  code vs data${c.reset}`);
  console.log(`  ${c.cyan}code${c.reset}  ${codeBar}  ${c.bold}${codeRatio}%${c.reset} ${c.dim}(${formatNum(totCode)} LOC)${c.reset}`);
  console.log(`  ${c.dim}data  ${bar(dataLines, totLines, 30)}  ${(100 - codeRatio)}% (${formatNum(dataLines)} LOC — JSON, Markdown, configs)${c.reset}`);
  console.log('');
}

main();

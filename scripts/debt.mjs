#!/usr/bin/env node
/**
 * arc debt — technical debt scanner across all projects
 * 
 * finds code quality signals that indicate accumulated debt:
 * - TODO/FIXME/HACK/XXX comments (promises to future self)
 * - large files (>300 lines of code)
 * - console.log/debug left in production code
 * - TypeScript `any` type usage
 * - disabled lint rules (eslint-disable)
 * - deeply nested code (callback hell / arrow pyramids)
 * - god files (high import count — doing too much)
 * 
 * usage:
 *   arc debt                    # all projects
 *   arc debt anivia             # single project
 *   arc debt --type todos       # only TODOs/FIXMEs
 *   arc debt --type large       # only large files
 *   arc debt --type any         # only TS `any` usage
 *   arc debt --type console     # only console.log debris
 *   arc debt --type lint        # only disabled lint rules
 *   arc debt --type nesting     # only deep nesting
 *   arc debt --type imports     # only god files
 *   arc debt --severity high    # filter by severity
 *   arc debt --top 20           # top N items
 *   arc debt --trend            # compare to last scan
 *   arc debt --short            # compact summary
 *   arc debt --json             # machine-readable
 */

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, extname, basename, relative, dirname } from 'path';

const ROOT = process.env.CLAWD_ROOT || process.cwd();

// ── args ──
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const isShort = flags.has('--short');
const isJson = flags.has('--json');
const isTrend = flags.has('--trend');

const typeFlag = args.find((_, i) => args[i - 1] === '--type');
const sevFlag = args.find((_, i) => args[i - 1] === '--severity');
const topFlag = args.find((_, i) => args[i - 1] === '--top');
const TOP_N = parseInt(topFlag) || 15;

// values that follow flags — not project names
const flagValues = new Set([typeFlag, sevFlag, topFlag].filter(Boolean));
const projectFilter = positional.find(p => !flagValues.has(p)) || null;

// ── project aliases ──
const ALIASES = {
  mundo: 'tuner',
  cm: 'context-memory',
  vsite: 'ventok-site',
};

// ── colors ──
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bg_red: '\x1b[41m',
  bg_yellow: '\x1b[43m',
  bg_green: '\x1b[42m',
};

// ── code extensions ──
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.scss', '.vue', '.svelte',
]);

const TS_EXTS = new Set(['.ts', '.tsx']);

// ── skip patterns ──
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build', '.turbo',
  '.vercel', 'coverage', '.cache', '__pycache__', '.svelte-kit',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'design-spec.json',
]);

// ── debt item types ──
const DEBT_TYPES = {
  todo: { label: 'TODO/FIXME', icon: '📌', severity: 'low' },
  hack: { label: 'HACK/XXX', icon: '⚠️', severity: 'medium' },
  large_file: { label: 'Large file', icon: '📄', severity: 'medium' },
  console: { label: 'console.log', icon: '🔍', severity: 'low' },
  any_type: { label: 'TS any', icon: '🔓', severity: 'medium' },
  lint_disable: { label: 'lint disable', icon: '🚫', severity: 'medium' },
  deep_nesting: { label: 'deep nesting', icon: '🪆', severity: 'high' },
  god_file: { label: 'god file', icon: '👑', severity: 'high' },
};

// ── discover repos ──
function discoverRepos() {
  const repos = [];

  if (existsSync(join(ROOT, '.git'))) {
    repos.push({ name: 'clawd', path: ROOT, isRoot: true });
  }

  const projDir = join(ROOT, 'projects');
  if (existsSync(projDir)) {
    for (const d of readdirSync(projDir)) {
      const full = join(projDir, d);
      try {
        if (statSync(full).isDirectory() && existsSync(join(full, '.git'))) {
          repos.push({ name: d, path: full, isRoot: false });
        }
      } catch {}
    }
  }

  for (const d of readdirSync(ROOT)) {
    if (d === 'projects' || d === 'node_modules' || d === '.git') continue;
    const full = join(ROOT, d);
    try {
      if (statSync(full).isDirectory() && existsSync(join(full, '.git'))) {
        repos.push({ name: d, path: full, isRoot: false });
      }
    } catch {}
  }

  return repos;
}

// ── walk files ──
function walkFiles(dir, files = [], depth = 0, isRoot = false) {
  if (depth > 10) return files;
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      if (SKIP_FILES.has(entry)) continue;

      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          // skip projects/ subdirectory in root repo — those are scanned as separate repos
          if (isRoot && entry === 'projects') continue;
          walkFiles(full, files, depth + 1);
        } else if (stat.isFile() && CODE_EXTS.has(extname(entry))) {
          files.push(full);
        }
      } catch {}
    }
  } catch {}
  return files;
}

// ── analyze a single file ──
function analyzeFile(filePath, repoPath, repoName) {
  const items = [];
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return items;
  }

  const lines = content.split('\n');
  const relPath = relative(repoPath, filePath);
  const ext = extname(filePath);
  const isTS = TS_EXTS.has(ext);
  const isTest = relPath.includes('test') || relPath.includes('spec') || relPath.includes('__tests__');

  // skip test files and CLI scripts for console.log checks
  const isCLIScript = relPath.endsWith('.mjs') || relPath.startsWith('scripts/');
  const skipConsoleCheck = isTest || isCLIScript;

  // count code lines (non-empty, non-comment)
  let codeLines = 0;
  let maxNesting = 0;
  let currentNesting = 0;
  let importCount = 0;
  let deepNestLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      // still check for TODOs in comments
    } else {
      codeLines++;
    }

    // ── TODO / FIXME / HACK / XXX (only in comments) ──
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    const todoMatch = isComment && trimmed.match(/\b(TODO|FIXME)\b[:\s]*(.*)/i);
    if (todoMatch) {
      items.push({
        type: 'todo',
        file: relPath,
        project: repoName,
        line: i + 1,
        text: todoMatch[2].trim().slice(0, 80) || todoMatch[1],
        severity: 'low',
      });
    }

    const hackMatch = isComment && trimmed.match(/\b(HACK|XXX|WORKAROUND)\b[:\s]*(.*)/i);
    if (hackMatch) {
      items.push({
        type: 'hack',
        file: relPath,
        project: repoName,
        line: i + 1,
        text: hackMatch[2].trim().slice(0, 80) || hackMatch[1],
        severity: 'medium',
      });
    }

    // ── console.log / console.debug ──
    if (!skipConsoleCheck && /\bconsole\.(log|debug|info)\b/.test(trimmed) && !trimmed.startsWith('//')) {
      items.push({
        type: 'console',
        file: relPath,
        project: repoName,
        line: i + 1,
        text: trimmed.slice(0, 80),
        severity: 'low',
      });
    }

    // ── TypeScript `any` type ──
    if (isTS && /:\s*any\b/.test(trimmed) && !trimmed.startsWith('//')) {
      items.push({
        type: 'any_type',
        file: relPath,
        project: repoName,
        line: i + 1,
        text: trimmed.trim().slice(0, 80),
        severity: 'medium',
      });
    }

    // ── eslint-disable ──
    if (/eslint-disable/.test(trimmed)) {
      items.push({
        type: 'lint_disable',
        file: relPath,
        project: repoName,
        line: i + 1,
        text: trimmed.trim().slice(0, 80),
        severity: 'medium',
      });
    }

    // ── nesting depth tracking ──
    const opens = (trimmed.match(/[{(]/g) || []).length;
    const closes = (trimmed.match(/[})]/g) || []).length;
    currentNesting += opens - closes;
    if (currentNesting < 0) currentNesting = 0;
    if (currentNesting > maxNesting) maxNesting = currentNesting;
    if (currentNesting >= 5) {
      deepNestLines.push(i + 1);
    }

    // ── import count ──
    if (/^import\s/.test(trimmed) || /require\(/.test(trimmed)) {
      importCount++;
    }
  }

  // ── large file ──
  if (codeLines > 300) {
    items.push({
      type: 'large_file',
      file: relPath,
      project: repoName,
      line: 0,
      text: `${codeLines} code lines`,
      severity: codeLines > 600 ? 'high' : 'medium',
      metric: codeLines,
    });
  }

  // ── deep nesting ──
  if (maxNesting >= 5) {
    items.push({
      type: 'deep_nesting',
      file: relPath,
      project: repoName,
      line: deepNestLines[0] || 0,
      text: `max depth ${maxNesting}, ${deepNestLines.length} deep lines`,
      severity: maxNesting >= 7 ? 'high' : 'medium',
      metric: maxNesting,
    });
  }

  // ── god file (high imports) ──
  if (importCount >= 15) {
    items.push({
      type: 'god_file',
      file: relPath,
      project: repoName,
      line: 0,
      text: `${importCount} imports — doing too much?`,
      severity: importCount >= 25 ? 'high' : 'medium',
      metric: importCount,
    });
  }

  return items;
}

// ── severity helpers ──
const SEV_ORDER = { high: 3, medium: 2, low: 1 };
const SEV_COLOR = { high: c.red, medium: c.yellow, low: c.dim };
const SEV_LABEL = { high: 'HIGH', medium: 'MED ', low: 'LOW ' };

// ── bar helper ──
function bar(value, max, width = 20) {
  const filled = Math.round((value / Math.max(max, 1)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ── debt score (0-100, lower = more debt) ──
// uses debt density (weighted items per file) rather than raw totals
// so a large clean project scores higher than a small dirty one
function debtScore(items, fileCount = 0) {
  if (items.length === 0) return 100;
  let weight = 0;
  for (const item of items) {
    weight += SEV_ORDER[item.severity] || 1;
  }
  // density = weighted debt per file (capped at 100 files minimum to avoid division noise)
  const effectiveFiles = Math.max(fileCount || items.length, 10);
  const density = weight / effectiveFiles;
  // score: 100 at density 0, ~50 at density 1.5, ~20 at density 3, ~0 at density 5+
  const score = Math.max(0, Math.round(100 * Math.exp(-density / 2)));
  return score;
}

// ── snapshot path ──
const SNAPSHOT_PATH = join(ROOT, 'memory', 'debt-snapshot.json');

function saveSnapshot(summary) {
  try {
    const snapshots = [];
    if (existsSync(SNAPSHOT_PATH)) {
      const existing = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
      if (Array.isArray(existing)) snapshots.push(...existing);
    }
    snapshots.push({
      date: new Date().toISOString().split('T')[0],
      total: summary.total,
      byType: summary.byType,
      bySeverity: summary.bySeverity,
      score: summary.score,
    });
    // keep last 30
    while (snapshots.length > 30) snapshots.shift();
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshots, null, 2));
  } catch {}
}

function loadSnapshots() {
  try {
    if (existsSync(SNAPSHOT_PATH)) {
      return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

// ══════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════

const repos = discoverRepos();
const resolvedFilter = projectFilter ? (ALIASES[projectFilter] || projectFilter) : null;

const targetRepos = resolvedFilter
  ? repos.filter(r => r.name === resolvedFilter)
  : repos;

if (resolvedFilter && targetRepos.length === 0) {
  console.log(`project not found: ${projectFilter}`);
  console.log(`available: ${repos.map(r => r.name).join(', ')}`);
  process.exit(1);
}

// ── scan all files ──
let allItems = [];
let totalFiles = 0;
const projectStats = {};

for (const repo of targetRepos) {
  const files = walkFiles(repo.path, [], 0, repo.isRoot);
  totalFiles += files.length;
  const repoItems = [];

  for (const f of files) {
    const items = analyzeFile(f, repo.path, repo.name);
    repoItems.push(...items);
  }

  allItems.push(...repoItems);
  projectStats[repo.name] = {
    files: files.length,
    items: repoItems.length,
    byType: {},
    bySeverity: { high: 0, medium: 0, low: 0 },
  };

  for (const item of repoItems) {
    projectStats[repo.name].byType[item.type] = (projectStats[repo.name].byType[item.type] || 0) + 1;
    projectStats[repo.name].bySeverity[item.severity]++;
  }
}

// ── filter by type ──
const TYPE_MAP = {
  todos: ['todo'],
  todo: ['todo'],
  hacks: ['hack'],
  hack: ['hack'],
  large: ['large_file'],
  console: ['console'],
  any: ['any_type'],
  lint: ['lint_disable'],
  nesting: ['deep_nesting'],
  imports: ['god_file'],
  god: ['god_file'],
};

if (typeFlag && TYPE_MAP[typeFlag]) {
  const allowedTypes = new Set(TYPE_MAP[typeFlag]);
  allItems = allItems.filter(i => allowedTypes.has(i.type));
}

// ── filter by severity ──
if (sevFlag && SEV_ORDER[sevFlag]) {
  const minSev = SEV_ORDER[sevFlag];
  allItems = allItems.filter(i => (SEV_ORDER[i.severity] || 0) >= minSev);
}

// ── sort: severity desc, then type, then file ──
allItems.sort((a, b) => {
  const sd = (SEV_ORDER[b.severity] || 0) - (SEV_ORDER[a.severity] || 0);
  if (sd !== 0) return sd;
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.file.localeCompare(b.file);
});

// ── summary stats ──
const summary = {
  total: allItems.length,
  files: totalFiles,
  projects: targetRepos.length,
  score: debtScore(allItems, totalFiles),
  byType: {},
  bySeverity: { high: 0, medium: 0, low: 0 },
  byProject: projectStats,
};

for (const item of allItems) {
  summary.byType[item.type] = (summary.byType[item.type] || 0) + 1;
  summary.bySeverity[item.severity]++;
}

// ── save snapshot ──
saveSnapshot(summary);

// ══════════════════════════════════════════════════
//  OUTPUT
// ══════════════════════════════════════════════════

if (isJson) {
  console.log(JSON.stringify({ summary, items: allItems.slice(0, TOP_N * 3) }, null, 2));
  process.exit(0);
}

if (isShort) {
  const scoreColor = summary.score >= 70 ? c.green : summary.score >= 40 ? c.yellow : c.red;
  console.log(
    `${c.bold}debt${c.reset} ${scoreColor}${summary.score}/100${c.reset} — ` +
    `${summary.total} items (${c.red}${summary.bySeverity.high} high${c.reset}, ` +
    `${c.yellow}${summary.bySeverity.medium} med${c.reset}, ` +
    `${c.dim}${summary.bySeverity.low} low${c.reset}) across ` +
    `${totalFiles} files in ${targetRepos.length} projects`
  );
  process.exit(0);
}

// ── full output ──
console.log();
console.log(`${c.bold}  ╔══════════════════════════════════════╗${c.reset}`);
console.log(`${c.bold}  ║     TECHNICAL DEBT SCANNER          ║${c.reset}`);
console.log(`${c.bold}  ╚══════════════════════════════════════╝${c.reset}`);
console.log();

// ── score ──
const scoreColor = summary.score >= 70 ? c.green : summary.score >= 40 ? c.yellow : c.red;
const scoreBar = bar(summary.score, 100, 25);
console.log(`  ${c.bold}Debt Score:${c.reset} ${scoreColor}${summary.score}/100${c.reset}  ${scoreColor}${scoreBar}${c.reset}`);
console.log(`  ${c.dim}(100 = pristine, 0 = drowning in debt)${c.reset}`);
console.log();

// ── breakdown by type ──
console.log(`  ${c.bold}By Type${c.reset}`);
const typeEntries = Object.entries(summary.byType).sort((a, b) => b[1] - a[1]);
const maxTypeCount = Math.max(...typeEntries.map(e => e[1]), 1);

for (const [type, count] of typeEntries) {
  const info = DEBT_TYPES[type] || { label: type, icon: '?', severity: 'low' };
  const typeBar = bar(count, maxTypeCount, 15);
  console.log(`    ${info.icon} ${info.label.padEnd(16)} ${String(count).padStart(4)}  ${c.dim}${typeBar}${c.reset}`);
}
console.log();

// ── breakdown by severity ──
console.log(`  ${c.bold}By Severity${c.reset}`);
const sevTotal = summary.bySeverity.high + summary.bySeverity.medium + summary.bySeverity.low;
if (sevTotal > 0) {
  const hPct = Math.round((summary.bySeverity.high / sevTotal) * 100);
  const mPct = Math.round((summary.bySeverity.medium / sevTotal) * 100);
  const lPct = Math.round((summary.bySeverity.low / sevTotal) * 100);
  console.log(`    ${c.red}HIGH   ${String(summary.bySeverity.high).padStart(4)}  (${hPct}%)${c.reset}`);
  console.log(`    ${c.yellow}MEDIUM ${String(summary.bySeverity.medium).padStart(4)}  (${mPct}%)${c.reset}`);
  console.log(`    ${c.dim}LOW    ${String(summary.bySeverity.low).padStart(4)}  (${lPct}%)${c.reset}`);
}
console.log();

// ── per project ──
if (targetRepos.length > 1) {
  console.log(`  ${c.bold}By Project${c.reset}`);
  const projEntries = Object.entries(projectStats)
    .filter(([, s]) => s.items > 0)
    .sort((a, b) => b[1].items - a[1].items);
  const maxProjItems = Math.max(...projEntries.map(e => e[1].items), 1);

  for (const [name, stats] of projEntries) {
    const projBar = bar(stats.items, maxProjItems, 15);
    const projScore = debtScore(allItems.filter(i => i.project === name), stats.files);
    const psColor = projScore >= 70 ? c.green : projScore >= 40 ? c.yellow : c.red;
    console.log(
      `    ${c.cyan}${name.padEnd(20)}${c.reset} ${String(stats.items).padStart(4)} items  ` +
      `${psColor}${projScore}/100${c.reset}  ${c.dim}${projBar}${c.reset}`
    );
    // top debt types for this project
    const topTypes = Object.entries(stats.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, n]) => `${(DEBT_TYPES[t] || {}).label || t}(${n})`)
      .join(', ');
    if (topTypes) {
      console.log(`    ${' '.repeat(20)} ${c.dim}${topTypes}${c.reset}`);
    }
  }
  console.log();
}

// ── top items ──
console.log(`  ${c.bold}Top ${TOP_N} Debt Items${c.reset}`);
console.log(`  ${c.dim}${'─'.repeat(70)}${c.reset}`);

const displayItems = allItems.slice(0, TOP_N);
for (const item of displayItems) {
  const info = DEBT_TYPES[item.type] || { label: item.type, icon: '?' };
  const sevCol = SEV_COLOR[item.severity] || c.dim;
  const lineStr = item.line > 0 ? `:${item.line}` : '';
  console.log(
    `  ${sevCol}${SEV_LABEL[item.severity]}${c.reset} ${info.icon} ` +
    `${c.cyan}${item.project}/${c.reset}${item.file}${c.dim}${lineStr}${c.reset}`
  );
  console.log(`       ${c.dim}${item.text}${c.reset}`);
}

if (allItems.length > TOP_N) {
  console.log(`  ${c.dim}... and ${allItems.length - TOP_N} more (use --top ${allItems.length} to see all)${c.reset}`);
}
console.log();

// ── trend ──
if (isTrend) {
  const snapshots = loadSnapshots();
  if (snapshots.length >= 2) {
    console.log(`  ${c.bold}Trend (last ${Math.min(snapshots.length, 10)} scans)${c.reset}`);

    const recent = snapshots.slice(-10);
    const maxTotal = Math.max(...recent.map(s => s.total), 1);

    for (const snap of recent) {
      const snapColor = snap.score >= 70 ? c.green : snap.score >= 40 ? c.yellow : c.red;
      const snapBar = bar(snap.total, maxTotal, 15);
      console.log(
        `    ${c.dim}${snap.date}${c.reset}  ${snapColor}${String(snap.score).padStart(3)}/100${c.reset}  ` +
        `${String(snap.total).padStart(4)} items  ${c.dim}${snapBar}${c.reset}`
      );
    }

    // delta from previous
    const prev = snapshots[snapshots.length - 2];
    const curr = snapshots[snapshots.length - 1];
    const delta = curr.total - prev.total;
    const deltaScore = curr.score - prev.score;
    const deltaSign = delta > 0 ? '+' : '';
    const scoreSign = deltaScore > 0 ? '+' : '';
    const deltaColor = delta > 0 ? c.red : delta < 0 ? c.green : c.dim;
    const scoreChangeColor = deltaScore > 0 ? c.green : deltaScore < 0 ? c.red : c.dim;
    console.log();
    console.log(
      `    ${c.bold}Change:${c.reset} ` +
      `${deltaColor}${deltaSign}${delta} items${c.reset}, ` +
      `${scoreChangeColor}${scoreSign}${deltaScore} score${c.reset}`
    );
    console.log();
  } else {
    console.log(`  ${c.dim}Not enough snapshots for trend. Run again tomorrow.${c.reset}`);
    console.log();
  }
}

// ── hottest files (files with most debt items) ──
const fileDebt = {};
for (const item of allItems) {
  const key = `${item.project}/${item.file}`;
  if (!fileDebt[key]) fileDebt[key] = { items: [], weight: 0 };
  fileDebt[key].items.push(item);
  fileDebt[key].weight += SEV_ORDER[item.severity] || 1;
}

const topFiles = Object.entries(fileDebt)
  .sort((a, b) => b[1].weight - a[1].weight)
  .slice(0, 5);

if (topFiles.length > 0) {
  console.log(`  ${c.bold}Debt Hotspots${c.reset} ${c.dim}(files with most accumulated debt)${c.reset}`);
  for (const [file, data] of topFiles) {
    const types = {};
    for (const i of data.items) types[i.type] = (types[i.type] || 0) + 1;
    const typeStr = Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${(DEBT_TYPES[t] || {}).label || t}×${n}`)
      .join(', ');
    console.log(`    ${c.cyan}${file}${c.reset}  ${c.dim}weight ${data.weight} — ${typeStr}${c.reset}`);
  }
  console.log();
}

// ── recommendations ──
const recs = [];
if (summary.bySeverity.high > 0) {
  recs.push(`${c.red}${summary.bySeverity.high} high-severity items${c.reset} — address deep nesting and god files first`);
}
if ((summary.byType.console || 0) > 10) {
  recs.push(`${summary.byType.console} console.log statements — sweep with grep and remove debug logging`);
}
if ((summary.byType.any_type || 0) > 5) {
  recs.push(`${summary.byType.any_type} TypeScript \`any\` types — add proper typing to reduce runtime surprises`);
}
if ((summary.byType.large_file || 0) > 3) {
  recs.push(`${summary.byType.large_file} large files (>300 LOC) — consider splitting or extracting modules`);
}
if ((summary.byType.todo || 0) > 20) {
  recs.push(`${summary.byType.todo} TODOs — review and resolve or delete stale ones`);
}
if ((summary.byType.hack || 0) > 0) {
  recs.push(`${summary.byType.hack} HACK/XXX markers — these are known shortcuts worth revisiting`);
}

if (recs.length > 0) {
  console.log(`  ${c.bold}Recommendations${c.reset}`);
  for (const rec of recs) {
    console.log(`    → ${rec}`);
  }
  console.log();
}

// ── footer ──
console.log(`  ${c.dim}scanned ${totalFiles} files across ${targetRepos.length} projects${c.reset}`);
console.log(`  ${c.dim}run with --trend to track changes over time${c.reset}`);
console.log();

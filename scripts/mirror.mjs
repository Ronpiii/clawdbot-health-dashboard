#!/usr/bin/env node
/**
 * arc mirror — cross-reference integrity checker
 * 
 * Scans workspace docs for references that no longer resolve:
 * - File paths mentioned in markdown that don't exist
 * - Projects referenced that aren't in projects/ or have no package.json
 * - Arc commands mentioned that aren't in the router
 * - URLs that return errors (optional, with --urls flag)
 * - Tasks referencing deleted/moved items
 * - Memory files referencing dates with no daily log
 * 
 * Usage:
 *   node scripts/mirror.mjs [--urls] [--fix] [--short] [--json]
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, dirname, basename } from 'path';

const ROOT = process.env.WORKSPACE || join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const checkUrls = args.includes('--urls');
const fixMode = args.includes('--fix');
const shortMode = args.includes('--short');
const jsonMode = args.includes('--json');

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
};

// ── Known entities ──────────────────────────────────────────

// Discover actual arc commands from the router
function getArcCommands() {
  try {
    const arcFile = readFileSync(join(ROOT, 'scripts/arc'), 'utf8');
    const scriptBlock = arcFile.match(/const SCRIPTS\s*=\s*\{([^}]+)\}/s);
    if (!scriptBlock) return new Set();
    const keys = [...scriptBlock[1].matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1]);
    return new Set(keys);
  } catch { return new Set(); }
}

// Discover actual projects
function getProjects() {
  const projects = new Set();
  const projectsDir = join(ROOT, 'projects');
  if (existsSync(projectsDir)) {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) projects.add(entry.name);
    }
  }
  // also check root-level dirs with package.json or .git
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (['node_modules', '.git', 'scripts', 'memory', 'learnings', 'tasks', 'projects', 'writing'].includes(entry.name)) continue;
    const full = join(ROOT, entry.name);
    if (existsSync(join(full, 'package.json')) || existsSync(join(full, '.git'))) {
      projects.add(entry.name);
    }
  }
  return projects;
}

// Discover daily log dates
function getLogDates() {
  const dates = new Set();
  const memDir = join(ROOT, 'memory');
  if (!existsSync(memDir)) return dates;
  for (const f of readdirSync(memDir)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (m) dates.add(m[1]);
  }
  return dates;
}

// Discover script files
function getScriptFiles() {
  const scripts = new Set();
  const scriptsDir = join(ROOT, 'scripts');
  if (!existsSync(scriptsDir)) return scripts;
  for (const f of readdirSync(scriptsDir)) {
    scripts.add(f);
  }
  return scripts;
}

// ── Markdown file scanner ───────────────────────────────────

function findMarkdownFiles(dir, depth = 0, maxDepth = 3) {
  const files = [];
  if (depth > maxDepth) return files;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findMarkdownFiles(full, depth + 1, maxDepth));
      } else if (entry.name.endsWith('.md')) {
        files.push(full);
      }
    }
  } catch { /* permission errors */ }
  return files;
}

// ── Reference extraction ────────────────────────────────────

function extractReferences(content, filePath) {
  const refs = [];
  const lines = content.split('\n');
  const relDir = dirname(filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 1. File path references: backticked paths or markdown links to local files
    //    ONLY match paths that start with known workspace directories:
    //    scripts/, memory/, tasks/, learnings/, projects/, writing/, research/, prompts/, hooks/, ideas/
    //    Also match explicit file refs like `MEMORY.md`, `AGENTS.md` etc.
    const workspaceDirs = ['scripts/', 'memory/', 'tasks/', 'learnings/', 'projects/', 'writing/', 'research/', 'prompts/', 'hooks/', 'ideas/'];
    const topLevelFiles = /^[A-Z][A-Z_-]+\.md$/; // MEMORY.md, AGENTS.md, etc.

    const pathPatterns = [
      /`([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6})`/g,                // `path/to/file.ext`
      /`([a-zA-Z0-9_/-]+\/[a-zA-Z0-9_./-]+)`/g,              // `dir/subdir/thing`
      /\]\((?!http)([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6})\)/g,    // [text](local/file.md)
    ];
    
    for (const pat of pathPatterns) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(line)) !== null) {
        const ref = m[1];
        // Skip obvious non-paths
        if (ref.includes('...') || ref.startsWith('http') || ref.startsWith('//')) continue;
        if (/^\d+\.\d+\.\d+/.test(ref)) continue; // version numbers like 3.77.0
        if (ref.includes('@') && !ref.includes('/')) continue; // email-like
        // Skip code/regex/data patterns
        if (/^[a-z]+\.(test|match|exec|replace|split|join|map|filter|reduce|forEach)\b/.test(ref)) continue;
        if (/\.(com|org|net|io|co|eu|app|dev)$/.test(ref) && !ref.includes('/')) continue; // domains
        // Skip template paths with variables
        if (ref.includes('YYYY') || ref.includes('{') || ref.includes('<') || ref.includes('$')) continue;
        // Skip API routes (start with /)
        if (ref.startsWith('/')) continue;
        // Skip source-relative paths (src/, app/, lib/, components/) — these are project-internal
        if (/^(src|app|lib|components|pages|public|utils|hooks|services|middleware|next)\//.test(ref)) continue;
        // Skip CSS/font module paths
        if (ref.startsWith('next/')) continue;
        // Skip tailwind utility class patterns
        if (/^rounded-/.test(ref)) continue;

        // Must be a workspace-level path OR a top-level file
        const isWorkspacePath = workspaceDirs.some(d => ref.startsWith(d));
        const isTopLevel = topLevelFiles.test(ref);
        const isExplicitFile = ref.includes('/') && ref.match(/\.(md|mjs|js|ts|json|sh)$/);

        if (!isWorkspacePath && !isTopLevel && !isExplicitFile) continue;

        refs.push({
          type: 'file',
          value: ref,
          line: lineNum,
          context: line.trim().slice(0, 120),
        });
      }
    }

    // 2. Arc command references: only backtick-enclosed `arc <command>` patterns
    //    Must be in backticks or in a code block to count — prevents matching prose
    const arcPat = /`arc\s+(\w+)/g;
    let am;
    while ((am = arcPat.exec(line)) !== null) {
      const cmd = am[1];
      refs.push({
        type: 'arc_command',
        value: cmd,
        line: lineNum,
        context: line.trim().slice(0, 120),
      });
    }

    // 3. Project references: only explicit `--project <name>` flags or `arc <cmd> <project>` in backticks
    //    Very strict — only match when it's clearly a project argument
    const projPat = /`--project\s+(\w[\w-]*)/g;
    let pm;
    while ((pm = projPat.exec(line)) !== null) {
      const proj = pm[1].toLowerCase();
      refs.push({
        type: 'project',
        value: proj,
        line: lineNum,
        context: line.trim().slice(0, 120),
      });
    }

    // 4. Date references — only match explicit `memory/YYYY-MM-DD.md` patterns
    //    General dates are too noisy (commit dates, CLI flags, etc.)
    const dateFilePat = /memory\/(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\.md/g;
    let dm;
    while ((dm = dateFilePat.exec(line)) !== null) {
      refs.push({
        type: 'date',
        value: dm[1],
        line: lineNum,
        context: line.trim().slice(0, 120),
      });
    }

    // 5. Script file references: `scripts/foo.mjs` or `node scripts/foo.mjs`
    const scriptPat = /(?:scripts\/|node\s+scripts\/)([a-zA-Z0-9_-]+\.mjs)/g;
    let sm;
    while ((sm = scriptPat.exec(line)) !== null) {
      refs.push({
        type: 'script',
        value: sm[1],
        line: lineNum,
        context: line.trim().slice(0, 120),
      });
    }

    // 6. URL references (only if --urls flag)
    if (checkUrls) {
      const urlPat = /https?:\/\/[^\s\)\]>"`,]+/g;
      let um;
      while ((um = urlPat.exec(line)) !== null) {
        refs.push({
          type: 'url',
          value: um[0].replace(/[.)]+$/, ''), // strip trailing punctuation
          line: lineNum,
          context: line.trim().slice(0, 120),
        });
      }
    }
  }

  return refs;
}

// ── Validation ──────────────────────────────────────────────

function validateFileRef(ref, sourceFile) {
  const val = ref.value;
  
  // Try absolute from workspace root
  if (existsSync(join(ROOT, val))) return { valid: true };
  
  // Try relative to source file
  const relPath = join(dirname(sourceFile), val);
  if (existsSync(relPath)) return { valid: true };
  
  // Try projects/ prefix
  if (existsSync(join(ROOT, 'projects', val))) return { valid: true };
  
  // Skip template/example paths
  if (val.includes('<') || val.includes('{') || val.includes('$')) return { valid: true, reason: 'template' };
  
  // Skip paths that are clearly code patterns, not real files  
  if (val.includes('_blocks_') || val.includes('_pages_v_')) return { valid: true, reason: 'db_table' };

  // Skip well-known template references that are intentionally non-existent
  const base = basename(val);
  if (['BOOTSTRAP.md', 'SKILL.md'].includes(base)) return { valid: true, reason: 'template_ref' };
  
  return { valid: false, suggestion: findClosest(val) };
}

function findClosest(path) {
  // Simple closest-match: check if a similar file exists
  const base = basename(path);
  const dir = dirname(path);
  
  // Check if directory exists with different file
  const checkDir = join(ROOT, dir);
  if (existsSync(checkDir)) {
    try {
      const files = readdirSync(checkDir);
      const similar = files.find(f => f.toLowerCase() === base.toLowerCase() || 
                                       f.replace(/[-_]/g, '') === base.replace(/[-_]/g, ''));
      if (similar) return join(dir, similar);
    } catch { /* ignore */ }
  }
  
  return null;
}

function validateArcCommand(ref, arcCommands) {
  if (arcCommands.has(ref.value)) return { valid: true };
  
  // Check aliases
  const aliases = {
    'codereview': 'review', 'cr': 'review',
    'snippets': 'snip', 'snippet': 'snip',
    'envs': 'env', 'palette': 'colors',
    'ping': 'pulse', 'uptime': 'pulse',
    'wisdom': 'fortune', 'momentum': 'orbit',
    'agenda': 'plan', 'vs': 'compare',
    'hot': 'hotspots', 'churn': 'hotspots',
    'loc': 'size', 'lines': 'size',
    'hours': 'time', 'timesheet': 'time',
    'journal': 'log', 'diary': 'log',
    'topology': 'map', 'graph': 'map',
    'repos': 'git', 'ctx': 'context',
    'tidy': 'clean', 'sweep': 'clean',
    'pipe': 'pipeline', 'sales': 'pipeline',
    'changes': 'diff',
  };
  
  if (aliases[ref.value] && arcCommands.has(aliases[ref.value])) return { valid: true };
  
  // Could be a subcommand (e.g., "arc task list")
  if (['list', 'add', 'done', 'start', 'block', 'save', 'get', 'delete', 'tag', 'count', 'summary'].includes(ref.value)) {
    return { valid: true, reason: 'subcommand' };
  }
  
  return { valid: false };
}

function validateProject(ref, projects) {
  const val = ref.value.toLowerCase();
  if (projects.has(val)) return { valid: true };
  
  // Check aliases
  const aliases = {
    'mundo': 'tuner',
    'cm': 'context-memory',
    'vsite': 'ventok-site',
    'discord': 'discord-voice-bot',
  };
  
  if (aliases[val] && projects.has(aliases[val])) return { valid: true };
  
  // Partial match
  for (const p of projects) {
    if (p.includes(val) || val.includes(p)) return { valid: true };
  }
  
  return { valid: false };
}

function validateDate(ref, logDates) {
  const date = ref.value;
  // Future dates are fine (they might not have logs yet)
  const today = new Date().toISOString().slice(0, 10);
  if (date >= today) return { valid: true, reason: 'future' };
  
  // Only flag if the date is old enough to definitely have been logged
  // and we're in a context that expects a log file
  if (logDates.has(date)) return { valid: true };
  
  return { valid: false, note: 'no daily log for this date' };
}

function validateScript(ref, scriptFiles) {
  if (scriptFiles.has(ref.value)) return { valid: true };
  return { valid: false };
}

function shouldSkipUrl(url) {
  // Skip localhost/dev URLs
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(url)) return true;
  // Skip placeholder/example domains
  if (/\b(example\.com|your-instance\.com|custom\.url|placeholder)\b/i.test(url)) return true;
  // Skip URLs with template variables
  if (/\[|{|\$|</.test(url)) return true;
  // Skip truncated URLs
  if (url.length < 12) return true;
  return false;
}

async function validateUrl(ref) {
  if (shouldSkipUrl(ref.value)) return { valid: true, reason: 'skipped' };
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(ref.value, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'arc-mirror/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    // 429 = rate limited = site is alive
    if (res.ok || res.status === 405 || res.status === 429) return { valid: true, status: res.status };
    // Try GET for servers that don't support HEAD
    if (res.status >= 400) {
      const res2 = await fetch(ref.value, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'arc-mirror/1.0' },
        redirect: 'follow',
      });
      if (res2.ok || res2.status === 429) return { valid: true, status: res2.status };
      return { valid: false, status: res2.status };
    }
    return { valid: false, status: res.status };
  } catch (e) {
    return { valid: false, error: e.code || e.message || 'network error' };
  }
}

// ── Severity ────────────────────────────────────────────────

function getSeverity(broken) {
  if (broken.type === 'url') return 'medium';
  if (broken.type === 'script') return 'high';
  if (broken.type === 'arc_command') return 'medium';
  if (broken.type === 'file') {
    // Higher severity for files referenced in active docs
    if (broken.source.includes('tasks/active') || broken.source.includes('MEMORY.md')) return 'high';
    return 'medium';
  }
  if (broken.type === 'date') return 'low';
  if (broken.type === 'project') return 'low';
  return 'low';
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  if (!jsonMode) {
    console.log(`${c.bold}arc mirror${c.reset} — cross-reference integrity checker`);
    console.log(`${c.dim}${'─'.repeat(58)}${c.reset}`);
  }

  const arcCommands = getArcCommands();
  const projects = getProjects();
  const logDates = getLogDates();
  const scriptFiles = getScriptFiles();

  if (!jsonMode) {
    console.log(`${c.dim}known: ${arcCommands.size} arc commands, ${projects.size} projects, ${logDates.size} daily logs, ${scriptFiles.size} scripts${c.reset}`);
  }

  const mdFiles = findMarkdownFiles(ROOT);
  // Also check key non-md files
  const keyFiles = ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'MEMORY.md', 'HEARTBEAT.md', 'IDENTITY.md'].map(f => join(ROOT, f));
  const allFiles = [...new Set([...mdFiles, ...keyFiles.filter(existsSync)])];

  if (!jsonMode) {
    console.log(`${c.dim}scanning ${allFiles.length} files...${c.reset}\n`);
  }

  const allRefs = [];
  for (const file of allFiles) {
    try {
      const content = readFileSync(file, 'utf8');
      const relFile = relative(ROOT, file);
      const refs = extractReferences(content, file);
      for (const ref of refs) {
        ref.source = relFile;
      }
      allRefs.push(...refs);
    } catch { /* skip unreadable files */ }
  }

  // Deduplicate refs (same type + value + source = one ref)
  const seen = new Set();
  const uniqueRefs = allRefs.filter(r => {
    const key = `${r.type}:${r.value}:${r.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Validate
  const broken = [];
  const urlRefs = [];

  for (const ref of uniqueRefs) {
    let result;
    switch (ref.type) {
      case 'file':
        result = validateFileRef(ref, join(ROOT, ref.source));
        break;
      case 'arc_command':
        result = validateArcCommand(ref, arcCommands);
        break;
      case 'project':
        result = validateProject(ref, projects);
        break;
      case 'date':
        result = validateDate(ref, logDates);
        break;
      case 'script':
        result = validateScript(ref, scriptFiles);
        break;
      case 'url':
        urlRefs.push(ref);
        continue;
      default:
        continue;
    }

    if (!result.valid) {
      broken.push({
        ...ref,
        severity: getSeverity({ ...ref }),
        suggestion: result.suggestion || null,
        note: result.note || null,
      });
    }
  }

  // Check URLs in parallel (if --urls)
  if (checkUrls && urlRefs.length > 0) {
    if (!jsonMode) {
      console.log(`${c.dim}checking ${urlRefs.length} URLs...${c.reset}`);
    }
    
    // Deduplicate URLs for checking (same URL checked once)
    const urlMap = new Map();
    for (const ref of urlRefs) {
      if (!urlMap.has(ref.value)) urlMap.set(ref.value, []);
      urlMap.get(ref.value).push(ref);
    }
    
    const uniqueUrls = [...urlMap.keys()];
    const batchSize = 5;
    
    for (let i = 0; i < uniqueUrls.length; i += batchSize) {
      const batch = uniqueUrls.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(url => validateUrl({ value: url })));
      
      for (let j = 0; j < batch.length; j++) {
        if (!results[j].valid) {
          const refs = urlMap.get(batch[j]);
          for (const ref of refs) {
            broken.push({
              ...ref,
              severity: 'medium',
              note: results[j].error || `HTTP ${results[j].status}`,
            });
          }
        }
      }
    }
  }

  // ── Report ──────────────────────────────────────────────

  if (jsonMode) {
    const report = {
      scanned: { files: allFiles.length, refs: uniqueRefs.length, urls: urlRefs.length },
      broken: broken.map(b => ({
        type: b.type,
        value: b.value,
        source: b.source,
        line: b.line,
        severity: b.severity,
        suggestion: b.suggestion,
        note: b.note,
      })),
      score: calcScore(broken),
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Group broken refs by type
  const byType = {};
  for (const b of broken) {
    if (!byType[b.type]) byType[b.type] = [];
    byType[b.type].push(b);
  }

  const typeLabels = {
    file: 'broken file paths',
    arc_command: 'unknown arc commands',
    project: 'unknown projects',
    date: 'missing daily logs',
    script: 'missing scripts',
    url: 'dead URLs',
  };

  const severityColors = {
    high: c.red,
    medium: c.yellow,
    low: c.dim,
  };

  const severityIcons = {
    high: '✗',
    medium: '●',
    low: '○',
  };

  if (broken.length === 0) {
    console.log(`${c.green}${c.bold}all references intact${c.reset}`);
    console.log(`${c.dim}checked ${uniqueRefs.length} references across ${allFiles.length} files${c.reset}`);
    if (!checkUrls) {
      console.log(`${c.dim}tip: add --urls to also check external URLs${c.reset}`);
    }
    return;
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };

  for (const [type, items] of Object.entries(byType)) {
    items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    console.log(`${c.bold}${typeLabels[type] || type}${c.reset} ${c.dim}(${items.length})${c.reset}`);
    
    const display = shortMode ? items.slice(0, 3) : items;
    for (const item of display) {
      const sc = severityColors[item.severity] || c.dim;
      const icon = severityIcons[item.severity] || '·';
      console.log(`  ${sc}${icon}${c.reset} ${c.cyan}${item.value}${c.reset}`);
      console.log(`    ${c.dim}${item.source}:${item.line}${c.reset}${item.note ? ` ${c.dim}(${item.note})${c.reset}` : ''}`);
      if (item.suggestion) {
        console.log(`    ${c.green}→ did you mean: ${item.suggestion}?${c.reset}`);
      }
    }
    if (shortMode && items.length > 3) {
      console.log(`  ${c.dim}...and ${items.length - 3} more${c.reset}`);
    }
    console.log();
  }

  // Score
  const score = calcScore(broken);
  const scoreBar = buildBar(score, 40);
  const verdict = score >= 90 ? `${c.green}excellent` :
                  score >= 70 ? `${c.green}good` :
                  score >= 50 ? `${c.yellow}moderate` :
                  score >= 30 ? `${c.yellow}needs attention` :
                  `${c.red}significant rot`;

  console.log(`${c.bold}integrity score:${c.reset} ${scoreBar} ${c.bold}${score}/100${c.reset} ${verdict}${c.reset}`);
  console.log(`${c.dim}${uniqueRefs.length} refs checked across ${allFiles.length} files · ${broken.length} broken${c.reset}`);
  
  const high = broken.filter(b => b.severity === 'high').length;
  const med = broken.filter(b => b.severity === 'medium').length;
  const low = broken.filter(b => b.severity === 'low').length;
  if (high > 0) console.log(`  ${c.red}${high} high severity${c.reset}`);
  if (med > 0) console.log(`  ${c.yellow}${med} medium severity${c.reset}`);
  if (low > 0) console.log(`  ${c.dim}${low} low severity${c.reset}`);

  if (!checkUrls) {
    console.log(`\n${c.dim}tip: add --urls to also check external URLs${c.reset}`);
  }
}

function calcScore(broken) {
  if (broken.length === 0) return 100;
  // Different weights: structural issues (files, scripts) matter more than dead URLs
  const penalty = broken.reduce((sum, b) => {
    if (b.type === 'url') return sum + 1; // URLs are informational
    const weights = { high: 8, medium: 3, low: 1 };
    return sum + (weights[b.severity] || 1);
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function buildBar(score, width) {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = score >= 70 ? c.green : score >= 40 ? c.yellow : c.red;
  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
}

main().catch(e => {
  console.error(`${c.red}error: ${e.message}${c.reset}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * arc hotspots — find the most frequently modified files across all projects
 * 
 * shows where complexity concentrates, which files are "hot" (changed often),
 * which are large but cold (potential dead code), and churn patterns.
 * 
 * usage:
 *   arc hotspots                    # all projects, 30 days
 *   arc hotspots anivia             # single project
 *   arc hotspots --days 7           # last week
 *   arc hotspots --cold             # large files that never change
 *   arc hotspots --coupling         # files that change together (co-change analysis)
 *   arc hotspots --authors          # who touches what
 *   arc hotspots --category         # group by file type
 *   arc hotspots --top 20           # top N hottest files
 *   arc hotspots --short            # compact summary
 *   arc hotspots --json             # machine-readable
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, extname, basename, dirname, relative } from 'path';

const ROOT = process.env.CLAWD_ROOT || join(process.cwd());

// ── args ──
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const isShort = flags.has('--short');
const isJson = flags.has('--json');
const isCold = flags.has('--cold');
const isCoupling = flags.has('--coupling');
const isAuthors = flags.has('--authors');
const isCategory = flags.has('--category');

const daysFlag = args.find((_, i) => args[i - 1] === '--days');
const DAYS = parseInt(daysFlag) || 30;

const topFlag = args.find((_, i) => args[i - 1] === '--top');
const TOP_N = parseInt(topFlag) || 15;

const projectFilter = positional[0] || null;

// ── project aliases ──
const ALIASES = {
  mundo: 'tuner',
  cm: 'context-memory',
  vsite: 'ventok-site',
  discord: 'discord-voice-bot',
};

// ── discover repos ──
function discoverRepos() {
  const repos = [];
  
  // root repo
  if (existsSync(join(ROOT, '.git'))) {
    repos.push({ name: 'clawd', path: ROOT, isRoot: true });
  }
  
  // projects/ subdirs
  const projDir = join(ROOT, 'projects');
  if (existsSync(projDir)) {
    for (const d of readdirSync(projDir)) {
      const full = join(projDir, d);
      if (statSync(full).isDirectory() && existsSync(join(full, '.git'))) {
        repos.push({ name: d, path: full, isRoot: false });
      }
    }
  }
  
  // top-level dirs with .git
  for (const d of readdirSync(ROOT)) {
    if (d === 'projects' || d === 'node_modules' || d === '.git') continue;
    const full = join(ROOT, d);
    if (statSync(full).isDirectory() && existsSync(join(full, '.git'))) {
      repos.push({ name: d, path: full, isRoot: false });
    }
  }
  
  return repos;
}

// ── git helpers ──
function gitLog(repoPath, since, format) {
  try {
    return execSync(
      `git log --since="${since} days ago" --format="${format}" --name-only`,
      { cwd: repoPath, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch { return ''; }
}

function gitLogDetailed(repoPath, since) {
  try {
    return execSync(
      `git log --since="${since} days ago" --format="COMMIT|%H|%an|%at" --name-only`,
      { cwd: repoPath, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch { return ''; }
}

function gitLogNumstat(repoPath, since) {
  try {
    return execSync(
      `git log --since="${since} days ago" --format="COMMIT|%H" --numstat`,
      { cwd: repoPath, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch { return ''; }
}

function getFileSize(repoPath, file) {
  try {
    const full = join(repoPath, file);
    if (existsSync(full)) return statSync(full).size;
  } catch {}
  return 0;
}

function countLines(repoPath, file) {
  try {
    const full = join(repoPath, file);
    if (!existsSync(full)) return 0;
    const content = readFileSync(full, 'utf-8');
    return content.split('\n').length;
  } catch { return 0; }
}

// ── file categories ──
function categorize(file) {
  const ext = extname(file).toLowerCase();
  const name = basename(file).toLowerCase();
  const dir = dirname(file).toLowerCase();
  
  if (name === 'package-lock.json' || name === 'yarn.lock' || name === 'pnpm-lock.yaml') return 'lockfile';
  if (name === 'package.json') return 'config';
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext) || name.startsWith('.')) return 'config';
  if (['.md', '.mdx', '.txt', '.rst'].includes(ext)) return 'docs';
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) return 'styles';
  if (['.test.ts', '.test.tsx', '.test.js', '.spec.ts', '.spec.tsx', '.spec.js'].some(s => file.endsWith(s))) return 'tests';
  if (dir.includes('migration') || dir.includes('seed')) return 'database';
  if (['.tsx', '.jsx'].includes(ext)) return 'component';
  if (['.ts', '.js', '.mjs', '.cjs'].includes(ext)) return 'source';
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp'].includes(ext)) return 'asset';
  return 'other';
}

function categoryIcon(cat) {
  const icons = {
    component: '\x1b[36m◆\x1b[0m',    // cyan
    source: '\x1b[33m●\x1b[0m',        // yellow
    styles: '\x1b[35m◆\x1b[0m',        // magenta
    config: '\x1b[90m●\x1b[0m',        // gray
    docs: '\x1b[34m■\x1b[0m',          // blue
    tests: '\x1b[32m▲\x1b[0m',         // green
    database: '\x1b[31m◆\x1b[0m',      // red
    lockfile: '\x1b[90m○\x1b[0m',      // dim
    asset: '\x1b[90m□\x1b[0m',         // dim
    other: '\x1b[90m·\x1b[0m',         // dim
  };
  return icons[cat] || icons.other;
}

// ── analysis ──
function analyzeHotspots(repos) {
  const allFiles = new Map(); // key: "project/file" → { changes, authors, commits, insertions, deletions, project, file }
  const commitFiles = new Map(); // key: commitHash → [files] (for coupling)
  
  for (const repo of repos) {
    // detailed log for file changes + authors
    const detailed = gitLogDetailed(repo.path, DAYS);
    let currentCommit = null;
    let currentAuthor = null;
    let currentTime = null;
    
    for (const line of detailed.split('\n')) {
      if (line.startsWith('COMMIT|')) {
        const parts = line.split('|');
        currentCommit = parts[1];
        currentAuthor = parts[2];
        currentTime = parseInt(parts[3]) * 1000;
        if (!commitFiles.has(currentCommit)) commitFiles.set(currentCommit, []);
      } else if (line.trim() && currentCommit) {
        const file = line.trim();
        if (file.includes('node_modules/') || file.includes('.git/')) continue;
        
        const key = repo.isRoot ? file : `${repo.name}/${file}`;
        
        if (!allFiles.has(key)) {
          allFiles.set(key, {
            changes: 0,
            authors: new Set(),
            commits: [],
            insertions: 0,
            deletions: 0,
            project: repo.name,
            file: file,
            repoPath: repo.path,
          });
        }
        
        const entry = allFiles.get(key);
        entry.changes++;
        entry.authors.add(currentAuthor);
        entry.commits.push({ hash: currentCommit, author: currentAuthor, time: currentTime });
        commitFiles.get(currentCommit).push(key);
      }
    }
    
    // numstat for insertions/deletions
    const numstat = gitLogNumstat(repo.path, DAYS);
    let numCommit = null;
    
    for (const line of numstat.split('\n')) {
      if (line.startsWith('COMMIT|')) {
        numCommit = line.split('|')[1];
      } else if (line.trim() && numCommit) {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          const ins = parseInt(parts[0]) || 0;
          const del = parseInt(parts[1]) || 0;
          const file = parts[2];
          if (file.includes('node_modules/') || file.includes('.git/')) continue;
          
          const key = repos.length > 1 && !repos.find(r => r.isRoot && r.path === repos[0].path)
            ? `${repo.name}/${file}`
            : (repo.isRoot ? file : `${repo.name}/${file}`);
          
          if (allFiles.has(key)) {
            allFiles.get(key).insertions += ins;
            allFiles.get(key).deletions += del;
          }
        }
      }
    }
  }
  
  return { allFiles, commitFiles };
}

// ── coupling analysis ──
function findCoupling(commitFiles, allFiles, minSupport = 3) {
  const pairs = new Map(); // "fileA|fileB" → count
  
  for (const [hash, files] of commitFiles) {
    // skip commits touching >20 files (likely bulk changes)
    if (files.length > 20 || files.length < 2) continue;
    
    // skip lockfiles and generated files
    const relevant = files.filter(f => {
      const cat = categorize(f);
      return cat !== 'lockfile' && cat !== 'config' && !f.endsWith('.json');
    });
    
    for (let i = 0; i < relevant.length; i++) {
      for (let j = i + 1; j < relevant.length; j++) {
        const pair = [relevant[i], relevant[j]].sort().join('|');
        pairs.set(pair, (pairs.get(pair) || 0) + 1);
      }
    }
  }
  
  return [...pairs.entries()]
    .filter(([, count]) => count >= minSupport)
    .map(([pair, count]) => {
      const [a, b] = pair.split('|');
      const aChanges = allFiles.get(a)?.changes || 0;
      const bChanges = allFiles.get(b)?.changes || 0;
      // coupling strength: co-changes / max(individual changes)
      const strength = count / Math.max(aChanges, bChanges);
      return { fileA: a, fileB: b, coChanges: count, strength };
    })
    .sort((a, b) => b.coChanges - a.coChanges);
}

// ── cold files: large files with zero changes ──
function findColdFiles(repos) {
  const cold = [];
  const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss']);
  
  for (const repo of repos) {
    try {
      // get all tracked files
      const tracked = execSync('git ls-files', {
        cwd: repo.path, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe']
      }).trim().split('\n').filter(Boolean);
      
      // get recently changed files
      const changed = new Set(
        execSync(`git log --since="${DAYS} days ago" --format="" --name-only`, {
          cwd: repo.path, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe']
        }).trim().split('\n').filter(Boolean)
      );
      
      for (const file of tracked) {
        if (file.includes('node_modules/') || file.includes('.git/')) continue;
        const ext = extname(file).toLowerCase();
        if (!CODE_EXTS.has(ext)) continue;
        if (changed.has(file)) continue;
        
        const lines = countLines(repo.path, file);
        if (lines < 50) continue; // only report substantial files
        
        const size = getFileSize(repo.path, file);
        const key = repo.isRoot ? file : `${repo.name}/${file}`;
        
        // get last change date
        let lastChange = null;
        try {
          const ts = execSync(`git log -1 --format="%at" -- "${file}"`, {
            cwd: repo.path, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
          }).trim();
          if (ts) lastChange = parseInt(ts) * 1000;
        } catch {}
        
        cold.push({
          key,
          file,
          project: repo.name,
          lines,
          size,
          lastChange,
          daysSince: lastChange ? Math.floor((Date.now() - lastChange) / 86400000) : null,
        });
      }
    } catch {}
  }
  
  return cold.sort((a, b) => b.lines - a.lines);
}

// ── display helpers ──
function bar(value, max, width = 20) {
  const filled = Math.round((value / max) * width);
  return '\x1b[33m' + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(width - filled) + '\x1b[0m';
}

function heatBar(value, max, width = 15) {
  const ratio = value / max;
  if (ratio > 0.7) return '\x1b[31m' + '█'.repeat(Math.round(ratio * width)) + '\x1b[0m';
  if (ratio > 0.4) return '\x1b[33m' + '█'.repeat(Math.round(ratio * width)) + '\x1b[0m';
  return '\x1b[32m' + '█'.repeat(Math.max(1, Math.round(ratio * width))) + '\x1b[0m';
}

function dim(s) { return `\x1b[90m${s}\x1b[0m`; }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function magenta(s) { return `\x1b[35m${s}\x1b[0m`; }

function truncPath(path, max = 55) {
  if (path.length <= max) return path;
  const parts = path.split('/');
  if (parts.length <= 2) return '...' + path.slice(-(max - 3));
  return parts[0] + '/.../' + parts.slice(-2).join('/');
}

function relativeTime(ts) {
  if (!ts) return 'unknown';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── main ──
function main() {
  let repos = discoverRepos();
  
  // filter by project
  if (projectFilter) {
    const resolved = ALIASES[projectFilter] || projectFilter;
    repos = repos.filter(r => r.name === resolved || r.name.includes(resolved));
    if (repos.length === 0) {
      console.log(`no project matching "${projectFilter}"`);
      process.exit(1);
    }
  }
  
  const { allFiles, commitFiles } = analyzeHotspots(repos);
  
  // sort by change frequency
  const sorted = [...allFiles.entries()]
    .map(([key, data]) => ({ key, ...data, authorCount: data.authors.size }))
    .filter(f => {
      const cat = categorize(f.key);
      return cat !== 'lockfile'; // always exclude lockfiles from hotspot view
    })
    .sort((a, b) => b.changes - a.changes);
  
  const maxChanges = sorted[0]?.changes || 1;
  
  // ── JSON output ──
  if (isJson) {
    const output = {
      period: `${DAYS} days`,
      projects: repos.map(r => r.name),
      hotspots: sorted.slice(0, TOP_N).map(f => ({
        file: f.key,
        changes: f.changes,
        authors: [...f.authors],
        insertions: f.insertions,
        deletions: f.deletions,
        category: categorize(f.key),
        churn: f.insertions + f.deletions,
      })),
    };
    if (isCoupling) {
      output.coupling = findCoupling(commitFiles, allFiles).slice(0, 10);
    }
    if (isCold) {
      output.cold = findColdFiles(repos).slice(0, 15);
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  
  // ── short output ──
  if (isShort) {
    const hottest = sorted[0];
    const totalFiles = sorted.length;
    const avgChanges = totalFiles > 0 ? (sorted.reduce((s, f) => s + f.changes, 0) / totalFiles).toFixed(1) : 0;
    const hotCount = sorted.filter(f => f.changes >= maxChanges * 0.5).length;
    console.log(`${bold('arc hotspots')} ${dim(`(${DAYS}d)`)} — ${totalFiles} files changed, ${hotCount} hot (≥50% of max), avg ${avgChanges} changes. hottest: ${cyan(truncPath(sorted[0]?.key || 'none', 40))} (${sorted[0]?.changes || 0}x)`);
    return;
  }
  
  // ── header ──
  console.log(`\x1b[1marc hotspots\x1b[0m ${dim(`— last ${DAYS} days`)}`);
  console.log(dim('─'.repeat(60)));
  
  if (sorted.length === 0) {
    console.log(dim('no file changes found in the period.'));
    return;
  }
  
  // ── cold files view ──
  if (isCold) {
    const cold = findColdFiles(repos);
    console.log(`\n${bold('cold files')} ${dim('— large code files with zero changes')}\n`);
    
    if (cold.length === 0) {
      console.log(dim('  no substantial cold files found.'));
    } else {
      const maxLines = cold[0]?.lines || 1;
      for (const f of cold.slice(0, TOP_N)) {
        const cat = categorize(f.key);
        const icon = categoryIcon(cat);
        const lineBar = bar(f.lines, maxLines, 10);
        const age = f.daysSince !== null ? dim(`last touched ${relativeTime(f.lastChange)}`) : dim('unknown age');
        console.log(`  ${icon} ${lineBar} ${String(f.lines).padStart(5)} lines  ${truncPath(f.key, 45)}  ${age}`);
      }
      
      const totalColdLines = cold.reduce((s, f) => s + f.lines, 0);
      console.log(`\n${dim(`  ${cold.length} cold files, ${totalColdLines.toLocaleString()} lines total — potential dead code or stable foundations`)}`);
    }
    
    console.log();
    return;
  }
  
  // ── coupling view ──
  if (isCoupling) {
    const couples = findCoupling(commitFiles, allFiles);
    console.log(`\n${bold('coupled files')} ${dim('— files that change together')}\n`);
    
    if (couples.length === 0) {
      console.log(dim('  no significant coupling detected (need ≥3 co-changes).'));
    } else {
      for (const c of couples.slice(0, TOP_N)) {
        const strengthPct = Math.round(c.strength * 100);
        const strengthColor = strengthPct > 70 ? red : strengthPct > 40 ? yellow : green;
        const strengthBar = strengthPct > 70 ? '███' : strengthPct > 40 ? '██░' : '█░░';
        console.log(`  ${strengthColor(strengthBar)} ${String(c.coChanges).padStart(3)}x together ${dim(`(${strengthPct}% coupled)`)}`);
        console.log(`    ${cyan(truncPath(c.fileA, 55))}`);
        console.log(`    ${cyan(truncPath(c.fileB, 55))}`);
        console.log();
      }
      
      console.log(dim(`  coupling strength = co-changes / max(individual changes)`));
      console.log(dim(`  high coupling suggests: extract shared module, or one always breaks the other`));
    }
    
    console.log();
    return;
  }
  
  // ── authors view ──
  if (isAuthors) {
    const authorStats = new Map();
    for (const [key, data] of allFiles) {
      for (const author of data.authors) {
        if (!authorStats.has(author)) {
          authorStats.set(author, { files: new Set(), changes: 0, categories: new Map() });
        }
        const stat = authorStats.get(author);
        stat.files.add(key);
        stat.changes += data.changes;
        const cat = categorize(key);
        stat.categories.set(cat, (stat.categories.get(cat) || 0) + data.changes);
      }
    }
    
    console.log(`\n${bold('author activity')} ${dim('— who touches what')}\n`);
    
    const authorList = [...authorStats.entries()]
      .sort((a, b) => b[1].changes - a[1].changes);
    
    for (const [author, stat] of authorList) {
      const topCats = [...stat.categories.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, count]) => `${cat}(${count})`)
        .join(', ');
      
      console.log(`  ${bold(author)} — ${stat.files.size} files, ${stat.changes} changes`);
      console.log(`    ${dim('focus:')} ${topCats}`);
      console.log();
    }
    return;
  }
  
  // ── category view ──
  if (isCategory) {
    const catStats = new Map();
    for (const f of sorted) {
      const cat = categorize(f.key);
      if (!catStats.has(cat)) {
        catStats.set(cat, { count: 0, changes: 0, files: [], churn: 0 });
      }
      const stat = catStats.get(cat);
      stat.count++;
      stat.changes += f.changes;
      stat.churn += f.insertions + f.deletions;
      stat.files.push(f);
    }
    
    const catList = [...catStats.entries()].sort((a, b) => b[1].changes - a[1].changes);
    const maxCatChanges = catList[0]?.[1].changes || 1;
    
    console.log(`\n${bold('changes by category')}\n`);
    
    for (const [cat, stat] of catList) {
      const icon = categoryIcon(cat);
      const catBar = bar(stat.changes, maxCatChanges, 15);
      const topFile = stat.files[0];
      console.log(`  ${icon} ${catBar} ${cat.padEnd(12)} ${String(stat.changes).padStart(4)} changes across ${stat.count} files ${dim(`(${stat.churn.toLocaleString()} lines churn)`)}`);
      if (topFile) {
        console.log(`    ${dim('hottest:')} ${truncPath(topFile.key, 50)} ${dim(`(${topFile.changes}x)`)}`);
      }
    }
    
    console.log();
    return;
  }
  
  // ── default: hotspot ranking ──
  console.log(`\n${bold('hottest files')} ${dim(`— top ${TOP_N} most frequently changed`)}\n`);
  
  for (let i = 0; i < Math.min(TOP_N, sorted.length); i++) {
    const f = sorted[i];
    const cat = categorize(f.key);
    const icon = categoryIcon(cat);
    const heat = heatBar(f.changes, maxChanges);
    const churn = f.insertions + f.deletions;
    const churnStr = churn > 0 ? dim(` +${f.insertions}/-${f.deletions}`) : '';
    const authStr = f.authorCount > 1 ? dim(` ${f.authorCount} authors`) : '';
    const rank = String(i + 1).padStart(2);
    
    console.log(`  ${dim(rank + '.')} ${heat} ${String(f.changes).padStart(3)}x  ${icon} ${truncPath(f.key, 45)}${churnStr}${authStr}`);
  }
  
  // ── heat zones (by directory) ──
  console.log(`\n${bold('heat zones')} ${dim('— directories with most activity')}\n`);
  
  const dirStats = new Map();
  for (const f of sorted) {
    const dir = dirname(f.key);
    if (!dirStats.has(dir)) {
      dirStats.set(dir, { changes: 0, files: 0, churn: 0 });
    }
    const stat = dirStats.get(dir);
    stat.changes += f.changes;
    stat.files++;
    stat.churn += f.insertions + f.deletions;
  }
  
  const topDirs = [...dirStats.entries()]
    .filter(([dir]) => dir !== '.')
    .sort((a, b) => b[1].changes - a[1].changes)
    .slice(0, 8);
  
  const maxDirChanges = topDirs[0]?.[1].changes || 1;
  
  for (const [dir, stat] of topDirs) {
    const dirBar = bar(stat.changes, maxDirChanges, 12);
    console.log(`  ${dirBar} ${String(stat.changes).padStart(4)} changes  ${truncPath(dir, 40)} ${dim(`(${stat.files} files, ${stat.churn.toLocaleString()} lines)`)}`);
  }
  
  // ── complexity risk ──
  // files with high changes AND high churn = risk
  const risky = sorted
    .filter(f => f.changes >= 5 && (f.insertions + f.deletions) > 100)
    .sort((a, b) => (b.changes * (b.insertions + b.deletions)) - (a.changes * (a.insertions + a.deletions)))
    .slice(0, 5);
  
  if (risky.length > 0) {
    console.log(`\n${bold('complexity risk')} ${dim('— high change frequency + high churn')}\n`);
    
    for (const f of risky) {
      const churn = f.insertions + f.deletions;
      const risk = f.changes * churn;
      const riskLevel = risk > 5000 ? red('HIGH') : risk > 1000 ? yellow('MED') : green('LOW');
      console.log(`  ${riskLevel} ${truncPath(f.key, 45)} — ${f.changes}x changes, ${churn.toLocaleString()} lines churned`);
    }
    
    console.log(`\n${dim('  high risk = changed often AND lots of code rewritten each time')}`);
    console.log(dim('  consider: extract stable parts, add tests, or simplify interface'));
  }
  
  // ── summary ──
  const totalChanges = sorted.reduce((s, f) => s + f.changes, 0);
  const totalChurn = sorted.reduce((s, f) => s + f.insertions + f.deletions, 0);
  const hotCount = sorted.filter(f => f.changes >= maxChanges * 0.3).length;
  const allAuthors = new Set();
  for (const f of sorted) f.authors.forEach(a => allAuthors.add(a));
  
  console.log(`\n${dim('─'.repeat(60))}`);
  console.log(`${dim('period:')} ${DAYS} days ${dim('│')} ${dim('files changed:')} ${sorted.length} ${dim('│')} ${dim('total changes:')} ${totalChanges} ${dim('│')} ${dim('churn:')} ${totalChurn.toLocaleString()} lines`);
  console.log(`${dim('hot files (≥30% of max):')} ${hotCount} ${dim('│')} ${dim('contributors:')} ${allAuthors.size} ${dim('│')} ${dim('projects:')} ${repos.length}`);
  
  // insight
  if (sorted.length > 0) {
    const top3Pct = Math.round((sorted.slice(0, 3).reduce((s, f) => s + f.changes, 0) / totalChanges) * 100);
    if (top3Pct > 50) {
      console.log(`\n${yellow('!')} top 3 files account for ${top3Pct}% of all changes — high concentration`);
    }
    
    const multiAuthor = sorted.filter(f => f.authorCount > 1);
    if (multiAuthor.length > 0) {
      console.log(`${yellow('!')} ${multiAuthor.length} files touched by multiple contributors — potential merge conflicts`);
    }
  }
  
  console.log(`\n${dim('try:')} --cold ${dim('(untouched files)')} --coupling ${dim('(co-change pairs)')} --authors --category --top N`);
  console.log();
}

main();

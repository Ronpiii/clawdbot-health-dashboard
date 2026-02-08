#!/usr/bin/env node
/**
 * arc shield — workspace security scanner
 * 
 * scans for exposed secrets, suspicious patterns, git hygiene,
 * permission issues, and .env leakage across all projects.
 * 
 * born from the clawdhub supply chain attack (2026-02-07).
 * the best time to harden was before the breach.
 * the second best time is now.
 * 
 * usage:
 *   arc shield              full scan with summary
 *   arc shield --quick      secrets + git only (fast)
 *   arc shield --json       machine-readable output
 *   arc shield --fix        auto-fix what's safe to fix
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, chmodSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const JSON_OUT = args.includes('--json');
const FIX = args.includes('--fix');

// ─── severity levels ───
const SEV = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪' };

// ─── collectors ───
const findings = [];
function finding(severity, category, message, file = null, line = null, fix = null) {
  findings.push({ severity, category, message, file, line, fix });
}

// ─── secret patterns ───
const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, sev: 'critical' },
  { name: 'AWS Secret Key', pattern: /(?:aws_secret_access_key|AWS_SECRET)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi, sev: 'critical' },
  { name: 'GitHub PAT (classic)', pattern: /ghp_[A-Za-z0-9]{36,}/g, sev: 'critical' },
  { name: 'GitHub PAT (fine-grained)', pattern: /github_pat_[A-Za-z0-9_]{20,}/g, sev: 'critical' },
  { name: 'Generic API Key', pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]([A-Za-z0-9_\-]{20,})['"]?/gi, sev: 'high' },
  { name: 'Generic Secret', pattern: /(?:secret|password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"]?/gi, sev: 'high' },
  { name: 'Bearer Token (hardcoded)', pattern: /Bearer\s+[A-Za-z0-9_\-.]{20,}/g, sev: 'high' },
  { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, sev: 'critical' },
  { name: 'Slack Token', pattern: /xox[bpors]-[A-Za-z0-9-]{10,}/g, sev: 'critical' },
  { name: 'Supabase Service Key', pattern: /eyJ[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]{50,}/g, sev: 'high' },
  { name: 'Stripe Key', pattern: /sk_live_[A-Za-z0-9]{20,}/g, sev: 'critical' },
  { name: 'Stripe Test Key', pattern: /sk_test_[A-Za-z0-9]{20,}/g, sev: 'medium' },
  { name: 'SendGrid API Key', pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, sev: 'critical' },
  { name: 'Telegram Bot Token', pattern: /\d{8,10}:[A-Za-z0-9_-]{35}/g, sev: 'high' },
  { name: 'Discord Webhook', pattern: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g, sev: 'low' },
  { name: 'OpenAI API Key', pattern: /sk-[A-Za-z0-9]{20,}/g, sev: 'critical' },
  { name: 'Hardcoded IP + Port', pattern: /\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}:\d{2,5}\b/g, sev: 'low' },
];

// files to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.vercel', 'dist', 'build', 
  '.cache', '.turbo', 'coverage', '__pycache__', '.svelte-kit'
]);
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.bz2', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.pyc', '.class', '.o', '.so', '.dylib',
  '.lock', '.map'
]);

// suspicious code patterns (for supply chain detection)
const SUSPICIOUS_PATTERNS = [
  { name: 'Dynamic require/import', pattern: /(?:require|import)\s*\(\s*[^'"`\s]/g, sev: 'medium' },
  { name: 'eval() usage', pattern: /\beval\s*\(/g, sev: 'high' },
  { name: 'Function constructor', pattern: /new\s+Function\s*\(/g, sev: 'high' },
  { name: 'child_process exec', pattern: /child_process.*exec(?:Sync)?\s*\(/g, sev: 'medium' },
  { name: 'Base64 decode + eval', pattern: /atob|Buffer\.from.*base64/g, sev: 'low' },
  { name: 'Obfuscated hex string', pattern: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){10,}/gi, sev: 'high' },
  // removed: fetch-to-variable-URL and suspicious-domain-fetch — too noisy for real codebases
];

// ─── file walker ───
function walkFiles(dir, maxDepth = 6, depth = 0) {
  const results = [];
  if (depth > maxDepth) return results;
  
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    if (entry.startsWith('.') && entry !== '.env' && !entry.startsWith('.env.')) continue;
    
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    
    if (stat.isDirectory()) {
      results.push(...walkFiles(full, maxDepth, depth + 1));
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) continue;
      if (stat.size > 500_000) continue; // skip files > 500KB
      results.push({ path: full, rel: relative(ROOT, full), stat });
    }
  }
  return results;
}

// ─── scan: secrets in files ───
function scanSecrets(files) {
  const envExampleFiles = new Set();
  
  for (const { path: fp, rel } of files) {
    // skip known safe files
    if (rel.endsWith('.env.example') || rel.endsWith('.env.sample')) {
      envExampleFiles.add(rel);
      continue;
    }
    if (rel.includes('memory/') && rel.endsWith('.md')) continue; // our own logs
    if (rel === 'scripts/shield.mjs') continue; // this file has patterns
    
    let content;
    try { content = readFileSync(fp, 'utf-8'); } catch { continue; }
    
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // skip comments
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#') || line.trimStart().startsWith('*')) continue;
      // skip if it's clearly a pattern/regex definition
      if (line.includes('pattern:') || line.includes('RegExp') || line.includes('/g,')) continue;
      
      for (const { name, pattern, sev } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match) {
          // skip template variables like ${token}, ${apiKey}, etc.
          const matchStr = match[0];
          if (/\$\{/.test(line) && /Bearer/.test(matchStr)) continue;
          // skip markdown code examples (lines with ` or ```)
          if (line.includes('```') || (line.includes('`') && line.includes('Bearer'))) continue;
          
          // check if it's inside a .gitignored path
          const isGitignored = isIgnored(rel);
          const effectiveSev = isGitignored ? 'info' : sev;
          const note = isGitignored ? ' (gitignored)' : '';
          finding(effectiveSev, 'secret', `${name} found${note}`, rel, i + 1);
        }
      }
    }
  }
}

// ─── scan: suspicious code patterns ───
function scanSuspicious(files) {
  const codeExts = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.sh']);
  
  for (const { path: fp, rel } of files) {
    const ext = extname(basename(rel)).toLowerCase();
    if (!codeExts.has(ext)) continue;
    if (rel === 'scripts/shield.mjs') continue;
    
    let content;
    try { content = readFileSync(fp, 'utf-8'); } catch { continue; }
    
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) continue;
      
      for (const { name, pattern, sev } of SUSPICIOUS_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          finding(sev, 'suspicious', name, rel, i + 1);
        }
      }
    }
  }
}

// ─── scan: .env files not gitignored ───
function scanEnvFiles(files) {
  for (const { path: fp, rel } of files) {
    const base = basename(rel);
    if (base === '.env' || (base.startsWith('.env.') && !base.includes('example') && !base.includes('sample'))) {
      if (!isIgnored(rel)) {
        finding('critical', 'env', '.env file not gitignored — secrets may be committed', rel, null, 
          `Add "${rel}" to .gitignore`);
      } else {
        finding('info', 'env', '.env file found (gitignored — OK)', rel);
      }
    }
  }
}

// ─── scan: git remotes for embedded tokens ───
function scanGitRemotes() {
  const gitDirs = [];
  function findGit(dir, depth = 0) {
    if (depth > 4) return;
    try {
      const entries = readdirSync(dir);
      if (entries.includes('.git')) gitDirs.push(dir);
      for (const e of entries) {
        if (SKIP_DIRS.has(e) && e !== '.git') continue;
        if (e.startsWith('.') && e !== '.git') continue;
        const full = join(dir, e);
        try { if (statSync(full).isDirectory() && e !== '.git') findGit(full, depth + 1); } catch {}
      }
    } catch {}
  }
  findGit(ROOT);
  
  for (const dir of gitDirs) {
    try {
      const remotes = execSync('git remote -v', { cwd: dir, encoding: 'utf-8', timeout: 5000 });
      const rel = relative(ROOT, dir) || '.';
      
      // check for embedded tokens in remote URLs
      if (/https?:\/\/[^@\s]+:[^@\s]+@/.test(remotes) || /ghp_|github_pat_/.test(remotes)) {
        finding('critical', 'git', 'Git remote contains embedded credentials', `${rel}/.git/config`, null,
          'Run: git remote set-url origin <url-without-token>');
      }
      
      // check for unsigned commits (info only)
      // check for branch protection
    } catch {}
  }
}

// ─── scan: file permissions ───
function scanPermissions(files) {
  for (const { path: fp, rel, stat } of files) {
    const mode = stat.mode & 0o777;
    // world-writable files
    if (mode & 0o002) {
      finding('medium', 'permissions', `World-writable file (${mode.toString(8)})`, rel, null,
        `chmod o-w "${rel}"`);
    }
    // executable non-scripts
    const ext = extname(rel).toLowerCase();
    const scriptExts = new Set(['.sh', '.bash', '.zsh', '.mjs', '.js', '.py']);
    if ((mode & 0o111) && !scriptExts.has(ext) && !rel.includes('bin/')) {
      // skip, too noisy
    }
  }
}

// ─── scan: gitignore coverage ───
function scanGitignore() {
  // check if common sensitive patterns are in .gitignore
  const gitignorePath = join(ROOT, '.gitignore');
  if (!existsSync(gitignorePath)) {
    finding('high', 'gitignore', 'No .gitignore found in workspace root', '.gitignore', null,
      'Create .gitignore with standard patterns');
    return;
  }
  
  const content = readFileSync(gitignorePath, 'utf-8');
  const mustHave = ['.env', 'node_modules', '.env.local'];
  for (const pattern of mustHave) {
    if (!content.includes(pattern)) {
      finding('high', 'gitignore', `Missing "${pattern}" in .gitignore`, '.gitignore', null,
        `Add "${pattern}" to .gitignore`);
    }
  }
}

// ─── scan: package.json for suspicious scripts ───
function scanPackageScripts(files) {
  for (const { path: fp, rel } of files) {
    if (basename(rel) !== 'package.json') continue;
    if (rel.includes('node_modules')) continue;
    
    let pkg;
    try { pkg = JSON.parse(readFileSync(fp, 'utf-8')); } catch { continue; }
    
    const scripts = pkg.scripts || {};
    const suspicious = ['preinstall', 'postinstall', 'preuninstall', 'postuninstall'];
    
    for (const hook of suspicious) {
      if (scripts[hook]) {
        const cmd = scripts[hook];
        // flag if it does anything beyond simple build commands
        if (/curl|wget|fetch|eval|exec|bash|sh -c|node -e|python -c/.test(cmd)) {
          finding('high', 'supply-chain', `Suspicious "${hook}" script: ${cmd.substring(0, 80)}`, rel);
        } else {
          finding('low', 'supply-chain', `Has "${hook}" lifecycle script: ${cmd.substring(0, 60)}`, rel);
        }
      }
    }
    
    // check for unusual dependency sources
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(allDeps)) {
      if (typeof version === 'string') {
        if (version.startsWith('git+') || version.startsWith('http') || version.includes('github:')) {
          finding('medium', 'supply-chain', `Git/URL dependency: ${name} → ${version}`, rel);
        }
      }
    }
  }
}

// ─── helper: check if path is gitignored ───
// find nested git repos (submodules or standalone repos within workspace)
const _nestedGitDirs = [];
function findNestedGit(dir, depth = 0) {
  if (depth > 5) return;
  try {
    const entries = readdirSync(dir);
    const hasGit = entries.includes('.git') && dir !== ROOT;
    if (hasGit) _nestedGitDirs.push(relative(ROOT, dir));
    for (const e of entries) {
      if (SKIP_DIRS.has(e)) continue;
      if (e === '.git') continue;
      const full = join(dir, e);
      try { if (statSync(full).isDirectory()) findNestedGit(full, depth + 1); } catch {}
    }
  } catch {}
}
findNestedGit(ROOT);
// sort longest-first so we match the deepest nested repo first
_nestedGitDirs.sort((a, b) => b.length - a.length);

function isIgnored(relPath) {
  // check if this file is inside a nested git repo
  for (const repoDir of _nestedGitDirs) {
    if (relPath.startsWith(repoDir + '/')) {
      const subRel = relPath.slice(repoDir.length + 1);
      try {
        execSync(`git check-ignore -q "${subRel}"`, { cwd: join(ROOT, repoDir), timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
        return true;
      } catch { /* not ignored in subrepo, fall through to root check */ }
    }
  }
  // check root repo
  try {
    execSync(`git check-ignore -q "${relPath}"`, { cwd: ROOT, timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

// ─── auto-fix ───
function autoFix() {
  let fixed = 0;
  for (const f of findings) {
    if (!f.fix || f.severity === 'info') continue;
    
    if (f.fix.startsWith('chmod')) {
      try {
        execSync(f.fix, { cwd: ROOT, timeout: 3000 });
        f.fixed = true;
        fixed++;
      } catch {}
    }
    // gitignore fixes
    if (f.fix.startsWith('Add "') && f.fix.includes('.gitignore')) {
      const match = f.fix.match(/Add "([^"]+)" to \.gitignore/);
      if (match) {
        const gitignorePath = join(ROOT, '.gitignore');
        try {
          const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
          if (!content.includes(match[1])) {
            writeFileSync(gitignorePath, content.trimEnd() + '\n' + match[1] + '\n');
            f.fixed = true;
            fixed++;
          }
        } catch {}
      }
    }
  }
  return fixed;
}

// ─── output ───
function printResults() {
  if (JSON_OUT) {
    console.log(JSON.stringify({ findings, summary: getSummary() }, null, 2));
    return;
  }
  
  const W = 60;
  console.log(`\x1b[1marc shield\x1b[0m — workspace security scanner`);
  console.log(`\x1b[90m${'─'.repeat(W)}\x1b[0m`);
  
  // group by category
  const categories = {};
  for (const f of findings) {
    if (!categories[f.category]) categories[f.category] = [];
    categories[f.category].push(f);
  }
  
  const catNames = {
    secret: '🔐 Secrets & Credentials',
    env: '📄 Environment Files',
    git: '🔗 Git Security',
    suspicious: '⚠️  Suspicious Code',
    permissions: '🔒 File Permissions',
    gitignore: '📋 Gitignore Coverage',
    'supply-chain': '📦 Supply Chain',
  };
  
  const order = ['secret', 'env', 'git', 'supply-chain', 'suspicious', 'permissions', 'gitignore'];
  
  for (const cat of order) {
    const items = categories[cat];
    if (!items || items.length === 0) continue;
    
    // skip info-only categories in non-verbose
    const nonInfo = items.filter(i => i.severity !== 'info');
    
    console.log();
    console.log(`\x1b[1m${catNames[cat] || cat}\x1b[0m`);
    
    // sort by severity
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    items.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
    
    for (const f of items) {
      const icon = SEV[f.severity];
      const loc = f.file ? `\x1b[90m${f.file}${f.line ? `:${f.line}` : ''}\x1b[0m` : '';
      const fixTag = f.fixed ? ' \x1b[32m✓ fixed\x1b[0m' : '';
      console.log(`  ${icon} ${f.message}${fixTag}`);
      if (loc) console.log(`     ${loc}`);
      if (f.fix && !f.fixed) console.log(`     \x1b[36m→ ${f.fix}\x1b[0m`);
    }
  }
  
  // summary
  const summary = getSummary();
  console.log();
  console.log(`\x1b[90m${'─'.repeat(W)}\x1b[0m`);
  
  const scoreColor = summary.score >= 90 ? '\x1b[32m' : summary.score >= 70 ? '\x1b[33m' : '\x1b[31m';
  console.log(`\x1b[1mSecurity Score:\x1b[0m ${scoreColor}${summary.score}/100\x1b[0m ${getScoreBar(summary.score)}`);
  
  if (summary.critical > 0) console.log(`  🔴 ${summary.critical} critical`);
  if (summary.high > 0) console.log(`  🟠 ${summary.high} high`);
  if (summary.medium > 0) console.log(`  🟡 ${summary.medium} medium`);
  if (summary.low > 0) console.log(`  🔵 ${summary.low} low`);
  if (summary.info > 0) console.log(`  ⚪ ${summary.info} informational`);
  
  if (summary.fixed > 0) console.log(`  \x1b[32m✓ ${summary.fixed} auto-fixed\x1b[0m`);
  
  console.log();
  if (summary.score === 100) {
    console.log(`\x1b[32m✓ workspace is clean. sleep well.\x1b[0m`);
  } else if (summary.score >= 90) {
    console.log(`\x1b[32m✓ looking good. minor items to review.\x1b[0m`);
  } else if (summary.score >= 70) {
    console.log(`\x1b[33m● some issues need attention.\x1b[0m`);
  } else {
    console.log(`\x1b[31m✗ security needs work. fix critical items first.\x1b[0m`);
  }
}

function getSummary() {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let fixed = 0;
  for (const f of findings) {
    counts[f.severity]++;
    if (f.fixed) fixed++;
  }
  
  // score: start at 100, deduct per severity (diminishing returns within category)
  let score = 100;
  score -= Math.min(counts.critical * 12, 40); // cap at 40
  score -= Math.min(counts.high * 5, 25);      // cap at 25
  score -= Math.min(counts.medium * 2, 15);    // cap at 15
  score -= Math.min(counts.low * 0.5, 10);     // cap at 10
  // info doesn't deduct
  score = Math.max(0, Math.round(Math.min(100, score)));
  
  return { ...counts, score, fixed, total: findings.length };
}

function getScoreBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const color = score >= 90 ? '\x1b[32m' : score >= 70 ? '\x1b[33m' : '\x1b[31m';
  return `${color}${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}\x1b[0m`;
}

// ─── main ───
async function main() {
  if (!JSON_OUT) {
    process.stdout.write('\x1b[90mscanning workspace...\x1b[0m\n');
  }
  
  const files = walkFiles(ROOT);
  
  // always run
  scanSecrets(files);
  scanEnvFiles(files);
  scanGitRemotes();
  scanGitignore();
  scanPackageScripts(files);
  
  // skip in quick mode
  if (!QUICK) {
    scanSuspicious(files);
    scanPermissions(files);
  }
  
  // auto-fix if requested
  let fixCount = 0;
  if (FIX) {
    fixCount = autoFix();
  }
  
  printResults();
}

main().catch(e => {
  console.error('shield error:', e.message);
  process.exit(1);
});

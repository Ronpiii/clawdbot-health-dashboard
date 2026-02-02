#!/usr/bin/env node
/**
 * arc blockers — unified blocker dashboard
 * 
 * Scans all markdown files for things that are blocked, waiting, or need
 * external input. Groups by project and severity.
 * 
 * Usage:
 *   arc blockers              # full dashboard
 *   arc blockers --json       # machine-readable
 *   arc blockers --short      # one-line-per-blocker summary
 *   arc blockers <project>    # filter to one project
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, basename } from 'path';

const ROOT = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');
const projectFilter = args.find(a => !a.startsWith('--'))?.toLowerCase();

// ── patterns that indicate blockers ──────────────────────────────────
const BLOCKER_PATTERNS = [
  // explicit blocker keywords (these are high-signal)
  { re: /\*\*blocker[s]?\*\*[:\s]*(.+)/gi, severity: 'critical', type: 'blocker' },
  { re: /^[-*]\s*blocker[s]?:\s*(.+)/gim, severity: 'critical', type: 'blocker' },
  { re: /^[-*]\s*\bblocked\b[:\s—–-]+(.+)/gim, severity: 'critical', type: 'blocked' },
  { re: /^[-*]\s*\bblocking\b[:\s—–-]+(.+)/gim, severity: 'critical', type: 'blocking' },
  // waiting patterns (only line-start bullets/items)
  { re: /^[-*]\s*waiting (?:on|for)\s+(.+)/gim, severity: 'high', type: 'waiting' },
  { re: /\*\*(?:status|blocked?)\*\*[:\s]*waiting (?:on|for)\s+(.+)/gi, severity: 'high', type: 'waiting' },
  // missing (only in structured contexts)
  { re: /\*\*missing[^*]*\*\*[:\s]*(.+)/gi, severity: 'high', type: 'missing' },
  // task-style unchecked items with blocker words
  { re: /- \[ \]\s*(.*(?:block|wait|need|missing|stuck|depend).*)/gi, severity: 'medium', type: 'todo-blocked' },
];

// skip directories that contain prose/essays/marketing (not real blockers)
const SKIP_DIRS = ['writing/', 'research/', 'marketing/', 'guides/', 'content/', 'docs/api', 'identity-persistence/'];
const SKIP_FILES = ['AGENTS.md', 'HEARTBEAT.md', 'README.md'];

// words that indicate false positives when the match is too generic
const FALSE_POSITIVE_WORDS = [
  'you need to', 'needs to be', 'needed for the', 'if you need',
  'no longer needs', 'doesn\'t need', 'does not need',
  'needed:', 'your attention', 'your review', 'your approval',
  'your input', 'that need', 'who need', 'agents need',
];

// ── project detection ────────────────────────────────────────────────
function detectProject(filePath) {
  const rel = relative(ROOT, filePath).toLowerCase();
  if (rel.includes('anivia')) return 'anivia';
  if (rel.includes('ventok-site') || rel.includes('ventok.eu') || rel.includes('ventok-web')) return 'ventok-site';
  if (rel.includes('ventok') && !rel.includes('ventok-site')) return 'ventok';
  if (rel.includes('context-memory') || rel.includes('ctxmem')) return 'context-memory';
  if (rel.includes('discord-voice')) return 'discord-voice-bot';
  if (rel.includes('clawdbot') || rel.includes('clawd') || rel.includes('gateway')) return 'clawdbot';
  if (rel.includes('moltbook')) return 'moltbook';
  // check file content for project mentions
  return 'workspace';
}

// ── scan files ───────────────────────────────────────────────────────
function getMarkdownFiles(dir, depth = 0) {
  if (depth > 3) return [];
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          files.push(...getMarkdownFiles(full, depth + 1));
        } else if (entry.endsWith('.md') && stat.size < 500_000) {
          files.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return files;
}

function extractBlockers(filePath) {
  const rel = relative(ROOT, filePath);
  if (SKIP_DIRS.some(d => rel.includes(d))) return [];
  if (SKIP_FILES.includes(basename(filePath))) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results = [];
  const seen = new Set();

  for (const pattern of BLOCKER_PATTERNS) {
    // reset regex
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(content)) !== null) {
      let text = match[1]?.trim();
      if (!text || text.length < 5 || text.length > 200) continue;

      // clean up
      text = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      
      // skip false positives
      const lower = text.toLowerCase();
      if (FALSE_POSITIVE_WORDS.some(fp => lower.includes(fp))) continue;
      if (lower.startsWith('a ') || lower.startsWith('the ') || lower.startsWith('an ')) {
        // too generic if it starts with articles and is short
        if (text.length < 20) continue;
      }

      // dedup by normalized text
      const key = lower.replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);

      // find line number
      const matchIdx = match.index;
      let charCount = 0;
      let lineNum = 0;
      for (let i = 0; i < lines.length; i++) {
        charCount += lines[i].length + 1;
        if (charCount > matchIdx) { lineNum = i + 1; break; }
      }

      // find section context (nearest ## heading above)
      let section = '';
      for (let i = lineNum - 1; i >= 0; i--) {
        if (lines[i]?.match(/^#{1,3}\s+/)) {
          section = lines[i].replace(/^#+\s+/, '').trim();
          break;
        }
      }

      // boost severity for items in task tracking files
      let finalSeverity = pattern.severity;
      if (rel.includes('tasks/active') && finalSeverity === 'medium') finalSeverity = 'high';

      results.push({
        text,
        severity: finalSeverity,
        type: pattern.type,
        file: relative(ROOT, filePath),
        line: lineNum,
        section,
        project: detectProject(filePath),
      });
    }
  }

  return results;
}

// ── main ─────────────────────────────────────────────────────────────
const files = getMarkdownFiles(ROOT);
let allBlockers = [];

for (const f of files) {
  allBlockers.push(...extractBlockers(f));
}

// filter by project if specified
if (projectFilter) {
  allBlockers = allBlockers.filter(b => b.project.includes(projectFilter));
}

// sort: critical first, then high, then medium
const severityOrder = { critical: 0, high: 1, medium: 2 };
allBlockers.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

// dedup across files — same text from different files = keep the first (highest severity)
const globalSeen = new Set();
allBlockers = allBlockers.filter(b => {
  const key = b.text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
  if (globalSeen.has(key)) return false;
  globalSeen.add(key);
  return true;
});

// ── output ───────────────────────────────────────────────────────────
if (jsonMode) {
  console.log(JSON.stringify(allBlockers, null, 2));
  process.exit(0);
}

if (allBlockers.length === 0) {
  console.log('✓ no blockers found — everything is unblocked');
  process.exit(0);
}

// group by project
const byProject = {};
for (const b of allBlockers) {
  (byProject[b.project] ??= []).push(b);
}

const SEVERITY_ICON = { critical: '🔴', high: '🟡', medium: '⚪' };
const SEVERITY_BAR = { critical: '███', high: '██░', medium: '█░░' };

if (shortMode) {
  console.log(`blockers: ${allBlockers.length}\n`);
  for (const b of allBlockers) {
    console.log(`${SEVERITY_ICON[b.severity]} [${b.project}] ${b.text}`);
  }
  process.exit(0);
}

// full dashboard
console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║                  BLOCKER DASHBOARD                      ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

// summary bar
const counts = { critical: 0, high: 0, medium: 0 };
allBlockers.forEach(b => counts[b.severity]++);
console.log(`  🔴 critical: ${counts.critical}    🟡 high: ${counts.high}    ⚪ medium: ${counts.medium}    total: ${allBlockers.length}`);
console.log('');

for (const [project, blockers] of Object.entries(byProject).sort()) {
  console.log(`─── ${project.toUpperCase()} (${blockers.length}) ${'─'.repeat(Math.max(0, 45 - project.length))}`)
  console.log('');
  
  for (const b of blockers) {
    const icon = SEVERITY_ICON[b.severity];
    const bar = SEVERITY_BAR[b.severity];
    const loc = b.section ? `${b.file} → ${b.section}` : b.file;
    console.log(`  ${icon} ${bar}  ${b.text}`);
    console.log(`          ${dim(`${b.type} · ${loc} :${b.line}`)}`);
    console.log('');
  }
}

console.log('─'.repeat(58));
console.log(`  ${allBlockers.length} blockers across ${Object.keys(byProject).length} projects`);
console.log(`  run: arc blockers <project>  to filter`);
console.log(`  run: arc blockers --short    for quick list`);
console.log('');

function dim(s) { return `\x1b[2m${s}\x1b[0m`; }

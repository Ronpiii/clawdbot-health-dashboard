#!/usr/bin/env node
/**
 * lessons - extract and analyze lessons from memory files
 * 
 * Scans daily logs for patterns like:
 * - "learned:", "lesson:", "insight:", "realized:"
 * - "mistake:", "error:", "bug:", "issue:"
 * - "decision:", "decided:", "agreed:"
 * - "todo:", "next:", "follow-up:"
 * 
 * Usage:
 *   ./scripts/lessons.mjs           # last 7 days
 *   ./scripts/lessons.mjs --all     # all time
 *   ./scripts/lessons.mjs --days 30 # last 30 days
 *   ./scripts/lessons.mjs --type decisions
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const MEMORY_DIR = join(WORKSPACE, 'memory');
const LEARNINGS_DIR = join(WORKSPACE, 'learnings');

const PATTERNS = {
  lessons: [
    /(?:learned|lesson|insight|realized|discovered|figured out)[:\s]+(.+)/gi,
    /(?:key takeaway|takeaway)[:\s]+(.+)/gi,
  ],
  mistakes: [
    /(?:mistake|error|bug|issue|problem|broke|failed)[:\s]+(.+)/gi,
    /(?:should have|shouldn't have)[:\s]+(.+)/gi,
  ],
  decisions: [
    /(?:decision|decided|agreed|chose|picked)[:\s]+(.+)/gi,
    /(?:going with|settled on)[:\s]+(.+)/gi,
  ],
  todos: [
    /(?:todo|next|follow-up|action item)[:\s]+(.+)/gi,
    /- \[ \] (.+)/g,
  ],
  wins: [
    /(?:shipped|deployed|completed|finished|done|working|fixed)[:\s]+(.+)/gi,
    /(?:success|win|milestone)[:\s]+(.+)/gi,
  ],
};

function getRecentDates(days) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function extractFromLine(line, type) {
  const patterns = PATTERNS[type];
  const matches = [];
  
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const text = match[1]?.trim();
      if (text && text.length > 10 && text.length < 500) {
        matches.push(text);
      }
    }
  }
  
  return matches;
}

function scanFile(filePath, types) {
  const results = {};
  types.forEach(t => results[t] = []);
  
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const type of types) {
        const matches = extractFromLine(line, type);
        for (const match of matches) {
          results[type].push({
            text: match,
            file: filePath,
            line: i + 1,
          });
        }
      }
    }
  } catch (e) {
    // Skip unreadable files
  }
  
  return results;
}

function scanDirectory(dir, dates, types) {
  const allResults = {};
  types.forEach(t => allResults[t] = []);
  
  if (!existsSync(dir)) return allResults;
  
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  
  for (const file of files) {
    // If dates filter, check if file matches date pattern
    if (dates) {
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dateMatch && !dates.includes(dateMatch[1])) {
        continue;
      }
    }
    
    const results = scanFile(join(dir, file), types);
    for (const type of types) {
      allResults[type].push(...results[type]);
    }
  }
  
  return allResults;
}

function formatResults(results, verbose = false) {
  for (const [type, items] of Object.entries(results)) {
    if (items.length === 0) continue;
    
    const emoji = {
      lessons: '💡',
      mistakes: '⚠️',
      decisions: '✅',
      todos: '📋',
      wins: '🎉',
    }[type] || '•';
    
    console.log(`\n${emoji} ${type.toUpperCase()} (${items.length})`);
    console.log('─'.repeat(40));
    
    // Deduplicate by text similarity
    const seen = new Set();
    for (const item of items) {
      const key = item.text.toLowerCase().slice(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);
      
      if (verbose) {
        console.log(`  • ${item.text}`);
        console.log(`    └─ ${item.file}:${item.line}`);
      } else {
        console.log(`  • ${item.text}`);
      }
    }
  }
}

// CLI
const args = process.argv.slice(2);
const allTime = args.includes('--all');
const verbose = args.includes('-v') || args.includes('--verbose');

const daysIdx = args.indexOf('--days');
const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1]) : 7;

const typeIdx = args.indexOf('--type');
const filterType = typeIdx !== -1 ? args[typeIdx + 1] : null;

const types = filterType ? [filterType] : Object.keys(PATTERNS);
const dates = allTime ? null : getRecentDates(days);

console.log(`📚 Lessons from ${allTime ? 'all time' : `last ${days} days`}`);

// Scan memory directory
const memoryResults = scanDirectory(MEMORY_DIR, dates, types);

// Scan learnings directory
const learningsResults = scanDirectory(LEARNINGS_DIR, null, types);

// Merge
const merged = {};
for (const type of types) {
  merged[type] = [
    ...(memoryResults[type] || []),
    ...(learningsResults[type] || []),
  ];
}

formatResults(merged, verbose);

// Summary
const total = Object.values(merged).reduce((sum, arr) => sum + arr.length, 0);
console.log(`\n📊 Total: ${total} items extracted`);

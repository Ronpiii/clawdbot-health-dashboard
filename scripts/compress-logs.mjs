#!/usr/bin/env node
/**
 * compress-logs.mjs - summarize old daily logs into MEMORY.md
 * 
 * reads memory/YYYY-MM-DD.md files older than N days
 * extracts key info (completed items, learnings, decisions)
 * suggests additions to MEMORY.md
 * 
 * usage: node scripts/compress-logs.mjs [days-old=7]
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const WORKSPACE = '/data02/virt137413/clawd';
const MEMORY_DIR = join(WORKSPACE, 'memory');

// patterns to extract
const PATTERNS = {
  completed: /^- \[?[x✓]\]?.+$/gim,
  decisions: /decision|decided|chose|choosing|picked/gi,
  learnings: /learned|discovered|found out|realized|note:|insight:/gi,
  blockers: /blocked|waiting|need from|blocking/gi,
  todos: /todo|to-do|next:|later:/gi
};

async function getOldLogs(daysOld = 7) {
  const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  const entries = await readdir(MEMORY_DIR);
  
  const logs = [];
  for (const entry of entries) {
    // match YYYY-MM-DD.md pattern
    const match = entry.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    
    const dateStr = match[1];
    const fileDate = new Date(dateStr).getTime();
    
    if (fileDate < cutoff) {
      logs.push({
        date: dateStr,
        path: join(MEMORY_DIR, entry)
      });
    }
  }
  
  return logs.sort((a, b) => a.date.localeCompare(b.date));
}

function extractKeyInfo(content, date) {
  const lines = content.split('\n');
  const info = {
    date,
    completed: [],
    decisions: [],
    learnings: [],
    blockers: [],
    todos: []
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // check for completed items (various formats)
    // - [x] task, - ✓ task, - [✓] task
    if (/^-\s*(\[[x✓]\]|✓)\s+/.test(trimmed)) {
      info.completed.push(trimmed.replace(/^-\s*(\[[x✓]\]|✓)\s+/, ''));
    }
    // also catch action verbs indicating completed work
    else if (/^-\s+(implemented|created|built|fixed|deployed|added|updated|configured|set up|established)/i.test(trimmed)) {
      info.completed.push(trimmed.replace(/^-\s+/, ''));
    }
    
    // check for patterns in content
    if (PATTERNS.decisions.test(trimmed)) {
      info.decisions.push(trimmed);
      PATTERNS.decisions.lastIndex = 0; // reset regex
    }
    if (PATTERNS.learnings.test(trimmed)) {
      info.learnings.push(trimmed);
      PATTERNS.learnings.lastIndex = 0;
    }
    if (PATTERNS.blockers.test(trimmed)) {
      info.blockers.push(trimmed);
      PATTERNS.blockers.lastIndex = 0;
    }
  }
  
  return info;
}

async function compressLogs(daysOld = 7) {
  const logs = await getOldLogs(daysOld);
  
  if (logs.length === 0) {
    console.log(`no logs older than ${daysOld} days found`);
    return;
  }
  
  console.log(`found ${logs.length} logs to analyze:\n`);
  
  const allInfo = [];
  
  for (const log of logs) {
    try {
      const content = await readFile(log.path, 'utf-8');
      const info = extractKeyInfo(content, log.date);
      allInfo.push(info);
      
      console.log(`=== ${log.date} ===`);
      
      if (info.completed.length) {
        console.log('completed:');
        info.completed.forEach(c => console.log(`  ✓ ${c}`));
      }
      
      if (info.decisions.length) {
        console.log('decisions:');
        info.decisions.forEach(d => console.log(`  • ${d}`));
      }
      
      if (info.learnings.length) {
        console.log('learnings:');
        info.learnings.forEach(l => console.log(`  • ${l}`));
      }
      
      console.log('');
    } catch (err) {
      console.error(`error reading ${log.path}:`, err.message);
    }
  }
  
  // summary
  console.log('=== SUMMARY ===');
  console.log(`logs analyzed: ${allInfo.length}`);
  console.log(`total completed: ${allInfo.reduce((sum, i) => sum + i.completed.length, 0)}`);
  console.log(`total decisions: ${allInfo.reduce((sum, i) => sum + i.decisions.length, 0)}`);
  console.log(`total learnings: ${allInfo.reduce((sum, i) => sum + i.learnings.length, 0)}`);
  
  console.log('\n💡 review above and update MEMORY.md with anything worth keeping long-term');
}

// CLI
const daysOld = process.argv[2] !== undefined ? parseInt(process.argv[2]) : 7;
await compressLogs(daysOld);

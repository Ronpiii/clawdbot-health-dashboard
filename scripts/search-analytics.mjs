#!/usr/bin/env node
/**
 * search-analytics.mjs - analyze search patterns
 * 
 * helps identify:
 * - common queries
 * - queries with no results (gaps in memory)
 * - search volume over time
 * 
 * usage: node scripts/search-analytics.mjs
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = '/data02/virt137413/clawd';
const LOG_FILE = join(WORKSPACE, 'memory', 'search-log.jsonl');

async function analyze() {
  if (!existsSync(LOG_FILE)) {
    console.log('no search log found yet');
    return;
  }

  const content = await readFile(LOG_FILE, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  if (lines.length === 0) {
    console.log('no searches logged yet');
    return;
  }

  const searches = lines.map(l => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);

  // analyze
  const noResults = searches.filter(s => s.n === 0);
  const withResults = searches.filter(s => s.n > 0);
  
  // query frequency
  const queryCount = {};
  for (const s of searches) {
    queryCount[s.q] = (queryCount[s.q] || 0) + 1;
  }
  
  const topQueries = Object.entries(queryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // average results
  const avgResults = withResults.length > 0
    ? (withResults.reduce((sum, s) => sum + s.n, 0) / withResults.length).toFixed(1)
    : 0;

  // output
  console.log('=== search analytics ===\n');
  console.log(`total searches: ${searches.length}`);
  console.log(`with results: ${withResults.length}`);
  console.log(`no results: ${noResults.length}`);
  console.log(`avg results: ${avgResults}`);

  if (topQueries.length > 0) {
    console.log('\ntop queries:');
    topQueries.forEach(([q, count]) => {
      console.log(`  ${count}x "${q}"`);
    });
  }

  if (noResults.length > 0) {
    console.log('\nqueries with no results (gaps):');
    const uniqueNoResults = [...new Set(noResults.map(s => s.q))];
    uniqueNoResults.slice(0, 10).forEach(q => {
      console.log(`  - "${q}"`);
    });
    
    if (uniqueNoResults.length > 10) {
      console.log(`  ... and ${uniqueNoResults.length - 10} more`);
    }
  }

  console.log('\n========================');
}

await analyze();

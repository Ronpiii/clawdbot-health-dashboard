#!/usr/bin/env node
/**
 * recall - hybrid search combining keyword (TF-IDF) and semantic (vector) search
 * 
 * Usage:
 *   ./scripts/recall.mjs "query"
 *   ./scripts/recall.mjs "query" --semantic   # semantic only
 *   ./scripts/recall.mjs "query" --keyword    # keyword only
 *   ./scripts/recall.mjs "query" -k 10        # top 10 results
 */

import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

function keywordSearch(query, topK = 5) {
  try {
    const result = execSync(`node ${join(__dirname, 'memory-search-v2.mjs')} "${query}" --json`, {
      cwd: WORKSPACE,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const parsed = JSON.parse(result);
    return parsed.slice(0, topK).map(r => ({
      ...r,
      method: 'keyword',
      score: r.score || 0
    }));
  } catch {
    return [];
  }
}

function semanticSearch(query, topK = 5) {
  const VENV_PYTHON = join(WORKSPACE, '.venv', 'bin', 'python3');
  const EMBED_SCRIPT = join(WORKSPACE, 'projects', 'context-memory', 'src', 'embed.py');
  
  try {
    const result = spawnSync(VENV_PYTHON, [EMBED_SCRIPT, 'search', query, '-k', String(topK), '-j'], {
      cwd: WORKSPACE,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    if (result.status !== 0) return [];
    
    const parsed = JSON.parse(result.stdout);
    return parsed.map(r => ({
      path: r.path,
      text: r.text,
      score: r.score,
      method: 'semantic'
    }));
  } catch {
    return [];
  }
}

function deduplicateResults(results) {
  // Deduplicate by path + rough text match
  const seen = new Map();
  
  for (const r of results) {
    const key = r.path;
    const existing = seen.get(key);
    
    if (!existing || r.score > existing.score) {
      seen.set(key, r);
    }
  }
  
  return Array.from(seen.values());
}

function hybridSearch(query, topK = 5) {
  // Run both searches
  const keywordResults = keywordSearch(query, topK);
  const semanticResults = semanticSearch(query, topK);
  
  // Combine and score
  // Semantic gets slight boost for relevance
  const combined = [
    ...semanticResults.map(r => ({ ...r, hybridScore: r.score * 1.1 })),
    ...keywordResults.map(r => ({ ...r, hybridScore: r.score })),
  ];
  
  // Deduplicate and sort
  const deduped = deduplicateResults(combined);
  deduped.sort((a, b) => b.hybridScore - a.hybridScore);
  
  return deduped.slice(0, topK);
}

function formatResult(r, index) {
  const method = r.method === 'semantic' ? '🧠' : '📝';
  const score = r.hybridScore || r.score;
  console.log(`\n${method} [${score.toFixed(2)}] ${r.path}`);
  console.log('-'.repeat(50));
  
  const text = r.text || r.snippet || r.content || '';
  const preview = text.length > 300 ? text.slice(0, 300) + '...' : text;
  console.log(preview);
}

// CLI
const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('-'));

if (!query) {
  console.log('Usage: recall "query" [--semantic|--keyword] [-k N]');
  process.exit(1);
}

const semanticOnly = args.includes('--semantic') || args.includes('-s');
const keywordOnly = args.includes('--keyword') || args.includes('-w');
const kIdx = args.indexOf('-k');
const topK = kIdx !== -1 ? parseInt(args[kIdx + 1]) : 5;

let results;

if (semanticOnly) {
  results = semanticSearch(query, topK);
  console.log(`\n🧠 Semantic search: "${query}"`);
} else if (keywordOnly) {
  results = keywordSearch(query, topK);
  console.log(`\n📝 Keyword search: "${query}"`);
} else {
  results = hybridSearch(query, topK);
  console.log(`\n🔍 Hybrid search: "${query}"`);
}

if (results.length === 0) {
  console.log('\nNo results found.');
} else {
  console.log(`\nFound ${results.length} result(s):`);
  results.forEach((r, i) => formatResult(r, i));
}

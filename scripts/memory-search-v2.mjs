#!/usr/bin/env node
/**
 * memory-search-v2.mjs - improved memory search with TF-IDF + section context
 * 
 * improvements over v1:
 * - TF-IDF scoring (rare terms matter more)
 * - section-aware: results include the nearest heading for context
 * - paragraph grouping: adjacent lines merged into chunks
 * - date-recency boost: recent entries rank higher
 * - direct file search (no pre-built index needed)
 * 
 * usage:
 *   node scripts/memory-search-v2.mjs "query terms"
 *   node scripts/memory-search-v2.mjs --json "query terms"   # JSON output
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = process.env.CLAWD_WORKSPACE || '/data02/virt137413/clawd';
const MEMORY_DIR = join(WORKSPACE, 'memory');
const MEMORY_MD = join(WORKSPACE, 'MEMORY.md');

const STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','must','can',
  'this','that','these','those','i','you','he','she','it','we','they',
  'what','which','who','when','where','why','how','all','each','every',
  'both','few','more','most','other','some','such','no','not','only','own',
  'same','so','than','too','very','just','also','now','here','there','then',
  'if','else','nor'
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\-_\.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Parse a markdown file into sections (heading + content chunks)
 */
function parseIntoChunks(content, filename) {
  const lines = content.split('\n');
  const chunks = [];
  let currentHeading = '';
  let currentLines = [];
  let chunkStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.match(/^#{1,4}\s/)) {
      // save previous chunk
      if (currentLines.length > 0) {
        const text = currentLines.join('\n').trim();
        if (text) {
          chunks.push({
            file: filename,
            heading: currentHeading,
            text,
            startLine: chunkStartLine,
            endLine: i,
          });
        }
      }
      currentHeading = line.replace(/^#+\s*/, '').trim();
      currentLines = [];
      chunkStartLine = i + 2; // next line after heading
    } else {
      currentLines.push(line);
    }
  }

  // last chunk
  if (currentLines.length > 0) {
    const text = currentLines.join('\n').trim();
    if (text) {
      chunks.push({
        file: filename,
        heading: currentHeading,
        text,
        startLine: chunkStartLine,
        endLine: lines.length,
      });
    }
  }

  return chunks;
}

/**
 * Compute TF-IDF score for a query against a corpus of chunks
 */
function searchWithTFIDF(chunks, query, maxResults = 15) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // document frequency: how many chunks contain each term
  const df = {};
  const N = chunks.length;

  // precompute term frequencies per chunk
  const chunkTFs = chunks.map(chunk => {
    const terms = tokenize(chunk.text + ' ' + chunk.heading);
    const tf = {};
    for (const t of terms) {
      tf[t] = (tf[t] || 0) + 1;
    }
    // track document frequency
    for (const t of Object.keys(tf)) {
      df[t] = (df[t] || 0) + 1;
    }
    return { tf, totalTerms: terms.length };
  });

  // score each chunk
  const scored = chunks.map((chunk, idx) => {
    const { tf, totalTerms } = chunkTFs[idx];
    let score = 0;
    const matchedTerms = [];

    for (const qt of queryTerms) {
      // exact match
      if (tf[qt]) {
        const termFreq = tf[qt] / (totalTerms || 1);
        const idf = Math.log(N / (df[qt] || 1));
        score += termFreq * idf;
        matchedTerms.push(qt);
      }
      
      // partial/prefix match (lower weight)
      for (const t of Object.keys(tf)) {
        if (t !== qt && (t.startsWith(qt) || qt.startsWith(t)) && t.length >= 3) {
          const termFreq = tf[t] / (totalTerms || 1);
          const idf = Math.log(N / (df[t] || 1));
          score += termFreq * idf * 0.3;
          if (!matchedTerms.includes(t)) matchedTerms.push(`~${t}`);
        }
      }
    }

    // boost for matching multiple query terms
    const uniqueMatches = matchedTerms.filter(t => !t.startsWith('~')).length;
    if (uniqueMatches > 1) {
      score *= (1 + uniqueMatches * 0.5);
    }

    // heading match boost (2x if query terms appear in heading)
    const headingTerms = tokenize(chunk.heading);
    for (const qt of queryTerms) {
      if (headingTerms.includes(qt)) {
        score *= 1.5;
      }
    }

    // recency boost for dated files (memory/2026-01-29.md)
    const dateMatch = chunk.file.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const fileDate = new Date(dateMatch[1]);
      const daysAgo = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo < 1) score *= 2.0;
      else if (daysAgo < 3) score *= 1.5;
      else if (daysAgo < 7) score *= 1.2;
      else if (daysAgo < 30) score *= 1.1;
    }

    return {
      ...chunk,
      score,
      matchedTerms,
    };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

async function loadAllChunks() {
  const chunks = [];

  // MEMORY.md
  if (existsSync(MEMORY_MD)) {
    const content = await readFile(MEMORY_MD, 'utf-8');
    chunks.push(...parseIntoChunks(content, 'MEMORY.md'));
  }

  // memory/*.md
  if (existsSync(MEMORY_DIR)) {
    const entries = await readdir(MEMORY_DIR);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        const content = await readFile(join(MEMORY_DIR, entry), 'utf-8');
        chunks.push(...parseIntoChunks(content, `memory/${entry}`));
      }
    }
  }

  return chunks;
}

// CLI
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const query = args.filter(a => a !== '--json').join(' ');

if (!query) {
  console.log('usage: node scripts/memory-search-v2.mjs "query terms"');
  process.exit(1);
}

const chunks = await loadAllChunks();
const results = searchWithTFIDF(chunks, query);

if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  if (results.length === 0) {
    console.log('no results');
  } else {
    console.log(`\n${results.length} results for "${query}":\n`);
    for (const r of results) {
      const preview = r.text.split('\n').slice(0, 3).join('\n  ');
      console.log(`[${r.score.toFixed(3)}] ${r.file} → ${r.heading || '(top)'}`);
      console.log(`  lines ${r.startLine}-${r.endLine}`);
      console.log(`  ${preview}`);
      console.log(`  matched: ${r.matchedTerms.join(', ')}\n`);
    }
  }
}

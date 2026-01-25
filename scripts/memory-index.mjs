#!/usr/bin/env node
/**
 * memory-index.mjs - local keyword index for memory files
 * 
 * builds inverted index: term -> [{file, line, context}]
 * no external deps, pure node
 * 
 * usage:
 *   node scripts/memory-index.mjs build    # rebuild index
 *   node scripts/memory-index.mjs search <query>  # search
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = process.env.CLAWD_WORKSPACE || '/data02/virt137413/clawd';
const INDEX_PATH = join(WORKSPACE, 'memory', 'keyword-index.json');
const MEMORY_DIR = join(WORKSPACE, 'memory');
const MEMORY_MD = join(WORKSPACE, 'MEMORY.md');
const TASKS_DIR = join(WORKSPACE, 'tasks');

// additional files to index (relative to workspace)
const EXTRA_FILES = [
  'QUICKREF.md',
  'AGENTS.md',
  'monetization-plan.md',
  'projects/context-memory/PLAN.md',
  'projects/context-memory/README.md',
  'scripts/README.md'
];

// stopwords to ignore
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'now', 'here', 'there', 'then', 'if', 'else'
]);

// simple synonyms for common terms
const SYNONYMS = {
  'api': ['endpoint', 'service', 'rest', 'route', 'server'],
  'db': ['database', 'postgres', 'sql', 'neon', 'storage'],
  'ui': ['interface', 'frontend', 'dashboard', 'page', 'view'],
  'error': ['bug', 'issue', 'problem', 'fail', 'fix', 'broken'],
  'config': ['configuration', 'settings', 'setup', 'env', 'options'],
  'auth': ['authentication', 'login', 'credentials', 'key', 'token'],
  'deploy': ['deployment', 'release', 'ship', 'vercel', 'railway', 'publish'],
  'test': ['testing', 'spec', 'check', 'verify', 'validate'],
  'docs': ['documentation', 'readme', 'guide', 'reference', 'manual'],
  'task': ['todo', 'backlog', 'work', 'item', 'job'],
  'memory': ['context', 'recall', 'remember', 'store', 'knowledge'],
  'search': ['find', 'query', 'lookup', 'index', 'locate'],
  'script': ['tool', 'utility', 'automation', 'command'],
  'webhook': ['hook', 'callback', 'notify', 'event'],
  'project': ['repo', 'codebase', 'workspace', 'app'],
  'build': ['compile', 'create', 'make', 'generate'],
  'run': ['execute', 'start', 'launch', 'invoke'],
  'status': ['state', 'health', 'condition', 'info'],
  'log': ['history', 'record', 'entry', 'journal'],
  'commit': ['save', 'push', 'version', 'change'],
};

// extract terms from text
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

// build index from files
async function buildIndex() {
  const index = {
    terms: {},      // term -> [{file, line, score}]
    files: {},      // file -> {lines, updated}
    built: new Date().toISOString()
  };

  const files = [];
  
  // add MEMORY.md
  if (existsSync(MEMORY_MD)) {
    files.push({ path: MEMORY_MD, name: 'MEMORY.md' });
  }

  // add memory/*.md files
  if (existsSync(MEMORY_DIR)) {
    const entries = await readdir(MEMORY_DIR);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        files.push({ path: join(MEMORY_DIR, entry), name: `memory/${entry}` });
      }
    }
  }

  // add tasks/*.md files
  if (existsSync(TASKS_DIR)) {
    const entries = await readdir(TASKS_DIR);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        files.push({ path: join(TASKS_DIR, entry), name: `tasks/${entry}` });
      }
    }
  }

  // add extra files
  for (const relPath of EXTRA_FILES) {
    const fullPath = join(WORKSPACE, relPath);
    if (existsSync(fullPath)) {
      files.push({ path: fullPath, name: relPath });
    }
  }

  for (const { path, name } of files) {
    try {
      const content = await readFile(path, 'utf-8');
      const lines = content.split('\n');
      
      index.files[name] = {
        lines: lines.length,
        updated: new Date().toISOString()
      };

      // index each line
      lines.forEach((line, lineNum) => {
        const terms = tokenize(line);
        const uniqueTerms = [...new Set(terms)];
        
        for (const term of uniqueTerms) {
          if (!index.terms[term]) {
            index.terms[term] = [];
          }
          
          // count term frequency in line for scoring
          const freq = terms.filter(t => t === term).length;
          
          index.terms[term].push({
            file: name,
            line: lineNum + 1,
            freq,
            context: line.trim().slice(0, 100)
          });
        }
      });
    } catch (err) {
      console.error(`error indexing ${name}:`, err.message);
    }
  }

  // sort entries by frequency (higher = more relevant)
  for (const term of Object.keys(index.terms)) {
    index.terms[term].sort((a, b) => b.freq - a.freq);
  }

  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
  
  const termCount = Object.keys(index.terms).length;
  const fileCount = Object.keys(index.files).length;
  console.log(`indexed ${termCount} terms from ${fileCount} files -> ${INDEX_PATH}`);
  
  return index;
}

// expand query with synonyms
function expandWithSynonyms(terms) {
  const expanded = new Set(terms);
  for (const term of terms) {
    // check if term is a synonym key
    if (SYNONYMS[term]) {
      SYNONYMS[term].forEach(syn => expanded.add(syn));
    }
    // check if term is in any synonym list
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (syns.includes(term)) {
        expanded.add(key);
        syns.forEach(syn => expanded.add(syn));
      }
    }
  }
  return [...expanded];
}

// search index
async function search(query, maxResults = 10) {
  if (!existsSync(INDEX_PATH)) {
    console.log('index not found, building...');
    await buildIndex();
  }

  const index = JSON.parse(await readFile(INDEX_PATH, 'utf-8'));
  const queryTerms = tokenize(query);
  
  if (queryTerms.length === 0) {
    console.log('no valid search terms');
    return [];
  }

  // expand with synonyms
  const expandedTerms = expandWithSynonyms(queryTerms);
  const originalTerms = new Set(queryTerms);

  // score each file:line by matching terms
  const scores = new Map(); // "file:line" -> {score, context, file, line, matchedTerms}

  for (const term of expandedTerms) {
    const matches = index.terms[term] || [];
    const isSynonym = !originalTerms.has(term);
    
    // also check partial matches (only for terms 4+ chars, require significant overlap)
    const partialMatches = [];
    if (term.length >= 4) {
      for (const indexTerm of Object.keys(index.terms)) {
        // require at least 70% overlap
        const shorter = Math.min(term.length, indexTerm.length);
        const longer = Math.max(term.length, indexTerm.length);
        if (shorter / longer >= 0.7) {
          if (indexTerm.includes(term) || term.includes(indexTerm)) {
            partialMatches.push(...index.terms[indexTerm].map(m => ({ ...m, partial: true })));
          }
        }
      }
    }

    for (const match of [...matches, ...partialMatches]) {
      const key = `${match.file}:${match.line}`;
      const existing = scores.get(key) || {
        score: 0,
        context: match.context,
        file: match.file,
        line: match.line,
        matchedTerms: []
      };
      
      // full match = freq * 2, partial = freq * 0.5, synonym = freq * 1
      let weight = match.partial ? 0.5 : 2;
      if (isSynonym) weight *= 0.5; // synonyms count less
      existing.score += match.freq * weight;
      
      if (!existing.matchedTerms.includes(term)) {
        existing.matchedTerms.push(term);
      }
      
      scores.set(key, existing);
    }
  }

  // boost scores for matching multiple query terms
  for (const [key, entry] of scores) {
    entry.score *= (1 + entry.matchedTerms.length * 0.5);
  }

  // sort by score, take top N
  const results = [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return results;
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'build':
    await buildIndex();
    break;
    
  case 'search':
    const query = args.join(' ');
    if (!query) {
      console.log('usage: node memory-index.mjs search <query>');
      process.exit(1);
    }
    const results = await search(query);
    
    // log search for analytics
    try {
      const { appendFile } = await import('fs/promises');
      const logEntry = JSON.stringify({
        ts: new Date().toISOString(),
        q: query,
        n: results.length
      }) + '\n';
      await appendFile(join(WORKSPACE, 'memory', 'search-log.jsonl'), logEntry);
    } catch {}
    
    if (results.length === 0) {
      console.log('no results');
    } else {
      console.log(`\nfound ${results.length} results:\n`);
      for (const r of results) {
        console.log(`[${r.score.toFixed(1)}] ${r.file}:${r.line}`);
        console.log(`  ${r.context}`);
        console.log(`  matched: ${r.matchedTerms.join(', ')}\n`);
      }
    }
    break;
    
  default:
    console.log('usage: node memory-index.mjs <build|search> [query]');
}

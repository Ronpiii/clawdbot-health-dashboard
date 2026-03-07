#!/usr/bin/env node
/**
 * Semantic search wrapper for context memory
 * Usage: ./scripts/semantic-search.mjs "query" [-k 5] [-m 0.3] [-j]
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const VENV_PYTHON = join(WORKSPACE, '.venv', 'bin', 'python3');
const EMBED_SCRIPT = join(WORKSPACE, 'projects', 'context-memory', 'src', 'embed.py');

function run(command, args = []) {
  const query = args[0];
  if (!query && command !== 'build') {
    console.error('Usage: semantic-search.mjs <query> | build');
    process.exit(1);
  }
  
  const cmdArgs = [EMBED_SCRIPT, command];
  if (query) cmdArgs.push(query);
  
  // Parse flags
  const topK = args.includes('-k') ? args[args.indexOf('-k') + 1] : '5';
  const minScore = args.includes('-m') ? args[args.indexOf('-m') + 1] : '0.3';
  const json = args.includes('-j') || args.includes('--json');
  
  if (command === 'search') {
    cmdArgs.push('-k', topK, '-m', minScore);
    if (json) cmdArgs.push('-j');
  }
  
  try {
    const result = execSync(`${VENV_PYTHON} ${cmdArgs.join(' ')}`, {
      cwd: WORKSPACE,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit']
    });
    console.log(result);
  } catch (err) {
    console.error('Search failed:', err.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args[0] === 'build') {
  run('build', args.slice(1));
} else {
  run('search', args);
}

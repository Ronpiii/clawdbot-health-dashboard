#!/usr/bin/env node
/**
 * Semantic search wrapper for context memory
 * Usage: ./scripts/semantic-search.mjs "query" [-k 5] [-m 0.3] [-j]
 *        ./scripts/semantic-search.mjs build
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const VENV_PYTHON = join(WORKSPACE, '.venv', 'bin', 'python3');
const EMBED_SCRIPT = join(WORKSPACE, 'projects', 'context-memory', 'src', 'embed.py');

function run(command, args = []) {
  const cmdArgs = [EMBED_SCRIPT, command];
  
  if (command === 'build') {
    // no extra args needed
  } else if (command === 'search') {
    const query = args[0];
    if (!query) {
      console.error('Usage: arc sem <query> [-k 5] [-m 0.3] [-j]');
      console.error('       arc sem build');
      process.exit(1);
    }
    
    cmdArgs.push(query);
    
    // Parse flags
    const kIdx = args.indexOf('-k');
    const topK = kIdx !== -1 ? args[kIdx + 1] : '5';
    
    const mIdx = args.indexOf('-m');
    const minScore = mIdx !== -1 ? args[mIdx + 1] : '0.3';
    
    const json = args.includes('-j') || args.includes('--json');
    
    cmdArgs.push('-k', topK, '-m', minScore);
    if (json) cmdArgs.push('-j');
  }
  
  const result = spawnSync(VENV_PYTHON, cmdArgs, {
    cwd: WORKSPACE,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit']
  });
  
  if (result.error) {
    console.error('Search failed:', result.error.message);
    process.exit(1);
  }
  
  if (result.stdout) {
    console.log(result.stdout);
  }
  
  process.exit(result.status || 0);
}

const args = process.argv.slice(2);
if (args[0] === 'build') {
  run('build', args.slice(1));
} else if (args[0] === 'update') {
  run('update', args.slice(1));
} else if (args[0] === 'stats') {
  run('stats', args.slice(1));
} else {
  run('search', args);
}

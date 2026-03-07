#!/usr/bin/env node
/**
 * memory-watch - auto-rebuild semantic index when memory files change
 * 
 * Uses polling (fs.watch is unreliable on network mounts)
 * 
 * Usage:
 *   ./scripts/memory-watch.mjs           # watch and rebuild
 *   ./scripts/memory-watch.mjs --once    # check once, rebuild if needed
 *   ./scripts/memory-watch.mjs --status  # show watch status
 */

import { watch, readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const MEMORY_DIR = join(WORKSPACE, 'memory');
const LEARNINGS_DIR = join(WORKSPACE, 'learnings');
const MEMORY_FILE = join(WORKSPACE, 'MEMORY.md');
const HASH_CACHE = join(WORKSPACE, 'projects', 'context-memory', 'index', 'watch-hashes.json');
const VENV_PYTHON = join(WORKSPACE, '.venv', 'bin', 'python3');
const EMBED_SCRIPT = join(WORKSPACE, 'projects', 'context-memory', 'src', 'embed.py');

function getFileHash(path) {
  try {
    const content = readFileSync(path);
    return createHash('md5').update(content).digest('hex');
  } catch {
    return null;
  }
}

function getDirectoryHashes(dir) {
  const hashes = {};
  if (!existsSync(dir)) return hashes;
  
  try {
    const files = readdirSync(dir, { recursive: true });
    for (const file of files) {
      if (typeof file === 'string' && file.endsWith('.md')) {
        const fullPath = join(dir, file);
        const hash = getFileHash(fullPath);
        if (hash) hashes[fullPath] = hash;
      }
    }
  } catch {
    // ignore errors
  }
  return hashes;
}

function getCurrentHashes() {
  const hashes = {};
  
  // Memory directory
  Object.assign(hashes, getDirectoryHashes(MEMORY_DIR));
  
  // Learnings directory
  Object.assign(hashes, getDirectoryHashes(LEARNINGS_DIR));
  
  // MEMORY.md
  const memHash = getFileHash(MEMORY_FILE);
  if (memHash) hashes[MEMORY_FILE] = memHash;
  
  return hashes;
}

function loadCachedHashes() {
  try {
    if (existsSync(HASH_CACHE)) {
      return JSON.parse(readFileSync(HASH_CACHE, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {};
}

import { writeFileSync, mkdirSync } from 'fs';

function saveCachedHashes(hashes) {
  try {
    mkdirSync(dirname(HASH_CACHE), { recursive: true });
    writeFileSync(HASH_CACHE, JSON.stringify(hashes, null, 2));
  } catch {
    // ignore
  }
}

function detectChanges(current, cached) {
  const changes = [];
  
  // Check for new or modified files
  for (const [path, hash] of Object.entries(current)) {
    if (!cached[path]) {
      changes.push({ path, type: 'added' });
    } else if (cached[path] !== hash) {
      changes.push({ path, type: 'modified' });
    }
  }
  
  // Check for deleted files
  for (const path of Object.keys(cached)) {
    if (!current[path]) {
      changes.push({ path, type: 'deleted' });
    }
  }
  
  return changes;
}

function rebuildIndex() {
  console.log('🔄 Rebuilding semantic index...');
  
  const result = spawnSync(VENV_PYTHON, [EMBED_SCRIPT, 'update'], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit']
  });
  
  if (result.status === 0) {
    console.log('✓ Index updated');
    try {
      const output = JSON.parse(result.stdout);
      console.log(`  ${output.indexed} chunks, ${output.changed} changed files`);
    } catch {
      // ignore parse errors
    }
  } else {
    console.log('✗ Index update failed');
  }
}

async function runOnce() {
  const current = getCurrentHashes();
  const cached = loadCachedHashes();
  const changes = detectChanges(current, cached);
  
  if (changes.length === 0) {
    console.log('✓ No changes detected');
    return;
  }
  
  console.log(`Found ${changes.length} change(s):`);
  for (const { path, type } of changes.slice(0, 5)) {
    const shortPath = path.replace(WORKSPACE + '/', '');
    console.log(`  ${type}: ${shortPath}`);
  }
  if (changes.length > 5) {
    console.log(`  ... and ${changes.length - 5} more`);
  }
  
  rebuildIndex();
  
  // Save new hashes
  saveCachedHashes(current);
}

function showStatus() {
  const current = getCurrentHashes();
  const cached = loadCachedHashes();
  const changes = detectChanges(current, cached);
  
  console.log('Memory Watch Status');
  console.log('═'.repeat(40));
  console.log(`Tracked files: ${Object.keys(current).length}`);
  console.log(`Cached hashes: ${Object.keys(cached).length}`);
  console.log(`Pending changes: ${changes.length}`);
  
  if (changes.length > 0) {
    console.log('\nChanges:');
    for (const { path, type } of changes) {
      const shortPath = path.replace(WORKSPACE + '/', '');
      console.log(`  ${type}: ${shortPath}`);
    }
  }
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--status')) {
  showStatus();
} else if (args.includes('--once')) {
  await runOnce();
} else {
  // Watch mode - poll every 30 seconds
  console.log('👁 Memory watch started (polling every 30s)');
  console.log('Press Ctrl+C to stop\n');
  
  let lastHashes = loadCachedHashes();
  
  const check = async () => {
    const current = getCurrentHashes();
    const changes = detectChanges(current, lastHashes);
    
    if (changes.length > 0) {
      console.log(`\n[${new Date().toISOString()}] ${changes.length} change(s) detected`);
      rebuildIndex();
      
      // Save new hashes
      saveCachedHashes(current);
      lastHashes = current;
    }
  };
  
  // Initial check
  await check();
  
  // Poll every 30 seconds
  setInterval(check, 30000);
}

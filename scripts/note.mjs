#!/usr/bin/env node
/**
 * note.mjs - quick note capture to today's memory log
 * 
 * usage:
 *   node scripts/note.mjs "some note here"
 *   node scripts/note.mjs --section "Learnings" "something I learned"
 *   echo "piped note" | node scripts/note.mjs
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = '/data02/virt137413/clawd';
const MEMORY_DIR = join(WORKSPACE, 'memory');

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getTodayFile() {
  return join(MEMORY_DIR, `${getToday()}.md`);
}

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString().trim();
}

async function ensureTodayFile() {
  const file = getTodayFile();
  if (!existsSync(file)) {
    await mkdir(MEMORY_DIR, { recursive: true });
    await writeFile(file, `# ${getToday()}\n\n## Notes\n`);
  }
  return file;
}

async function addNote(note, section = null) {
  const file = await ensureTodayFile();
  let content = await readFile(file, 'utf-8');
  
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 5);
  const formattedNote = `- [${timestamp}] ${note}`;
  
  if (section) {
    // find or create section
    const sectionHeader = `## ${section}`;
    if (!content.includes(sectionHeader)) {
      content = content.trimEnd() + `\n\n${sectionHeader}\n`;
    }
    
    // add note after section header
    const lines = content.split('\n');
    const sectionIdx = lines.findIndex(l => l === sectionHeader);
    
    // find next section or end
    let insertIdx = sectionIdx + 1;
    while (insertIdx < lines.length && !lines[insertIdx].startsWith('## ')) {
      insertIdx++;
    }
    
    // insert before next section
    lines.splice(insertIdx, 0, formattedNote);
    content = lines.join('\n');
  } else {
    // append to end
    content = content.trimEnd() + '\n' + formattedNote + '\n';
  }
  
  await writeFile(file, content);
  console.log(`noted: ${formattedNote}`);
}

// CLI
const args = process.argv.slice(2);
let section = null;
let noteArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--section' || args[i] === '-s') {
    section = args[++i];
  } else {
    noteArgs.push(args[i]);
  }
}

let note = noteArgs.join(' ');

// try stdin if no note given
if (!note) {
  note = await readStdin();
}

if (!note) {
  console.log('usage: note.mjs [--section "Section"] "note text"');
  console.log('       echo "note" | note.mjs');
  process.exit(1);
}

await addNote(note, section);

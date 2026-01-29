#!/usr/bin/env node
/**
 * learn.mjs - capture lessons learned
 * 
 * Adds to a "## lessons" section in today's daily log.
 * Forces distillation: what did I learn, not just what did I do.
 * 
 * usage:
 *   node scripts/learn.mjs "always check token expiry before API calls"
 *   arc learn "RLS policies can cause infinite recursion with self-referencing queries"
 */

import { readFile, writeFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const WORKSPACE = process.env.CLAWD_WORKSPACE || '/data02/virt137413/clawd';
const MEMORY_DIR = join(WORKSPACE, 'memory');

const lesson = process.argv.slice(2).join(' ').trim();

if (!lesson) {
  console.log('usage: arc learn "lesson text"');
  console.log('\ncaptures lessons to the daily log, not just activities');
  process.exit(1);
}

// Get today's file
const today = new Date().toISOString().split('T')[0];
const filePath = join(MEMORY_DIR, `${today}.md`);

async function addLesson() {
  const timestamp = new Date().toTimeString().slice(0, 5);
  const entry = `- [${timestamp}] ${lesson}`;
  
  if (!existsSync(filePath)) {
    // Create new file with lessons section
    const content = `# ${today}\n\n## lessons\n${entry}\n`;
    await writeFile(filePath, content);
    console.log(`✓ created ${today}.md with lesson`);
    return;
  }
  
  // Read existing file
  let content = await readFile(filePath, 'utf-8');
  
  // Check if lessons section exists
  if (content.includes('## lessons')) {
    // Add to existing lessons section
    const lines = content.split('\n');
    const lessonIdx = lines.findIndex(l => l.trim() === '## lessons');
    
    // Find the next section or end of file
    let insertIdx = lessonIdx + 1;
    while (insertIdx < lines.length && !lines[insertIdx].startsWith('## ')) {
      insertIdx++;
    }
    
    // Insert before next section (or at end)
    lines.splice(insertIdx, 0, entry);
    content = lines.join('\n');
  } else {
    // Add lessons section at the end
    content = content.trimEnd() + '\n\n## lessons\n' + entry + '\n';
  }
  
  await writeFile(filePath, content);
  console.log(`✓ lesson added to ${today}.md`);
}

addLesson().catch(err => {
  console.error('error:', err.message);
  process.exit(1);
});

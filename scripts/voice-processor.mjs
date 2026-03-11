#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');
const voiceMemoDir = path.join(workspaceRoot, 'memory', 'voice-memos');
const transcriptDir = path.join(workspaceRoot, 'memory', 'transcripts');

// ensure directories exist
[voiceMemoDir, transcriptDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// action item patterns
const actionPatterns = [
  { pattern: /TODO[:\s]+([^\n]+)/gi, type: 'todo' },
  { pattern: /action[:\s]+([^\n]+)/gi, type: 'action' },
  { pattern: /decide[d]?[:\s]+([^\n]+)/gi, type: 'decision' },
  { pattern: /@(\w+)/g, type: 'mention' },
  { pattern: /(?:need to|should|must)[:\s]+([^\n]+)/gi, type: 'task' },
];

export async function transcribeAudio(filePath) {
  const fileName = path.basename(filePath);
  const withoutExt = path.parse(fileName).name;

  // check if whisper is available
  try {
    execSync('which whisper', { stdio: 'pipe' });
  } catch {
    return {
      success: false,
      error: 'whisper not found. install: pip install openai-whisper',
      hint: 'alternatively, use: openai-whisper --model tiny ' + filePath,
    };
  }

  try {
    const transcriptPath = path.join(transcriptDir, withoutExt + '.txt');

    // run whisper with model=tiny for speed
    console.log(`🎙️  transcribing ${fileName}...`);
    const cmd = `whisper "${filePath}" --model tiny --output_format txt --output_dir "${transcriptDir}" --device cpu 2>/dev/null`;
    execSync(cmd, { stdio: 'pipe' });

    const transcript = fs.readFileSync(transcriptPath, 'utf8').trim();
    return { success: true, transcript, fileName, withoutExt };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      hint: 'ensure audio file is valid WAV, MP3, or M4A',
    };
  }
}

export function extractActionItems(transcript) {
  const items = {
    todos: [],
    actions: [],
    decisions: [],
    mentions: [],
    tasks: [],
  };

  actionPatterns.forEach(({ pattern, type }) => {
    let match;
    while ((match = pattern.exec(transcript)) !== null) {
      const text = (match[1] || match[0]).trim();
      if (text && text.length > 3) {
        if (!items[type === 'mention' ? 'mentions' : type + 's']?.includes(text)) {
          items[type === 'mention' ? 'mentions' : type + 's'].push(text);
        }
      }
    }
  });

  return items;
}

export function formatForLog(transcript, actionItems, fileName) {
  let output = `### Voice Memo: ${path.parse(fileName).name}\n\n`;
  output += '**Transcription:**\n' + transcript + '\n\n';

  if (
    actionItems.todos.length ||
    actionItems.actions.length ||
    actionItems.decisions.length ||
    actionItems.mentions.length ||
    actionItems.tasks.length
  ) {
    output += '**Action Items:**\n';
    if (actionItems.todos.length) output += '- [ ] ' + actionItems.todos.join('\n- [ ] ') + '\n';
    if (actionItems.actions.length) output += '**Actions:** ' + actionItems.actions.join(', ') + '\n';
    if (actionItems.decisions.length) output += '**Decisions:** ' + actionItems.decisions.join(', ') + '\n';
    if (actionItems.mentions.length) output += '**Mentions:** @' + actionItems.mentions.join(', @') + '\n';
    if (actionItems.tasks.length) output += '**Tasks:** ' + actionItems.tasks.join(', ') + '\n';
  }

  return output;
}

export function appendToTodaysLog(content) {
  const now = new Date();
  const todayFile = path.join(
    workspaceRoot,
    'memory',
    now.toISOString().split('T')[0] + '.md'
  );

  let existing = '';
  if (fs.existsSync(todayFile)) {
    existing = fs.readFileSync(todayFile, 'utf8');
  }

  fs.writeFileSync(todayFile, existing + '\n' + content);
  return todayFile;
}

export async function processVoiceMemos(opts = {}) {
  const { silent = false } = opts;

  if (!fs.existsSync(voiceMemoDir)) {
    return { success: false, error: 'voice-memos directory not found' };
  }

  const files = fs.readdirSync(voiceMemoDir).filter(f => /\.(mp3|wav|m4a|flac)$/i.test(f));

  if (!files.length) {
    return { success: true, message: 'no voice memos to process' };
  }

  const processed = [];

  for (const file of files) {
    const filePath = path.join(voiceMemoDir, file);

    if (!silent) console.log(`processing: ${file}`);

    const result = await transcribeAudio(filePath);
    if (!result.success) {
      if (!silent) console.error(`✗ ${file}: ${result.error}`);
      continue;
    }

    const actionItems = extractActionItems(result.transcript);
    const logEntry = formatForLog(result.transcript, actionItems, file);
    const appendedPath = appendToTodaysLog(logEntry);

    if (!silent) console.log(`✓ ${file} → ${path.basename(appendedPath)}`);

    // move processed file to archive
    const archiveDir = path.join(voiceMemoDir, 'processed');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(filePath, path.join(archiveDir, file));

    processed.push({
      file,
      actionItems: Object.fromEntries(Object.entries(actionItems).filter(([, v]) => v.length)),
    });
  }

  return { success: true, processed };
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];

  if (!cmd || cmd === '--help') {
    console.log(`
usage: arc voice <command>

commands:
  process     process all voice memos in memory/voice-memos/
  list        list unprocessed voice memos
  setup       create voice-memos directory
  path        show voice-memos directory path

examples:
  arc voice process
  arc voice list
`);
    process.exit(0);
  }

  (async () => {
    if (cmd === 'setup') {
      if (!fs.existsSync(voiceMemoDir)) {
        fs.mkdirSync(voiceMemoDir, { recursive: true });
        console.log(`✓ created ${voiceMemoDir}`);
      } else {
        console.log(`✓ ${voiceMemoDir} already exists`);
      }
      process.exit(0);
    }

    if (cmd === 'path') {
      console.log(voiceMemoDir);
      process.exit(0);
    }

    if (cmd === 'list') {
      const files = fs.readdirSync(voiceMemoDir).filter(f => /\.(mp3|wav|m4a|flac)$/i.test(f));
      if (files.length) {
        console.log(`${files.length} voice memo(s):\n` + files.map(f => `  • ${f}`).join('\n'));
      } else {
        console.log('no voice memos in ' + voiceMemoDir);
      }
      process.exit(0);
    }

    if (cmd === 'process') {
      const result = await processVoiceMemos();
      if (!result.success) {
        console.error(result.error);
        process.exit(1);
      }
      console.log(`processed ${result.processed?.length || 0} memos`);
      process.exit(0);
    }

    console.error(`unknown command: ${cmd}`);
    process.exit(1);
  })();
}

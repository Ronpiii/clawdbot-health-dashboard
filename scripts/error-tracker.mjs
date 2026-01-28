#!/usr/bin/env node
/**
 * Error Tracker
 * Scans logs for errors and summarizes them
 * 
 * Usage:
 *   node scripts/error-tracker.mjs                     # scan recent clawdbot logs
 *   node scripts/error-tracker.mjs /path/to/log        # scan specific file
 *   node scripts/error-tracker.mjs --watch             # continuous monitoring
 *   node scripts/error-tracker.mjs --json              # output as JSON
 */

import { readFileSync, existsSync, statSync, watch } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const jsonMode = args.includes('--json');
const logPath = args.find(a => !a.startsWith('--'));

// Error patterns to look for
const ERROR_PATTERNS = [
  { regex: /error[:\s]+(.{0,100})/gi, type: 'error' },
  { regex: /Error:\s*(.{0,100})/g, type: 'error' },
  { regex: /\bERR\b[:\s]*(.{0,100})/gi, type: 'error' },
  { regex: /failed[:\s]+(.{0,100})/gi, type: 'failure' },
  { regex: /FATAL[:\s]*(.{0,100})/gi, type: 'fatal' },
  { regex: /panic[:\s]*(.{0,100})/gi, type: 'panic' },
  { regex: /exception[:\s]*(.{0,100})/gi, type: 'exception' },
  { regex: /ENOENT[:\s]*(.{0,80})/gi, type: 'file-not-found' },
  { regex: /ECONNREFUSED[:\s]*(.{0,80})/gi, type: 'connection-refused' },
  { regex: /ETIMEDOUT[:\s]*(.{0,80})/gi, type: 'timeout' },
  { regex: /UnhandledPromiseRejection[:\s]*(.{0,100})/gi, type: 'unhandled-promise' },
  { regex: /TypeError[:\s]*(.{0,100})/gi, type: 'type-error' },
  { regex: /ReferenceError[:\s]*(.{0,100})/gi, type: 'reference-error' },
  { regex: /SyntaxError[:\s]*(.{0,100})/gi, type: 'syntax-error' },
];

// Patterns to ignore (false positives)
const IGNORE_PATTERNS = [
  /error handling/i,
  /no error/i,
  /error\.md/i,
  /if.*error/i,
  /catch.*error/i,
  /error-tracker/i,
];

function findLogs() {
  const candidates = [
    join(process.env.HOME || '', '.clawdbot/logs'),
    '/var/log/clawdbot',
    join(ROOT, 'logs'),
  ];
  
  for (const dir of candidates) {
    if (existsSync(dir)) {
      try {
        const files = execSync(`ls -t "${dir}"/*.log 2>/dev/null | head -5`, { encoding: 'utf-8' })
          .trim()
          .split('\n')
          .filter(Boolean);
        if (files.length > 0) return files;
      } catch {}
    }
  }
  
  // Try pm2 logs
  try {
    const pm2Log = execSync('pm2 logs clawdbot --nostream --lines 0 2>&1 | head -1', { encoding: 'utf-8' });
    const match = pm2Log.match(/([^\s]+\.log)/);
    if (match && existsSync(match[1])) {
      return [match[1]];
    }
  } catch {}
  
  return [];
}

function parseErrors(content, source = 'unknown') {
  const errors = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip ignored patterns
    if (IGNORE_PATTERNS.some(p => p.test(line))) continue;
    
    for (const { regex, type } of ERROR_PATTERNS) {
      regex.lastIndex = 0; // Reset regex state
      const match = regex.exec(line);
      if (match) {
        // Extract timestamp if present
        const tsMatch = line.match(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/);
        const timestamp = tsMatch ? tsMatch[0] : null;
        
        // Get context (surrounding lines)
        const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join('\n');
        
        errors.push({
          type,
          message: match[1]?.trim() || match[0].trim(),
          timestamp,
          source,
          line: i + 1,
          context: context.slice(0, 300),
        });
        break; // Only match first pattern per line
      }
    }
  }
  
  return errors;
}

function dedupeErrors(errors) {
  const seen = new Map();
  
  for (const err of errors) {
    // Create a key from type + normalized message
    const normalizedMsg = err.message
      .replace(/\d+/g, 'N')  // Replace numbers
      .replace(/0x[a-f0-9]+/gi, 'ADDR')  // Replace hex addresses
      .replace(/\/[^\s]+/g, '/PATH')  // Replace paths
      .slice(0, 80);
    
    const key = `${err.type}:${normalizedMsg}`;
    
    if (seen.has(key)) {
      seen.get(key).count++;
      seen.get(key).lastSeen = err.timestamp || seen.get(key).lastSeen;
    } else {
      seen.set(key, {
        ...err,
        count: 1,
        lastSeen: err.timestamp,
      });
    }
  }
  
  return Array.from(seen.values()).sort((a, b) => b.count - a.count);
}

function formatOutput(errors, format = 'text') {
  if (format === 'json') {
    return JSON.stringify(errors, null, 2);
  }
  
  if (errors.length === 0) {
    return '✅ No errors found';
  }
  
  const lines = [`\n🔴 Found ${errors.length} unique error patterns:\n`];
  
  // Group by type
  const byType = {};
  for (const err of errors) {
    if (!byType[err.type]) byType[err.type] = [];
    byType[err.type].push(err);
  }
  
  for (const [type, typeErrors] of Object.entries(byType)) {
    lines.push(`\n## ${type.toUpperCase()} (${typeErrors.length})`);
    
    for (const err of typeErrors.slice(0, 5)) {
      const countStr = err.count > 1 ? ` (×${err.count})` : '';
      const timeStr = err.lastSeen ? ` [${err.lastSeen}]` : '';
      lines.push(`  • ${err.message.slice(0, 60)}${countStr}${timeStr}`);
    }
    
    if (typeErrors.length > 5) {
      lines.push(`  ... and ${typeErrors.length - 5} more`);
    }
  }
  
  return lines.join('\n');
}

async function scanLogs(paths) {
  const allErrors = [];
  
  for (const path of paths) {
    if (!existsSync(path)) {
      console.error(`File not found: ${path}`);
      continue;
    }
    
    try {
      // Read last 10000 lines (or whole file if smaller)
      const stat = statSync(path);
      let content;
      
      if (stat.size > 1024 * 1024) {
        // Large file, use tail
        content = execSync(`tail -n 10000 "${path}"`, { encoding: 'utf-8' });
      } else {
        content = readFileSync(path, 'utf-8');
      }
      
      const errors = parseErrors(content, basename(path));
      allErrors.push(...errors);
    } catch (e) {
      console.error(`Error reading ${path}: ${e.message}`);
    }
  }
  
  return dedupeErrors(allErrors);
}

async function main() {
  let paths;
  
  if (logPath) {
    paths = [logPath];
  } else {
    paths = findLogs();
    if (paths.length === 0) {
      console.log('No log files found. Specify a path or ensure clawdbot logs exist.');
      console.log('\nChecked locations:');
      console.log('  - ~/.clawdbot/logs/*.log');
      console.log('  - /var/log/clawdbot/*.log');
      console.log('  - ./logs/*.log');
      console.log('  - pm2 logs');
      return;
    }
  }
  
  console.log(`📋 Scanning: ${paths.join(', ')}\n`);
  
  if (watchMode) {
    console.log('👁️  Watch mode enabled (Ctrl+C to stop)\n');
    
    // Initial scan
    const errors = await scanLogs(paths);
    console.log(formatOutput(errors, jsonMode ? 'json' : 'text'));
    
    // Watch for changes
    for (const path of paths) {
      if (existsSync(path)) {
        let lastSize = statSync(path).size;
        
        setInterval(async () => {
          const currentSize = statSync(path).size;
          if (currentSize !== lastSize) {
            lastSize = currentSize;
            const newErrors = await scanLogs([path]);
            if (newErrors.length > 0) {
              console.log(`\n[${new Date().toISOString()}] New errors detected:`);
              console.log(formatOutput(newErrors, jsonMode ? 'json' : 'text'));
            }
          }
        }, 5000);
      }
    }
  } else {
    const errors = await scanLogs(paths);
    console.log(formatOutput(errors, jsonMode ? 'json' : 'text'));
  }
}

main().catch(console.error);

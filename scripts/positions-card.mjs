#!/usr/bin/env node
/**
 * Positions Card - LIVE DATA from Hyperliquid
 * Fetches fresh prices + P&L every time you ask
 * Uses raw API (not SDK) for speed and reliability
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const botDir = path.join(__dirname, '../projects/hyperliquid-bot');

const result = spawnSync('node', ['positions-live-raw.mjs'], {
  cwd: botDir,
  encoding: 'utf8',
  timeout: 15000,
  stdio: ['ignore', 'pipe', 'ignore'], // only capture stdout, ignore stderr + stdin
});

if (result.stdout) console.log(result.stdout);

process.exit(result.status || 0);

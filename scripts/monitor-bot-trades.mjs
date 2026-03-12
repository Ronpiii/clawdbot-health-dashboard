#!/usr/bin/env node
/**
 * Monitor bot trades and post to Discord
 * Watches bot.log for NEW trade activity
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const botLogPath = path.join(__dirname, '../projects/hyperliquid-bot/bot.log');
const stateFile = path.join(__dirname, '../projects/hyperliquid-bot/.trade-alert-state');

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1480891035126075463/WWw6Xapr3n19Xr6S_PoabJk1mzCGmj8KxQjR06EFzL5oYu22MUbu2TgGgCS-SVCm_70g';

async function postToDiscord(message) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ content: message });
    const url = new URL(DISCORD_WEBHOOK);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(true));
    });

    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

function getLastSeenLines() {
  try {
    if (fs.existsSync(stateFile)) {
      return parseInt(fs.readFileSync(stateFile, 'utf8').trim()) || 0;
    }
  } catch (e) {}
  return 0;
}

function saveLastSeenLines(count) {
  fs.writeFileSync(stateFile, count.toString());
}

async function checkNewTrades() {
  try {
    const content = fs.readFileSync(botLogPath, 'utf8');
    const lines = content.split('\n');
    const lastSeen = getLastSeenLines();
    
    const newLines = lines.slice(lastSeen);
    const newContent = newLines.join('\n');
    
    // Look for trade signals: PLACING, ✅ ORDER PLACED, CLOSING
    const tradePatterns = [
      /📍 PLACING: (BUY|SELL|LONG|SHORT) (.+?) (\d+\.?\d*) (.+)/g,
      /✅ ORDER PLACED/g,
      /🎯 CLOSE SIGNAL/g,
      /📈 SCALE/g,
    ];
    
    let hasNewTrade = false;
    let tradeMessage = '';
    
    if (newContent.includes('PLACING') || newContent.includes('ORDER PLACED')) {
      hasNewTrade = true;
      tradeMessage = '🚨 **NEW TRADE ACTIVITY DETECTED**\n```\n' + newContent.slice(-500) + '\n```';
    }
    
    if (hasNewTrade && tradeMessage) {
      console.log('📤 Posting trade alert...');
      await postToDiscord(tradeMessage);
    }
    
    saveLastSeenLines(lines.length);
  } catch (err) {
    console.error('Monitor error:', err.message);
  }
}

// Run once
await checkNewTrades();

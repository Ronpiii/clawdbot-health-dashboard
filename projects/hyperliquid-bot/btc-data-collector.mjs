#!/usr/bin/env node

/**
 * BTC Historical Data Collector from Hyperliquid API
 * Fetches 5m candles: 2024-03-13 to 2025-03-13 (1 year of data)
 * Fixed API payload: uses proper request structure
 */

import fs from 'fs';
import path from 'path'
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'backtest-data');
const DATA_FILE = path.join(DATA_DIR, 'BTC_5m_historical.jsonl');
const STATE_FILE = path.join(DATA_DIR, '.collector-state.json');

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';
const RATE_LIMIT_MS = 1500;
const CANDLE_WIDTH_MS = 300000; // 5m

const END_TIME = new Date('2025-03-13T00:00:00Z').getTime();
const START_TIME = new Date('2024-03-13T00:00:00Z').getTime();

let stats = {
  startTime: Date.now(),
  candlesCollected: 0,
  startTimestamp: END_TIME,
  requestsTotal: 0,
  requestsSuccess: 0,
  requestsFailed: 0,
  lastError: null,
};

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(stats, null, 2));
}

async function fetchCandles(startTime, endTime) {
  try {
    stats.requestsTotal++;

    const payload = {
      type: 'candleSnapshot',
      req: {
        coin: 'BTC',
        interval: '5m',
        startTime: Math.floor(startTime),
        endTime: Math.floor(endTime),
      },
    };

    const response = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 10000,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`);
    }

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('API returned non-array: ' + JSON.stringify(data).slice(0, 100));
    }

    stats.requestsSuccess++;
    return data;
  } catch (error) {
    stats.requestsFailed++;
    stats.lastError = error.message;
    throw error;
  }
}

async function collectData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(STATE_FILE)) {
    try {
      stats = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      log(`state loaded: ${stats.candlesCollected} candles`);
    } catch (e) {
      log(`warn: state load failed`);
    }
  }

  const existing = new Set();
  if (fs.existsSync(DATA_FILE)) {
    const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const [ts] = JSON.parse(line);
        existing.add(ts);
      } catch (e) {}
    }
  }

  const totalCandles = Math.ceil((stats.startTimestamp - START_TIME) / CANDLE_WIDTH_MS);
  log(`target: ~${totalCandles} candles from ${new Date(START_TIME).toISOString()} to ${new Date(stats.startTimestamp).toISOString()}`);

  let currentTime = stats.startTimestamp;
  let batchCount = 0;

  while (currentTime > START_TIME) {
    const batchStart = Math.max(currentTime - 1000 * CANDLE_WIDTH_MS, START_TIME);
    
    try {
      log(`batch ${++batchCount}: ${new Date(batchStart).toISOString()} → ${new Date(currentTime).toISOString()}`);
      const candles = await fetchCandles(batchStart, currentTime);

      let newCount = 0;
      for (const candle of candles) {
        const ts = candle[0];
        if (!existing.has(ts)) {
          fs.appendFileSync(DATA_FILE, JSON.stringify(candle) + '\n');
          existing.add(ts);
          newCount++;
          stats.candlesCollected++;
        }
      }

      log(`  ✓ ${newCount} new (${candles.length} total)`);
      
      if (batchCount % 5 === 0) saveState();
      
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    } catch (error) {
      log(`  ✗ ${error.message}`);
      saveState();
      await new Promise(r => setTimeout(r, 5000));
    }

    currentTime = batchStart;
  }

  saveState();
  const runtime = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  log(`complete: ${stats.candlesCollected} candles, ${stats.requestsSuccess}/${stats.requestsTotal} requests in ${runtime}s`);
}

collectData().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * BTC EMA Signal Checker
 * 
 * Regime-filtered strategy:
 * - 200 EMA determines regime (bull/bear/chop)
 * - 20 EMA determines entry/exit
 * 
 * Usage:
 *   ./scripts/btc-signal.mjs           # check current signal
 *   ./scripts/btc-signal.mjs --json    # JSON output
 *   ./scripts/btc-signal.mjs --alert   # only output if signal changed
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const STATE_FILE = join(WORKSPACE, '.cache', 'btc-signal-state.json');

// Ensure cache dir exists
const cacheDir = dirname(STATE_FILE);
if (!existsSync(cacheDir)) {
  mkdirSync(cacheDir, { recursive: true });
}

// --- Config ---
const CONFIG = {
  shortEMA: 20,
  longEMA: 200,
  chopZone: 0.03, // 3% around 200 EMA
  leverage: 3,
  riskPercent: 0.02,
  stopPercent: 0.06,
};

// --- Fetch Price Data ---
async function fetchPriceHistory() {
  // CoinGecko API - last 200 days
  const url = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200&interval=daily';
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.prices.map(p => p[1]); // extract just prices
  } catch (err) {
    console.error('Failed to fetch price data:', err.message);
    return null;
  }
}

async function fetchCurrentPrice() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.bitcoin.usd;
  } catch (err) {
    console.error('Failed to fetch current price:', err.message);
    return null;
  }
}

// --- Calculate EMA ---
function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

// --- Determine Signal ---
function analyzeSignal(price, ema20, ema200) {
  // Determine regime
  let regime;
  const chopThreshold = ema200 * CONFIG.chopZone;
  
  if (price > ema200 + chopThreshold) {
    regime = 'BULL';
  } else if (price < ema200 - chopThreshold) {
    regime = 'BEAR';
  } else {
    regime = 'CHOP';
  }
  
  // Determine signal based on 20 EMA
  const above20 = price > ema20;
  
  // Final action
  let action, direction;
  
  if (regime === 'BULL') {
    if (above20) {
      action = 'LONG';
      direction = 'long';
    } else {
      action = 'EXIT';
      direction = 'cash';
    }
  } else if (regime === 'BEAR') {
    if (!above20) {
      action = 'SHORT';
      direction = 'short';
    } else {
      action = 'EXIT';
      direction = 'cash';
    }
  } else {
    // CHOP
    action = 'REDUCED';
    if (above20) {
      direction = 'long-half';
    } else {
      direction = 'short-half';
    }
  }
  
  // Calculate stop
  let stopPrice;
  if (direction === 'long' || direction === 'long-half') {
    stopPrice = price * (1 - CONFIG.stopPercent);
  } else if (direction === 'short' || direction === 'short-half') {
    stopPrice = price * (1 + CONFIG.stopPercent);
  } else {
    stopPrice = null;
  }
  
  return {
    price,
    ema20,
    ema200,
    regime,
    above20,
    action,
    direction,
    stopPrice,
    leverage: CONFIG.leverage,
    timestamp: new Date().toISOString(),
  };
}

// --- State Management ---
function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function hasSignalChanged(current, previous) {
  if (!previous) return true;
  return current.direction !== previous.direction || current.regime !== previous.regime;
}

// --- Output Formatting ---
function formatSignal(signal) {
  const regimeEmoji = {
    BULL: '🟢',
    BEAR: '🔴',
    CHOP: '🟡',
  };
  
  const actionEmoji = {
    LONG: '📈',
    SHORT: '📉',
    EXIT: '💵',
    REDUCED: '⚠️',
  };
  
  return `
┌─────────────────────────────────────────────┐
│  BTC SIGNAL — ${new Date().toUTCString().slice(0, 22)}      │
├─────────────────────────────────────────────┤
│  Price:    $${signal.price.toLocaleString().padEnd(10)}                │
│  20 EMA:   $${signal.ema20.toFixed(0).padEnd(10)}                │
│  200 EMA:  $${signal.ema200.toFixed(0).padEnd(10)}                │
├─────────────────────────────────────────────┤
│  Regime:   ${regimeEmoji[signal.regime]} ${signal.regime.padEnd(6)}                      │
│  Signal:   ${actionEmoji[signal.action]} ${signal.action.padEnd(8)}                    │
│  Position: ${signal.direction.padEnd(12)}                   │
${signal.stopPrice ? `│  Stop:     $${signal.stopPrice.toFixed(0).padEnd(10)}                │\n` : ''}│  Leverage: ${signal.leverage}x                              │
└─────────────────────────────────────────────┘`;
}

function formatAlert(signal, changed) {
  if (!changed) return null;
  
  const emoji = signal.action === 'LONG' ? '🚀' : signal.action === 'SHORT' ? '🔻' : '⏸️';
  
  return `${emoji} BTC SIGNAL CHANGE

Regime: ${signal.regime}
Action: ${signal.action}
Price: $${signal.price.toLocaleString()}
${signal.stopPrice ? `Stop: $${signal.stopPrice.toFixed(0)}` : ''}
Leverage: ${signal.leverage}x`;
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const alertOnly = args.includes('--alert');
  
  // Fetch data
  const [prices, currentPrice] = await Promise.all([
    fetchPriceHistory(),
    fetchCurrentPrice(),
  ]);
  
  if (!prices || !currentPrice) {
    console.error('Failed to fetch data');
    process.exit(1);
  }
  
  // Calculate EMAs
  const ema20 = calculateEMA(prices, CONFIG.shortEMA);
  const ema200 = calculateEMA(prices, CONFIG.longEMA);
  
  if (!ema20 || !ema200) {
    console.error('Insufficient data for EMA calculation');
    process.exit(1);
  }
  
  // Analyze
  const signal = analyzeSignal(currentPrice, ema20, ema200);
  
  // Check for changes
  const previousState = loadState();
  const changed = hasSignalChanged(signal, previousState);
  
  // Save state
  saveState(signal);
  
  // Output
  if (jsonOutput) {
    console.log(JSON.stringify({ ...signal, changed }, null, 2));
  } else if (alertOnly) {
    if (changed) {
      console.log(formatAlert(signal, changed));
    }
  } else {
    console.log(formatSignal(signal));
    if (changed && previousState) {
      console.log(`\n⚡ SIGNAL CHANGED from ${previousState.direction} to ${signal.direction}`);
    }
  }
}

main().catch(console.error);

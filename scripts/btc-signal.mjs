#!/usr/bin/env node
/**
 * BTC EMA Signal Checker (v2)
 * 
 * Regime-filtered strategy with confirmations:
 * - 200 EMA (daily) determines regime (bull/bear/chop)
 * - 20 EMA (daily) determines signal direction
 * - 50 EMA (4H) confirms entry timing
 * - Funding rate filters for sentiment extremes
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
  // Daily EMAs
  shortEMA: 20,
  longEMA: 200,
  // 4H EMA
  ema4H: 50,
  // Regime
  chopZone: 0.03, // 3% around 200 EMA
  // Funding thresholds
  fundingBullish: -0.01, // below this = bullish (shorts paying)
  fundingBearish: 0.03,  // above this = bearish (longs paying)
  // Position
  leverage: 3,
  riskPercent: 0.02,
  stopPercent: 0.06,
};

// --- Fetch Price Data ---
async function fetchDailyPrices() {
  // Binance daily klines - last 200 days
  const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=200';
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.map(k => parseFloat(k[4])); // close prices
  } catch (err) {
    console.error('Failed to fetch daily prices:', err.message);
    return null;
  }
}

async function fetch4HPrices() {
  // Binance klines API - last 50 4H candles
  const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=60';
  try {
    const res = await fetch(url);
    const data = await res.json();
    // Extract close prices [0]=openTime, [4]=close
    return data.map(k => parseFloat(k[4]));
  } catch (err) {
    console.error('Failed to fetch 4H prices:', err.message);
    return null;
  }
}

async function fetchCurrentPrice() {
  // Use Binance for reliable price
  const url = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';
  try {
    const res = await fetch(url);
    const data = await res.json();
    return parseFloat(data.price);
  } catch (err) {
    console.error('Failed to fetch current price:', err.message);
    return null;
  }
}

async function fetchFundingRate() {
  // Binance funding rate
  const url = 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1';
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      return parseFloat(data[0].fundingRate);
    }
    return null;
  } catch (err) {
    console.error('Failed to fetch funding rate:', err.message);
    return null;
  }
}

// --- Calculate EMA ---
function calculateEMA(prices, period) {
  if (!prices || prices.length < period) return null;
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

// --- Determine Signal ---
function analyzeSignal(price, ema20, ema200, ema4H50, fundingRate) {
  // Determine regime from daily 200 EMA
  let regime;
  const chopThreshold = ema200 * CONFIG.chopZone;
  
  if (price > ema200 + chopThreshold) {
    regime = 'BULL';
  } else if (price < ema200 - chopThreshold) {
    regime = 'BEAR';
  } else {
    regime = 'CHOP';
  }
  
  // Daily 20 EMA signal
  const above20 = price > ema20;
  
  // 4H 50 EMA confirmation
  const above4H50 = ema4H50 ? price > ema4H50 : null;
  
  // Funding rate analysis
  let fundingSentiment = 'neutral';
  if (fundingRate !== null) {
    if (fundingRate > CONFIG.fundingBearish) {
      fundingSentiment = 'extreme_long'; // crowded longs, bearish signal
    } else if (fundingRate < CONFIG.fundingBullish) {
      fundingSentiment = 'extreme_short'; // crowded shorts, bullish signal
    }
  }
  
  // Determine base action from regime + 20 EMA
  let baseAction, direction;
  
  if (regime === 'BULL') {
    if (above20) {
      baseAction = 'LONG';
      direction = 'long';
    } else {
      baseAction = 'EXIT';
      direction = 'cash';
    }
  } else if (regime === 'BEAR') {
    if (!above20) {
      baseAction = 'SHORT';
      direction = 'short';
    } else {
      baseAction = 'EXIT';
      direction = 'cash';
    }
  } else {
    baseAction = 'REDUCED';
    direction = above20 ? 'long-half' : 'short-half';
  }
  
  // Check confirmations
  let confirmed = true;
  let confirmations = [];
  let warnings = [];
  
  // 4H confirmation
  if (direction === 'long' || direction === 'long-half') {
    if (above4H50 === true) {
      confirmations.push('4H EMA ✓');
    } else if (above4H50 === false) {
      warnings.push('4H EMA not confirmed');
      confirmed = false;
    }
  } else if (direction === 'short' || direction === 'short-half') {
    if (above4H50 === false) {
      confirmations.push('4H EMA ✓');
    } else if (above4H50 === true) {
      warnings.push('4H EMA not confirmed');
      confirmed = false;
    }
  }
  
  // Funding confirmation
  if (direction === 'long' || direction === 'long-half') {
    if (fundingSentiment === 'extreme_short') {
      confirmations.push('funding ✓ (shorts crowded)');
    } else if (fundingSentiment === 'extreme_long') {
      warnings.push('funding: longs crowded');
    }
  } else if (direction === 'short' || direction === 'short-half') {
    if (fundingSentiment === 'extreme_long') {
      confirmations.push('funding ✓ (longs crowded)');
    } else if (fundingSentiment === 'extreme_short') {
      warnings.push('funding: shorts crowded');
    }
  }
  
  // Final action
  let action = baseAction;
  if (!confirmed && (direction === 'long' || direction === 'short')) {
    action = 'WAIT'; // signal present but not confirmed
  }
  
  // Calculate stop
  let stopPrice = null;
  if (direction === 'long' || direction === 'long-half') {
    stopPrice = price * (1 - CONFIG.stopPercent);
  } else if (direction === 'short' || direction === 'short-half') {
    stopPrice = price * (1 + CONFIG.stopPercent);
  }
  
  return {
    price,
    ema20,
    ema200,
    ema4H50,
    fundingRate,
    fundingSentiment,
    regime,
    above20,
    above4H50,
    baseAction,
    action,
    direction,
    confirmed,
    confirmations,
    warnings,
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
  return current.action !== previous.action || 
         current.direction !== previous.direction || 
         current.regime !== previous.regime;
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
    WAIT: '⏳',
    REDUCED: '⚠️',
  };
  
  const fundingStr = signal.fundingRate !== null 
    ? `${(signal.fundingRate * 100).toFixed(4)}%`
    : 'N/A';
  
  let output = `
┌─────────────────────────────────────────────┐
│  BTC SIGNAL v2 — ${new Date().toUTCString().slice(0, 22)}   │
├─────────────────────────────────────────────┤
│  Price:     $${signal.price.toLocaleString().padEnd(10)}               │
│  20 EMA:    $${signal.ema20.toFixed(0).padEnd(10)}               │
│  200 EMA:   $${signal.ema200.toFixed(0).padEnd(10)}               │
│  4H 50 EMA: $${signal.ema4H50 ? signal.ema4H50.toFixed(0).padEnd(10) : 'N/A'.padEnd(10)}               │
├─────────────────────────────────────────────┤
│  Funding:   ${fundingStr.padEnd(10)} ${signal.fundingSentiment.padEnd(14)}│
├─────────────────────────────────────────────┤
│  Regime:    ${regimeEmoji[signal.regime]} ${signal.regime.padEnd(6)}                     │
│  Signal:    ${actionEmoji[signal.action]} ${signal.action.padEnd(8)}                   │
│  Position:  ${signal.direction.padEnd(12)}                  │
${signal.stopPrice ? `│  Stop:      $${signal.stopPrice.toFixed(0).padEnd(10)}               │\n` : ''}│  Leverage:  ${signal.leverage}x                             │
├─────────────────────────────────────────────┤`;

  if (signal.confirmations.length > 0) {
    output += `\n│  ✓ ${signal.confirmations.join(', ').slice(0, 38).padEnd(38)} │`;
  }
  
  if (signal.warnings.length > 0) {
    output += `\n│  ⚠ ${signal.warnings.join(', ').slice(0, 38).padEnd(38)} │`;
  }
  
  output += `\n└─────────────────────────────────────────────┘`;
  
  return output;
}

function formatAlert(signal, changed) {
  if (!changed) return null;
  
  const emoji = signal.action === 'LONG' ? '🚀' : 
                signal.action === 'SHORT' ? '🔻' : 
                signal.action === 'WAIT' ? '⏳' : '⏸️';
  
  let alert = `${emoji} **BTC SIGNAL CHANGE**

Regime: ${signal.regime}
Action: **${signal.action}**
Price: $${signal.price.toLocaleString()}
Funding: ${signal.fundingRate !== null ? (signal.fundingRate * 100).toFixed(4) + '%' : 'N/A'}`;

  if (signal.stopPrice) {
    alert += `\nStop: $${signal.stopPrice.toFixed(0)}`;
  }
  
  if (signal.confirmations.length > 0) {
    alert += `\n✓ ${signal.confirmations.join(', ')}`;
  }
  
  if (signal.warnings.length > 0) {
    alert += `\n⚠ ${signal.warnings.join(', ')}`;
  }
  
  return alert;
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const alertOnly = args.includes('--alert');
  
  // Fetch all data in parallel
  const [dailyPrices, prices4H, currentPrice, fundingRate] = await Promise.all([
    fetchDailyPrices(),
    fetch4HPrices(),
    fetchCurrentPrice(),
    fetchFundingRate(),
  ]);
  
  if (!dailyPrices || !currentPrice) {
    console.error('Failed to fetch required data');
    process.exit(1);
  }
  
  // Calculate EMAs
  const ema20 = calculateEMA(dailyPrices, CONFIG.shortEMA);
  const ema200 = calculateEMA(dailyPrices, CONFIG.longEMA);
  const ema4H50 = prices4H ? calculateEMA(prices4H, CONFIG.ema4H) : null;
  
  if (!ema20 || !ema200) {
    console.error('Insufficient data for EMA calculation');
    process.exit(1);
  }
  
  // Analyze
  const signal = analyzeSignal(currentPrice, ema20, ema200, ema4H50, fundingRate);
  
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
      console.log(`\n⚡ SIGNAL CHANGED: ${previousState.action} → ${signal.action}`);
    }
  }
}

main().catch(console.error);

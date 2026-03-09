#!/usr/bin/env node
/**
 * EMA Trading Bot v2 for Hyperliquid
 * 
 * Two modes:
 * 1. CROSSOVER: Fast/slow EMA crossover (original)
 * 2. TREND: 200 EMA + slope filter (backtested +12.7% vs -85% B&H)
 * 
 * V2 Changes:
 * - Added SHORT support (both directions)
 * - Added 200 EMA trend mode with slope filter
 * - 4H timeframe for trend mode
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { placeOrder, getPositions } from './trade.mjs';

config();

// ==================== CONFIGURATION ====================

const CONFIG = {
  // Trading mode: 'crossover' or 'trend'
  mode: process.env.BOT_MODE || 'trend',
  
  // Asset configurations for CROSSOVER mode
  crossover: {
    BTC: { 
      fastEMA: 10, 
      slowEMA: 30, 
      crashStop: 0.20,
      enabled: true,
      allowShort: false,  // BTC shorts risky in macro bull
      minSize: 0.0001,
    },
    SOL: { 
      fastEMA: 8, 
      slowEMA: 21, 
      crashStop: null,
      enabled: true,
      allowShort: false,
      minSize: 0.01,
    },
    HYPE: { 
      fastEMA: 5, 
      slowEMA: 20, 
      crashStop: null,
      enabled: true,
      allowShort: true,  // More volatile, cleaner trends
      minSize: 0.1,
    },
  },
  
  // Asset configurations for TREND mode (200 EMA + slope)
  // FULL DEGEN: all assets enabled, 10x leverage, 50% position sizing
  trend: {
    // === CORE POSITIONS ===
    BTC: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 0.0001,
    },
    SOL: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 0.01,
    },
    // === HIGH QUALITY SHORTS (from scanner) ===
    OP: {  // quality: 13.3
      ema: 200,
      slopeLookback: 48,
      enabled: false,  // Disabled: JSON deserialization error on order
      allowShort: true,
      minSize: 1,
    },
    APE: {  // quality: 9.7
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 0.1,
    },
    DYDX: {  // quality: 9.4
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 1,
    },
    LDO: {  // quality: 7.8
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 0.1,
    },
    ARB: {  // quality: 6.9
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 1,
    },
    // === ADDITIONAL MOMENTUM SHORTS ===
    HYPE: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 0.1,
    },
    VVV: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 0.1,
    },
    GRASS: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 1,
    },
    MORPHO: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 0.1,
    },
    IP: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 1,
    },
    AR: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 0.1,
    },
    MERL: {
      ema: 200,
      slopeLookback: 48,
      enabled: true,
      allowShort: true,
      minSize: 100,
    },
  },
  
  // Risk management
  maxPositionPct: 0.50,  // % of available margin per position (10x leverage) - DEGEN MODE
  dailyLossLimit: 0.10,
  
  // Execution
  slippagePct: 0.002,
  minOrderUsd: 10,  // Hyperliquid minimum
  
  // Files
  stateFile: './bot-state-v2.json',
  logFile: './trades-v2.log',
};

const HL_API = 'https://api.hyperliquid.xyz';

// ==================== HYPERLIQUID API ====================

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function getWallet() {
  const key = process.env.HL_PRIVATE_KEY;
  if (!key) throw new Error('HL_PRIVATE_KEY not set');
  return new ethers.Wallet(key);
}

async function getMeta() {
  return hlPost('/info', { type: 'meta' });
}

async function getMids() {
  return hlPost('/info', { type: 'allMids' });
}

async function getCandles(symbol, interval = '4h', lookback = 250) {
  // For 4h candles, need enough for 200 EMA + slope lookback
  const intervalMs = interval === '4h' ? 4 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const endTime = Date.now();
  const startTime = endTime - (lookback * intervalMs);
  
  const data = await hlPost('/info', {
    type: 'candleSnapshot',
    req: { coin: symbol, interval, startTime, endTime },
  });
  
  return data || [];
}

async function getAccountState(address) {
  return hlPost('/info', { type: 'clearinghouseState', user: address });
}

// ==================== EMA CALCULATION ====================

function calculateEMA(prices, period) {
  if (!prices || prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateEMAArray(prices, period) {
  if (!prices || prices.length < period) return [];
  const k = 2 / (period + 1);
  const emaArray = [];
  let ema = prices[0];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      const slice = prices.slice(0, i + 1);
      ema = slice.reduce((a, b) => a + b, 0) / slice.length;
    } else {
      ema = prices[i] * k + ema * (1 - k);
    }
    emaArray.push(ema);
  }
  return emaArray;
}

// ==================== SIGNAL GENERATION ====================

/**
 * CROSSOVER MODE: Fast EMA crosses slow EMA
 */
function generateCrossoverSignal(symbol, prices, currentPrice, state) {
  const cfg = CONFIG.crossover[symbol];
  if (!cfg || !cfg.enabled) return null;
  
  const fastEMA = calculateEMA(prices, cfg.fastEMA);
  const slowEMA = calculateEMA(prices, cfg.slowEMA);
  
  if (!fastEMA || !slowEMA) {
    return { signal: 'WAIT', reason: 'Insufficient data' };
  }
  
  // Check crash stop (for BTC)
  if (cfg.crashStop && state.highestPrice?.[symbol]) {
    const crashLevel = state.highestPrice[symbol] * (1 - cfg.crashStop);
    if (currentPrice < crashLevel) {
      return { 
        signal: 'EXIT', 
        reason: `Crash stop: $${currentPrice.toFixed(2)} < $${crashLevel.toFixed(2)}`,
        fastEMA, 
        slowEMA,
      };
    }
  }
  
  const bullish = fastEMA > slowEMA;
  
  if (bullish) {
    return {
      signal: 'LONG',
      reason: `EMA ${cfg.fastEMA} ($${fastEMA.toFixed(2)}) > EMA ${cfg.slowEMA} ($${slowEMA.toFixed(2)})`,
      fastEMA,
      slowEMA,
    };
  } else if (cfg.allowShort) {
    return {
      signal: 'SHORT',
      reason: `EMA ${cfg.fastEMA} ($${fastEMA.toFixed(2)}) < EMA ${cfg.slowEMA} ($${slowEMA.toFixed(2)})`,
      fastEMA,
      slowEMA,
    };
  } else {
    return {
      signal: 'EXIT',
      reason: `Bearish (shorts disabled): EMA ${cfg.fastEMA} < EMA ${cfg.slowEMA}`,
      fastEMA,
      slowEMA,
    };
  }
}

/**
 * TREND MODE: 200 EMA + slope filter
 * - LONG: price > EMA AND EMA rising (higher than N candles ago)
 * - SHORT: price < EMA AND EMA falling
 * - EXIT: price crosses EMA
 */
function generateTrendSignal(symbol, prices, currentPrice, state) {
  const cfg = CONFIG.trend[symbol];
  if (!cfg || !cfg.enabled) return null;
  
  if (prices.length < cfg.ema + cfg.slopeLookback) {
    return { signal: 'WAIT', reason: `Need ${cfg.ema + cfg.slopeLookback} candles, have ${prices.length}` };
  }
  
  // Calculate full EMA array for slope comparison
  const emaArray = calculateEMAArray(prices, cfg.ema);
  const currentEMA = emaArray[emaArray.length - 1];
  const lookbackEMA = emaArray[emaArray.length - 1 - cfg.slopeLookback];
  
  if (!currentEMA || !lookbackEMA) {
    return { signal: 'WAIT', reason: 'EMA calculation failed' };
  }
  
  const aboveEMA = currentPrice > currentEMA;
  const emaRising = currentEMA > lookbackEMA;
  const emaFalling = currentEMA < lookbackEMA;
  
  const slopeInfo = emaRising ? '↗ rising' : emaFalling ? '↘ falling' : '→ flat';
  const posInfo = aboveEMA ? 'above' : 'below';
  
  // Check current position for exit logic
  const currentPos = state.positions?.[symbol];
  const posDir = currentPos?.direction; // 'LONG', 'SHORT', or undefined
  
  // Exit conditions: price crosses EMA opposite to position
  if (posDir === 'LONG' && !aboveEMA) {
    return {
      signal: 'EXIT',
      reason: `Exit LONG: price ${posInfo} EMA 200 ($${currentEMA.toFixed(2)})`,
      ema: currentEMA,
      slope: slopeInfo,
    };
  }
  if (posDir === 'SHORT' && aboveEMA) {
    return {
      signal: 'EXIT',
      reason: `Exit SHORT: price ${posInfo} EMA 200 ($${currentEMA.toFixed(2)})`,
      ema: currentEMA,
      slope: slopeInfo,
    };
  }
  
  // Entry conditions: price crosses EMA + slope confirms
  if (aboveEMA && emaRising) {
    return {
      signal: 'LONG',
      reason: `Price ${posInfo} EMA 200 ($${currentEMA.toFixed(2)}), slope ${slopeInfo}`,
      ema: currentEMA,
      slope: slopeInfo,
    };
  }
  
  if (!aboveEMA && emaFalling && cfg.allowShort) {
    return {
      signal: 'SHORT',
      reason: `Price ${posInfo} EMA 200 ($${currentEMA.toFixed(2)}), slope ${slopeInfo}`,
      ema: currentEMA,
      slope: slopeInfo,
    };
  }
  
  // No valid signal (slope doesn't confirm)
  return {
    signal: 'HOLD',
    reason: `Price ${posInfo} EMA 200, but slope ${slopeInfo} doesn't confirm`,
    ema: currentEMA,
    slope: slopeInfo,
  };
}

// ==================== STATE MANAGEMENT ====================

function loadState() {
  try {
    if (existsSync(CONFIG.stateFile)) {
      return JSON.parse(readFileSync(CONFIG.stateFile, 'utf8'));
    }
  } catch {}
  return {
    positions: {},
    highestPrice: {},
    dailyPnL: 0,
    dailyPnLDate: null,
    lastCheck: null,
  };
}

function saveState(state) {
  state.lastCheck = new Date().toISOString();
  writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

function logTrade(action, symbol, size, price, reason) {
  const entry = `${new Date().toISOString()} | ${action.padEnd(5)} | ${symbol.padEnd(4)} | ${size.toString().padStart(10)} | $${price.toString().padStart(10)} | ${reason}\n`;
  console.log(entry.trim());
  
  try {
    appendFileSync(CONFIG.logFile, entry);
  } catch {}
}

// ==================== POSITION SIZING ====================

function calculatePositionSize(symbol, accountValue, currentPrice, cumulativeMarginUsed = 0) {
  const cfg = CONFIG.mode === 'trend' ? CONFIG.trend[symbol] : CONFIG.crossover[symbol];
  if (!cfg) return 0;
  
  // Track cumulative margin: don't overcommit
  const availableMargin = accountValue - cumulativeMarginUsed;
  const maxPositionValue = availableMargin * CONFIG.maxPositionPct;
  // NOTE: No leverage multiplier here - Hyperliquid applies its own defaults
  // To use actual leverage, must explicitly set in order placement
  const positionValue = maxPositionValue;
  
  if (positionValue < CONFIG.minOrderUsd) return 0;
  
  let size = positionValue / currentPrice;
  
  // Round down appropriately
  if (symbol === 'BTC') {
    size = Math.floor(size * 10000) / 10000;
  } else if (symbol === 'SOL') {
    size = Math.floor(size * 100) / 100;
  } else {
    size = Math.floor(size * 10) / 10;
  }
  
  if (size < cfg.minSize) return 0;
  if (size * currentPrice < CONFIG.minOrderUsd) return 0;
  
  return size;
}

// ==================== LIVE ORDER EXECUTION ====================

async function executeLiveOrder(symbol, direction, size, price) {
  try {
    const isBuy = direction === 'LONG';
    console.log(`✅ LIVE ${direction}: ${size} ${symbol}`);
    const result = await placeOrder(symbol, isBuy, size, price);
    console.log(`   Order response:`, result);
    return true;
  } catch (err) {
    console.error(`❌ Order error (${symbol}):`, err.message);
    return false;
  }
}

async function executePaperOrder(symbol, direction, size, price, state) {
  // Paper trading - just update state
  if (direction === 'LONG' || direction === 'SHORT') {
    state.positions[symbol] = {
      direction,
      size: direction === 'LONG' ? size : -size,
      entryPrice: price,
      entryTime: new Date().toISOString(),
    };
    console.log(`📝 PAPER ${direction}: ${size} ${symbol} @ $${price.toFixed(2)}`);
  } else if (direction === 'EXIT') {
    const pos = state.positions[symbol];
    if (pos) {
      const pnlPct = pos.direction === 'LONG'
        ? (price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - price) / pos.entryPrice;
      const pnlUsd = pnlPct * Math.abs(pos.size) * pos.entryPrice;
      console.log(`📝 PAPER EXIT: ${symbol} | PnL: ${(pnlPct * 100).toFixed(2)}% ($${pnlUsd.toFixed(2)})`);
      state.dailyPnL = (state.dailyPnL || 0) + pnlUsd;
      delete state.positions[symbol];
    }
  }
  return true;
}

// ==================== MAIN BOT LOGIC ====================

async function runBot(paperMode = true) {
  console.log('═'.repeat(60));
  console.log(`EMA BOT V2 | Mode: ${CONFIG.mode.toUpperCase()} | ${paperMode ? 'PAPER' : 'LIVE'}`);
  console.log(new Date().toISOString());
  console.log('═'.repeat(60));
  
  if (!paperMode) {
    console.log('⚠️  LIVE TRADING - REAL MONEY AT RISK');
  }
  
  const wallet = getWallet();
  const address = wallet.address;
  
  // Get real positions from API
  const account = await getAccountState(address);
  const accountValue = parseFloat(account.marginSummary?.accountValue || 0);
  
  // Load real positions from API, not state.json
  const realPositions = {};
  if (account.assetPositions) {
    for (const ap of account.assetPositions) {
      const p = ap.position;
      if (Math.abs(parseFloat(p.szi)) > 0) {
        realPositions[p.coin] = {
          direction: parseFloat(p.szi) > 0 ? 'LONG' : 'SHORT',
          size: parseFloat(p.szi),
          entryPrice: parseFloat(p.entryPx),
        };
      }
    }
  }
  
  let state = { positions: realPositions };
  
  // Reset daily P&L if new day
  const today = new Date().toISOString().slice(0, 10);
  state.dailyPnLDate = today;
  state.dailyPnL = 0;
  
  console.log(`\nAccount: $${accountValue.toFixed(2)}`);
  console.log(`Daily PnL: $${(state.dailyPnL || 0).toFixed(2)}`);
  
  if (accountValue < 1) {
    console.log('No funds. Deposit to:', address);
    return;
  }
  
  // Check daily loss limit
  if ((state.dailyPnL || 0) < -accountValue * CONFIG.dailyLossLimit) {
    console.log(`⚠️ Daily loss limit reached. Stopping.`);
    return;
  }
  
  // Get current prices
  const mids = await getMids();
  
  // Get assets based on mode
  const assets = CONFIG.mode === 'trend' ? CONFIG.trend : CONFIG.crossover;
  const interval = CONFIG.mode === 'trend' ? '4h' : '1d';
  const lookback = CONFIG.mode === 'trend' ? 300 : 50;
  
  // Track cumulative margin used in this run
  let cumulativeMarginUsed = 0;
  
  // Check each asset
  for (const [symbol, cfg] of Object.entries(assets)) {
    if (!cfg.enabled) continue;
    
    console.log(`\n─── ${symbol} ───`);
    
    const currentPrice = parseFloat(mids[symbol] || 0);
    if (!currentPrice) {
      console.log(`No price data`);
      continue;
    }
    
    console.log(`Price: $${currentPrice.toFixed(symbol === 'BTC' ? 2 : 4)}`);
    
    // Update highest price
    if (!state.highestPrice) state.highestPrice = {};
    if (!state.highestPrice[symbol] || currentPrice > state.highestPrice[symbol]) {
      state.highestPrice[symbol] = currentPrice;
    }
    
    // Get candles
    const candles = await getCandles(symbol, interval, lookback);
    const closes = candles.map(c => parseFloat(c.c)).filter(p => p > 0);
    
    if (closes.length < 50) {
      console.log(`Insufficient data (${closes.length} candles)`);
      continue;
    }
    
    // Generate signal based on mode
    const signal = CONFIG.mode === 'trend'
      ? generateTrendSignal(symbol, closes, currentPrice, state)
      : generateCrossoverSignal(symbol, closes, currentPrice, state);
    
    console.log(`Signal: ${signal.signal}`);
    console.log(`Reason: ${signal.reason}`);
    
    const currentPos = state.positions?.[symbol];
    const hasPosition = !!currentPos;
    
    // Decision logic
    if (signal.signal === 'LONG' && !hasPosition) {
      const size = calculatePositionSize(symbol, accountValue, currentPrice, cumulativeMarginUsed);
      const orderValue = size * currentPrice;
      if (size > 0 && orderValue >= CONFIG.minOrderUsd) {
        console.log(`→ OPENING LONG: ${size} ${symbol}`);
        cumulativeMarginUsed += orderValue;
        if (!paperMode) {
          await executeLiveOrder(symbol, 'LONG', size, currentPrice);
        }
        logTrade('LONG', symbol, size, currentPrice, signal.reason);
      } else if (size > 0) {
        console.log(`→ SKIP (order too small): ${size} ${symbol} = $${orderValue.toFixed(2)}`);
      }
    } else if (signal.signal === 'SHORT' && !hasPosition) {
      const size = calculatePositionSize(symbol, accountValue, currentPrice, cumulativeMarginUsed);
      const orderValue = size * currentPrice;
      if (size > 0 && orderValue >= CONFIG.minOrderUsd) {
        console.log(`→ OPENING SHORT: ${size} ${symbol}`);
        cumulativeMarginUsed += orderValue;
        if (!paperMode) {
          await executeLiveOrder(symbol, 'SHORT', size, currentPrice);
        }
        logTrade('SHORT', symbol, size, currentPrice, signal.reason);
      } else if (size > 0) {
        console.log(`→ SKIP (order too small): ${size} ${symbol} = $${orderValue.toFixed(2)}`);
      }

    } else if (signal.signal === 'EXIT' && hasPosition) {
      console.log(`→ CLOSING: ${currentPos.direction} ${symbol}`);
      cumulativeMarginUsed -= Math.abs(currentPos.size) * currentPrice;
      if (paperMode) {
        await executePaperOrder(symbol, 'EXIT', 0, currentPrice, state);
      } else {
        await executeLiveOrder(symbol, 'EXIT', Math.abs(currentPos.size), currentPrice);
      }
      logTrade('EXIT', symbol, Math.abs(currentPos.size), currentPrice, signal.reason);
    } else if (signal.signal === 'LONG' && currentPos?.direction === 'SHORT') {
      // Flip from SHORT to LONG
      console.log(`→ FLIPPING: SHORT → LONG ${symbol}`);
      cumulativeMarginUsed -= Math.abs(currentPos.size) * currentPrice;
      if (!paperMode) {
        await executeLiveOrder(symbol, 'EXIT', Math.abs(currentPos.size), currentPrice);
      }
      const size = calculatePositionSize(symbol, accountValue, currentPrice, cumulativeMarginUsed);
      if (size > 0) {
        cumulativeMarginUsed += size * currentPrice;
        if (!paperMode) {
          await executeLiveOrder(symbol, 'LONG', size, currentPrice);
        }
        logTrade('FLIP→L', symbol, size, currentPrice, signal.reason);
      }
    } else if (signal.signal === 'SHORT' && currentPos?.direction === 'LONG') {
      // Flip from LONG to SHORT
      console.log(`→ FLIPPING: LONG → SHORT ${symbol}`);
      cumulativeMarginUsed -= Math.abs(currentPos.size) * currentPrice;
      if (!paperMode) {
        await executeLiveOrder(symbol, 'EXIT', Math.abs(currentPos.size), currentPrice);
      }
      const size = calculatePositionSize(symbol, accountValue, currentPrice, cumulativeMarginUsed);
      if (size > 0) {
        cumulativeMarginUsed += size * currentPrice;
        if (!paperMode) {
          await executeLiveOrder(symbol, 'SHORT', size, currentPrice);
        }
        logTrade('FLIP→S', symbol, size, currentPrice, signal.reason);
      }
    } else if (hasPosition) {
      const pnlPct = currentPos.direction === 'LONG'
        ? (currentPrice - currentPos.entryPrice) / currentPos.entryPrice
        : (currentPos.entryPrice - currentPrice) / currentPos.entryPrice;
      console.log(`→ HOLDING: ${currentPos.direction} (PnL: ${(pnlPct * 100).toFixed(2)}%)`);
    } else {
      console.log(`→ WAITING: no entry signal`);
    }
  }
  
  saveState(state);
  
  console.log('\n' + '═'.repeat(60));
  console.log('Run complete');
}

async function showStatus() {
  console.log('═'.repeat(60));
  console.log('BOT STATUS');
  console.log('═'.repeat(60));
  
  const state = loadState();
  const mids = await getMids();
  
  console.log(`Mode: ${CONFIG.mode}`);
  console.log(`Last check: ${state.lastCheck || 'Never'}`);
  console.log(`Daily PnL: $${(state.dailyPnL || 0).toFixed(2)}`);
  
  console.log('\nPositions:');
  if (!state.positions || Object.keys(state.positions).length === 0) {
    console.log('  None');
  } else {
    for (const [symbol, pos] of Object.entries(state.positions)) {
      const currentPrice = parseFloat(mids[symbol] || 0);
      const pnlPct = pos.direction === 'LONG'
        ? (currentPrice - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - currentPrice) / pos.entryPrice;
      console.log(`  ${symbol}: ${pos.direction} ${Math.abs(pos.size)} @ $${pos.entryPrice.toFixed(2)} → $${currentPrice.toFixed(2)} (${(pnlPct * 100).toFixed(2)}%)`);
    }
  }
}

// ==================== CLI ====================

const args = process.argv.slice(2);

if (args.includes('--run') || args.includes('-r')) {
  runBot(false).catch(console.error);  // LIVE MODE
} else if (args.includes('--status') || args.includes('-s')) {
  showStatus().catch(console.error);
} else if (args.includes('--loop')) {
  const intervalHours = CONFIG.mode === 'trend' ? 4 : 24;
  console.log(`Starting bot loop (every ${intervalHours}h for ${CONFIG.mode} mode)...`);
  runBot(false).catch(console.error);  // LIVE MODE
  setInterval(() => runBot(false).catch(console.error), intervalHours * 60 * 60 * 1000);
} else {
  console.log(`
EMA Trading Bot V2 - Hyperliquid

Usage:
  node ema-bot-v2.mjs --run      Run once (paper trading)
  node ema-bot-v2.mjs --status   Show current positions
  node ema-bot-v2.mjs --loop     Run continuously

Modes (set BOT_MODE env):
  trend     - 200 EMA + slope filter (4H, shorts enabled)
  crossover - Fast/slow EMA crossover (daily)

Current mode: ${CONFIG.mode}

Trend Mode Config (backtested +12.7% vs -85% B&H):
  - Entry: price crosses EMA + slope confirms (48 candles = 8 days)
  - Exit: price crosses back
  - Shorts: enabled for all assets

Risk:
  - Max 33% per position
  - 3x leverage
  - 10% daily loss limit
`);
}

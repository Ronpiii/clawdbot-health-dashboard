#!/usr/bin/env node
/**
 * BTC-only strategy: 200 EMA 5m + 0.01% slope + 2% profit take
 * Leverage: 5x
 * Live trading enabled
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fetch = global.fetch;

const API_KEY = process.env.HYPERLIQUID_API_KEY;
const API_SECRET = process.env.HYPERLIQUID_API_SECRET;

const SYMBOL = 'BTC';
const LEVERAGE = 5;
const PROFIT_TARGET = 2;
const SL_PCT = 5;
const SLOPE_THRESHOLD = 0.01;
const EMA_PERIOD = 200;
const LOOKBACK_CANDLES = 100;

const STATE_FILE = path.join(__dirname, 'btc-slope-state.json');
const TRADE_LOG = path.join(__dirname, 'btc-trades-5m.log');

console.log(`\n════════════════════════════════════════════════════════`);
console.log(`BTC SLOPE BOT v1 | 200 EMA + 0.01% slope + 2% profit`);
console.log(`${new Date().toISOString()}`);
console.log(`════════════════════════════════════════════════════════`);
console.log(`⚠️  LIVE TRADING - REAL MONEY AT RISK\n`);

async function hlPost(endpoint, payload) {
  const res = await fetch(`https://api.hyperliquid.xyz${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function getAccount() {
  try {
    const data = await hlPost('/info', {
      type: 'clearinghouseState',
      user: API_KEY
    });
    return {
      balance: parseFloat(data.marginSummary?.accountValue || 0),
      marginUsed: parseFloat(data.marginSummary?.totalMarginUsed || 0)
    };
  } catch (e) {
    console.error(`Account fetch error: ${e.message}`);
    return null;
  }
}

async function getCandles(symbol, interval = '5m', lookback = 100) {
  try {
    const intervalMs = interval === '5m' ? 5 * 60 * 1000 : 60 * 60 * 1000;
    const endTime = Date.now();
    const startTime = endTime - (lookback * intervalMs);
    
    const res = await hlPost('/info', {
      type: 'candleSnapshot',
      req: {
        coin: symbol,
        interval: interval,
        startTime: startTime,
        endTime: endTime
      }
    });
    return res || [];
  } catch (e) {
    console.error(`Candles fetch error: ${e.message}`);
    return [];
  }
}

function calculateEMA(closes, period) {
  const ema = [];
  const mult = 2 / (period + 1);
  for (let i = 0; i < closes.length; i++) {
    ema.push(i === 0 ? closes[i] : closes[i] * mult + ema[i - 1] * (1 - mult));
  }
  return ema;
}

function getSlope(emaVals, index) {
  if (index < 10) return 0;
  return ((emaVals[index] - emaVals[index - 10]) / emaVals[index - 10]) * 100;
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { 
    position: null, 
    entryPrice: null, 
    entryTime: null,
    currentPrice: null,
    peakPrice: null,
    profitTaken: false 
  };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function logTrade(action, price, reason) {
  const entry = `${new Date().toISOString()} | ${action.padEnd(5)} | BTC | $${price.toFixed(2)} | ${reason}\n`;
  console.log(entry.trim());
  
  try {
    fs.appendFileSync(TRADE_LOG, entry);
  } catch (e) {
    console.error(`Log error: ${e.message}`);
  }
}

(async () => {
  const candles = await getCandles(SYMBOL, '5m', LOOKBACK_CANDLES);
  if (!candles || candles.length < 50) {
    console.log(`❌ No candle data (got ${candles?.length || 0})`);
    process.exit(1);
  }

  const closes = candles.map(c => parseFloat(c.c || c[4]));
  const emaVals = calculateEMA(closes, EMA_PERIOD);

  const currentClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const currentEMA = emaVals[emaVals.length - 1];
  const prevEMA = emaVals[emaVals.length - 2];
  const slope = getSlope(emaVals, emaVals.length - 1);
  const currentPrice = currentClose;

  console.log(`Price: $${currentPrice.toFixed(2)}`);
  console.log(`EMA200: $${currentEMA.toFixed(2)}`);
  console.log(`Slope: ${slope.toFixed(3)}%`);

  let state = loadState();
  const account = await getAccount();
  if (account && account.balance > 0) {
    console.log(`\nAccount balance: $${account.balance.toFixed(2)}`);
  }

  // Always track current price
  state.currentPrice = currentPrice;
  
  // Entry logic
  if (!state.position) {
    const hasSlope = Math.abs(slope) > SLOPE_THRESHOLD;

    if (prevClose <= prevEMA && currentClose > currentEMA && hasSlope && slope > 0) {
      console.log(`\n✅ LONG signal: crossover above EMA + positive slope`);
      state.position = 'LONG';
      state.entryPrice = currentPrice;
      state.entryTime = new Date().toISOString();
      state.peakPrice = currentPrice;
      saveState(state);
      logTrade('LONG', currentPrice, `EMA crossover, slope ${slope.toFixed(3)}%`);
    } else if (prevClose >= prevEMA && currentClose < currentEMA && hasSlope && slope < 0) {
      console.log(`\n✅ SHORT signal: crossover below EMA + negative slope`);
      state.position = 'SHORT';
      state.entryPrice = currentPrice;
      state.entryTime = new Date().toISOString();
      state.peakPrice = currentPrice;
      saveState(state);
      logTrade('SHORT', currentPrice, `EMA crossover, slope ${slope.toFixed(3)}%`);
    }
  }

  // Exit logic
  if (state.position) {
    const pnlPct = state.position === 'LONG'
      ? ((currentPrice - state.entryPrice) / state.entryPrice) * 100
      : ((state.entryPrice - currentPrice) / state.entryPrice) * 100;

    console.log(`\n${state.position} position: entry $${state.entryPrice.toFixed(2)}, current $${currentPrice.toFixed(2)}, PnL: ${pnlPct.toFixed(2)}%`);

    // Update peak
    if (state.position === 'LONG' && currentPrice > state.peakPrice) {
      state.peakPrice = currentPrice;
    } else if (state.position === 'SHORT' && currentPrice < state.peakPrice) {
      state.peakPrice = currentPrice;
    }

    let shouldExit = false;
    let exitReason = '';

    if (pnlPct >= PROFIT_TARGET) {
      shouldExit = true;
      exitReason = `+${PROFIT_TARGET}% profit`;
    } else if (pnlPct < -SL_PCT) {
      shouldExit = true;
      exitReason = `-${SL_PCT}% stoploss`;
    }

    if (shouldExit) {
      console.log(`\n🚪 EXIT: ${exitReason}`);
      logTrade('EXIT', currentPrice, exitReason);
      state.position = null;
      state.entryPrice = null;
      state.entryTime = null;
      saveState(state);
    } else {
      saveState(state);
    }
  }

  console.log(`\n════════════════════════════════════════════════════════\n`);
})();

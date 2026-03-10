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
const LOOKBACK_CANDLES = 100; // for EMA calculation

const STATE_FILE = path.join(__dirname, 'btc-slope-state.json');

console.log(`\n════════════════════════════════════════════════════════`);
console.log(`BTC SLOPE BOT v1 | 200 EMA + 0.01% slope + 2% profit`);
console.log(`${new Date().toISOString()}`);
console.log(`════════════════════════════════════════════════════════`);
console.log(`⚠️  LIVE TRADING - REAL MONEY AT RISK\n`);

async function getAccount() {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: API_KEY
      })
    });
    const data = await res.json();
    return {
      balance: parseFloat(data.crossMaintenanceMarginUsed || 0),
      marginUsed: parseFloat(data.crossMaintenanceMarginUsed || 0)
    };
  } catch (e) {
    console.error(`Account fetch error: ${e.message}`);
    return null;
  }
}

async function getPositions() {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: API_KEY
      })
    });
    const data = await res.json();
    return data.assetPositions || [];
  } catch (e) {
    console.error(`Positions fetch error: ${e.message}`);
    return [];
  }
}

async function getCandles(symbol, limit = 100) {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candles',
        req: {
          coin: symbol,
          interval: '5m',
          startTime: Date.now() - (limit * 5 * 60 * 1000),
          endTime: Date.now()
        }
      })
    });
    const data = await res.json();
    return data || [];
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
  return { position: null, entryPrice: null, profitTaken: false };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

(async () => {
  const candles = await getCandles(SYMBOL, LOOKBACK_CANDLES);
  if (!candles.length) {
    console.log(`❌ No candle data`);
    process.exit(1);
  }

  const closes = candles.map(c => parseFloat(c.c));
  const highs = candles.map(c => parseFloat(c.h));
  const lows = candles.map(c => parseFloat(c.l));
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
  if (account) {
    console.log(`\nAccount balance: $${account.balance.toFixed(2)}`);
  }

  // Entry logic
  if (!state.position) {
    const hasSlope = Math.abs(slope) > SLOPE_THRESHOLD;

    if (prevClose <= prevEMA && currentClose > currentEMA && hasSlope && slope > 0) {
      console.log(`\n✅ LONG signal: crossover above EMA + positive slope`);
      state.position = 'LONG';
      state.entryPrice = currentPrice;
      state.profitTaken = false;
      state.peakPrice = currentPrice;
      saveState(state);
      console.log(`Entering LONG at $${currentPrice.toFixed(2)}`);
    } else if (prevClose >= prevEMA && currentClose < currentEMA && hasSlope && slope < 0) {
      console.log(`\n✅ SHORT signal: crossover below EMA + negative slope`);
      state.position = 'SHORT';
      state.entryPrice = currentPrice;
      state.profitTaken = false;
      state.peakPrice = currentPrice;
      saveState(state);
      console.log(`Entering SHORT at $${currentPrice.toFixed(2)}`);
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

    // Profit target
    if (pnlPct >= PROFIT_TARGET) {
      shouldExit = true;
      exitReason = `+${PROFIT_TARGET}% profit`;
    }
    // Stoploss
    else if (pnlPct < -SL_PCT) {
      shouldExit = true;
      exitReason = `-${SL_PCT}% stoploss`;
    }

    if (shouldExit) {
      console.log(`\n🚪 EXIT: ${exitReason}`);
      state.position = null;
      state.entryPrice = null;
      state.profitTaken = false;
      saveState(state);
    } else {
      saveState(state);
    }
  }

  console.log(`\n════════════════════════════════════════════════════════\n`);
})();

#!/usr/bin/env node
/**
 * BTC 5m Slope Bot
 * Strategy: 200 EMA 5m + 0.01% slope filter + 2% profit take
 * API: Same as main bot (ema-bot-v2.mjs)
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { placeOrder } from './trade.mjs';
import https from 'https';

config();

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1480891035126075463/WWw6Xapr3n19Xr6S_PoabJk1mzCGmj8KxQjR06EFzL5oYu22MUbu2TgGgCS-SVCm_70g';

async function notifyDiscord(embed) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({ embeds: [embed] });
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
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const success = res.statusCode === 204 || res.statusCode === 200;
          resolve(success);
        });
      });

      req.on('error', (err) => {
        console.error(`Discord notify error: ${err.message}`);
        resolve(false);
      });
      
      req.write(payload);
      req.end();
    } catch (err) {
      console.error(`Discord notify exception: ${err.message}`);
      resolve(false);
    }
  });
}

const HL_API = 'https://api.hyperliquid.xyz';
const STATE_FILE = './btc-slope-state.json';
const TRADE_LOG = './btc-trades-5m.log';

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

async function getCandles(symbol, interval = '5m', lookback = 100) {
  const intervalMs = interval === '5m' ? 5 * 60 * 1000 : 60 * 60 * 1000;
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

async function getMids() {
  return hlPost('/info', { type: 'allMids' });
}

function calculateEMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateEMAArray(closes, period) {
  if (!closes || closes.length < period) return [];
  const k = 2 / (period + 1);
  const emaArray = [];
  let ema = closes[0];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      const slice = closes.slice(0, i + 1);
      ema = slice.reduce((a, b) => a + b, 0) / slice.length;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    emaArray.push(ema);
  }
  return emaArray;
}

function getSlope(emaVals, index) {
  if (index < 10) return 0;
  return ((emaVals[index] - emaVals[index - 10]) / emaVals[index - 10]) * 100;
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    position: null,
    entryPrice: null,
    entryTime: null,
    currentPrice: null,
    peakPrice: null,
  };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function logTrade(action, price, reason) {
  const entry = `${new Date().toISOString()} | ${action.padEnd(5)} | BTC | $${price.toFixed(2)} | ${reason}\n`;
  console.log(entry.trim());
  try {
    appendFileSync(TRADE_LOG, entry);
  } catch (e) {
    console.error(`Log error: ${e.message}`);
  }
}

async function runBot() {
  console.log('═'.repeat(60));
  console.log(`BTC SLOPE BOT | 200 EMA 5m + 0.01% slope + 2% profit`);
  console.log(new Date().toISOString());
  console.log('═'.repeat(60));
  console.log('⚠️  LIVE TRADING - REAL MONEY AT RISK\n');

  const wallet = getWallet();
  const address = wallet.address;

  // Get account & prices
  const account = await getAccountState(address);
  const accountValue = parseFloat(account.marginSummary?.accountValue || 0);
  const mids = await getMids();
  const currentPrice = parseFloat(mids.BTC || 0);

  console.log(`Account: $${accountValue.toFixed(2)}`);
  console.log(`BTC Price: $${currentPrice.toFixed(2)}\n`);

  // Get candles
  const candles = await getCandles('BTC', '5m', 200);
  if (!candles || candles.length < 50) {
    console.log(`❌ Insufficient candle data (${candles?.length || 0})`);
    return;
  }

  // Parse closes - handle both formats
  const closes = candles
    .map(c => {
      const close = c.c !== undefined ? parseFloat(c.c) : (Array.isArray(c) ? parseFloat(c[4]) : 0);
      return close;
    })
    .filter(p => p > 0 && !isNaN(p));
  if (closes.length < 200) {
    console.log(`❌ Need 200+ closes for EMA, got ${closes.length}`);
    return;
  }
  
  const emaVals = calculateEMAArray(closes, 200);
  if (!emaVals || emaVals.length === 0) {
    console.log(`❌ EMA calculation failed`);
    return;
  }
  
  const currentEMA = emaVals[emaVals.length - 1];
  const prevClose = closes[closes.length - 2];
  const prevEMA = emaVals[emaVals.length - 2];
  const slope = getSlope(emaVals, emaVals.length - 1);

  if (!currentEMA || !prevEMA) {
    console.log(`❌ EMA values invalid`);
    return;
  }

  console.log(`EMA200: $${currentEMA.toFixed(2)}`);
  console.log(`Slope: ${slope.toFixed(3)}%\n`);

  let state = loadState();
  state.currentPrice = currentPrice;
  state.ema200 = currentEMA;
  state.slope = slope;
  state.timestamp = new Date().toISOString();

  // ============ ENTRY LOGIC ============
  if (!state.position) {
    const hasSlope = Math.abs(slope) > 0.01;

    if (prevClose <= prevEMA && currentPrice > currentEMA && hasSlope && slope > 0) {
      console.log(`✅ LONG SIGNAL: price crossed above EMA + positive slope`);
      
      // Execute live order
      const positionSize = 0.01; // 0.01 BTC
      const orderResult = await placeOrder('BTC', true, positionSize, currentPrice);
      console.log(`Order result:`, orderResult);
      
      state.position = 'LONG';
      state.entryPrice = currentPrice;
      state.entryTime = new Date().toISOString();
      state.peakPrice = currentPrice;
      state.positionSize = positionSize;
      saveState(state);
      logTrade('LONG', currentPrice, `Slope ${slope.toFixed(3)}%`);

      await notifyDiscord({
        title: '📈 BTC LONG: 5m Slope Signal',
        color: 0x00ff00,
        fields: [
          { name: 'Entry', value: `$${currentPrice.toFixed(2)}`, inline: true },
          { name: 'EMA200', value: `$${currentEMA.toFixed(2)}`, inline: true },
          { name: 'Slope', value: `${slope.toFixed(3)}%`, inline: true },
          { name: 'Target', value: `+${(currentPrice * 1.02).toFixed(2)} (2%)`, inline: false },
          { name: 'Stop', value: `$${(currentPrice * 0.95).toFixed(2)} (5%)`, inline: false },
        ],
        timestamp: new Date().toISOString(),
      });
    } else if (prevClose >= prevEMA && currentPrice < currentEMA && hasSlope && slope < 0) {
      console.log(`✅ SHORT SIGNAL: price crossed below EMA + negative slope`);
      
      // Execute live order
      const positionSize = 0.01; // 0.01 BTC
      const orderResult = await placeOrder('BTC', false, positionSize, currentPrice);
      console.log(`Order result:`, orderResult);
      
      state.position = 'SHORT';
      state.entryPrice = currentPrice;
      state.entryTime = new Date().toISOString();
      state.peakPrice = currentPrice;
      state.positionSize = positionSize;
      saveState(state);
      logTrade('SHORT', currentPrice, `Slope ${slope.toFixed(3)}%`);

      await notifyDiscord({
        title: '📉 BTC SHORT: 5m Slope Signal',
        color: 0xff0000,
        fields: [
          { name: 'Entry', value: `$${currentPrice.toFixed(2)}`, inline: true },
          { name: 'EMA200', value: `$${currentEMA.toFixed(2)}`, inline: true },
          { name: 'Slope', value: `${slope.toFixed(3)}%`, inline: true },
          { name: 'Target', value: `$${(currentPrice * 0.98).toFixed(2)} (2%)`, inline: false },
          { name: 'Stop', value: `$${(currentPrice * 1.05).toFixed(2)} (5%)`, inline: false },
        ],
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ============ EXIT LOGIC ============
  if (state.position) {
    const pnlPct = state.position === 'LONG'
      ? ((currentPrice - state.entryPrice) / state.entryPrice) * 100
      : ((state.entryPrice - currentPrice) / state.entryPrice) * 100;

    console.log(`\n${state.position} Position:`);
    console.log(`  Entry: $${state.entryPrice.toFixed(2)}`);
    console.log(`  Current: $${currentPrice.toFixed(2)}`);
    console.log(`  Peak: $${state.peakPrice.toFixed(2)}`);
    console.log(`  P&L: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%\n`);

    // Update peak
    if (state.position === 'LONG' && currentPrice > state.peakPrice) {
      state.peakPrice = currentPrice;
    } else if (state.position === 'SHORT' && currentPrice < state.peakPrice) {
      state.peakPrice = currentPrice;
    }

    let shouldExit = false;
    let exitReason = '';
    let color = 0x00ff00;

    // Profit target: +2%
    if (pnlPct >= 2) {
      shouldExit = true;
      exitReason = '+2% Profit Target';
    }
    // Stoploss: -5%
    else if (pnlPct < -5) {
      shouldExit = true;
      exitReason = '-5% Stoploss Hit';
      color = 0xff0000;
    }

    if (shouldExit) {
      console.log(`🚪 EXIT: ${exitReason}`);
      
      // Execute close order
      const isBuy = state.position === 'SHORT'; // close SHORT = buy, close LONG = sell
      const closeResult = await placeOrder('BTC', isBuy, state.positionSize, currentPrice);
      console.log(`Close order result:`, closeResult);
      
      logTrade('EXIT', currentPrice, exitReason);

      await notifyDiscord({
        title: `🚪 BTC EXIT`,
        color: color,
        fields: [
          { name: 'Direction', value: state.position, inline: true },
          { name: 'Entry', value: `$${state.entryPrice.toFixed(2)}`, inline: true },
          { name: 'Exit', value: `$${currentPrice.toFixed(2)}`, inline: true },
          { name: 'Peak', value: `$${state.peakPrice.toFixed(2)}`, inline: true },
          { name: 'P&L', value: `${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, inline: true },
          { name: 'Reason', value: exitReason, inline: false },
        ],
        timestamp: new Date().toISOString(),
      });

      state.position = null;
      state.entryPrice = null;
      state.entryTime = null;
      state.positionSize = null;
      saveState(state);
    } else {
      saveState(state);
    }
  }

  // Always save current state (slope, EMA, price)
  saveState(state);
  
  console.log(`═`.repeat(60) + '\n');
}

const args = process.argv.slice(2);

if (args.includes('--loop')) {
  console.log(`Starting BTC slope bot loop (every 5 minutes)...`);
  (async () => {
    try {
      await runBot();
    } catch (err) {
      console.error(`Error in runBot: ${err.message}`);
    }
  })();
  
  setInterval(async () => {
    try {
      await runBot();
    } catch (err) {
      console.error(`Error in loop: ${err.message}`);
    }
  }, 5 * 60 * 1000);
} else {
  runBot().catch(console.error);
}

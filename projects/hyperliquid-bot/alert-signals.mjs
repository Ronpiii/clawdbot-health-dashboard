#!/usr/bin/env node
/**
 * Signal Change Alerter
 * Monitors for fresh EMA crosses and alerts via telegram
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';

config();

const HL_API = 'https://api.hyperliquid.xyz';
const STATE_FILE = './alert-state.json';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1457352512';

// Assets to monitor (from bot config)
const WATCHLIST = [
  'BTC', 'SOL', 'HYPE',  // Core
  'VVV', 'GRASS', 'MORPHO',  // High momentum longs
  'IP', 'OP', 'AR', 'MERL',  // Strong shorts
];

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[ALERT - no telegram]', message);
    return;
  }
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    console.log('[ALERT SENT]', message);
  } catch (err) {
    console.error('Telegram error:', err.message);
  }
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

async function getCandles(symbol) {
  const intervalMs = 4 * 60 * 60 * 1000;
  const endTime = Date.now();
  const startTime = endTime - (300 * intervalMs);
  
  try {
    const data = await hlPost('/info', {
      type: 'candleSnapshot',
      req: { coin: symbol, interval: '4h', startTime, endTime },
    });
    return data || [];
  } catch {
    return [];
  }
}

function getSignal(closes, currentPrice) {
  if (closes.length < 250) return { signal: 'WAIT', reason: 'insufficient data' };
  
  const emaArray = calculateEMAArray(closes, 200);
  const currentEMA = emaArray[emaArray.length - 1];
  const lookbackEMA = emaArray[emaArray.length - 49];
  const prevEMA = emaArray[emaArray.length - 2];
  const prevClose = closes[closes.length - 2];
  
  if (!currentEMA || !lookbackEMA) return { signal: 'WAIT', reason: 'ema calc failed' };
  
  const aboveEMA = currentPrice > currentEMA;
  const prevAboveEMA = prevClose > prevEMA;
  const emaRising = currentEMA > lookbackEMA;
  const emaFalling = currentEMA < lookbackEMA;
  
  const freshLongCross = aboveEMA && !prevAboveEMA;
  const freshShortCross = !aboveEMA && prevAboveEMA;
  
  let signal = 'NONE';
  if (aboveEMA && emaRising) signal = 'LONG';
  else if (!aboveEMA && emaFalling) signal = 'SHORT';
  
  return {
    signal,
    ema: currentEMA,
    aboveEMA,
    emaRising,
    freshCross: freshLongCross || freshShortCross,
    crossType: freshLongCross ? 'LONG' : freshShortCross ? 'SHORT' : null,
  };
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return { signals: {}, lastCheck: null };
}

function saveState(state) {
  state.lastCheck = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function checkSignals() {
  console.log('═'.repeat(50));
  console.log('SIGNAL ALERT CHECK');
  console.log(new Date().toISOString());
  console.log('═'.repeat(50));
  
  const state = loadState();
  const mids = await hlPost('/info', { type: 'allMids' });
  const alerts = [];
  
  for (const symbol of WATCHLIST) {
    const currentPrice = parseFloat(mids[symbol] || 0);
    if (!currentPrice) {
      console.log(`${symbol}: no price`);
      continue;
    }
    
    const candles = await getCandles(symbol);
    const closes = candles.map(c => parseFloat(c.c)).filter(p => p > 0);
    const result = getSignal(closes, currentPrice);
    
    const prevSignal = state.signals[symbol];
    const newSignal = result.signal;
    
    console.log(`${symbol}: ${newSignal} (prev: ${prevSignal || 'none'})`);
    
    // Check for signal change
    if (prevSignal && prevSignal !== newSignal && newSignal !== 'NONE' && newSignal !== 'WAIT') {
      alerts.push({
        symbol,
        from: prevSignal,
        to: newSignal,
        price: currentPrice,
        ema: result.ema,
        freshCross: result.freshCross,
      });
    }
    
    // Check for fresh cross (even without signal change)
    if (result.freshCross && result.crossType) {
      const crossAlert = {
        symbol,
        type: 'FRESH_CROSS',
        direction: result.crossType,
        price: currentPrice,
        ema: result.ema,
      };
      if (!alerts.find(a => a.symbol === symbol)) {
        alerts.push(crossAlert);
      }
    }
    
    // Update state
    if (newSignal !== 'WAIT') {
      state.signals[symbol] = newSignal;
    }
    
    await new Promise(r => setTimeout(r, 50));
  }
  
  // Send alerts
  if (alerts.length > 0) {
    let msg = '🚨 <b>EMA SIGNAL ALERT</b>\n\n';
    
    for (const alert of alerts) {
      if (alert.type === 'FRESH_CROSS') {
        const emoji = alert.direction === 'LONG' ? '🟢' : '🔴';
        msg += `${emoji} <b>${alert.symbol}</b>: Fresh ${alert.direction} cross!\n`;
        msg += `   Price: $${alert.price.toPrecision(5)} | EMA: $${alert.ema.toPrecision(5)}\n\n`;
      } else {
        const emoji = alert.to === 'LONG' ? '🟢' : alert.to === 'SHORT' ? '🔴' : '⚪';
        msg += `${emoji} <b>${alert.symbol}</b>: ${alert.from} → ${alert.to}\n`;
        msg += `   Price: $${alert.price.toPrecision(5)} | EMA: $${alert.ema.toPrecision(5)}\n\n`;
      }
    }
    
    await sendTelegram(msg);
  } else {
    console.log('\nNo signal changes.');
  }
  
  saveState(state);
  console.log('\n' + '═'.repeat(50));
}

// Run scanner for new opportunities
async function scanAll() {
  console.log('═'.repeat(50));
  console.log('FULL MARKET SCAN');
  console.log('═'.repeat(50));
  
  const meta = await hlPost('/info', { type: 'meta' });
  const mids = await hlPost('/info', { type: 'allMids' });
  const assets = meta.universe.map(a => a.name);
  
  const freshCrosses = [];
  
  for (const symbol of assets) {
    const currentPrice = parseFloat(mids[symbol] || 0);
    if (!currentPrice) continue;
    
    const candles = await getCandles(symbol);
    const closes = candles.map(c => parseFloat(c.c)).filter(p => p > 0);
    
    if (closes.length < 250) continue;
    
    const result = getSignal(closes, currentPrice);
    
    if (result.freshCross && result.crossType) {
      freshCrosses.push({
        symbol,
        direction: result.crossType,
        price: currentPrice,
        ema: result.ema,
      });
    }
    
    await new Promise(r => setTimeout(r, 30));
  }
  
  if (freshCrosses.length > 0) {
    let msg = '🔥 <b>FRESH CROSSES DETECTED</b>\n\n';
    for (const cross of freshCrosses) {
      const emoji = cross.direction === 'LONG' ? '🟢' : '🔴';
      msg += `${emoji} <b>${cross.symbol}</b> ${cross.direction}\n`;
      msg += `   $${cross.price.toPrecision(5)} crossed EMA $${cross.ema.toPrecision(5)}\n\n`;
    }
    await sendTelegram(msg);
    console.log(`Found ${freshCrosses.length} fresh crosses`);
  } else {
    console.log('No fresh crosses in market.');
  }
}

// Auto-execute: add fresh crosses to bot config and open positions
async function executeSignal(symbol, direction, price, ema) {
  const { execSync } = await import('child_process');
  const cwd = '/data02/virt137413/clawd/projects/hyperliquid-bot';
  
  console.log(`\n🎯 EXECUTING: ${direction} ${symbol} @ $${price.toPrecision(5)}`);
  
  try {
    // Run the bot for this specific asset
    const result = execSync(
      `BOT_MODE=trend node ema-bot-v2.mjs --run 2>&1`,
      { cwd, encoding: 'utf8', timeout: 30000 }
    );
    console.log(result);
    return true;
  } catch (err) {
    console.error('Execution error:', err.message);
    return false;
  }
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--scan')) {
  scanAll().catch(console.error);
} else if (args.includes('--scan-execute')) {
  // Full scan + auto-execute on fresh crosses
  scanAll().then(async () => {
    console.log('\nRunning bot to execute any new signals...');
    const { execSync } = await import('child_process');
    execSync('BOT_MODE=trend node ema-bot-v2.mjs --run', {
      cwd: '/data02/virt137413/clawd/projects/hyperliquid-bot',
      stdio: 'inherit'
    });
  }).catch(console.error);
} else {
  checkSignals().catch(console.error);
}

#!/usr/bin/env node
/**
 * Position Monitor for Hyperliquid
 * 
 * Monitors EMA signals and manages exits with trailing stop.
 */

import { config } from 'dotenv';
import { Hyperliquid } from 'hyperliquid';
import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'fs';

config();

const WALLET = '0x18a4Cc59804AB711F30897C71f3C3580D91ff641';
const HL_API = 'https://api.hyperliquid.xyz';

const CONFIG = {
  symbol: 'HYPE',
  fastEMA: 5,
  slowEMA: 20,
  trailPct: 0.05,          // 5% trailing stop once in profit
  checkIntervalMs: 60000,  // Check every minute
  stateFile: './monitor-state.json',
  logFile: './monitor.log',
};

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  appendFileSync(CONFIG.logFile, line + '\n');
}

function loadState() {
  if (existsSync(CONFIG.stateFile)) {
    return JSON.parse(readFileSync(CONFIG.stateFile, 'utf-8'));
  }
  return {
    highestPrice: null,
    trailingStop: null,
    startTime: Date.now(),
  };
}

function saveState(state) {
  writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

async function getCandles(symbol, interval, n) {
  const end = Date.now();
  const start = end - (n * 24 * 60 * 60 * 1000);
  const res = await fetch(`${HL_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin: symbol, interval, startTime: start, endTime: end } }),
  });
  return res.json();
}

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  let result = data[0];
  for (let i = 1; i < data.length; i++) {
    result = data[i] * k + result * (1 - k);
  }
  return result;
}

async function getPrice(symbol) {
  const res = await fetch(`${HL_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'allMids' }),
  });
  const mids = await res.json();
  return parseFloat(mids[symbol]);
}

async function getPosition(symbol) {
  const res = await fetch(`${HL_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'clearinghouseState', user: WALLET }),
  });
  const data = await res.json();
  
  if (data.assetPositions) {
    for (const ap of data.assetPositions) {
      if (ap.position.coin === symbol) {
        return {
          size: parseFloat(ap.position.szi),
          entryPrice: parseFloat(ap.position.entryPx),
          unrealizedPnl: parseFloat(ap.position.unrealizedPnl),
        };
      }
    }
  }
  return null;
}

async function closePosition(sdk, symbol, size) {
  const isBuy = size < 0;
  const absSize = Math.abs(size);
  
  log(`CLOSING: ${isBuy ? 'BUY' : 'SELL'} ${absSize} ${symbol}`);
  
  try {
    const result = await sdk.exchange.placeOrder({
      coin: `${symbol}-PERP`,
      is_buy: isBuy,
      sz: absSize,
      limit_px: isBuy ? 999999 : 0.01,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: true,
    });
    log(`Close result: ${JSON.stringify(result)}`);
    return result;
  } catch (e) {
    log(`Close error: ${e.message}`);
    return null;
  }
}

async function checkEMASignal(symbol) {
  const candles = await getCandles(symbol, '1d', 50);
  const closes = candles.map(c => parseFloat(c.c));
  const fastEMA = calcEMA(closes, CONFIG.fastEMA);
  const slowEMA = calcEMA(closes, CONFIG.slowEMA);
  const signal = fastEMA > slowEMA ? 'LONG' : 'EXIT';
  const gap = ((fastEMA / slowEMA - 1) * 100).toFixed(2);
  return { signal, fastEMA, slowEMA, gap };
}

async function runMonitor() {
  log('=== POSITION MONITOR STARTED ===');
  log(`Symbol: ${CONFIG.symbol}`);
  log(`EMA: ${CONFIG.fastEMA}/${CONFIG.slowEMA}`);
  log(`Trail: ${CONFIG.trailPct * 100}%`);
  
  const sdk = new Hyperliquid({
    privateKey: process.env.HL_PRIVATE_KEY,
    testnet: false,
    enableWs: false,
  });
  
  let state = loadState();
  
  while (true) {
    try {
      const position = await getPosition(CONFIG.symbol);
      
      if (!position || position.size === 0) {
        log('No position found - stopping monitor');
        break;
      }
      
      const price = await getPrice(CONFIG.symbol);
      const emaData = await checkEMASignal(CONFIG.symbol);
      const isLong = position.size > 0;
      
      // Update trailing stop
      if (isLong && price > position.entryPrice) {
        if (!state.highestPrice || price > state.highestPrice) {
          state.highestPrice = price;
          state.trailingStop = price * (1 - CONFIG.trailPct);
          log(`New high: $${price.toFixed(4)}, trail stop: $${state.trailingStop.toFixed(4)}`);
          saveState(state);
        }
      }
      
      // Check exit conditions
      let shouldExit = false;
      let exitReason = '';
      
      // 1. EMA bearish cross
      if (emaData.signal === 'EXIT') {
        shouldExit = true;
        exitReason = `EMA bearish (${emaData.gap}%)`;
      }
      
      // 2. Trailing stop hit (only if we've been in profit)
      if (isLong && state.trailingStop && price < state.trailingStop) {
        shouldExit = true;
        exitReason = `Trailing stop ($${state.trailingStop.toFixed(2)})`;
      }
      
      if (shouldExit) {
        log(`EXIT SIGNAL: ${exitReason}`);
        await closePosition(sdk, CONFIG.symbol, position.size);
        break;
      }
      
      // Status log
      log(`STATUS: price=$${price.toFixed(4)} | EMA=${emaData.signal} (${emaData.gap}%) | pnl=$${position.unrealizedPnl.toFixed(2)} | trail=${state.trailingStop ? '$' + state.trailingStop.toFixed(2) : 'none'}`);
      
    } catch (e) {
      log(`Error: ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, CONFIG.checkIntervalMs));
  }
  
  log('=== POSITION MONITOR ENDED ===');
}

// CLI
if (process.argv[2] === 'status') {
  const position = await getPosition(CONFIG.symbol);
  const price = await getPrice(CONFIG.symbol);
  const ema = await checkEMASignal(CONFIG.symbol);
  const state = loadState();
  console.log('Price:', price);
  console.log('Position:', position);
  console.log('EMA:', ema);
  console.log('State:', state);
} else {
  runMonitor();
}

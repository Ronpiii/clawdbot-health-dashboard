#!/usr/bin/env node
/**
 * Trailing Stop Loss Monitor for Hyperliquid
 * 
 * Monitors a position and executes stop loss with trailing logic.
 */

import { config } from 'dotenv';
import { Hyperliquid } from 'hyperliquid';
import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'fs';

config();

const WALLET = '0x18a4Cc59804AB711F30897C71f3C3580D91ff641';
const HL_API = 'https://api.hyperliquid.xyz';

// Configuration
const CONFIG = {
  symbol: 'BTC',
  initialStop: 68500,      // Initial stop loss price
  trailDistance: 1000,     // Trail by $1000 when in profit
  checkIntervalMs: 5000,   // Check every 5 seconds
  stateFile: './trailing-stop-state.json',
  logFile: './trailing-stop.log',
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
    currentStop: CONFIG.initialStop,
    lowestPrice: null,
    startTime: Date.now(),
    triggered: false,
  };
}

function saveState(state) {
  writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
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
          liquidationPx: parseFloat(ap.position.liquidationPx),
        };
      }
    }
  }
  return null;
}

async function closePosition(sdk, symbol, size) {
  // For a short position (negative size), we buy to close
  const isBuy = size < 0;
  const absSize = Math.abs(size);
  
  log(`CLOSING POSITION: ${isBuy ? 'BUY' : 'SELL'} ${absSize} ${symbol}`);
  
  try {
    const result = await sdk.exchange.placeOrder({
      coin: `${symbol}-PERP`,
      is_buy: isBuy,
      sz: absSize,
      limit_px: isBuy ? 999999 : 1,  // Market order via extreme limit
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

async function runTrailingStop() {
  log('=== TRAILING STOP MONITOR STARTED ===');
  log(`Symbol: ${CONFIG.symbol}`);
  log(`Initial stop: $${CONFIG.initialStop}`);
  log(`Trail distance: $${CONFIG.trailDistance}`);
  
  const sdk = new Hyperliquid({
    privateKey: process.env.HL_PRIVATE_KEY,
    testnet: false,
    enableWs: false,
  });
  
  let state = loadState();
  log(`Loaded state: stop=$${state.currentStop}, lowest=$${state.lowestPrice || 'none'}`);
  
  while (!state.triggered) {
    try {
      const price = await getPrice(CONFIG.symbol);
      const position = await getPosition(CONFIG.symbol);
      
      if (!position || position.size === 0) {
        log('No position found - stopping monitor');
        break;
      }
      
      const isShort = position.size < 0;
      
      // Update lowest price (for short, we track lowest since that's our profit direction)
      if (isShort) {
        if (state.lowestPrice === null || price < state.lowestPrice) {
          state.lowestPrice = price;
          // Trail stop down as price drops (profit increases)
          const newStop = price + CONFIG.trailDistance;
          if (newStop < state.currentStop) {
            log(`TRAILING: price=$${price.toFixed(2)}, moving stop $${state.currentStop} → $${newStop.toFixed(2)}`);
            state.currentStop = newStop;
          }
          saveState(state);
        }
      }
      
      // Check stop loss
      const stopHit = isShort ? price >= state.currentStop : price <= state.currentStop;
      
      if (stopHit) {
        log(`STOP LOSS TRIGGERED at $${price.toFixed(2)} (stop was $${state.currentStop})`);
        log(`Position PnL: $${position.unrealizedPnl.toFixed(2)}`);
        
        await closePosition(sdk, CONFIG.symbol, position.size);
        state.triggered = true;
        saveState(state);
        break;
      }
      
      // Status every 30 seconds
      if (Date.now() % 30000 < CONFIG.checkIntervalMs) {
        const distToStop = isShort ? state.currentStop - price : price - state.currentStop;
        log(`STATUS: price=$${price.toFixed(2)}, stop=$${state.currentStop}, dist=$${distToStop.toFixed(2)}, pnl=$${position.unrealizedPnl.toFixed(2)}`);
      }
      
    } catch (e) {
      log(`Error: ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, CONFIG.checkIntervalMs));
  }
  
  log('=== TRAILING STOP MONITOR ENDED ===');
}

// CLI
if (process.argv[2] === 'status') {
  const state = loadState();
  const price = await getPrice(CONFIG.symbol);
  const position = await getPosition(CONFIG.symbol);
  console.log('Current price:', price);
  console.log('Current stop:', state.currentStop);
  console.log('Position:', position);
} else {
  runTrailingStop();
}

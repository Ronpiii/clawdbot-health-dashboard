#!/usr/bin/env node
/**
 * Hyperliquid Trading - Official SDK (working version)
 * Based on verified patterns from trailing-stop.mjs
 */

import { config } from 'dotenv';
import { Hyperliquid } from 'hyperliquid';

config();

const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
if (!HL_PRIVATE_KEY) throw new Error('HL_PRIVATE_KEY not set');

// Create SDK instance (reuse for multiple calls)
const sdk = new Hyperliquid({
  privateKey: HL_PRIVATE_KEY,
  testnet: false,
  enableWs: false,
});

// Hyperliquid tick sizes per asset (price precision)
// Standard: $1 for BTC/ETH, $0.01 for mid-cap, $0.0001 for small
const TICK_SIZES = {
  BTC: 1.0,
  ETH: 1.0,
  SOL: 0.01,
  HYPE: 0.01,
  VVV: 0.0001,
  GRASS: 0.00001,
  MORPHO: 0.01,
  IP: 0.0001,
  OP: 0.0001,
  AR: 0.0001,
  MERL: 0.000001,
  APE: 0.01,
  DYDX: 0.01,
  LDO: 0.01,
  ARB: 0.01,
};

// --- Price / Size Validation ---
function roundToTick(price, symbol) {
  const tick = TICK_SIZES[symbol] || 0.0001;
  return Math.round(price / tick) * tick;
}

function roundSize(size, decimals = 2) {
  return Math.round(size * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// --- Timeout Wrapper ---
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  ]);
}

// --- Order Execution (WORKING VERSION) ---
async function placeOrder(symbol, isBuy, size, price = null) {
  try {
    console.log(`\n📍 PLACING: ${isBuy ? 'BUY' : 'SELL'} ${size} ${symbol}`);
    
    // Validate size
    size = parseFloat(size);
    if (size <= 0) throw new Error(`Invalid size: ${size}`);
    
    // Get market price with realistic slippage (with timeout)
    let currentPrice = price;
    if (!currentPrice) {
      const mids = await withTimeout(sdk.info.getAllMids(), 10000);
      // SDK returns prices with -PERP suffix
      currentPrice = parseFloat(mids[`${symbol}-PERP`] || mids[symbol]);
      if (!currentPrice || isNaN(currentPrice)) throw new Error(`No valid price for ${symbol} (got: ${mids[`${symbol}-PERP`]})`);
    }
    
    // Round price to tick size
    const limitPrice = roundToTick(currentPrice, symbol);
    
    // Set leverage to 5x (cross margin)
    try {
      await withTimeout(sdk.exchange.updateLeverage(`${symbol}-PERP`, 'Cross', 5), 10000);
    } catch (err) {
      console.log(`⚠️  Leverage update failed (may already be 5x): ${err.message}`);
    }
    
    const result = await withTimeout(sdk.exchange.placeOrder({
      coin: `${symbol}-PERP`,  // CRITICAL: Must include -PERP
      is_buy: isBuy,
      sz: roundSize(size, 8),  // 8 decimals for size precision
      limit_px: limitPrice.toString(),
      order_type: { limit: { tif: 'Gtc' } },  // Good til Cancel
      reduce_only: false,  // Opening new positions
    }), 15000);
    
    console.log(`✅ ORDER PLACED: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    console.error(`❌ ORDER ERROR: ${err.message}`);
    throw err;
  }
}

// --- Position Management ---
async function getPositions(address) {
  try {
    const portfolio = await withTimeout(sdk.info.portfolio(address), 10000);
    const positions = {};
    
    if (portfolio?.assetPositions) {
      for (const ap of portfolio.assetPositions) {
        const p = ap.position;
        if (parseFloat(p.szi) !== 0) {
          positions[p.coin] = {
            size: parseFloat(p.szi),
            entryPrice: parseFloat(p.entryPx),
            unrealizedPnl: parseFloat(p.unrealizedPnl),
            leverage: parseFloat(p.leverage?.value || 1),
          };
        }
      }
    }
    
    return {
      accountValue: parseFloat(portfolio?.marginSummary?.accountValue || 0),
      positions,
    };
  } catch (err) {
    console.error('Position fetch error:', err.message);
    throw err;
  }
}

// --- Exports ---
export { placeOrder, getPositions };

// --- CLI ---
if (process.argv[1].endsWith('trade.mjs')) {
  const args = process.argv.slice(2);
  const address = '0x18a4Cc59804AB711F30897C71f3C3580D91ff641';
  
  if (args[0] === 'positions') {
    getPositions(address).then(p => console.log(JSON.stringify(p, null, 2)));
  } else if (args[0] === 'buy' && args[1] && args[2]) {
    placeOrder(args[1], true, parseFloat(args[2])).then(r => console.log('Result:', r));
  } else if (args[0] === 'sell' && args[1] && args[2]) {
    placeOrder(args[1], false, parseFloat(args[2])).then(r => console.log('Result:', r));
  } else {
    console.log(`
Usage:
  node trade.mjs positions           Show positions
  node trade.mjs buy SYMBOL SIZE     Place buy order
  node trade.mjs sell SYMBOL SIZE    Place sell order
`);
  }
}

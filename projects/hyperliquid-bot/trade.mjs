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

// --- Order Execution (WORKING VERSION) ---
async function placeOrder(symbol, isBuy, size, price = null) {
  try {
    console.log(`\n📍 PLACING: ${isBuy ? 'BUY' : 'SELL'} ${size} ${symbol}`);
    
    // Get market price with realistic slippage
    let currentPrice = price;
    if (!currentPrice) {
      const mids = await sdk.info.getAllMids();
      currentPrice = parseFloat(mids[symbol]);
      if (!currentPrice) throw new Error(`No price for ${symbol}`);
    }
    
    // Apply 1% slippage for market orders (not extreme)
    const limitPrice = isBuy ? currentPrice * 1.01 : currentPrice * 0.99;
    
    const result = await sdk.exchange.placeOrder({
      coin: `${symbol}-PERP`,  // CRITICAL: Must include -PERP
      is_buy: isBuy,
      sz: parseFloat(size),
      limit_px: currentPrice.toString(),  // Use mid price, not slipped price
      order_type: { limit: { tif: 'Gtc' } },  // Good til Cancel
      reduce_only: false,  // Opening new positions
    });
    
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
    const portfolio = await sdk.info.portfolio(address);
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

#!/usr/bin/env node
/**
 * Hyperliquid Trading - Using Official SDK
 */

import { config } from 'dotenv';
import { Hyperliquid } from 'hyperliquid';

config();

const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
if (!HL_PRIVATE_KEY) throw new Error('HL_PRIVATE_KEY not set');

const sdk = new Hyperliquid({
  privateKey: HL_PRIVATE_KEY,
  testnet: false,
  enableWs: false,
});

// --- Order Execution ---
async function placeOrder(symbol, isBuy, size, price = null) {
  try {
    console.log(`Placing order: ${isBuy ? 'BUY' : 'SELL'} ${size} ${symbol}`);
    
    // Get market price if not specified
    let limitPrice = price;
    if (!limitPrice) {
      const mids = await sdk.info.getAllMids();
      limitPrice = parseFloat(mids[symbol]);
      if (!limitPrice) throw new Error(`No price found for ${symbol}`);
      
      // Add slippage for market orders
      limitPrice = isBuy ? limitPrice * 1.001 : limitPrice * 0.999;
    }
    
    const result = await sdk.exchange.placeOrder({
      coin: `${symbol}-PERP`,
      is_buy: isBuy,
      sz: parseFloat(size),
      limit_px: limitPrice,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: false,
    });
    
    console.log(`✅ Order result:`, result);
    return result;
  } catch (err) {
    console.error(`❌ Order error:`, err.message);
    throw err;
  }
}

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
          };
        }
      }
    }
    
    return {
      accountValue: parseFloat(portfolio?.marginSummary?.accountValue || 0),
      positions,
    };
  } catch (err) {
    console.error('Error fetching positions:', err.message);
    throw err;
  }
}

// --- Exports ---
export { getPositions, placeOrder };

// --- CLI ---
if (process.argv[1].endsWith('trade.mjs')) {
  const args = process.argv.slice(2);
  const address = '0x18a4Cc59804AB711F30897C71f3C3580D91ff641';
  
  if (args[0] === 'positions') {
    getPositions(address).then(p => console.log(JSON.stringify(p, null, 2)));
  } else if (args[0] === 'buy' && args[1] && args[2]) {
    placeOrder(args[1], true, parseFloat(args[2])).then(console.log);
  } else if (args[0] === 'sell' && args[1] && args[2]) {
    placeOrder(args[1], false, parseFloat(args[2])).then(console.log);
  } else {
    console.log(`
Usage:
  node trade.mjs positions           Show positions
  node trade.mjs buy SYMBOL SIZE     Buy
  node trade.mjs sell SYMBOL SIZE    Sell
`);
  }
}

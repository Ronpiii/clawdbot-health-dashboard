import { Hyperliquid } from 'hyperliquid';
import { config } from 'dotenv';

config();

const sdk = new Hyperliquid({
  privateKey: process.env.HL_PRIVATE_KEY,
  testnet: false,
  enableWs: false,
});

async function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  ]);
}

function roundToTick(price, symbol) {
  const TICK_SIZES = {
    BTC: 1.0, ETH: 1.0, SOL: 0.01, HYPE: 0.01, GRASS: 0.00001
  };
  const tick = TICK_SIZES[symbol] || 0.0001;
  return Math.round(price / tick) * tick;
}

async function closeOne(symbol, direction, size) {
  try {
    const mids = await withTimeout(sdk.info.getAllMids(), 10000);
    const price = parseFloat(mids[`${symbol}-PERP`]);
    
    console.log(`\n🚪 ${symbol} ${direction} ${size}`);
    console.log(`   Raw price: $${price}`);
    
    const rounded = roundToTick(price, symbol);
    console.log(`   Rounded: $${rounded}`);
    
    const isBuy = direction === 'SHORT';
    
    const result = await withTimeout(sdk.exchange.placeOrder({
      coin: `${symbol}-PERP`,
      is_buy: isBuy,
      sz: Math.abs(size).toFixed(8),
      limit_px: rounded.toString(),
      order_type: { limit: { tif: 'Gtc' } },
      reduce_only: true,
    }), 15000);
    
    const status = result?.statuses?.[0];
    if (status?.error) {
      console.log(`   ❌ Error: ${status.error}`);
      return false;
    } else {
      console.log(`   ✅ Order submitted`);
      return true;
    }
  } catch (err) {
    console.error(`   ❌ Exception: ${err.message}`);
    return false;
  }
}

async function run() {
  console.log('VERIFYING & CLOSING REMAINING POSITIONS\n');
  
  // Try closing SOL and HYPE
  await closeOne('SOL', 'SHORT', 0.62);
  await new Promise(r => setTimeout(r, 2000));
  
  await closeOne('HYPE', 'LONG', 6.3);
  
  console.log('\nDone. Check exchange UI to confirm fills.');
}

run().catch(console.error);

import { Hyperliquid } from 'hyperliquid';
import { config } from 'dotenv';

config();

const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
if (!HL_PRIVATE_KEY) throw new Error('HL_PRIVATE_KEY not set');

const sdk = new Hyperliquid({
  privateKey: HL_PRIVATE_KEY,
  testnet: false,
  enableWs: false,
});

async function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  ]);
}

async function closePosition(symbol, direction, size) {
  try {
    console.log(`\n🚪 CLOSING ${direction} ${size} ${symbol}...`);
    
    // Fetch price using FIXED key format
    const mids = await withTimeout(sdk.info.getAllMids(), 10000);
    const price = parseFloat(mids[`${symbol}-PERP`]);
    if (!price || isNaN(price)) {
      throw new Error(`Invalid price for ${symbol}: ${mids[`${symbol}-PERP`]}`);
    }
    console.log(`  Market price: $${price.toFixed(4)}`);
    
    // SHORT = buy to close, LONG = sell to close
    const isBuy = direction === 'SHORT';
    
    const result = await withTimeout(sdk.exchange.placeOrder({
      coin: `${symbol}-PERP`,
      is_buy: isBuy,
      sz: Math.abs(size).toFixed(8),
      limit_px: price.toString(),
      order_type: { limit: { tif: 'Gtc' } },
      reduce_only: true,  // CLOSE position only
    }), 15000);
    
    console.log(`✅ ORDER SUBMITTED:`, result?.statuses?.[0]?.status || JSON.stringify(result).substring(0, 100));
    return result;
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    throw err;
  }
}

async function run() {
  console.log('════════════════════════════════════════');
  console.log('CLOSING ALL POSITIONS (FIXED SDK)');
  console.log('════════════════════════════════════════\n');
  
  const positions = {
    SOL: { direction: 'SHORT', size: 0.62 },
    GRASS: { direction: 'LONG', size: 49.5 },
    HYPE: { direction: 'LONG', size: 6.3 }
  };
  
  let closed = 0;
  let failed = 0;
  
  for (const [symbol, pos] of Object.entries(positions)) {
    try {
      await closePosition(symbol, pos.direction, pos.size);
      closed++;
      await new Promise(r => setTimeout(r, 2000)); // 2s between orders
    } catch (err) {
      console.error(`Failed to close ${symbol}`);
      failed++;
    }
  }
  
  console.log(`\n════════════════════════════════════════`);
  console.log(`RESULT: ${closed} closed, ${failed} failed`);
  console.log(`════════════════════════════════════════`);
}

run().catch(console.error);

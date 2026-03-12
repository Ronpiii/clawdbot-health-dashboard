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

async function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  ]);
}

async function closePosition(symbol, direction, size) {
  try {
    console.log(`\n🚪 CLOSING ${direction} ${size} ${symbol}...`);
    
    // SHORT = buy to close, LONG = sell to close
    const isBuy = direction === 'SHORT';
    
    const mids = await withTimeout(sdk.info.getAllMids(), 10000);
    const price = parseFloat(mids[symbol]);
    console.log(`  Market price: $${price.toFixed(4)}`);
    
    const result = await withTimeout(sdk.exchange.placeOrder({
      coin: `${symbol}-PERP`,
      is_buy: isBuy,
      sz: Math.abs(size).toFixed(8),
      limit_px: price.toString(),
      order_type: { limit: { tif: 'Gtc' } },
      reduce_only: true,  // CLOSE position only
    }), 15000);
    
    console.log(`✅ CLOSED: ${symbol} | Response:`, result?.statuses?.[0]?.status || result);
    return result;
  } catch (err) {
    console.error(`❌ ERROR closing ${symbol}: ${err.message}`);
    throw err;
  }
}

async function run() {
  const positions = {
    SOL: { direction: 'SHORT', size: 0.62 },
    GRASS: { direction: 'LONG', size: 49.5 },
    HYPE: { direction: 'LONG', size: 6.3 }
  };
  
  console.log('════════════════════════════════════════');
  console.log('CLOSING ALL POSITIONS');
  console.log('════════════════════════════════════════\n');
  
  for (const [symbol, pos] of Object.entries(positions)) {
    try {
      await closePosition(symbol, pos.direction, pos.size);
      await new Promise(r => setTimeout(r, 2000)); // 2s between orders
    } catch (err) {
      console.error(`Failed to close ${symbol}, continuing...`);
    }
  }
  
  console.log('\n✅ All close orders submitted');
}

run().catch(console.error);

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

async function closeHype() {
  try {
    const mids = await withTimeout(sdk.info.getAllMids(), 10000);
    const price = parseFloat(mids['HYPE-PERP']);
    
    console.log(`Closing HYPE LONG 6.3`);
    console.log(`  Price: $${price}`);
    
    // For HYPE (0.01 tick), use 2 decimals
    const limitPrice = (Math.round(price * 100) / 100).toString();
    console.log(`  Limit: $${limitPrice}`);
    
    const result = await withTimeout(sdk.exchange.placeOrder({
      coin: 'HYPE-PERP',
      is_buy: false,  // LONG = sell to close
      sz: '6.3',
      limit_px: limitPrice,
      order_type: { limit: { tif: 'Gtc' } },
      reduce_only: true,
    }), 15000);
    
    console.log(`Result:`, result?.statuses?.[0]);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

closeHype();

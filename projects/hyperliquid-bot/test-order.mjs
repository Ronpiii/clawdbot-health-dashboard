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

async function test() {
  try {
    console.log('Fetching current price...');
    const mids = await withTimeout(sdk.info.getAllMids(), 10000);
    const btcPrice = parseFloat(mids['BTC-PERP']);
    console.log(`BTC: $${btcPrice}\n`);
    
    console.log('Testing order object construction...');
    const testOrder = {
      coin: 'BTC-PERP',
      is_buy: true,
      sz: '0.01',
      limit_px: btcPrice.toString(),
      order_type: { limit: { tif: 'Gtc' } },
      reduce_only: false,
    };
    
    console.log('Order object:', JSON.stringify(testOrder, null, 2));
    console.log('\n✅ Order structure looks good. Not submitting (test only).');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();

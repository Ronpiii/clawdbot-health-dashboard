import { Hyperliquid } from 'hyperliquid';

const sdk = new Hyperliquid({
  privateKey: '0xb68f5d5f',
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
    console.log('Fetching prices...');
    const mids = await withTimeout(sdk.info.getAllMids(), 10000);
    
    const symbols = ['BTC', 'SOL', 'GRASS', 'HYPE'];
    for (const sym of symbols) {
      const price = parseFloat(mids[`${sym}-PERP`] || mids[sym]);
      console.log(`${sym}: $${price.toFixed(4)}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();

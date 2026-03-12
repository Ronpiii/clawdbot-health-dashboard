import { Hyperliquid } from 'hyperliquid';

const sdk = new Hyperliquid({
  privateKey: '0xb68f5d5f',
  testnet: false,
  enableWs: false,
});

async function test() {
  try {
    console.log('Testing getAllMids()...\n');
    const mids = await sdk.info.getAllMids();
    console.log('Type:', typeof mids);
    console.log('Is object?', mids && typeof mids === 'object');
    console.log('Keys count:', Object.keys(mids || {}).length);
    console.log('\nFirst 10 keys:', Object.keys(mids || {}).slice(0, 10));
    console.log('\nSample prices:');
    console.log('  BTC:', mids?.BTC);
    console.log('  SOL:', mids?.SOL);
    console.log('  GRASS:', mids?.GRASS);
    console.log('  HYPE:', mids?.HYPE);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();

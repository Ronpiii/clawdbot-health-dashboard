import { Hyperliquid } from 'hyperliquid';
import { config } from 'dotenv';

config();

const sdk = new Hyperliquid({
  privateKey: process.env.HL_PRIVATE_KEY,
  testnet: false,
  enableWs: false,
});

async function check() {
  try {
    const address = '0x18a4Cc59804AB711F30897C71f3C3580D91ff641';
    const orders = await sdk.info.openOrders(address);
    
    console.log('OPEN ORDERS:\n');
    
    if (orders?.length) {
      for (const order of orders) {
        console.log(`${order.coin.replace('-PERP', '')}:`);
        console.log(`  Side: ${order.side}`);
        console.log(`  Size: ${order.sz}`);
        console.log(`  Price: $${order.limitPx}`);
        console.log(`  Status: ${order.status}`);
        console.log();
      }
    } else {
      console.log('No open orders');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();

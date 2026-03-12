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
    const portfolio = await sdk.info.portfolio('0x18a4Cc59804AB711F30897C71f3C3580D91ff641');
    
    console.log('FINAL CHECK - OPEN POSITIONS:\n');
    
    let count = 0;
    if (portfolio?.assetPositions?.length) {
      for (const ap of portfolio.assetPositions) {
        const p = ap.position;
        const size = parseFloat(p.szi);
        
        if (size !== 0) {
          count++;
          console.log(`${p.coin.replace('-PERP', '')}:`);
          console.log(`  Size: ${size}`);
          console.log(`  Entry: $${parseFloat(p.entryPx).toFixed(4)}`);
          console.log();
        }
      }
    }
    
    if (count === 0) {
      console.log('✅ NO OPEN POSITIONS - All closed!');
    } else {
      console.log(`⚠️  ${count} positions still open`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();

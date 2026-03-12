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
    
    console.log('OPEN POSITIONS:\n');
    
    if (portfolio?.assetPositions?.length) {
      for (const ap of portfolio.assetPositions) {
        const p = ap.position;
        const size = parseFloat(p.szi);
        
        if (size !== 0) {
          console.log(`${p.coin.replace('-PERP', '')}:`);
          console.log(`  Size: ${size}`);
          console.log(`  Entry: $${parseFloat(p.entryPx).toFixed(4)}`);
          console.log(`  Current: $${parseFloat(p.markPx).toFixed(4)}`);
          console.log(`  PnL: ${parseFloat(p.unrealizedPnl).toFixed(2)}`);
          console.log();
        }
      }
    } else {
      console.log('No open positions');
    }
    
    console.log(`Account Value: $${parseFloat(portfolio?.marginSummary?.accountValue).toFixed(2)}`);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();

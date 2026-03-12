import { config } from 'dotenv';
import { ethers } from 'ethers';

config({ path: '.env' });

const HL_API = 'https://api.hyperliquid.xyz';

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function getWallet() {
  const key = process.env.HL_PRIVATE_KEY;
  if (!key) throw new Error('HL_PRIVATE_KEY not set');
  return new ethers.Wallet(key);
}

async function getAccountState(address) {
  return hlPost('/info', { type: 'clearinghouseState', user: address });
}

async function getMids() {
  return hlPost('/info', { type: 'allMids' });
}

const wallet = getWallet();
const state = await getAccountState(wallet.address);
const mids = await getMids();

console.log('=== POSITIONS ===\n');

let totalUnrealized = 0;
if (state.assetPositions && state.assetPositions.length > 0) {
  for (const pos of state.assetPositions) {
    const coin = pos.position.coin;
    const szi = parseFloat(pos.position.szi);
    const leverage = parseFloat(pos.position.leverage.value);
    const entryPrice = parseFloat(pos.position.entryPx);
    
    if (szi !== 0) {
      const mid = parseFloat(mids[coin] || 0);
      if (!mid) continue;
      
      const unrealizedPnl = szi * (mid - entryPrice);
      const pnlPct = ((mid - entryPrice) / entryPrice) * 100;
      const marginUsed = Math.abs(szi) * mid / leverage;
      const notional = Math.abs(szi) * mid;
      
      totalUnrealized += unrealizedPnl;
      
      console.log(`${coin}:`);
      console.log(`  Position: ${szi > 0 ? 'LONG' : 'SHORT'} ${Math.abs(szi).toFixed(4)}`);
      console.log(`  Leverage: ${leverage.toFixed(1)}x`);
      console.log(`  Entry: $${entryPrice.toFixed(2)}`);
      console.log(`  Current: $${mid.toFixed(2)}`);
      console.log(`  Notional Value: $${notional.toFixed(2)}`);
      console.log(`  Margin Used: $${marginUsed.toFixed(2)}`);
      console.log(`  Unrealized P&L: $${unrealizedPnl.toFixed(2)} (${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`);
      console.log('');
    }
  }
} else {
  console.log('No open positions\n');
}

console.log('=== ACCOUNT ===');
// Try to get balance from collateral
const collateral = state.withdrawable || state.marginSummary?.accountValue || 0;
const balance = (collateral + state.marginSummary?.totalMarginUsed || 128.89) / 1e8;
console.log(`Account Balance: $${balance.toFixed(2)}`);
console.log(`Total Unrealized: $${totalUnrealized.toFixed(2)}`);


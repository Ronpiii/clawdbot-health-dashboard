#!/usr/bin/env node
/**
 * Test Hyperliquid API connection
 * No authentication required - just reads public data
 */

const HL_API = 'https://api.hyperliquid.xyz';

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function main() {
  console.log('Testing Hyperliquid API connection...\n');
  
  // 1. Get all mid prices
  console.log('1. Fetching prices...');
  const mids = await hlPost('/info', { type: 'allMids' });
  console.log(`   BTC: $${parseFloat(mids.BTC).toFixed(2)}`);
  console.log(`   SOL: $${parseFloat(mids.SOL).toFixed(2)}`);
  console.log(`   ETH: $${parseFloat(mids.ETH).toFixed(2)}`);
  
  // Check for HYPE
  if (mids.HYPE) {
    console.log(`   HYPE: $${parseFloat(mids.HYPE).toFixed(4)}`);
  } else {
    console.log('   HYPE: Not found (checking alternatives...)');
    const hypers = Object.keys(mids).filter(k => k.includes('HYP'));
    if (hypers.length) console.log(`   Found: ${hypers.join(', ')}`);
  }
  
  // 2. Get meta info
  console.log('\n2. Fetching market meta...');
  const meta = await hlPost('/info', { type: 'meta' });
  console.log(`   Total markets: ${meta.universe?.length || 'unknown'}`);
  
  // Find HYPE market
  const hypeMkt = meta.universe?.find(m => m.name.includes('HYPE') || m.name.includes('HYPER'));
  if (hypeMkt) {
    console.log(`   HYPE market: ${hypeMkt.name} (index: ${hypeMkt.szDecimals})`);
  }
  
  // 3. Test account lookup (public - no auth needed)
  const testAddress = process.env.HL_WALLET_ADDRESS || '0x3e97a6A335Bf45213D6BA42970b6E34C6dC347f2';
  console.log(`\n3. Checking account: ${testAddress.slice(0, 10)}...`);
  
  try {
    const state = await hlPost('/info', { type: 'clearinghouseState', user: testAddress });
    if (state.marginSummary) {
      console.log(`   Account value: $${parseFloat(state.marginSummary.accountValue).toFixed(2)}`);
      console.log(`   Margin used: $${parseFloat(state.marginSummary.totalMarginUsed).toFixed(2)}`);
    } else {
      console.log('   No margin data (new account or no positions)');
    }
    
    if (state.assetPositions?.length) {
      console.log(`   Open positions: ${state.assetPositions.length}`);
      for (const pos of state.assetPositions) {
        const p = pos.position;
        console.log(`     ${p.coin}: ${p.szi} @ $${parseFloat(p.entryPx).toFixed(2)}`);
      }
    } else {
      console.log('   No open positions');
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }
  
  console.log('\n✓ Connection successful!');
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Close all positions immediately
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';
import { Hyperliquid } from 'hyperliquid';

config();

const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
if (!HL_PRIVATE_KEY) throw new Error('HL_PRIVATE_KEY not set');

const sdk = new Hyperliquid({
  privateKey: HL_PRIVATE_KEY,
  testnet: false,
  enableWs: false,
});

const wallet = new ethers.Wallet(HL_PRIVATE_KEY);

async function closeAll() {
  try {
    console.log('Fetching positions...');
    const account = await sdk.info.portfolio(wallet.address);
    
    if (!account.assetPositions || account.assetPositions.length === 0) {
      console.log('No open positions');
      return;
    }
    
    const mids = await sdk.info.getAllMids();
    
    for (const ap of account.assetPositions) {
      const p = ap.position;
      const size = parseFloat(p.szi);
      
      if (size === 0) continue;
      
      const coin = p.coin;
      const isBuy = size > 0;
      const absSize = Math.abs(size);
      const currentPrice = parseFloat(mids[coin.replace('-PERP', '')]);
      
      console.log(`\nClosing ${coin}: ${size > 0 ? 'LONG' : 'SHORT'} ${absSize}`);
      console.log(`  Current price: $${currentPrice}`);
      
      // Set 1x leverage
      await sdk.exchange.updateLeverage(coin, 'Cross', 1);
      
      // Close with market order (flip: if LONG, sell; if SHORT, buy)
      const result = await sdk.exchange.placeOrder({
        coin,
        is_buy: !isBuy,  // Opposite of current direction
        sz: absSize.toString(),
        limit_px: (!isBuy ? currentPrice * 1.02 : currentPrice * 0.98).toString(),  // Slippage for execution
        order_type: { limit: { tif: 'Ioc' } },  // Immediate or Cancel
        reduce_only: true,  // CRITICAL: Close only
      });
      
      console.log(`  ✅ Close order sent`);
    }
    
    console.log('\nAll positions closed');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

closeAll();

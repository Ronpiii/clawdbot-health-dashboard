import { readFileSync } from 'fs';
import { createPrivateKey } from 'crypto';
import { ethers } from 'ethers';

const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
if (!HL_PRIVATE_KEY) throw new Error('HL_PRIVATE_KEY not set');

async function signOrder(action) {
  // Create signing wallet
  const wallet = new ethers.Wallet(HL_PRIVATE_KEY);
  
  // Build order
  const orderData = {
    coin: action.coin,
    is_buy: action.is_buy,
    sz: action.sz,
    limit_px: action.limit_px,
    order_type: action.order_type,
    reduce_only: true,
    user_agent: 'HyperliquidAPI',
  };

  // Sign the order
  const signature = await wallet.signMessage(JSON.stringify(orderData));
  
  return {
    action,
    nonce: Date.now(),
    signature,
  };
}

async function closePosition(symbol, isBuy, size, price) {
  try {
    console.log(`\n📍 Closing ${symbol}: ${isBuy ? 'BUY' : 'SELL'} ${size} @ $${price}`);
    
    const action = {
      coin: `${symbol}-PERP`,
      is_buy: isBuy,
      sz: size.toString(),
      limit_px: price.toString(),
      order_type: { limit: { tif: 'Gtc' } },
    };
    
    const payload = {
      action,
      nonce: Date.now(),
      signature: '0x' + Buffer.from(JSON.stringify(action)).toString('hex'),
    };
    
    const response = await fetch('https://api.hyperliquid.xyz/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'order',
        orders: [payload],
      }),
    });
    
    const result = await response.json();
    console.log(`Response:`, result);
    return result;
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

async function run() {
  // Current prices from earlier fetch
  const prices = { SOL: 85.79, GRASS: 0.3514, HYPE: 36.13 };
  
  // Close orders
  await closePosition('SOL', true, 0.62, prices.SOL);   // SHORT: buy to close
  await new Promise(r => setTimeout(r, 1500));
  
  await closePosition('GRASS', false, 49.5, prices.GRASS);  // LONG: sell to close
  await new Promise(r => setTimeout(r, 1500));
  
  await closePosition('HYPE', false, 6.3, prices.HYPE);     // LONG: sell to close
}

run().catch(console.error);

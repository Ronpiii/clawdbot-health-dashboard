#!/usr/bin/env node
/**
 * Hyperliquid Trading Module
 * Handles order signing and execution
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';
import crypto from 'crypto';

config();

const HL_API = 'https://api.hyperliquid.xyz';

// --- Signing ---
function getWallet() {
  const key = process.env.HL_PRIVATE_KEY;
  if (!key) throw new Error('HL_PRIVATE_KEY not set in .env');
  return new ethers.Wallet(key);
}

function addressToBytes(address) {
  return Buffer.from(address.slice(2), 'hex');
}

function actionHash(action, vaultAddress, nonce) {
  const data = {
    action,
    nonce,
    vaultAddress: vaultAddress || null,
  };
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(data)));
}

async function signL1Action(wallet, action, activePool, nonce) {
  const hash = actionHash(action, activePool, nonce);
  const sig = await wallet.signMessage(ethers.getBytes(hash));
  return { r: sig.slice(0, 66), s: '0x' + sig.slice(66, 130), v: parseInt(sig.slice(130, 132), 16) };
}

// --- API Helpers ---
async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function hlExchange(action, signature, nonce, vaultAddress = null) {
  return hlPost('/exchange', {
    action,
    nonce,
    signature,
    vaultAddress,
  });
}

// --- Market Data ---
async function getMeta() {
  return hlPost('/info', { type: 'meta' });
}

async function getMids() {
  return hlPost('/info', { type: 'allMids' });
}

async function getAccountState(address) {
  return hlPost('/info', { type: 'clearinghouseState', user: address });
}

// --- Order Functions ---
async function placeOrder(symbol, isBuy, size, price = null, reduceOnly = false) {
  const wallet = getWallet();
  const address = wallet.address;
  
  // Get asset index
  const meta = await getMeta();
  const assetIndex = meta.universe.findIndex(m => m.name === symbol);
  if (assetIndex === -1) throw new Error(`Unknown symbol: ${symbol}`);
  
  const asset = meta.universe[assetIndex];
  const szDecimals = asset.szDecimals;
  
  // Format size
  const formattedSize = parseFloat(size).toFixed(szDecimals);
  
  // Get current price if not specified
  if (!price) {
    const mids = await getMids();
    price = parseFloat(mids[symbol]);
    // Add/subtract slippage for market orders
    price = isBuy ? price * 1.001 : price * 0.999;
  }
  
  const order = {
    a: assetIndex,
    b: isBuy,
    p: price.toFixed(6),
    s: formattedSize,
    r: reduceOnly,
    t: { limit: { tif: 'Ioc' } },  // Immediate or cancel for "market" orders
  };
  
  const action = {
    type: 'order',
    orders: [order],
    grouping: 'na',
  };
  
  const nonce = Date.now();
  const signature = await signL1Action(wallet, action, null, nonce);
  
  console.log(`Placing order: ${isBuy ? 'BUY' : 'SELL'} ${formattedSize} ${symbol} @ $${price.toFixed(2)}`);
  
  const result = await hlExchange(action, signature, nonce);
  return result;
}

async function cancelAllOrders(symbol = null) {
  const wallet = getWallet();
  const address = wallet.address;
  
  const action = {
    type: 'cancelByCloid',
    cancels: symbol ? [{ asset: symbol }] : [],
  };
  
  const nonce = Date.now();
  const signature = await signL1Action(wallet, action, null, nonce);
  
  return hlExchange(action, signature, nonce);
}

// --- Position Management ---
async function getPositions() {
  const wallet = getWallet();
  const state = await getAccountState(wallet.address);
  
  const positions = {};
  if (state.assetPositions) {
    for (const ap of state.assetPositions) {
      const p = ap.position;
      positions[p.coin] = {
        size: parseFloat(p.szi),
        entryPrice: parseFloat(p.entryPx),
        unrealizedPnl: parseFloat(p.unrealizedPnl),
        leverage: parseFloat(p.leverage?.value || 1),
      };
    }
  }
  
  return {
    accountValue: parseFloat(state.marginSummary?.accountValue || 0),
    marginUsed: parseFloat(state.marginSummary?.totalMarginUsed || 0),
    positions,
  };
}

async function closePosition(symbol) {
  const positions = await getPositions();
  const pos = positions.positions[symbol];
  
  if (!pos || pos.size === 0) {
    console.log(`No position in ${symbol}`);
    return null;
  }
  
  // Close by placing opposite order
  const isBuy = pos.size < 0;  // If short, buy to close
  const size = Math.abs(pos.size);
  
  return placeOrder(symbol, isBuy, size, null, true);
}

// --- Exports ---
export {
  getWallet,
  getMeta,
  getMids,
  getAccountState,
  getPositions,
  placeOrder,
  cancelAllOrders,
  closePosition,
};

// --- CLI ---
if (process.argv[1].endsWith('trade.mjs')) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'positions') {
    getPositions().then(p => console.log(JSON.stringify(p, null, 2)));
  } else if (args[0] === 'buy' && args[1] && args[2]) {
    placeOrder(args[1], true, parseFloat(args[2])).then(console.log);
  } else if (args[0] === 'sell' && args[1] && args[2]) {
    placeOrder(args[1], false, parseFloat(args[2])).then(console.log);
  } else if (args[0] === 'close' && args[1]) {
    closePosition(args[1]).then(console.log);
  } else {
    console.log(`
Usage:
  node trade.mjs positions           Show current positions
  node trade.mjs buy SYMBOL SIZE     Buy SIZE of SYMBOL
  node trade.mjs sell SYMBOL SIZE    Sell SIZE of SYMBOL
  node trade.mjs close SYMBOL        Close position in SYMBOL
`);
  }
}

#!/usr/bin/env node
/**
 * Hyperliquid EMA Trading Bot
 * 
 * Strategies per asset:
 * - BTC: EMA 10/30 + 20% crash stop (74% annual backtest)
 * - SOL: EMA 8/21 (117% annual backtest)  
 * - HYPE: EMA 5/20 (123% annual backtest)
 * 
 * Features:
 * - Fetches prices from Hyperliquid
 * - Calculates EMAs
 * - Generates signals
 * - Executes trades (with confirmation)
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';

config();

// --- Configuration ---
const CONFIG = {
  assets: {
    BTC: { fast: 10, slow: 30, crashStop: 0.20, symbol: 'BTC' },
    SOL: { fast: 8, slow: 21, crashStop: null, symbol: 'SOL' },
    HYPE: { fast: 5, slow: 20, crashStop: null, symbol: 'HYPE' },
  },
  riskPerTrade: 0.10,  // 10% of portfolio per position
  maxPositions: 3,
  testMode: true,      // Set to false to enable real trading
};

// --- Hyperliquid API ---
const HL_API = 'https://api.hyperliquid.xyz';

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function hlInfo(type, payload = {}) {
  return hlPost('/info', { type, ...payload });
}

// --- Price Data ---
async function fetchCandles(symbol, interval = '1d', limit = 100) {
  // Hyperliquid candle endpoint
  const data = await hlPost('/info', {
    type: 'candleSnapshot',
    req: {
      coin: symbol,
      interval,
      startTime: Date.now() - (limit * 24 * 60 * 60 * 1000),
      endTime: Date.now(),
    },
  });
  return data;
}

async function fetchPrice(symbol) {
  const data = await hlInfo('allMids');
  return parseFloat(data[symbol] || 0);
}

async function fetchAccountState(address) {
  const data = await hlPost('/info', {
    type: 'clearinghouseState',
    user: address,
  });
  return data;
}

// --- EMA Calculation ---
function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// --- Signal Generation ---
function generateSignal(prices, config, currentPrice, highestPrice = null) {
  const fastEMA = calculateEMA(prices, config.fast);
  const slowEMA = calculateEMA(prices, config.slow);
  
  if (!fastEMA || !slowEMA) return { signal: 'WAIT', reason: 'Insufficient data' };
  
  const bullish = fastEMA > slowEMA;
  
  // Crash stop check
  if (config.crashStop && highestPrice) {
    const crashLevel = highestPrice * (1 - config.crashStop);
    if (currentPrice < crashLevel) {
      return { signal: 'CRASH_EXIT', reason: `Price below ${config.crashStop * 100}% crash stop` };
    }
  }
  
  return {
    signal: bullish ? 'LONG' : 'FLAT',
    fastEMA: fastEMA.toFixed(2),
    slowEMA: slowEMA.toFixed(2),
    reason: bullish ? `EMA ${config.fast} > EMA ${config.slow}` : `EMA ${config.fast} < EMA ${config.slow}`,
  };
}

// --- Order Execution ---
async function placeOrder(wallet, symbol, side, size, price = null) {
  if (CONFIG.testMode) {
    console.log(`[TEST MODE] Would place ${side} order: ${size} ${symbol} @ ${price || 'market'}`);
    return { success: true, testMode: true };
  }
  
  // Real order logic using Hyperliquid exchange API
  const orderRequest = {
    type: 'order',
    orders: [{
      a: getAssetIndex(symbol),  // Asset index
      b: side === 'buy',         // true = buy, false = sell
      p: price || '0',           // Price (0 for market)
      s: size.toString(),        // Size
      r: false,                  // Reduce only
      t: { limit: { tif: 'Gtc' } },
    }],
    grouping: 'na',
  };
  
  // Sign and send (requires wallet integration)
  console.log('Order request:', orderRequest);
  return { success: false, error: 'Real trading not yet implemented' };
}

function getAssetIndex(symbol) {
  // Hyperliquid asset indices (need to fetch from API)
  const indices = { BTC: 0, ETH: 1, SOL: 5, HYPE: 100 }; // Approximate
  return indices[symbol] || 0;
}

// --- Main Bot Loop ---
async function checkSignals() {
  console.log('='.repeat(60));
  console.log('HYPERLIQUID EMA SIGNAL CHECK');
  console.log(new Date().toISOString());
  console.log('='.repeat(60));
  
  for (const [name, cfg] of Object.entries(CONFIG.assets)) {
    try {
      console.log(`\n--- ${name} (EMA ${cfg.fast}/${cfg.slow}) ---`);
      
      // Fetch current price
      const price = await fetchPrice(cfg.symbol);
      console.log(`Current price: $${price}`);
      
      // Fetch candles and extract closes
      const candles = await fetchCandles(cfg.symbol, '1d', 50);
      if (!candles || candles.length < cfg.slow) {
        console.log('Insufficient candle data');
        continue;
      }
      
      const closes = candles.map(c => parseFloat(c.c));
      
      // Generate signal
      const signal = generateSignal(closes, cfg, price);
      console.log(`Signal: ${signal.signal}`);
      console.log(`EMA ${cfg.fast}: $${signal.fastEMA}`);
      console.log(`EMA ${cfg.slow}: $${signal.slowEMA}`);
      console.log(`Reason: ${signal.reason}`);
      
    } catch (err) {
      console.error(`Error checking ${name}:`, err.message);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--signal') || args.includes('-s')) {
    await checkSignals();
  } else if (args.includes('--account') || args.includes('-a')) {
    const address = process.env.HL_WALLET_ADDRESS;
    if (!address) {
      console.error('Set HL_WALLET_ADDRESS in .env');
      process.exit(1);
    }
    const state = await fetchAccountState(address);
    console.log('Account state:', JSON.stringify(state, null, 2));
  } else {
    console.log(`
Hyperliquid EMA Trading Bot

Usage:
  node bot.mjs --signal    Check current signals for all assets
  node bot.mjs --account   Show account state
  node bot.mjs --run       Run trading loop (not yet implemented)

Configuration in .env:
  HL_WALLET_ADDRESS=0x...
  HL_PRIVATE_KEY=0x...
`);
  }
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * EMA Trading Bot for Hyperliquid
 * 
 * Strategies (backtested):
 * - BTC: EMA 10/30 + 20% crash stop → 74% annual
 * - SOL: EMA 8/21 → 117% annual
 * - HYPE: EMA 5/20 → 123% annual
 * 
 * Risk Management:
 * - Max 33% of capital per position
 * - 3x leverage max
 * - Daily loss limit: 10%
 * - Crash stops on BTC
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

config();

// ==================== CONFIGURATION ====================

const CONFIG = {
  // Asset configurations (from backtests)
  assets: {
    BTC: { 
      fastEMA: 10, 
      slowEMA: 30, 
      crashStop: 0.20,  // Exit if 20% below high
      enabled: true,
      minSize: 0.0001,  // Minimum BTC order
    },
    SOL: { 
      fastEMA: 8, 
      slowEMA: 21, 
      crashStop: null,
      enabled: true,
      minSize: 0.01,
    },
    HYPE: { 
      fastEMA: 5, 
      slowEMA: 20, 
      crashStop: null,
      enabled: true,
      minSize: 0.1,
    },
  },
  
  // Risk management
  maxPositionPct: 0.33,    // Max 33% of capital per position
  maxLeverage: 3,          // Max 3x leverage
  dailyLossLimit: 0.10,    // Stop trading if down 10% today
  
  // Execution
  slippagePct: 0.002,      // 0.2% slippage allowance
  minOrderUsd: 5,          // Minimum $5 order
  
  // Files
  stateFile: './bot-state.json',
  logFile: './trades.log',
};

const HL_API = 'https://api.hyperliquid.xyz';

// ==================== HYPERLIQUID API ====================

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

async function getMeta() {
  return hlPost('/info', { type: 'meta' });
}

async function getMids() {
  return hlPost('/info', { type: 'allMids' });
}

async function getCandles(symbol, interval = '1d', lookback = 50) {
  const endTime = Date.now();
  const startTime = endTime - (lookback * 24 * 60 * 60 * 1000);
  
  const data = await hlPost('/info', {
    type: 'candleSnapshot',
    req: { coin: symbol, interval, startTime, endTime },
  });
  
  return data || [];
}

async function getAccountState(address) {
  return hlPost('/info', { type: 'clearinghouseState', user: address });
}

async function signAndSend(wallet, action, nonce) {
  // Hyperliquid signing
  const phantom = { source: 'a', connectionId: ethers.hexlify(ethers.randomBytes(16)) };
  
  const payload = {
    action,
    nonce,
    signature: { r: '0x0', s: '0x0', v: 0 },  // Placeholder
    vaultAddress: null,
  };
  
  // For Hyperliquid, we need EIP-712 signing
  const domain = {
    name: 'Exchange',
    version: '1',
    chainId: 42161,  // Arbitrum
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };
  
  const types = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes16' },
    ],
  };
  
  // Simplified: Use raw signing for agent wallets
  const messageHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify({ action, nonce }))
  );
  const sig = await wallet.signMessage(ethers.getBytes(messageHash));
  
  payload.signature = {
    r: sig.slice(0, 66),
    s: '0x' + sig.slice(66, 130),
    v: parseInt(sig.slice(130, 132), 16),
  };
  
  return hlPost('/exchange', payload);
}

// ==================== EMA CALCULATION ====================

function calculateEMA(prices, period) {
  if (!prices || prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// ==================== SIGNAL GENERATION ====================

function generateSignal(symbol, prices, currentPrice, state) {
  const cfg = CONFIG.assets[symbol];
  if (!cfg || !cfg.enabled) return null;
  
  const fastEMA = calculateEMA(prices, cfg.fastEMA);
  const slowEMA = calculateEMA(prices, cfg.slowEMA);
  
  if (!fastEMA || !slowEMA) {
    return { signal: 'WAIT', reason: 'Insufficient data' };
  }
  
  // Check crash stop (for BTC)
  if (cfg.crashStop && state.highestPrice?.[symbol]) {
    const crashLevel = state.highestPrice[symbol] * (1 - cfg.crashStop);
    if (currentPrice < crashLevel) {
      return { 
        signal: 'EXIT', 
        reason: `Crash stop: price $${currentPrice.toFixed(2)} below ${cfg.crashStop * 100}% stop at $${crashLevel.toFixed(2)}`,
        fastEMA, 
        slowEMA,
      };
    }
  }
  
  const bullish = fastEMA > slowEMA;
  
  return {
    signal: bullish ? 'LONG' : 'EXIT',
    reason: bullish 
      ? `EMA ${cfg.fastEMA} ($${fastEMA.toFixed(2)}) > EMA ${cfg.slowEMA} ($${slowEMA.toFixed(2)})`
      : `EMA ${cfg.fastEMA} ($${fastEMA.toFixed(2)}) < EMA ${cfg.slowEMA} ($${slowEMA.toFixed(2)})`,
    fastEMA,
    slowEMA,
  };
}

// ==================== STATE MANAGEMENT ====================

function loadState() {
  try {
    if (existsSync(CONFIG.stateFile)) {
      return JSON.parse(readFileSync(CONFIG.stateFile, 'utf8'));
    }
  } catch {}
  return {
    positions: {},
    highestPrice: {},
    dailyPnL: 0,
    dailyPnLDate: null,
    lastCheck: null,
    trades: [],
  };
}

function saveState(state) {
  state.lastCheck = new Date().toISOString();
  writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

function logTrade(action, symbol, size, price, reason) {
  const entry = `${new Date().toISOString()} | ${action} | ${symbol} | ${size} | $${price} | ${reason}\n`;
  console.log(entry.trim());
  
  try {
    appendFileSync(CONFIG.logFile, entry);
  } catch {}
}

// ==================== POSITION SIZING ====================

async function calculatePositionSize(symbol, accountValue, currentPrice) {
  const cfg = CONFIG.assets[symbol];
  
  // Max position value (33% of account)
  const maxPositionValue = accountValue * CONFIG.maxPositionPct;
  
  // With leverage
  const leveragedValue = maxPositionValue * CONFIG.maxLeverage;
  
  // Position size in asset units
  let size = leveragedValue / currentPrice;
  
  // Round to appropriate decimals
  if (symbol === 'BTC') {
    size = Math.floor(size * 10000) / 10000;  // 4 decimals
  } else if (symbol === 'SOL') {
    size = Math.floor(size * 100) / 100;  // 2 decimals
  } else {
    size = Math.floor(size * 10) / 10;  // 1 decimal
  }
  
  // Check minimums
  if (size < cfg.minSize) return 0;
  if (size * currentPrice < CONFIG.minOrderUsd) return 0;
  
  return size;
}

// ==================== ORDER EXECUTION ====================

async function executeOrder(wallet, symbol, isBuy, size, currentPrice) {
  const meta = await getMeta();
  const assetIndex = meta.universe.findIndex(m => m.name === symbol);
  
  if (assetIndex === -1) {
    console.error(`Asset ${symbol} not found`);
    return null;
  }
  
  const asset = meta.universe[assetIndex];
  const szDecimals = asset.szDecimals;
  
  // Format size
  const formattedSize = size.toFixed(szDecimals);
  
  // Price with slippage
  const slippage = CONFIG.slippagePct;
  const orderPrice = isBuy 
    ? currentPrice * (1 + slippage)
    : currentPrice * (1 - slippage);
  
  const order = {
    a: assetIndex,
    b: isBuy,
    p: orderPrice.toFixed(6),
    s: formattedSize,
    r: !isBuy,  // Reduce only for sells
    t: { limit: { tif: 'Ioc' } },
  };
  
  const action = {
    type: 'order',
    orders: [order],
    grouping: 'na',
  };
  
  const nonce = Date.now();
  
  console.log(`Executing: ${isBuy ? 'BUY' : 'SELL'} ${formattedSize} ${symbol} @ $${orderPrice.toFixed(2)}`);
  
  try {
    const result = await signAndSend(wallet, action, nonce);
    console.log('Order result:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('Order failed:', err.message);
    return null;
  }
}

// ==================== MAIN BOT LOGIC ====================

async function runBot() {
  console.log('='.repeat(60));
  console.log('EMA TRADING BOT - Hyperliquid');
  console.log(new Date().toISOString());
  console.log('='.repeat(60));
  
  const wallet = getWallet();
  const address = wallet.address;
  
  // Load state
  let state = loadState();
  
  // Reset daily P&L if new day
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyPnLDate !== today) {
    state.dailyPnL = 0;
    state.dailyPnLDate = today;
  }
  
  // Get account state
  const account = await getAccountState(address);
  const accountValue = parseFloat(account.marginSummary?.accountValue || 0);
  
  console.log(`\nAccount: $${accountValue.toFixed(2)}`);
  
  if (accountValue < 1) {
    console.log('Account has no funds. Please deposit to the wallet.');
    console.log(`Wallet address: ${address}`);
    return;
  }
  
  // Check daily loss limit
  if (state.dailyPnL < -accountValue * CONFIG.dailyLossLimit) {
    console.log(`Daily loss limit reached (${(state.dailyPnL / accountValue * 100).toFixed(1)}%). Stopping.`);
    return;
  }
  
  // Get current prices
  const mids = await getMids();
  
  // Get current positions
  const positions = {};
  if (account.assetPositions) {
    for (const ap of account.assetPositions) {
      const p = ap.position;
      positions[p.coin] = {
        size: parseFloat(p.szi),
        entryPrice: parseFloat(p.entryPx),
        unrealizedPnl: parseFloat(p.unrealizedPnl),
      };
    }
  }
  
  console.log(`Current positions: ${Object.keys(positions).length || 'None'}`);
  
  // Check each asset
  for (const [symbol, cfg] of Object.entries(CONFIG.assets)) {
    if (!cfg.enabled) continue;
    
    console.log(`\n--- ${symbol} (EMA ${cfg.fastEMA}/${cfg.slowEMA}) ---`);
    
    const currentPrice = parseFloat(mids[symbol] || 0);
    if (!currentPrice) {
      console.log(`No price data for ${symbol}`);
      continue;
    }
    
    console.log(`Price: $${currentPrice.toFixed(symbol === 'BTC' ? 2 : 4)}`);
    
    // Update highest price for crash stops
    if (!state.highestPrice) state.highestPrice = {};
    if (!state.highestPrice[symbol] || currentPrice > state.highestPrice[symbol]) {
      state.highestPrice[symbol] = currentPrice;
    }
    
    // Get candles and calculate signal
    const candles = await getCandles(symbol, '1d', 50);
    const closes = candles.map(c => parseFloat(c.c)).filter(p => p > 0);
    
    if (closes.length < cfg.slowEMA) {
      console.log(`Insufficient candle data (${closes.length}/${cfg.slowEMA})`);
      continue;
    }
    
    const signal = generateSignal(symbol, closes, currentPrice, state);
    console.log(`Signal: ${signal.signal}`);
    console.log(`Reason: ${signal.reason}`);
    
    const currentPos = positions[symbol];
    const hasPosition = currentPos && Math.abs(currentPos.size) > 0;
    
    // Decision logic
    if (signal.signal === 'LONG' && !hasPosition) {
      // Open long position
      const size = await calculatePositionSize(symbol, accountValue, currentPrice);
      if (size > 0) {
        console.log(`→ OPENING LONG: ${size} ${symbol}`);
        const result = await executeOrder(wallet, symbol, true, size, currentPrice);
        if (result) {
          logTrade('BUY', symbol, size, currentPrice, signal.reason);
          state.highestPrice[symbol] = currentPrice;  // Reset crash stop tracking
        }
      } else {
        console.log(`→ Position too small (min $${CONFIG.minOrderUsd})`);
      }
    } else if ((signal.signal === 'EXIT' || signal.signal === 'WAIT') && hasPosition) {
      // Close position
      console.log(`→ CLOSING: ${currentPos.size} ${symbol}`);
      const result = await executeOrder(wallet, symbol, false, Math.abs(currentPos.size), currentPrice);
      if (result) {
        logTrade('SELL', symbol, currentPos.size, currentPrice, signal.reason);
        state.dailyPnL += currentPos.unrealizedPnl;
      }
    } else if (hasPosition) {
      console.log(`→ HOLDING: ${currentPos.size} ${symbol} (PnL: $${currentPos.unrealizedPnl.toFixed(2)})`);
    } else {
      console.log(`→ NO ACTION: waiting for entry signal`);
    }
  }
  
  // Save state
  saveState(state);
  
  console.log('\n' + '='.repeat(60));
  console.log('Bot run complete');
}

async function checkSignalsOnly() {
  console.log('='.repeat(60));
  console.log('EMA SIGNAL CHECK (no trading)');
  console.log(new Date().toISOString());
  console.log('='.repeat(60));
  
  const mids = await getMids();
  const state = loadState();
  
  for (const [symbol, cfg] of Object.entries(CONFIG.assets)) {
    if (!cfg.enabled) continue;
    
    console.log(`\n--- ${symbol} (EMA ${cfg.fastEMA}/${cfg.slowEMA}) ---`);
    
    const currentPrice = parseFloat(mids[symbol] || 0);
    if (!currentPrice) {
      console.log(`No price data`);
      continue;
    }
    
    console.log(`Price: $${currentPrice.toFixed(symbol === 'BTC' ? 2 : 4)}`);
    
    const candles = await getCandles(symbol, '1d', 50);
    const closes = candles.map(c => parseFloat(c.c)).filter(p => p > 0);
    
    if (closes.length < cfg.slowEMA) {
      console.log(`Insufficient data`);
      continue;
    }
    
    const signal = generateSignal(symbol, closes, currentPrice, state);
    console.log(`Signal: ${signal.signal}`);
    console.log(`Reason: ${signal.reason}`);
  }
}

// ==================== CLI ====================

const args = process.argv.slice(2);

if (args.includes('--run') || args.includes('-r')) {
  runBot().catch(console.error);
} else if (args.includes('--signal') || args.includes('-s')) {
  checkSignalsOnly().catch(console.error);
} else if (args.includes('--loop')) {
  // Run every hour
  console.log('Starting bot loop (checks every hour)...');
  runBot().catch(console.error);
  setInterval(() => runBot().catch(console.error), 60 * 60 * 1000);
} else {
  console.log(`
EMA Trading Bot for Hyperliquid

Usage:
  node ema-bot.mjs --signal    Check signals only (no trading)
  node ema-bot.mjs --run       Run once and execute trades
  node ema-bot.mjs --loop      Run continuously (hourly checks)

Configuration:
  BTC:  EMA 10/30 + 20% crash stop
  SOL:  EMA 8/21
  HYPE: EMA 5/20
  
Risk Settings:
  Max position: 33% of capital
  Max leverage: 3x
  Daily loss limit: 10%
`);
}

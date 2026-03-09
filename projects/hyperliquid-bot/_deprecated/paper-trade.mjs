#!/usr/bin/env node
/**
 * Paper Trading Bot - EMA Strategy Simulator
 * 
 * Tracks virtual positions and P&L without real money
 * Validates strategy in real-time market conditions
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const HL_API = 'https://api.hyperliquid.xyz';
const STATE_FILE = './paper-state.json';
const TRADE_LOG = './paper-trades.log';

// Configuration (matching real bot) - IMPROVED STRATEGIES
const CONFIG = {
  startingCapital: 45,
  assets: {
    BTC: { fastEMA: 10, slowEMA: 30, crashStop: 0.20, filter: null },
    SOL: { fastEMA: 8, slowEMA: 21, crashStop: null, filter: 'momentum10' },  // +29% improvement
    HYPE: { fastEMA: 5, slowEMA: 20, crashStop: null, filter: 'rsi70' },      // +184% improvement
  },
  maxPositionPct: 0.33,
  leverage: 3,
};

// --- API ---
async function hlPost(type, extra = {}) {
  const res = await fetch(`${HL_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...extra }),
  });
  return res.json();
}

async function getMids() {
  return hlPost('allMids');
}

async function getCandles(symbol, interval = '1d', lookback = 50) {
  const endTime = Date.now();
  const startTime = endTime - (lookback * 24 * 60 * 60 * 1000);
  return hlPost('candleSnapshot', { req: { coin: symbol, interval, startTime, endTime } });
}

// --- EMA ---
function calculateEMA(prices, period) {
  if (!prices || prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// --- RSI ---
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return null;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// --- Momentum ---
function calculateMomentum(prices, period = 10) {
  if (!prices || prices.length < period + 1) return null;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - period];
  return (current - past) / past;
}

// --- State ---
function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return {
    capital: CONFIG.startingCapital,
    positions: {},      // { symbol: { size, entryPrice, direction } }
    highestPrice: {},   // For crash stops
    totalPnL: 0,
    trades: [],
    startDate: new Date().toISOString(),
  };
}

function saveState(state) {
  state.lastUpdate = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function logTrade(action, symbol, size, price, pnl, reason) {
  const entry = `${new Date().toISOString()} | ${action.padEnd(5)} | ${symbol.padEnd(4)} | size: ${size.toFixed(4)} | price: $${price.toFixed(2)} | pnl: $${pnl.toFixed(2)} | ${reason}\n`;
  console.log(entry.trim());
  appendFileSync(TRADE_LOG, entry);
}

// --- Trading Logic ---
async function runPaperTrade() {
  console.log('='.repeat(70));
  console.log('PAPER TRADING BOT - EMA Strategy');
  console.log(new Date().toISOString());
  console.log('='.repeat(70));
  
  let state = loadState();
  const mids = await getMids();
  
  // Calculate current portfolio value
  let portfolioValue = state.capital;
  for (const [symbol, pos] of Object.entries(state.positions)) {
    const currentPrice = parseFloat(mids[symbol] || 0);
    if (currentPrice && pos.size) {
      const unrealizedPnL = (currentPrice - pos.entryPrice) * pos.size * (pos.direction === 'long' ? 1 : -1);
      portfolioValue += unrealizedPnL;
    }
  }
  
  console.log(`\nPortfolio: $${portfolioValue.toFixed(2)} (started: $${CONFIG.startingCapital})`);
  console.log(`Total P&L: $${state.totalPnL.toFixed(2)} (${((portfolioValue / CONFIG.startingCapital - 1) * 100).toFixed(1)}%)`);
  console.log(`Positions: ${Object.keys(state.positions).length}`);
  
  // Check each asset
  for (const [symbol, cfg] of Object.entries(CONFIG.assets)) {
    console.log(`\n--- ${symbol} (EMA ${cfg.fastEMA}/${cfg.slowEMA}) ---`);
    
    const currentPrice = parseFloat(mids[symbol] || 0);
    if (!currentPrice) {
      console.log('No price data');
      continue;
    }
    
    // Update highest price for crash stop
    if (!state.highestPrice[symbol] || currentPrice > state.highestPrice[symbol]) {
      state.highestPrice[symbol] = currentPrice;
    }
    
    // Get candles
    const candles = await getCandles(symbol, '1d', 50);
    const closes = (candles || []).map(c => parseFloat(c.c)).filter(p => p > 0);
    
    if (closes.length < cfg.slowEMA) {
      console.log('Insufficient data');
      continue;
    }
    
    // Calculate EMAs
    const fastEMA = calculateEMA(closes, cfg.fastEMA);
    const slowEMA = calculateEMA(closes, cfg.slowEMA);
    
    let bullish = fastEMA > slowEMA;
    let filterStatus = '';
    
    // Apply filters based on asset configuration
    if (cfg.filter === 'momentum10') {
      const momentum = calculateMomentum(closes, 10);
      const momentumOk = momentum !== null && momentum > 0;
      filterStatus = `| Mom10: ${momentum !== null ? (momentum * 100).toFixed(1) + '%' : 'N/A'} ${momentumOk ? '✓' : '✗'}`;
      if (!momentumOk) bullish = false;  // Don't enter if momentum negative
    } else if (cfg.filter === 'rsi70') {
      const rsi = calculateRSI(closes, 14);
      const rsiOk = rsi !== null && rsi < 70;
      filterStatus = `| RSI: ${rsi !== null ? rsi.toFixed(1) : 'N/A'} ${rsiOk ? '✓' : '✗ (overbought)'}`;
      if (!rsiOk) bullish = false;  // Don't enter if overbought
    }
    
    console.log(`Price: $${currentPrice.toFixed(symbol === 'BTC' ? 2 : 4)}`);
    console.log(`EMA ${cfg.fastEMA}: $${fastEMA.toFixed(2)} | EMA ${cfg.slowEMA}: $${slowEMA.toFixed(2)} ${filterStatus}`);
    console.log(`Signal: ${bullish ? '🟢 LONG' : '🔴 EXIT'}${cfg.filter ? ' (filtered)' : ''}`);
    
    const currentPos = state.positions[symbol];
    const hasPosition = currentPos && currentPos.size > 0;
    
    // Check crash stop
    let crashExit = false;
    if (cfg.crashStop && hasPosition && state.highestPrice[symbol]) {
      const crashLevel = state.highestPrice[symbol] * (1 - cfg.crashStop);
      if (currentPrice < crashLevel) {
        crashExit = true;
        console.log(`⚠️ CRASH STOP triggered at $${crashLevel.toFixed(2)}`);
      }
    }
    
    // Decision
    if (bullish && !hasPosition) {
      // OPEN LONG
      const positionValue = portfolioValue * CONFIG.maxPositionPct * CONFIG.leverage;
      const size = positionValue / currentPrice;
      
      state.positions[symbol] = {
        size,
        entryPrice: currentPrice,
        direction: 'long',
        openedAt: new Date().toISOString(),
      };
      state.highestPrice[symbol] = currentPrice;
      
      logTrade('BUY', symbol, size, currentPrice, 0, `EMA ${cfg.fastEMA} > EMA ${cfg.slowEMA}`);
      console.log(`→ OPENED LONG: ${size.toFixed(4)} ${symbol} @ $${currentPrice.toFixed(2)}`);
      
    } else if ((!bullish || crashExit) && hasPosition) {
      // CLOSE POSITION
      const pnl = (currentPrice - currentPos.entryPrice) * currentPos.size;
      state.totalPnL += pnl;
      state.capital += pnl;
      
      const reason = crashExit ? 'CRASH STOP' : `EMA ${cfg.fastEMA} < EMA ${cfg.slowEMA}`;
      logTrade('SELL', symbol, currentPos.size, currentPrice, pnl, reason);
      console.log(`→ CLOSED: ${currentPos.size.toFixed(4)} ${symbol} @ $${currentPrice.toFixed(2)} | P&L: $${pnl.toFixed(2)}`);
      
      delete state.positions[symbol];
      
    } else if (hasPosition) {
      // HOLDING
      const unrealizedPnL = (currentPrice - currentPos.entryPrice) * currentPos.size;
      console.log(`→ HOLDING: ${currentPos.size.toFixed(4)} ${symbol} | Entry: $${currentPos.entryPrice.toFixed(2)} | P&L: $${unrealizedPnL.toFixed(2)}`);
      
    } else {
      console.log(`→ WAITING for entry signal`);
    }
  }
  
  saveState(state);
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Portfolio Value: $${portfolioValue.toFixed(2)}`);
  console.log(`Realized P&L: $${state.totalPnL.toFixed(2)}`);
  console.log(`Return: ${((portfolioValue / CONFIG.startingCapital - 1) * 100).toFixed(2)}%`);
  
  if (Object.keys(state.positions).length > 0) {
    console.log('\nOpen Positions:');
    for (const [sym, pos] of Object.entries(state.positions)) {
      const price = parseFloat(mids[sym] || 0);
      const pnl = (price - pos.entryPrice) * pos.size;
      console.log(`  ${sym}: ${pos.size.toFixed(4)} @ $${pos.entryPrice.toFixed(2)} → $${price.toFixed(2)} | P&L: $${pnl.toFixed(2)}`);
    }
  }
}

// --- CLI ---
const args = process.argv.slice(2);

if (args.includes('--reset')) {
  if (existsSync(STATE_FILE)) {
    const fs = await import('fs');
    fs.unlinkSync(STATE_FILE);
  }
  console.log('State reset');
} else if (args.includes('--status')) {
  const state = loadState();
  console.log(JSON.stringify(state, null, 2));
} else {
  runPaperTrade().catch(console.error);
}

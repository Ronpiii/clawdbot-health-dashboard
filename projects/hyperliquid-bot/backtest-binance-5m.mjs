#!/usr/bin/env node
/**
 * Backtest: 200 EMA 5-min chart with 5% EMA stoploss
 * Data source: Binance (free, accurate, fast)
 * 
 * Usage: node backtest-binance-5m.mjs [symbol] [days]
 * Example: node backtest-binance-5m.mjs BTC 7
 */

const SYMBOL = (process.argv[2]?.toUpperCase() || 'BTC') + 'USDT';
const DAYS = parseInt(process.argv[3]) || 7;
const EMA_PERIOD = 200;
const STOPLOSS_PCT = 3;

console.log(`\n📊 BACKTEST: ${SYMBOL.replace('USDT', '')} ${DAYS}d | 5m chart | 200 EMA | 5% EMA stoploss\n`);

// Fetch 5-min candles from Binance
async function fetchBinanceCandles(symbol, days) {
  const now = Date.now();
  const startTime = now - (days * 24 * 60 * 60 * 1000);
  
  const allCandles = [];
  let currentTime = startTime;
  const limit = 1000;
  
  console.log(`⏳ Fetching ${days} days of 5-min candles from Binance...`);
  
  while (currentTime < now) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&startTime=${currentTime}&limit=${limit}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) break;
      
      allCandles.push(...data);
      currentTime = data[data.length - 1][0] + 1;
      process.stdout.write('.');
    } catch (err) {
      console.error(`\n❌ Fetch error: ${err.message}`);
      break;
    }
  }
  
  console.log(`\n✓ Fetched ${allCandles.length} candles\n`);
  return allCandles;
}

// Calculate EMA
function calculateEMA(closes, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      ema.push(closes[i]);
    } else {
      ema.push((closes[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
    }
  }
  return ema;
}

// Run backtest
function backtest(candles) {
  if (candles.length < EMA_PERIOD) {
    console.log(`❌ Not enough data (need ${EMA_PERIOD}, got ${candles.length})`);
    return;
  }
  
  // Parse Binance candles: [time, open, high, low, close, volume, ...]
  const times = candles.map(c => parseInt(c[0]));
  const opens = candles.map(c => parseFloat(c[1]));
  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));
  const closes = candles.map(c => parseFloat(c[4]));
  
  const ema = calculateEMA(closes, EMA_PERIOD);
  
  let position = null;
  let trades = [];
  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  let maxDrawdown = 0;
  let peakEquity = 0;
  
  for (let i = EMA_PERIOD; i < closes.length; i++) {
    const close = closes[i];
    const high = highs[i];
    const low = lows[i];
    const emaValue = ema[i];
    const prevClose = closes[i - 1];
    const prevEma = ema[i - 1];
    const time = new Date(times[i]).toISOString().split('T')[0];
    
    peakEquity = Math.max(peakEquity, totalPnL);
    const currentDrawdown = peakEquity - totalPnL;
    maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
    
    // Entry: cross EMA
    if (!position) {
      // LONG: price crosses above EMA
      if (prevClose <= prevEma && close > emaValue) {
        position = {
          type: 'LONG',
          entryPrice: close,
          entryEMA: emaValue,
          entryTime: time,
          entryIdx: i
        };
      }
      // SHORT: price crosses below EMA
      else if (prevClose >= prevEma && close < emaValue) {
        position = {
          type: 'SHORT',
          entryPrice: close,
          entryEMA: emaValue,
          entryTime: time,
          entryIdx: i
        };
      }
    }
    // Exit: 5% away from EMA
    else {
      const stoplossDistance = emaValue * (STOPLOSS_PCT / 100);
      const upperBound = emaValue + stoplossDistance;
      const lowerBound = emaValue - stoplossDistance;
      
      let shouldExit = false;
      let exitPrice = null;
      let exitReason = '';
      
      if (position.type === 'LONG') {
        if (low < lowerBound) {
          shouldExit = true;
          exitPrice = lowerBound;
          exitReason = `SL: ${STOPLOSS_PCT}% below EMA`;
        }
      } else if (position.type === 'SHORT') {
        if (high > upperBound) {
          shouldExit = true;
          exitPrice = upperBound;
          exitReason = `SL: ${STOPLOSS_PCT}% above EMA`;
        }
      }
      
      if (shouldExit && exitPrice) {
        const pnlPct = position.type === 'LONG'
          ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
        
        const pnlDollars = pnlPct;
        totalPnL += pnlDollars;
        
        if (pnlPct > 0) wins++;
        else losses++;
        
        trades.push({
          type: position.type,
          entry: position.entryPrice.toFixed(2),
          exit: exitPrice.toFixed(2),
          pnlPct: pnlPct.toFixed(3),
          bars: i - position.entryIdx,
          time
        });
        
        position = null;
      }
    }
  }
  
  // Close any open position at last price
  if (position) {
    const exitPrice = closes[closes.length - 1];
    const pnlPct = position.type === 'LONG'
      ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
    
    totalPnL += pnlPct;
    if (pnlPct > 0) wins++;
    else losses++;
    
    trades.push({
      type: position.type,
      entry: position.entryPrice.toFixed(2),
      exit: exitPrice.toFixed(2),
      pnlPct: pnlPct.toFixed(3),
      bars: closes.length - position.entryIdx,
      time: new Date(times[times.length - 1]).toISOString().split('T')[0]
    });
  }
  
  const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : 0;
  
  console.log(`═══════════════════════════════════════`);
  console.log(`BACKTEST RESULTS`);
  console.log(`═══════════════════════════════════════\n`);
  
  console.log(`Period: ${DAYS} days | Candles: ${closes.length}`);
  console.log(`Strategy: 200 EMA 5-min | Stoploss: ${STOPLOSS_PCT}% from EMA\n`);
  
  console.log(`📊 TRADES: ${trades.length}`);
  console.log(`✅ Wins: ${wins}`);
  console.log(`❌ Losses: ${losses}`);
  console.log(`📈 Win Rate: ${winRate}%`);
  console.log(`\n💰 PERFORMANCE:`);
  console.log(`Total P&L: ${totalPnL.toFixed(2)}% (${totalPnL > 0 ? '✅' : '❌'})`);
  console.log(`Avg P&L per trade: ${(totalPnL / trades.length).toFixed(3)}%`);
  console.log(`Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`\n`);
  
  // Show all trades
  console.log(`All trades:\n`);
  console.log(`# | Type  | Entry    | Exit     | P&L %    | Bars | Date`);
  console.log(`──────────────────────────────────────────────────────────`);
  
  trades.forEach((t, i) => {
    const emoji = parseFloat(t.pnlPct) > 0 ? '✅' : '❌';
    console.log(`${String(i+1).padEnd(2)}| ${t.type.padEnd(5)}| $${t.entry.padEnd(7)}| $${t.exit.padEnd(7)}| ${emoji} ${t.pnlPct.padEnd(7)}| ${String(t.bars).padEnd(4)}| ${t.time}`);
  });
  
  console.log(`\n═══════════════════════════════════════\n`);
  
  // Summary
  console.log(`Summary:`);
  console.log(`- Win rate of ${winRate}% means ${wins > losses ? 'MORE wins than losses ✅' : losses > wins ? 'MORE losses than wins ❌' : 'even'}`);
  console.log(`- ${totalPnL > 0 ? `+${totalPnL.toFixed(2)}% total profit (profitable!)` : `${totalPnL.toFixed(2)}% total loss (needs work)`}`);
  console.log(`- Max drawdown: ${maxDrawdown.toFixed(2)}% (largest unrealized loss during backtest)`);
  console.log(`\nRecommendation: ${totalPnL > 0 && winRate > 50 ? '✅ VIABLE - Consider live testing' : '❌ NEEDS REFINEMENT - Adjust parameters or signals'}\n`);
}

// Main
(async () => {
  try {
    const candles = await fetchBinanceCandles(SYMBOL, DAYS);
    backtest(candles);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
})();

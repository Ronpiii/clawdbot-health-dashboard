#!/usr/bin/env node
/**
 * 200 EMA crossover + variable stoploss
 * Test: 1%, 2%, 3%, 4%, 5%, 7%, 10%
 */

const SYMBOL = (process.argv[2]?.toUpperCase() || 'BTC') + 'USDT';
const DAYS = parseInt(process.argv[3]) || 30;

console.log(`\n📊 ${SYMBOL.replace('USDT', '')} ${DAYS}d | 200 EMA + stoploss sweep\n`);

async function fetchCandles(symbol, days) {
  const now = Date.now();
  const start = now - (days * 24 * 60 * 60 * 1000);
  const candles = [];
  let time = start;
  
  console.log(`Fetching...`);
  while (time < now) {
    try {
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&startTime=${time}&limit=1000`);
      const data = await res.json();
      if (!data.length) break;
      candles.push(...data);
      time = data[data.length - 1][0] + 1;
      process.stdout.write('.');
    } catch (e) { break; }
  }
  console.log(` ✓ ${candles.length}\n`);
  return candles;
}

function ema(closes, period) {
  const result = [];
  const mult = 2 / (period + 1);
  for (let i = 0; i < closes.length; i++) {
    result.push(i === 0 ? closes[i] : closes[i] * mult + result[i - 1] * (1 - mult));
  }
  return result;
}

function backtest(candles, slPct) {
  const closes = candles.map(c => parseFloat(c[4]));
  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));
  const emaVals = ema(closes, 200);
  
  let position = null;
  let trades = [];
  let pnlTotal = 0;
  let maxDD = 0;
  let peakEquity = 0;
  
  for (let i = 200; i < closes.length; i++) {
    const close = closes[i];
    const high = highs[i];
    const low = lows[i];
    const emaVal = emaVals[i];
    const prevClose = closes[i - 1];
    const prevEma = emaVals[i - 1];
    
    // Entry
    if (!position) {
      if (prevClose <= prevEma && close > emaVal) {
        position = { type: 'LONG', entry: close, emaEntry: emaVal, bar: i };
      } else if (prevClose >= prevEma && close < emaVal) {
        position = { type: 'SHORT', entry: close, emaEntry: emaVal, bar: i };
      }
    }
    // Exit: stoploss OR reverse crossover
    else {
      const sl = position.emaEntry * (slPct / 100);
      const upperSL = position.emaEntry + sl;
      const lowerSL = position.emaEntry - sl;
      
      let exit = null;
      let reason = '';
      
      // Stoploss hit
      if (position.type === 'LONG' && low < lowerSL) {
        exit = lowerSL;
        reason = 'SL';
      } else if (position.type === 'SHORT' && high > upperSL) {
        exit = upperSL;
        reason = 'SL';
      }
      // Reverse crossover
      else if (position.type === 'LONG' && prevClose >= prevEma && close < emaVal) {
        exit = close;
        reason = 'XO';
      } else if (position.type === 'SHORT' && prevClose <= prevEma && close > emaVal) {
        exit = close;
        reason = 'XO';
      }
      
      if (exit) {
        const pnl = position.type === 'LONG'
          ? ((exit - position.entry) / position.entry) * 100
          : ((position.entry - exit) / position.entry) * 100;
        
        peakEquity = Math.max(peakEquity, pnlTotal);
        maxDD = Math.max(maxDD, peakEquity - (pnlTotal + pnl));
        pnlTotal += pnl;
        
        trades.push({ pnl, reason });
        position = null;
      }
    }
  }
  
  // Close open position
  if (position) {
    const exit = closes[closes.length - 1];
    const pnl = position.type === 'LONG'
      ? ((exit - position.entry) / position.entry) * 100
      : ((position.entry - exit) / position.entry) * 100;
    pnlTotal += pnl;
    trades.push({ pnl, reason: 'CLOSE' });
  }
  
  const wins = trades.filter(t => t.pnl > 0).length;
  const wr = trades.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  return {
    trades: trades.length,
    wins,
    wr,
    pnl: pnlTotal.toFixed(2),
    avgPnl: trades.length ? (pnlTotal / trades.length).toFixed(3) : 0,
    maxDD: maxDD.toFixed(2)
  };
}

(async () => {
  const candles = await fetchCandles(SYMBOL, DAYS);
  
  const stoplosses = [1, 2, 3, 4, 5, 7, 10];
  
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`200 EMA Crossover + Stoploss Sweep (${DAYS}d)`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  console.log(`SL%  | Trades | Wins | WR%   | Total P&L | Avg P&L | Max DD`);
  console.log(`─────┼────────┼──────┼───────┼───────────┼─────────┼────────`);
  
  stoplosses.forEach(sl => {
    const result = backtest(candles, sl);
    const emoji = result.pnl > 0 ? '✅' : '❌';
    console.log(`${String(sl).padEnd(4)}| ${String(result.trades).padEnd(6)}| ${String(result.wins).padEnd(5)}| ${String(result.wr).padEnd(5)}% | ${emoji} ${result.pnl.padEnd(8)}% | ${result.avgPnl.padEnd(6)}% | ${result.maxDD}%`);
  });
  
  console.log(`\n═══════════════════════════════════════════════════════════\n`);
})();

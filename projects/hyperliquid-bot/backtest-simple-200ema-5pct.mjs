#!/usr/bin/env node
/**
 * SIMPLE: 200 EMA 5m + 5% stoploss
 * Entry: price crosses EMA
 * Exit: price 5% away from current EMA
 */

const SYMBOL = (process.argv[2]?.toUpperCase() || 'BTC') + 'USDT';
const DAYS = parseInt(process.argv[3]) || 30;

console.log(`\n📊 ${SYMBOL.replace('USDT', '')} ${DAYS}d | 5m chart | 200 EMA | 5% stoploss\n`);

async function fetchCandles(symbol, days) {
  const now = Date.now();
  const start = now - (days * 24 * 60 * 60 * 1000);
  const candles = [];
  let time = start;
  
  console.log(`Fetching ${days}d of 5m data...`);
  
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

function backtest(candles) {
  const closes = candles.map(c => parseFloat(c[4]));
  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));
  const emaVals = ema(closes, 200);
  
  let position = null;
  let trades = [];
  let pnlTotal = 0;
  
  for (let i = 200; i < closes.length; i++) {
    const close = closes[i];
    const high = highs[i];
    const low = lows[i];
    const emaVal = emaVals[i];
    const prevClose = closes[i - 1];
    const prevEma = emaVals[i - 1];
    
    // Entry: cross EMA
    if (!position) {
      if (prevClose <= prevEma && close > emaVal) {
        position = { type: 'LONG', entry: close, emaEntry: emaVal, bar: i };
      } else if (prevClose >= prevEma && close < emaVal) {
        position = { type: 'SHORT', entry: close, emaEntry: emaVal, bar: i };
      }
    }
    
    // Exit: 5% from EMA
    if (position) {
      const sl = emaVal * 0.05;
      const upper = emaVal + sl;
      const lower = emaVal - sl;
      
      let exit = null;
      if (position.type === 'LONG' && low < lower) {
        exit = lower;
      } else if (position.type === 'SHORT' && high > upper) {
        exit = upper;
      }
      
      if (exit) {
        const pnl = position.type === 'LONG'
          ? ((exit - position.entry) / position.entry) * 100
          : ((position.entry - exit) / position.entry) * 100;
        
        pnlTotal += pnl;
        trades.push({
          type: position.type,
          entry: position.entry.toFixed(2),
          exit: exit.toFixed(2),
          pnl: pnl.toFixed(3),
          bars: i - position.bar
        });
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
    trades.push({
      type: position.type,
      entry: position.entry.toFixed(2),
      exit: exit.toFixed(2),
      pnl: pnl.toFixed(3),
      bars: closes.length - position.bar
    });
  }
  
  const wins = trades.filter(t => parseFloat(t.pnl) > 0).length;
  const losses = trades.filter(t => parseFloat(t.pnl) < 0).length;
  const wr = trades.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  console.log(`═══════════════════════════════════`);
  console.log(`200 EMA | 5% Stoploss | ${DAYS}d`);
  console.log(`═══════════════════════════════════\n`);
  
  console.log(`Trades: ${trades.length}`);
  console.log(`Wins: ${wins} | Losses: ${losses} | Win Rate: ${wr}%`);
  console.log(`Total P&L: ${pnlTotal.toFixed(2)}%`);
  if (trades.length > 0) {
    console.log(`Avg P&L: ${(pnlTotal / trades.length).toFixed(3)}%\n`);
  }
  
  console.log(`# | Type  | Entry    | Exit     | P&L %  | Bars`);
  console.log(`─────────────────────────────────────────────`);
  trades.forEach((t, i) => {
    const e = parseFloat(t.pnl) > 0 ? '✅' : '❌';
    console.log(`${i+1} | ${t.type.padEnd(5)}| $${t.entry.padEnd(7)}| $${t.exit.padEnd(7)}| ${e} ${t.pnl.padEnd(5)}| ${t.bars}`);
  });
  
  console.log(`\n═══════════════════════════════════\n`);
}

(async () => {
  const candles = await fetchCandles(SYMBOL, DAYS);
  backtest(candles);
})();

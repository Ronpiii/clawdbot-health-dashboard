#!/usr/bin/env node
/**
 * Pure 200 EMA 5m crossover strategy
 * Entry: price crosses EMA
 * Exit: price crosses back (reverse signal)
 * NO stoploss, just ride the trend
 */

const SYMBOL = (process.argv[2]?.toUpperCase() || 'BTC') + 'USDT';
const DAYS = parseInt(process.argv[3]) || 30;

console.log(`\n📊 ${SYMBOL.replace('USDT', '')} ${DAYS}d | 5m | 200 EMA crossover (no SL)\n`);

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

function backtest(candles) {
  const closes = candles.map(c => parseFloat(c[4]));
  const times = candles.map(c => new Date(parseInt(c[0])).toISOString().split('T')[0]);
  const emaVals = ema(closes, 200);
  
  let position = null;
  let trades = [];
  let pnlTotal = 0;
  let maxDD = 0;
  let peakEquity = 0;
  
  for (let i = 200; i < closes.length; i++) {
    const close = closes[i];
    const emaVal = emaVals[i];
    const prevClose = closes[i - 1];
    const prevEma = emaVals[i - 1];
    
    // Entry
    if (!position) {
      if (prevClose <= prevEma && close > emaVal) {
        position = { type: 'LONG', entry: close, bar: i, time: times[i] };
      } else if (prevClose >= prevEma && close < emaVal) {
        position = { type: 'SHORT', entry: close, bar: i, time: times[i] };
      }
    }
    // Exit: reverse crossover
    else {
      let exit = null;
      if (position.type === 'LONG' && prevClose >= prevEma && close < emaVal) {
        exit = close;
      } else if (position.type === 'SHORT' && prevClose <= prevEma && close > emaVal) {
        exit = close;
      }
      
      if (exit) {
        const pnl = position.type === 'LONG'
          ? ((exit - position.entry) / position.entry) * 100
          : ((position.entry - exit) / position.entry) * 100;
        
        peakEquity = Math.max(peakEquity, pnlTotal);
        maxDD = Math.max(maxDD, peakEquity - (pnlTotal + pnl));
        pnlTotal += pnl;
        
        trades.push({
          type: position.type,
          entry: position.entry.toFixed(2),
          exit: exit.toFixed(2),
          pnl: pnl.toFixed(3),
          bars: i - position.bar,
          entryTime: position.time,
          exitTime: times[i]
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
      bars: closes.length - position.bar,
      entryTime: position.time,
      exitTime: times[times.length - 1]
    });
  }
  
  const wins = trades.filter(t => parseFloat(t.pnl) > 0).length;
  const losses = trades.filter(t => parseFloat(t.pnl) < 0).length;
  const wr = trades.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  console.log(`═══════════════════════════════════════`);
  console.log(`200 EMA Crossover | No Stoploss | ${DAYS}d`);
  console.log(`═══════════════════════════════════════\n`);
  
  console.log(`Trades: ${trades.length}`);
  console.log(`Wins: ${wins} | Losses: ${losses} | Win Rate: ${wr}%`);
  console.log(`Total P&L: ${pnlTotal.toFixed(2)}%`);
  if (trades.length > 0) {
    console.log(`Avg P&L: ${(pnlTotal / trades.length).toFixed(3)}%`);
    console.log(`Max Drawdown: ${maxDD.toFixed(2)}%\n`);
  }
  
  console.log(`# | Type  | Entry    | Exit     | P&L %   | Bars | Entry Date | Exit Date`);
  console.log(`──────────────────────────────────────────────────────────────────────`);
  trades.forEach((t, i) => {
    const e = parseFloat(t.pnl) > 0 ? '✅' : '❌';
    console.log(`${i+1} | ${t.type.padEnd(5)}| $${t.entry.padEnd(7)}| $${t.exit.padEnd(7)}| ${e} ${t.pnl.padEnd(6)}| ${String(t.bars).padEnd(4)}| ${t.entryTime} | ${t.exitTime}`);
  });
  
  console.log(`\n═══════════════════════════════════════\n`);
  
  if (trades.length === 0) {
    console.log(`No trades. EMA stayed flat or was too slow.\n`);
  } else if (pnlTotal > 0 && wr > 50) {
    console.log(`✅ PROFITABLE: Win rate ${wr}%, total +${pnlTotal.toFixed(2)}%\n`);
  } else if (pnlTotal > 0) {
    console.log(`⚠️  MARGINAL: Profitable but low win rate\n`);
  } else {
    console.log(`❌ LOSING: Total ${pnlTotal.toFixed(2)}%\n`);
  }
}

(async () => {
  const candles = await fetchCandles(SYMBOL, DAYS);
  backtest(candles);
})();

#!/usr/bin/env node
/**
 * 200 EMA + 0.01% slope + 2% profit take
 * Test on SOL
 */

const SYMBOL = 'SOLUSDT';
const DAYS = 30;

async function fetchCandles(symbol, days) {
  const now = Date.now();
  const start = now - (days * 24 * 60 * 60 * 1000);
  const candles = [];
  let time = start;
  
  console.log(`Fetching ${symbol} ${days}d...`);
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

function getSlope(emaVals, i) {
  if (i < 10) return 0;
  return ((emaVals[i] - emaVals[i - 10]) / emaVals[i - 10]) * 100;
}

function backtest(candles) {
  const closes = candles.map(c => parseFloat(c[4]));
  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));
  const times = candles.map(c => new Date(parseInt(c[0])).toISOString().split('T')[0]);
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
    const slope = getSlope(emaVals, i);
    
    if (!position) {
      const hasSlope = Math.abs(slope) > 0.01;
      if (prevClose <= prevEma && close > emaVal && hasSlope) {
        position = { type: 'LONG', entry: close, emaEntry: emaVal, bar: i, time: times[i], slope: slope.toFixed(3) };
      } else if (prevClose >= prevEma && close < emaVal && hasSlope) {
        position = { type: 'SHORT', entry: close, emaEntry: emaVal, bar: i, time: times[i], slope: slope.toFixed(3) };
      }
    } else {
      const pnlPct = position.type === 'LONG'
        ? ((close - position.entry) / position.entry) * 100
        : ((position.entry - close) / position.entry) * 100;
      
      let exit = null;
      let reason = '';
      
      // Profit target
      if (pnlPct >= 2) {
        exit = close;
        reason = '+2%';
      }
      // Stoploss
      else if (pnlPct < -5) {
        exit = position.type === 'LONG' ? position.entry * 0.95 : position.entry * 1.05;
        reason = '-5%';
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
          entry: position.entry.toFixed(3),
          exit: exit.toFixed(3),
          pnl: pnl.toFixed(3),
          bars: i - position.bar,
          time: position.time,
          slope: position.slope,
          reason
        });
        position = null;
      }
    }
  }
  
  // Close open
  if (position) {
    const exit = closes[closes.length - 1];
    const pnl = position.type === 'LONG'
      ? ((exit - position.entry) / position.entry) * 100
      : ((position.entry - exit) / position.entry) * 100;
    pnlTotal += pnl;
    trades.push({
      type: position.type,
      entry: position.entry.toFixed(3),
      exit: exit.toFixed(3),
      pnl: pnl.toFixed(3),
      bars: closes.length - position.bar,
      time: position.time,
      slope: position.slope,
      reason: 'CLOSE'
    });
  }
  
  const wins = trades.filter(t => parseFloat(t.pnl) > 0).length;
  const losses = trades.filter(t => parseFloat(t.pnl) < 0).length;
  const wr = trades.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`SOL 30d | 200 EMA + 0.01% slope + 2% profit take`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  
  console.log(`Trades: ${trades.length}`);
  console.log(`Wins: ${wins} | Losses: ${losses} | Win Rate: ${wr}%`);
  console.log(`Total P&L: ${pnlTotal.toFixed(2)}%`);
  if (trades.length > 0) {
    console.log(`Avg P&L: ${(pnlTotal / trades.length).toFixed(3)}%`);
    console.log(`Max Drawdown: ${maxDD.toFixed(2)}%\n`);
  }
  
  console.log(`# | Type  | Entry   | Exit    | P&L %  | Slope% | Reason | Bars`);
  console.log(`───────────────────────────────────────────────────────────────────`);
  trades.forEach((t, i) => {
    const e = parseFloat(t.pnl) > 0 ? '✅' : '❌';
    console.log(`${i+1} | ${t.type.padEnd(5)}| $${t.entry.padEnd(6)}| $${t.exit.padEnd(6)}| ${e} ${t.pnl.padEnd(5)}| ${t.slope.padEnd(5)}| ${t.reason.padEnd(5)}| ${t.bars}`);
  });
  
  console.log(`\n═══════════════════════════════════════════════════════════\n`);
  
  if (pnlTotal > 0 && wr > 50) {
    console.log(`✅ STRONG: ${wr}% win rate, +${pnlTotal.toFixed(2)}%\n`);
  } else if (pnlTotal > 0) {
    console.log(`⚠️  MARGINAL: Low win rate but profitable\n`);
  } else {
    console.log(`❌ LOSING: ${pnlTotal.toFixed(2)}%\n`);
  }
}

(async () => {
  const candles = await fetchCandles(SYMBOL, DAYS);
  backtest(candles);
})();

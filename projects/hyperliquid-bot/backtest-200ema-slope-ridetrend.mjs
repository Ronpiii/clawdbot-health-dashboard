#!/usr/bin/env node
/**
 * 200 EMA crossover + strong slope filter
 * Entry: crossover + EMA slope is strong
 * Exit: 5% stoploss only (let winners run)
 */

const SYMBOL = (process.argv[2]?.toUpperCase() || 'BTC') + 'USDT';
const DAYS = parseInt(process.argv[3]) || 30;
const SL_PCT = 5;

console.log(`\n📊 ${SYMBOL.replace('USDT', '')} ${DAYS}d | 200 EMA slope filter + ride trend (${SL_PCT}% SL)\n`);

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

function getEmaSlope(emaVals, barIndex, lookback = 10) {
  if (barIndex < lookback) return 0;
  const recent = emaVals[barIndex];
  const past = emaVals[barIndex - lookback];
  return ((recent - past) / past) * 100;
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
  let rejectedEntries = 0;
  
  for (let i = 200; i < closes.length; i++) {
    const close = closes[i];
    const high = highs[i];
    const low = lows[i];
    const emaVal = emaVals[i];
    const prevClose = closes[i - 1];
    const prevEma = emaVals[i - 1];
    const slope = getEmaSlope(emaVals, i);
    
    // Entry: crossover + strong slope
    if (!position) {
      const hasSlope = Math.abs(slope) > 0.1;
      
      if (prevClose <= prevEma && close > emaVal && hasSlope) {
        position = { 
          type: 'LONG', 
          entry: close, 
          emaEntry: emaVal, 
          bar: i, 
          time: times[i],
          slope: slope.toFixed(2),
          maxProfit: 0
        };
      } else if (prevClose >= prevEma && close < emaVal && hasSlope) {
        position = { 
          type: 'SHORT', 
          entry: close, 
          emaEntry: emaVal, 
          bar: i, 
          time: times[i],
          slope: slope.toFixed(2),
          maxProfit: 0
        };
      } else if ((prevClose <= prevEma && close > emaVal) || (prevClose >= prevEma && close < emaVal)) {
        rejectedEntries++;
      }
    }
    // Exit: stoploss only
    else {
      const pnlPct = position.type === 'LONG'
        ? ((close - position.entry) / position.entry) * 100
        : ((position.entry - close) / position.entry) * 100;
      
      position.maxProfit = Math.max(position.maxProfit, pnlPct);
      
      const sl = position.emaEntry * (SL_PCT / 100);
      const upperSL = position.emaEntry + sl;
      const lowerSL = position.emaEntry - sl;
      
      let exit = null;
      
      if (position.type === 'LONG' && low < lowerSL) {
        exit = lowerSL;
      } else if (position.type === 'SHORT' && high > upperSL) {
        exit = upperSL;
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
          maxProfit: position.maxProfit.toFixed(3),
          bars: i - position.bar,
          entryTime: position.time,
          exitTime: times[i],
          slope: position.slope
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
      maxProfit: position.maxProfit.toFixed(3),
      bars: closes.length - position.bar,
      entryTime: position.time,
      exitTime: times[times.length - 1],
      slope: position.slope
    });
  }
  
  const wins = trades.filter(t => parseFloat(t.pnl) > 0).length;
  const losses = trades.filter(t => parseFloat(t.pnl) < 0).length;
  const wr = trades.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`200 EMA | Slope Filter + Ride Trend (${SL_PCT}% SL)`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  
  console.log(`Trades: ${trades.length} (rejected flat: ${rejectedEntries})`);
  console.log(`Wins: ${wins} | Losses: ${losses} | Win Rate: ${wr}%`);
  console.log(`Total P&L: ${pnlTotal.toFixed(2)}%`);
  if (trades.length > 0) {
    console.log(`Avg P&L: ${(pnlTotal / trades.length).toFixed(3)}%`);
    console.log(`Max Drawdown: ${maxDD.toFixed(2)}%\n`);
  }
  
  console.log(`# | Type  | Entry    | Exit     | P&L %  | Max% | Slope% | Bars`);
  console.log(`──────────────────────────────────────────────────────────────────`);
  trades.forEach((t, i) => {
    const e = parseFloat(t.pnl) > 0 ? '✅' : '❌';
    console.log(`${i+1} | ${t.type.padEnd(5)}| $${t.entry.padEnd(7)}| $${t.exit.padEnd(7)}| ${e} ${t.pnl.padEnd(5)}| ${t.maxProfit.padEnd(4)}| ${t.slope.padEnd(5)}| ${t.bars}`);
  });
  
  console.log(`\n═══════════════════════════════════════════════════════════\n`);
  
  if (trades.length === 0) {
    console.log(`No trades.\n`);
  } else if (pnlTotal > 0 && wr > 50) {
    console.log(`✅ STRONG: ${wr}% win rate, +${pnlTotal.toFixed(2)}%\n`);
  } else if (pnlTotal > 0) {
    console.log(`⚠️  GOOD: Low win rate but profitable\n`);
  } else {
    console.log(`❌ LOSING: ${pnlTotal.toFixed(2)}%\n`);
  }
}

(async () => {
  const candles = await fetchCandles(SYMBOL, DAYS);
  backtest(candles);
})();

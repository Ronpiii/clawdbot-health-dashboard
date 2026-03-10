#!/usr/bin/env node
/**
 * 200 EMA slope filter
 * Entry: crossover + strong slope
 * Exit strategy: 
 *   - Take 2% profit (sell half)
 *   - Trail remaining 50% with 3% below peak
 */

const SYMBOL = (process.argv[2]?.toUpperCase() || 'BTC') + 'USDT';
const DAYS = parseInt(process.argv[3]) || 30;

console.log(`\n📊 ${SYMBOL.replace('USDT', '')} ${DAYS}d | 200 EMA slope + 2% take profit + 3% trailing\n`);

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
  
  for (let i = 200; i < closes.length; i++) {
    const close = closes[i];
    const high = highs[i];
    const low = lows[i];
    const emaVal = emaVals[i];
    const prevClose = closes[i - 1];
    const prevEma = emaVals[i - 1];
    const slope = getEmaSlope(emaVals, i);
    
    // Entry
    if (!position) {
      const hasSlope = Math.abs(slope) > 0.1;
      
      if (prevClose <= prevEma && close > emaVal && hasSlope) {
        position = { 
          type: 'LONG', 
          entry: close, 
          bar: i, 
          time: times[i],
          slope: slope.toFixed(2),
          partialTaken: false,
          peakPrice: close,
          partialExit: null
        };
      } else if (prevClose >= prevEma && close < emaVal && hasSlope) {
        position = { 
          type: 'SHORT', 
          entry: close, 
          bar: i, 
          time: times[i],
          slope: slope.toFixed(2),
          partialTaken: false,
          peakPrice: close,
          partialExit: null
        };
      }
    }
    // Exit logic
    else {
      const pnlPct = position.type === 'LONG'
        ? ((close - position.entry) / position.entry) * 100
        : ((position.entry - close) / position.entry) * 100;
      
      // Update peak for trailing
      if (position.type === 'LONG' && close > position.peakPrice) {
        position.peakPrice = close;
      } else if (position.type === 'SHORT' && close < position.peakPrice) {
        position.peakPrice = close;
      }
      
      let exit = null;
      let reason = '';
      let finalPnl = null;
      
      // Phase 1: Take 2% profit (sell half)
      if (!position.partialTaken && pnlPct >= 2) {
        position.partialTaken = true;
        position.partialExit = close;
        position.partialPnl = pnlPct;
        reason = 'PARTIAL';
        // Continue to phase 2 (don't exit yet, trail the rest)
      }
      
      // Phase 2: Trailing stop on remaining half (3% below peak)
      if (position.partialTaken) {
        const trailDist = position.type === 'LONG'
          ? position.peakPrice * 0.05
          : position.peakPrice * 0.05;
        
        const trailStop = position.type === 'LONG'
          ? position.peakPrice - trailDist
          : position.peakPrice + trailDist;
        
        if ((position.type === 'LONG' && low < trailStop) || 
            (position.type === 'SHORT' && high > trailStop)) {
          exit = position.type === 'LONG' ? trailStop : trailStop;
          reason = 'TRAIL';
          // Combined P&L: 2% from first half + whatever on second half
          const secondHalfPnl = position.type === 'LONG'
            ? ((exit - position.partialExit) / position.partialExit) * 100
            : ((position.partialExit - exit) / position.partialExit) * 100;
          finalPnl = (position.partialPnl + secondHalfPnl) / 2; // average of both halves
        }
      }
      // Fallback: if holding with no partial yet, just apply tight stop
      else if (pnlPct < -3) {
        exit = position.type === 'LONG'
          ? position.entry * 0.97
          : position.entry * 1.03;
        reason = 'SL';
        finalPnl = -3;
      }
      
      if (exit && !reason.includes('PARTIAL')) {
        peakEquity = Math.max(peakEquity, pnlTotal);
        maxDD = Math.max(maxDD, peakEquity - (pnlTotal + (finalPnl || pnlPct)));
        const recordPnl = finalPnl || pnlPct;
        pnlTotal += recordPnl;
        
        trades.push({
          type: position.type,
          entry: position.entry.toFixed(2),
          partial: position.partialExit ? position.partialExit.toFixed(2) : '-',
          exit: exit.toFixed(2),
          pnl: recordPnl.toFixed(3),
          peak: position.peakPrice.toFixed(2),
          bars: i - position.bar,
          time: position.time,
          slope: position.slope,
          reason
        });
        position = null;
      }
    }
  }
  
  // Close open position
  if (position) {
    const exit = closes[closes.length - 1];
    let recordPnl;
    if (position.partialTaken) {
      const secondHalfPnl = position.type === 'LONG'
        ? ((exit - position.partialExit) / position.partialExit) * 100
        : ((position.partialExit - exit) / position.partialExit) * 100;
      recordPnl = (position.partialPnl + secondHalfPnl) / 2;
    } else {
      recordPnl = position.type === 'LONG'
        ? ((exit - position.entry) / position.entry) * 100
        : ((position.entry - exit) / position.entry) * 100;
    }
    pnlTotal += recordPnl;
    trades.push({
      type: position.type,
      entry: position.entry.toFixed(2),
      partial: position.partialExit ? position.partialExit.toFixed(2) : '-',
      exit: exit.toFixed(2),
      pnl: recordPnl.toFixed(3),
      peak: position.peakPrice.toFixed(2),
      bars: closes.length - position.bar,
      time: position.time,
      slope: position.slope,
      reason: 'CLOSE'
    });
  }
  
  const wins = trades.filter(t => parseFloat(t.pnl) > 0).length;
  const losses = trades.filter(t => parseFloat(t.pnl) < 0).length;
  const wr = trades.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`200 EMA | Slope Filter | 2% Take Profit + 5% Trailing`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  console.log(`Trades: ${trades.length}`);
  console.log(`Wins: ${wins} | Losses: ${losses} | Win Rate: ${wr}%`);
  console.log(`Total P&L: ${pnlTotal.toFixed(2)}%`);
  if (trades.length > 0) {
    console.log(`Avg P&L: ${(pnlTotal / trades.length).toFixed(3)}%`);
    console.log(`Max Drawdown: ${maxDD.toFixed(2)}%\n`);
  }
  
  console.log(`# | Type  | Entry    | Partial  | Exit     | P&L %  | Peak    | Reason | Bars`);
  console.log(`───────────────────────────────────────────────────────────────────────────────`);
  trades.forEach((t, i) => {
    const e = parseFloat(t.pnl) > 0 ? '✅' : '❌';
    console.log(`${i+1} | ${t.type.padEnd(5)}| $${t.entry.padEnd(7)}| $${t.partial.padEnd(7)}| $${t.exit.padEnd(7)}| ${e} ${t.pnl.padEnd(5)}| $${t.peak.padEnd(6)}| ${t.reason.padEnd(6)}| ${t.bars}`);
  });
  
  console.log(`\n═══════════════════════════════════════════════════════════════\n`);
  
  if (pnlTotal > 0 && wr > 50) {
    console.log(`✅ STRONG: ${wr}% win rate, +${pnlTotal.toFixed(2)}%\n`);
  } else if (pnlTotal > 0) {
    console.log(`⚠️  GOOD: Profitable\n`);
  } else {
    console.log(`❌ LOSING\n`);
  }
}

(async () => {
  const candles = await fetchCandles(SYMBOL, DAYS);
  backtest(candles);
})();

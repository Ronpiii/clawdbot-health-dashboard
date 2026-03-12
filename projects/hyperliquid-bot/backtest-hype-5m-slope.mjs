#!/usr/bin/env node
/**
 * HYPE 5m Slope Bot Backtest
 * Strategy: 200 EMA + 0.01% slope + 5% profit / 2% stoploss
 * Data: Hyperliquid API (last 30 days)
 */

const HL_API = 'https://api.hyperliquid.xyz';
const SYMBOL = 'HYPE';
const LOOKBACK_DAYS = 30;

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function getCandles(symbol, days = 30) {
  const endTime = Date.now();
  const startTime = endTime - (days * 24 * 60 * 60 * 1000);
  
  console.log(`Fetching ${symbol} ${days}d 5m candles from Hyperliquid...`);
  
  const data = await hlPost('/info', {
    type: 'candleSnapshot',
    req: { coin: symbol, interval: '5m', startTime, endTime },
  });
  
  console.log(`✓ ${data.length} candles\n`);
  return data || [];
}

function calculateEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const emaArray = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      const slice = closes.slice(0, i + 1);
      ema = slice.reduce((a, b) => a + b, 0) / slice.length;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    emaArray.push(ema);
  }
  return emaArray;
}

function getSlope(emaVals, index) {
  // 5-candle slope (25 minutes)
  if (index < 5) return 0;
  return ((emaVals[index] - emaVals[index - 5]) / emaVals[index - 5]) * 100;
}

function backtest(candles) {
  if (!candles.length) {
    console.log('❌ No candle data returned');
    return;
  }
  
  const closes = candles.map(c => parseFloat(c.c));
  const times = candles.map(c => new Date(c.t).toISOString().substr(0, 10));
  const emaVals = calculateEMA(closes, 200);
  
  let position = null;
  let trades = [];
  let pnlTotal = 0;
  let winCount = 0;
  let lossCount = 0;
  
  for (let i = 200; i < closes.length; i++) {
    const close = closes[i];
    const emaVal = emaVals[i];
    const prevClose = closes[i - 1];
    const prevEma = emaVals[i - 1];
    const slope = getSlope(emaVals, i);
    
    if (!position) {
      // Entry: crossover + slope
      const slopeOk = Math.abs(slope) > 0.01;
      
      if (prevClose <= prevEma && close > emaVal && slope > 0 && slopeOk) {
        position = {
          type: 'LONG',
          entry: close,
          bar: i,
          time: times[i],
          slope: slope.toFixed(4),
        };
      } else if (prevClose >= prevEma && close < emaVal && slope < 0 && slopeOk) {
        position = {
          type: 'SHORT',
          entry: close,
          bar: i,
          time: times[i],
          slope: slope.toFixed(4),
        };
      }
    } else {
      // P&L tracking
      const pnlPct = position.type === 'LONG'
        ? ((close - position.entry) / position.entry) * 100
        : ((position.entry - close) / position.entry) * 100;
      
      let exit = null;
      let reason = '';
      
      // +5% profit take
      if (pnlPct >= 5) {
        exit = close;
        reason = '+5%';
      }
      // -2% stoploss
      else if (pnlPct <= -2) {
        exit = close;
        reason = '-2%';
      }
      
      if (exit) {
        const finalPnl = pnlPct;
        pnlTotal += finalPnl;
        
        if (finalPnl > 0) winCount++;
        else lossCount++;
        
        trades.push({
          type: position.type,
          entry: position.entry.toFixed(4),
          exit: exit.toFixed(4),
          pnl: finalPnl.toFixed(3),
          bars: i - position.bar,
          time: position.time,
          slope: position.slope,
          reason,
        });
        
        position = null;
      }
    }
  }
  
  // Close open position
  if (position) {
    const exit = closes[closes.length - 1];
    const finalPnl = position.type === 'LONG'
      ? ((exit - position.entry) / position.entry) * 100
      : ((position.entry - exit) / position.entry) * 100;
    pnlTotal += finalPnl;
    if (finalPnl > 0) winCount++;
    else lossCount++;
    
    trades.push({
      type: position.type,
      entry: position.entry.toFixed(4),
      exit: exit.toFixed(4),
      pnl: finalPnl.toFixed(3),
      bars: closes.length - position.bar,
      time: position.time,
      slope: position.slope,
      reason: 'CLOSE',
    });
  }
  
  const wr = trades.length ? (winCount / trades.length * 100).toFixed(1) : 0;
  const avgTrade = trades.length ? (pnlTotal / trades.length).toFixed(3) : 0;
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`HYPE 30d | 200 EMA + 0.01% slope + 5%/-2% targets`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`Trades: ${trades.length}`);
  console.log(`Wins: ${winCount} | Losses: ${lossCount} | Win Rate: ${wr}%`);
  console.log(`Total P&L: ${pnlTotal.toFixed(2)}%`);
  console.log(`Avg P&L: ${avgTrade}%\n`);
  
  if (trades.length > 0) {
    console.log(`# | Type  | Entry    | Exit     | P&L %  | Slope% | Reason | Bars`);
    console.log('──────────────────────────────────────────────────────────────────');
    trades.forEach((t, i) => {
      const icon = parseFloat(t.pnl) > 0 ? '✅' : '❌';
      const typeStr = t.type === 'LONG' ? 'LONG ' : 'SHORT';
      console.log(`${String(i+1).padEnd(2)}| ${typeStr}| ${t.entry.padEnd(8)}| ${t.exit.padEnd(8)}| ${icon} ${t.pnl.padEnd(5)}| ${t.slope.padEnd(5)}| ${t.reason.padEnd(6)}| ${t.bars}`);
    });
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  if (pnlTotal > 0 && wr > 50) {
    console.log(`✅ PROFITABLE: ${wr}% win rate, +${pnlTotal.toFixed(2)}% total\n`);
  } else if (pnlTotal > 0) {
    console.log(`⚠️  MARGINAL: Low win rate but profitable\n`);
  } else if (pnlTotal === 0) {
    console.log(`❌ BREAKEVEN: No trades executed\n`);
  } else {
    console.log(`❌ LOSING: ${pnlTotal.toFixed(2)}%\n`);
  }
}

(async () => {
  const candles = await getCandles(SYMBOL, LOOKBACK_DAYS);
  backtest(candles);
})();

#!/usr/bin/env node
const SYMBOL = 'BTCUSDT';
const DAYS = 30;

async function fetchCandles(symbol, days) {
  const now = Date.now();
  const start = now - (days * 24 * 60 * 60 * 1000);
  const candles = [];
  let time = start;
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
  console.log(` ✓\n`);
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

function backtest(candles, slopeThreshold) {
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
    const slope = getSlope(emaVals, i);
    
    if (!position) {
      const hasSlope = Math.abs(slope) > slopeThreshold;
      if (prevClose <= prevEma && close > emaVal && hasSlope) {
        position = { type: 'LONG', entry: close, emaEntry: emaVal, peakPrice: close };
      } else if (prevClose >= prevEma && close < emaVal && hasSlope) {
        position = { type: 'SHORT', entry: close, emaEntry: emaVal, peakPrice: close };
      }
    } else {
      if (position.type === 'LONG' && close > position.peakPrice) {
        position.peakPrice = close;
      } else if (position.type === 'SHORT' && close < position.peakPrice) {
        position.peakPrice = close;
      }
      
      const pnlPct = position.type === 'LONG'
        ? ((close - position.entry) / position.entry) * 100
        : ((position.entry - close) / position.entry) * 100;
      
      let exit = null;
      if (pnlPct >= 2) {
        exit = close;
        const pnl = pnlPct;
        pnlTotal += pnl;
        trades.push({ pnl, peak: position.peakPrice });
        position = null;
      } else if (pnlPct < -5) {
        exit = position.type === 'LONG' ? position.entry * 0.95 : position.entry * 1.05;
        pnlTotal -= 5;
        trades.push({ pnl: -5, peak: position.peakPrice });
        position = null;
      }
    }
  }
  
  const wins = trades.filter(t => t.pnl > 0).length;
  const wr = trades.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  return {
    trades: trades.length,
    wins,
    wr,
    pnl: pnlTotal.toFixed(2)
  };
}

(async () => {
  console.log(`Fetching...`);
  const candles = await fetchCandles(SYMBOL, DAYS);
  
  console.log(`\nSlope Threshold Sweep:\n`);
  console.log(`Slope% | Trades | Wins | WR%  | Total P&L`);
  console.log(`───────┼────────┼──────┼──────┼───────────`);
  
  const slopes = [0.01, 0.02, 0.05, 0.10, 0.15, 0.20];
  slopes.forEach(s => {
    const result = backtest(candles, s);
    const emoji = result.pnl > 0 ? '✅' : '❌';
    console.log(`${s.toFixed(2)} | ${String(result.trades).padEnd(6)} | ${String(result.wins).padEnd(4)} | ${result.wr.padEnd(4)} | ${emoji} ${result.pnl}%`);
  });
  
  console.log();
})();

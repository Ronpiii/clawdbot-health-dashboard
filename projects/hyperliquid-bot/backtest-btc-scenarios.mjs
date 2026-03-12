#!/usr/bin/env node
/**
 * BTC 5m Slope Bot - Specific Market Scenarios
 * Based on chart: Bull (64k→128k) + Crash (128k→70k)
 */

const HL_API = 'https://api.hyperliquid.xyz';

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function getCandles(coin, startTime, endTime) {
  const data = await hlPost('/info', {
    type: 'candleSnapshot',
    req: { coin, interval: '5m', startTime, endTime },
  });
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
  if (index < 5) return 0;
  return ((emaVals[index] - emaVals[index - 5]) / emaVals[index - 5]) * 100;
}

function runBacktest(candles, label) {
  if (!candles.length) return null;
  
  const closes = candles.map(c => parseFloat(c.c));
  const emaVals = calculateEMA(closes, 200);
  
  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const change = ((lastClose - firstClose) / firstClose * 100).toFixed(2);
  
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
      const slopeOk = Math.abs(slope) > 0.01;
      
      if (prevClose <= prevEma && close > emaVal && slope > 0 && slopeOk) {
        position = { type: 'LONG', entry: close, bar: i };
      } else if (prevClose >= prevEma && close < emaVal && slope < 0 && slopeOk) {
        position = { type: 'SHORT', entry: close, bar: i };
      }
    } else {
      const pnlPct = position.type === 'LONG'
        ? ((close - position.entry) / position.entry) * 100
        : ((position.entry - close) / position.entry) * 100;
      
      let exit = null;
      if (pnlPct >= 5) exit = close;
      else if (pnlPct <= -2) exit = close;
      
      if (exit) {
        const finalPnl = pnlPct;
        pnlTotal += finalPnl;
        if (finalPnl > 0) winCount++;
        else lossCount++;
        
        trades.push({
          type: position.type,
          entry: position.entry.toFixed(0),
          exit: exit.toFixed(0),
          pnl: finalPnl.toFixed(3),
          bars: i - position.bar,
        });
        
        position = null;
      }
    }
  }
  
  if (position) {
    const exit = closes[closes.length - 1];
    const finalPnl = position.type === 'LONG'
      ? ((exit - position.entry) / position.entry) * 100
      : ((position.entry - exit) / position.entry) * 100;
    pnlTotal += finalPnl;
    if (finalPnl > 0) winCount++;
    else lossCount++;
  }
  
  const wr = trades.length ? (winCount / trades.length * 100).toFixed(1) : 0;
  const avgTrade = trades.length ? (pnlTotal / trades.length).toFixed(3) : 0;
  
  return {
    label,
    candles: candles.length,
    firstClose: firstClose.toFixed(0),
    lastClose: lastClose.toFixed(0),
    high: high.toFixed(0),
    low: low.toFixed(0),
    change,
    trades: trades.length,
    winCount,
    lossCount,
    wr,
    pnlTotal: pnlTotal.toFixed(2),
    avgTrade,
    tradeList: trades,
  };
}

(async () => {
  console.log('Testing BTC on key market scenarios...\n');
  
  // Approximate timestamps
  // Bull run: Nov 2025 - early Dec 2025 (assume peak Dec 2)
  // Crash: Dec 2, 2025 - now March 12, 2026
  
  const bullRunStart = new Date('2025-11-01').getTime();
  const bullRunEnd = new Date('2025-12-02').getTime();
  
  const crashStart = new Date('2025-12-02').getTime();
  const crashEnd = new Date('2026-03-12').getTime();
  
  const recentStart = new Date('2026-02-10').getTime();
  const recentEnd = new Date('2026-03-12').getTime();
  
  const scenarios = [
    { label: 'BULL RUN (Nov-Dec 2025)', start: bullRunStart, end: bullRunEnd },
    { label: 'CRASH (Dec 2025 - Mar 2026)', start: crashStart, end: crashEnd },
    { label: 'RECENT (last 30 days)', start: recentStart, end: recentEnd },
  ];
  
  const results = [];
  
  for (const scenario of scenarios) {
    console.log(`  ${scenario.label}...`);
    try {
      const candles = await getCandles('BTC', scenario.start, scenario.end);
      if (candles.length > 0) {
        const result = runBacktest(candles, scenario.label);
        if (result) results.push(result);
      } else {
        console.log(`    (no data available for this period)`);
      }
    } catch (e) {
      console.log(`    (error: ${e.message})`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('BTC 5m SLOPE BOT - SCENARIO BACKTEST');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  results.forEach(r => {
    const trend = parseFloat(r.change) > 0 ? '📈' : '📉';
    console.log(`${r.label}`);
    console.log(`├─ Market: $${r.firstClose} → $${r.lastClose} (${trend} ${r.change}%)`);
    console.log(`├─ Range: $${r.low} - $${r.high}`);
    console.log(`├─ Candles: ${r.candles} 5m bars`);
    console.log(`├─ Trades: ${r.trades} | W: ${r.winCount} L: ${r.lossCount} | WR: ${r.wr}%`);
    console.log(`└─ P&L: ${r.pnlTotal > 0 ? '✅' : '❌'} ${r.pnlTotal > 0 ? '+' : ''}${r.pnlTotal}% (${r.avgTrade}%/trade)\n`);
    
    if (r.tradeList.length > 0 && r.tradeList.length <= 20) {
      console.log(`  Trades:`);
      r.tradeList.forEach((t, i) => {
        const icon = parseFloat(t.pnl) > 0 ? '✅' : '❌';
        console.log(`  ${i+1}. ${t.type.padEnd(5)} $${t.entry} → $${t.exit} ${icon} ${t.pnl}% (${t.bars}b)`);
      });
      console.log('');
    }
  });
  
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  if (results.length > 0) {
    const bullResult = results.find(r => r.label.includes('BULL'));
    const crashResult = results.find(r => r.label.includes('CRASH'));
    const recentResult = results.find(r => r.label.includes('RECENT'));
    
    console.log('KEY INSIGHTS:\n');
    
    if (bullResult) {
      console.log(`Bull Run: ${bullResult.pnlTotal > 0 ? 'Strategy excels' : 'Strategy struggles'} with +${bullResult.change}% market move`);
      console.log(`  • ${bullResult.trades} trades, ${bullResult.wr}% win rate\n`);
    }
    
    if (crashResult) {
      console.log(`Crash/Drawdown: ${crashResult.pnlTotal > 0 ? 'Profitable despite' : 'Loses in'} -${Math.abs(crashResult.change)}% market decline`);
      console.log(`  • ${crashResult.trades} trades, ${crashResult.wr}% win rate`);
      console.log(`  • Shorts should dominate this period\n`);
    }
    
    if (recentResult) {
      console.log(`Recent 30d: ${recentResult.pnlTotal > 0 ? '✅ Profitable' : '❌ Losing'}`);
      console.log(`  • ${recentResult.change}% market move`);
      console.log(`  • ${recentResult.trades} trades, ${recentResult.wr}% win rate\n`);
    }
  }
})();

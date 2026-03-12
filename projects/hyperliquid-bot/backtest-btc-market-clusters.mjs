#!/usr/bin/env node
/**
 * BTC 5m Slope Bot - Multi-Cluster Backtest
 * Test on different market conditions:
 * - Bull market (sustained uptrend)
 * - Downtrend (major decline like 128k → 64k)
 * - Sideways (range-bound)
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

async function getCandles(symbol, days = 30) {
  const endTime = Date.now();
  const startTime = endTime - (days * 24 * 60 * 60 * 1000);
  
  const data = await hlPost('/info', {
    type: 'candleSnapshot',
    req: { coin: symbol, interval: '5m', startTime, endTime },
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
  const closes = candles.map(c => parseFloat(c.c));
  const emaVals = calculateEMA(closes, 200);
  
  // Market analysis
  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const change = ((lastClose - firstClose) / firstClose * 100).toFixed(2);
  const volatility = (((high - low) / low) * 100).toFixed(2);
  
  let position = null;
  let trades = [];
  let pnlTotal = 0;
  let winCount = 0;
  let lossCount = 0;
  let shortWins = 0, shortLosses = 0;
  let longWins = 0, longLosses = 0;
  
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
      if (pnlPct >= 5) {
        exit = close;
      } else if (pnlPct <= -2) {
        exit = close;
      }
      
      if (exit) {
        const finalPnl = pnlPct;
        pnlTotal += finalPnl;
        
        if (finalPnl > 0) {
          winCount++;
          if (position.type === 'LONG') longWins++;
          else shortWins++;
        } else {
          lossCount++;
          if (position.type === 'LONG') longLosses++;
          else shortLosses++;
        }
        
        trades.push({
          type: position.type,
          entry: position.entry.toFixed(2),
          exit: exit.toFixed(2),
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
    if (finalPnl > 0) {
      winCount++;
      if (position.type === 'LONG') longWins++;
      else shortWins++;
    } else {
      lossCount++;
      if (position.type === 'LONG') longLosses++;
      else shortLosses++;
    }
  }
  
  const wr = trades.length ? (winCount / trades.length * 100).toFixed(1) : 0;
  const avgTrade = trades.length ? (pnlTotal / trades.length).toFixed(3) : 0;
  
  return {
    label,
    market: { firstClose, lastClose, high, low, change, volatility },
    trades: trades.length,
    winCount, lossCount, wr,
    longWins, longLosses,
    shortWins, shortLosses,
    pnlTotal: pnlTotal.toFixed(2),
    avgTrade,
  };
}

(async () => {
  console.log('Fetching BTC data for multiple clusters...\n');
  
  const clusters = [
    { days: 30, label: '30 days (recent)' },
    { days: 60, label: '60 days (2 months)' },
    { days: 90, label: '90 days (3 months)' },
  ];
  
  const results = [];
  
  for (const cluster of clusters) {
    console.log(`  ${cluster.label}...`);
    const candles = await getCandles('BTC', cluster.days);
    const result = runBacktest(candles, cluster.label);
    results.push(result);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('BTC 5m SLOPE BOT - MULTI-CLUSTER BACKTEST');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  results.forEach(r => {
    const trend = r.market.change > 0 ? '📈 BULL' : '📉 BEAR';
    console.log(`${r.label} | ${trend} (${r.market.change}%)`);
    console.log(`├─ Market: $${parseFloat(r.market.firstClose).toFixed(0)} → $${parseFloat(r.market.lastClose).toFixed(0)} | Range: $${(parseFloat(r.market.high) - parseFloat(r.market.low)).toFixed(0)} (${r.market.volatility}%)`);
    console.log(`├─ Trades: ${r.trades} | Wins: ${r.winCount}/${r.trades} (${r.wr}% WR)`);
    console.log(`├─ LONG: ${r.longWins}W-${r.longLosses}L | SHORT: ${r.shortWins}W-${r.shortLosses}L`);
    console.log(`├─ P&L: ${r.pnlTotal > 0 ? '+' : ''}${r.pnlTotal}% | Avg/trade: ${r.avgTrade}%`);
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('INTERPRETATION:\n');
  
  const r30 = results[0];
  const r60 = results[1];
  const r90 = results[2];
  
  console.log(`30-day performance:  ${r30.pnlTotal > 0 ? '✅' : '❌'} ${r30.pnlTotal}%`);
  console.log(`60-day performance:  ${r60.pnlTotal > 0 ? '✅' : '❌'} ${r60.pnlTotal}%`);
  console.log(`90-day performance:  ${r90.pnlTotal > 0 ? '✅' : '❌'} ${r90.pnlTotal}%\n`);
  
  const avgTrades30 = (30 * 24 * 60 / 5 - 200) / r30.trades;
  const avgTrades60 = (60 * 24 * 60 / 5 - 200) / r60.trades;
  const avgTrades90 = (90 * 24 * 60 / 5 - 200) / r90.trades;
  
  console.log(`Entry frequency: 1 trade every ~${avgTrades30.toFixed(0)} candles (30d) | ~${avgTrades60.toFixed(0)} (60d) | ~${avgTrades90.toFixed(0)} (90d)`);
  console.log(`Win rate trend: ${r30.wr}% (30d) → ${r60.wr}% (60d) → ${r90.wr}% (90d)`);
  
  // Identify market regime
  console.log(`\nMarket regime (90d):`);
  if (r90.market.change > 5) {
    console.log(`📈 STRONG BULL: ${r90.market.change}% gain over 3 months`);
  } else if (r90.market.change > 0) {
    console.log(`📈 MILD BULL: ${r90.market.change}% gain over 3 months`);
  } else if (r90.market.change < -5) {
    console.log(`📉 STRONG BEAR: ${r90.market.change}% loss over 3 months`);
  } else {
    console.log(`➡️  SIDEWAYS: ${r90.market.change}% change over 3 months`);
  }
  
  console.log(`\nNote: To test specific drawdown (128k→64k), need exact date range.\n`);
})();

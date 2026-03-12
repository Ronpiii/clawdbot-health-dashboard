#!/usr/bin/env node
/**
 * BTC 5m Slope Bot - Tighter Stoploss
 * Strategy: 200 EMA + 0.01% slope + 5% profit / 1.5% stoploss (vs original 2%)
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

(async () => {
  const candles = await getCandles('BTC', 30);
  const closes = candles.map(c => parseFloat(c.c));
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
      let reason = '';
      
      if (pnlPct >= 5) {
        exit = close;
        reason = '+5%';
      } else if (pnlPct <= -1.5) {
        exit = close;
        reason = '-1.5%';
      }
      
      if (exit) {
        const finalPnl = pnlPct;
        pnlTotal += finalPnl;
        
        if (finalPnl > 0) winCount++;
        else lossCount++;
        
        trades.push({
          type: position.type,
          entry: position.entry.toFixed(2),
          exit: exit.toFixed(2),
          pnl: finalPnl.toFixed(3),
          bars: i - position.bar,
          reason,
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
    
    trades.push({
      type: position.type,
      entry: position.entry.toFixed(2),
      exit: exit.toFixed(2),
      pnl: finalPnl.toFixed(3),
      bars: closes.length - position.bar,
      reason: 'CLOSE',
    });
  }
  
  const wr = trades.length ? (winCount / trades.length * 100).toFixed(1) : 0;
  const avgTrade = trades.length ? (pnlTotal / trades.length).toFixed(3) : 0;
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`BTC 30d | 200 EMA + 0.01% slope + 5%/-1.5% (TIGHTER STOP)`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`Trades: ${trades.length}`);
  console.log(`Wins: ${winCount} | Losses: ${lossCount} | Win Rate: ${wr}%`);
  console.log(`Total P&L: ${pnlTotal.toFixed(2)}%`);
  console.log(`Avg P&L: ${avgTrade}%\n`);
  
  if (trades.length > 0 && trades.length <= 20) {
    console.log(`# | Type  | Entry   | Exit    | P&L %  | Reason | Bars`);
    console.log('─────────────────────────────────────────────────────────────');
    trades.forEach((t, i) => {
      const icon = parseFloat(t.pnl) > 0 ? '✅' : '❌';
      const typeStr = t.type === 'LONG' ? 'LONG ' : 'SHORT';
      console.log(`${String(i+1).padEnd(2)}| ${typeStr}| $${t.entry.padEnd(6)}| $${t.exit.padEnd(6)}| ${icon} ${t.pnl.padEnd(5)}| ${t.reason.padEnd(6)}| ${t.bars}`);
    });
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  if (pnlTotal > 0 && wr > 50) {
    console.log(`✅ PROFITABLE: ${wr}% win rate, +${pnlTotal.toFixed(2)}%\n`);
  } else if (pnlTotal > 0) {
    console.log(`⚠️  MARGINAL: Low win rate but profitable\n`);
  } else {
    console.log(`❌ LOSING: ${pnlTotal.toFixed(2)}%\n`);
  }
  
  console.log('COMPARISON:');
  console.log('Original (5%/-2%):      4 trades, 75% WR, +7.05% P&L');
  console.log(`Tighter (5%/-1.5%):     ${trades.length} trades, ${wr}% WR, ${pnlTotal.toFixed(2)}% P&L`);
  
  if (trades.length > 4) {
    console.log(`\n→ +${trades.length - 4} additional trades from tighter stop`);
    console.log(`→ Trade frequency increased (faster exits on reversals)`);
  } else if (trades.length < 4) {
    console.log(`\n→ -${4 - trades.length} trades (fewer signals or longer hold times)`);
  } else {
    console.log(`\n→ Same trade count, but different exit prices/timing`);
  }
})();

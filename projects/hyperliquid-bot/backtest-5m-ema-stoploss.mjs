#!/usr/bin/env node
/**
 * Backtest: 200 EMA 5-min chart with 5% EMA stoploss
 * Tests if price touches EMA ±5% boundary → close position
 * 
 * Usage: node backtest-5m-ema-stoploss.mjs [symbol] [days]
 * Example: node backtest-5m-ema-stoploss.mjs BTC 30
 */

import * as https from 'https';

const SYMBOL = process.argv[2]?.toUpperCase() || 'BTC';
const DAYS = parseInt(process.argv[3]) || 30;
const INTERVAL = '5m';
const EMA_PERIOD = 200;
const STOPLOSS_PCT = 5; // % away from EMA

console.log(`\n📊 BACKTEST: ${SYMBOL} ${DAYS}d | 5m chart | 200 EMA | 5% EMA stoploss\n`);

// Fetch OHLCV data from Hyperliquid REST API
async function fetchCandles(symbol, days) {
  const now = Date.now();
  const startTime = now - (days * 24 * 60 * 60 * 1000);
  const interval = 5 * 60 * 1000; // 5 min in ms
  
  const candles = [];
  let currentTime = startTime;
  
  console.log(`⏳ Fetching ${days} days of 5-min candles...`);
  
  while (currentTime < now) {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candles',
          req: {
            coin: symbol,
            interval: INTERVAL,
            startTime: currentTime,
            endTime: Math.min(currentTime + (1000 * interval), now)
          }
        })
      });
      
      const data = await response.json();
      if (data.candles && data.candles.length > 0) {
        candles.push(...data.candles);
        currentTime = parseInt(data.candles[data.candles.length - 1].t) + 1;
        process.stdout.write('.');
      } else {
        currentTime += 1000 * interval;
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.error(`\n❌ Fetch error: ${err.message}`);
      break;
    }
  }
  
  console.log(`\n✓ Fetched ${candles.length} candles\n`);
  return candles;
}

// Calculate EMA
function calculateEMA(closes, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      ema.push(closes[i]);
    } else if (i < period) {
      ema.push((closes[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
    } else {
      ema.push((closes[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
    }
  }
  return ema;
}

// Run backtest
function backtest(candles) {
  if (candles.length < EMA_PERIOD) {
    console.log(`❌ Not enough data (need ${EMA_PERIOD}, got ${candles.length})`);
    return;
  }
  
  const closes = candles.map(c => parseFloat(c.c));
  const highs = candles.map(c => parseFloat(c.h));
  const lows = candles.map(c => parseFloat(c.l));
  const times = candles.map(c => c.t);
  
  const ema = calculateEMA(closes, EMA_PERIOD);
  
  let position = null;
  let trades = [];
  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  
  for (let i = EMA_PERIOD; i < closes.length; i++) {
    const close = closes[i];
    const high = highs[i];
    const low = lows[i];
    const emaValue = ema[i];
    const prevEma = ema[i - 1];
    const prevClose = closes[i - 1];
    const time = new Date(parseInt(times[i])).toISOString();
    
    // Entry logic: cross EMA
    if (!position) {
      // LONG: price crosses above EMA
      if (prevClose <= prevEma && close > emaValue) {
        position = {
          type: 'LONG',
          entryPrice: close,
          entryEMA: emaValue,
          entryTime: time,
          entryIdx: i
        };
      }
      // SHORT: price crosses below EMA
      else if (prevClose >= prevEma && close < emaValue) {
        position = {
          type: 'SHORT',
          entryPrice: close,
          entryEMA: emaValue,
          entryTime: time,
          entryIdx: i
        };
      }
    }
    // Exit logic: 5% away from EMA
    else {
      const stoplossDistance = emaValue * (STOPLOSS_PCT / 100);
      const upperBound = emaValue + stoplossDistance;
      const lowerBound = emaValue - stoplossDistance;
      
      let shouldExit = false;
      let exitPrice = null;
      let exitReason = '';
      
      if (position.type === 'LONG') {
        // Exit if price drops below lower bound (5% below EMA)
        if (low < lowerBound) {
          shouldExit = true;
          exitPrice = lowerBound;
          exitReason = `price hit ${STOPLOSS_PCT}% below EMA`;
        }
      } else if (position.type === 'SHORT') {
        // Exit if price rises above upper bound (5% above EMA)
        if (high > upperBound) {
          shouldExit = true;
          exitPrice = upperBound;
          exitReason = `price hit ${STOPLOSS_PCT}% above EMA`;
        }
      }
      
      if (shouldExit && exitPrice) {
        const pnlPct = position.type === 'LONG'
          ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
        
        const pnlDollars = pnlPct * position.entryPrice / 100;
        totalPnL += pnlDollars;
        
        if (pnlDollars > 0) wins++;
        else losses++;
        
        trades.push({
          type: position.type,
          entry: position.entryPrice.toFixed(2),
          exit: exitPrice.toFixed(2),
          pnlPct: pnlPct.toFixed(2),
          duration: `${i - position.entryIdx} candles`,
          reason: exitReason,
          time: time
        });
        
        position = null;
      }
    }
  }
  
  // Close any open position at last price
  if (position) {
    const exitPrice = closes[closes.length - 1];
    const pnlPct = position.type === 'LONG'
      ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
    
    const pnlDollars = pnlPct * position.entryPrice / 100;
    totalPnL += pnlDollars;
    
    if (pnlDollars > 0) wins++;
    else losses++;
    
    trades.push({
      type: position.type,
      entry: position.entryPrice.toFixed(2),
      exit: exitPrice.toFixed(2),
      pnlPct: pnlPct.toFixed(2),
      duration: `${closes.length - position.entryIdx} candles`,
      reason: 'close on last candle',
      time: new Date(parseInt(times[times.length - 1])).toISOString()
    });
  }
  
  // Print results
  console.log(`═══════════════════════════════════════`);
  console.log(`RESULTS: ${SYMBOL} | ${EMA_PERIOD} EMA | 5m chart | ${DAYS} days`);
  console.log(`═══════════════════════════════════════\n`);
  
  console.log(`📊 Total Trades: ${trades.length}`);
  console.log(`✅ Wins: ${wins} (${(wins / trades.length * 100).toFixed(0)}%)`);
  console.log(`❌ Losses: ${losses} (${(losses / trades.length * 100).toFixed(0)}%)`);
  console.log(`💰 Total P&L: $${totalPnL.toFixed(2)}`);
  console.log(`📈 Avg P&L per trade: $${(totalPnL / trades.length).toFixed(2)}\n`);
  
  // Show last 10 trades
  console.log(`Last 10 trades:\n`);
  trades.slice(-10).forEach((t, i) => {
    const emoji = parseFloat(t.pnlPct) > 0 ? '✅' : '❌';
    console.log(`${i + 1}. ${emoji} ${t.type.padEnd(5)} | Entry: $${t.entry} | Exit: $${t.exit} | P&L: ${t.pnlPct}% | ${t.duration}`);
  });
  
  console.log(`\n═══════════════════════════════════════\n`);
}

// Main
(async () => {
  try {
    const candles = await fetchCandles(SYMBOL, DAYS);
    backtest(candles);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
})();

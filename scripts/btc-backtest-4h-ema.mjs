#!/usr/bin/env node
/**
 * BTC 4H 200 EMA Strategy Backtest
 * 
 * Rules:
 * - LONG: 4H candle closes above 200 EMA
 * - SHORT: 4H candle closes below 200 EMA
 * - Exit: candle closes on opposite side of 200 EMA
 * 
 * No fixed stop/TP — pure EMA following
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

// --- Fetch 4H Data ---
async function fetch4HKlines(days = 365) {
  // Binance allows max 1000 candles per request
  // 4H = 6 candles/day, so 1000 candles = ~166 days
  // For longer periods, need multiple requests
  
  const allCandles = [];
  const candlesPerDay = 6;
  const totalCandles = days * candlesPerDay;
  const batchSize = 1000;
  
  let endTime = Date.now();
  
  while (allCandles.length < totalCandles) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=${batchSize}&endTime=${endTime}`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      
      if (!data || data.length === 0) break;
      
      const candles = data.map(k => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
      
      allCandles.unshift(...candles);
      endTime = data[0][0] - 1; // Go further back
      
      // Rate limit
      await new Promise(r => setTimeout(r, 100));
      
    } catch (err) {
      console.error('Fetch error:', err.message);
      break;
    }
  }
  
  // Remove duplicates and sort
  const seen = new Set();
  const unique = allCandles.filter(c => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  }).sort((a, b) => a.time - b.time);
  
  return unique;
}

// --- EMA Calculation ---
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const emaArray = [];
  let ema = prices[0];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      const slice = prices.slice(0, i + 1);
      ema = slice.reduce((a, b) => a + b, 0) / slice.length;
    } else {
      ema = prices[i] * k + ema * (1 - k);
    }
    emaArray.push(ema);
  }
  return emaArray;
}

// --- Simulate Trades ---
function simulateTrades(candles, ema200, leverage = 3, riskPercent = 0.025) {
  const trades = [];
  let position = null;
  
  for (let i = 201; i < candles.length; i++) {
    const candle = candles[i];
    const prevCandle = candles[i - 1];
    const ema = ema200[i];
    const prevEma = ema200[i - 1];
    
    const aboveEMA = candle.close > ema;
    const prevAboveEMA = prevCandle.close > prevEma;
    
    // Check for exit first
    if (position) {
      const shouldExit = 
        (position.direction === 'LONG' && !aboveEMA) ||
        (position.direction === 'SHORT' && aboveEMA);
      
      if (shouldExit) {
        const pnlPercent = position.direction === 'LONG'
          ? (candle.close - position.entry) / position.entry
          : (position.entry - candle.close) / position.entry;
        
        trades.push({
          ...position,
          exit: candle.close,
          exitTime: candle.time,
          exitDate: new Date(candle.time).toISOString().split('T')[0],
          pnlPercent,
          pnlLeveraged: pnlPercent * leverage,
          barsHeld: i - position.entryIndex,
          hoursHeld: (i - position.entryIndex) * 4,
        });
        position = null;
      }
    }
    
    // Check for entry (cross)
    if (!position) {
      // Crossed above EMA -> LONG
      if (aboveEMA && !prevAboveEMA) {
        position = {
          direction: 'LONG',
          entry: candle.close,
          entryTime: candle.time,
          entryDate: new Date(candle.time).toISOString().split('T')[0],
          entryIndex: i,
          emaAtEntry: ema,
        };
      }
      // Crossed below EMA -> SHORT
      else if (!aboveEMA && prevAboveEMA) {
        position = {
          direction: 'SHORT',
          entry: candle.close,
          entryTime: candle.time,
          entryDate: new Date(candle.time).toISOString().split('T')[0],
          entryIndex: i,
          emaAtEntry: ema,
        };
      }
    }
  }
  
  // Close any open position
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const pnlPercent = position.direction === 'LONG'
      ? (lastCandle.close - position.entry) / position.entry
      : (position.entry - lastCandle.close) / position.entry;
    
    trades.push({
      ...position,
      exit: lastCandle.close,
      exitTime: lastCandle.time,
      exitDate: new Date(lastCandle.time).toISOString().split('T')[0],
      pnlPercent,
      pnlLeveraged: pnlPercent * leverage,
      barsHeld: candles.length - 1 - position.entryIndex,
      hoursHeld: (candles.length - 1 - position.entryIndex) * 4,
      isOpen: true,
    });
  }
  
  return trades;
}

// --- Calculate Metrics ---
function calculateMetrics(trades, initialCapital = 10000, leverage = 3, riskPercent = 0.025) {
  if (trades.length === 0) {
    return { error: 'No trades' };
  }
  
  const closedTrades = trades.filter(t => !t.isOpen);
  const winners = closedTrades.filter(t => t.pnlPercent > 0);
  const losers = closedTrades.filter(t => t.pnlPercent <= 0);
  
  const winRate = closedTrades.length > 0 ? winners.length / closedTrades.length : 0;
  
  const avgWin = winners.length > 0
    ? winners.reduce((sum, t) => sum + t.pnlPercent, 0) / winners.length
    : 0;
  const avgLoss = losers.length > 0
    ? Math.abs(losers.reduce((sum, t) => sum + t.pnlPercent, 0) / losers.length)
    : 0;
  
  const ev = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / closedTrades.length
    : 0;
  
  // Equity curve
  let equity = initialCapital;
  let peak = equity;
  let maxDrawdown = 0;
  const equityCurve = [equity];
  
  for (const trade of closedTrades) {
    // Risk a percentage of equity per trade
    const riskAmount = equity * riskPercent;
    // PnL based on leveraged return
    const pnl = riskAmount * (trade.pnlLeveraged / 0.08); // Normalized to ~8% avg move
    
    equity += pnl;
    equityCurve.push(equity);
    
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  
  const totalReturn = (equity - initialCapital) / initialCapital;
  
  // Profit factor
  const grossProfit = winners.reduce((sum, t) => sum + t.pnlPercent, 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  
  // Average hold time
  const avgHoldHours = closedTrades.reduce((sum, t) => sum + t.hoursHeld, 0) / closedTrades.length;
  
  // Win/loss streaks
  let maxWinStreak = 0, maxLossStreak = 0, currentStreak = 0, lastWin = null;
  for (const t of closedTrades) {
    const isWin = t.pnlPercent > 0;
    if (lastWin === null || isWin === lastWin) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }
    if (isWin && currentStreak > maxWinStreak) maxWinStreak = currentStreak;
    if (!isWin && currentStreak > maxLossStreak) maxLossStreak = currentStreak;
    lastWin = isWin;
  }
  
  // Kelly
  const b = avgLoss > 0 ? avgWin / avgLoss : 0;
  const kelly = b > 0 ? (winRate * b - (1 - winRate)) / b : 0;
  
  return {
    totalTrades: trades.length,
    closedTrades: closedTrades.length,
    openTrades: trades.filter(t => t.isOpen).length,
    winners: winners.length,
    losers: losers.length,
    winRate,
    avgWin,
    avgLoss,
    avgWinLeveraged: avgWin * leverage,
    avgLossLeveraged: avgLoss * leverage,
    ev,
    evLeveraged: ev * leverage,
    profitFactor,
    maxDrawdown,
    totalReturn,
    finalEquity: equity,
    avgHoldHours,
    avgHoldDays: avgHoldHours / 24,
    maxWinStreak,
    maxLossStreak,
    kelly,
    longTrades: closedTrades.filter(t => t.direction === 'LONG').length,
    shortTrades: closedTrades.filter(t => t.direction === 'SHORT').length,
    longWinRate: closedTrades.filter(t => t.direction === 'LONG').length > 0
      ? closedTrades.filter(t => t.direction === 'LONG' && t.pnlPercent > 0).length /
        closedTrades.filter(t => t.direction === 'LONG').length
      : 0,
    shortWinRate: closedTrades.filter(t => t.direction === 'SHORT').length > 0
      ? closedTrades.filter(t => t.direction === 'SHORT' && t.pnlPercent > 0).length /
        closedTrades.filter(t => t.direction === 'SHORT').length
      : 0,
  };
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const days = args.includes('--days') 
    ? parseInt(args[args.indexOf('--days') + 1]) 
    : 730;
  const showTrades = args.includes('--trades');
  const leverage = args.includes('--leverage')
    ? parseInt(args[args.indexOf('--leverage') + 1])
    : 3;
  
  console.log(`fetching ${days} days of 4H BTC data...`);
  
  const candles = await fetch4HKlines(days);
  console.log(`got ${candles.length} candles (${(candles.length / 6).toFixed(0)} days)\n`);
  
  if (candles.length < 250) {
    console.error('insufficient data');
    process.exit(1);
  }
  
  // Calculate 200 EMA
  const closes = candles.map(c => c.close);
  const ema200 = calculateEMA(closes, 200);
  
  // Simulate
  const trades = simulateTrades(candles, ema200, leverage);
  const metrics = calculateMetrics(trades, 10000, leverage);
  
  // Buy and hold comparison
  const startPrice = candles[200].close;
  const endPrice = candles[candles.length - 1].close;
  const buyHoldReturn = (endPrice - startPrice) / startPrice;
  const buyHoldLeveraged = buyHoldReturn * leverage;
  
  const startDate = new Date(candles[200].time).toISOString().split('T')[0];
  const endDate = new Date(candles[candles.length - 1].time).toISOString().split('T')[0];
  
  // Output
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  4H 200 EMA STRATEGY BACKTEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  period:      ${startDate} → ${endDate}`);
  console.log(`  candles:     ${candles.length} (4H)`);
  console.log(`  leverage:    ${leverage}x`);
  console.log(`  entry:       4H close crosses 200 EMA`);
  console.log(`  exit:        4H close crosses back`);
  console.log('');
  
  console.log('  TRADE STATS');
  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  total trades:     ${metrics.closedTrades} closed, ${metrics.openTrades} open`);
  console.log(`  winners:          ${metrics.winners} (${(metrics.winRate * 100).toFixed(1)}%)`);
  console.log(`  losers:           ${metrics.losers}`);
  console.log(`  long/short:       ${metrics.longTrades}/${metrics.shortTrades}`);
  console.log(`  long win rate:    ${(metrics.longWinRate * 100).toFixed(1)}%`);
  console.log(`  short win rate:   ${(metrics.shortWinRate * 100).toFixed(1)}%`);
  console.log(`  avg hold time:    ${metrics.avgHoldDays.toFixed(1)} days (${metrics.avgHoldHours.toFixed(0)} hours)`);
  console.log(`  max win streak:   ${metrics.maxWinStreak}`);
  console.log(`  max loss streak:  ${metrics.maxLossStreak}`);
  console.log('');
  
  console.log('  P&L ANALYSIS');
  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  avg win:          ${(metrics.avgWin * 100).toFixed(2)}% (${(metrics.avgWinLeveraged * 100).toFixed(2)}% leveraged)`);
  console.log(`  avg loss:         ${(metrics.avgLoss * 100).toFixed(2)}% (${(metrics.avgLossLeveraged * 100).toFixed(2)}% leveraged)`);
  console.log(`  EV per trade:     ${(metrics.ev * 100).toFixed(2)}% (${(metrics.evLeveraged * 100).toFixed(2)}% leveraged)`);
  console.log(`  profit factor:    ${metrics.profitFactor.toFixed(2)}`);
  console.log('');
  
  console.log('  RISK METRICS');
  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  max drawdown:     ${(metrics.maxDrawdown * 100).toFixed(1)}%`);
  console.log(`  kelly fraction:   ${(metrics.kelly * 100).toFixed(1)}%`);
  console.log(`  quarter kelly:    ${(metrics.kelly * 25).toFixed(1)}%`);
  console.log('');
  
  console.log('  RETURNS');
  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  strategy return:  ${(metrics.totalReturn * 100).toFixed(1)}% ($10k → $${metrics.finalEquity.toFixed(0)})`);
  console.log(`  buy & hold:       ${(buyHoldReturn * 100).toFixed(1)}% (${(buyHoldLeveraged * 100).toFixed(1)}% at ${leverage}x)`);
  console.log(`  beats buy&hold:   ${metrics.totalReturn > buyHoldLeveraged ? '✓ YES' : '✗ NO'}`);
  console.log('');
  
  // Verdict
  console.log('  VERDICT');
  console.log('  ─────────────────────────────────────────────────────────');
  if (metrics.ev > 0.005 && metrics.totalReturn > buyHoldLeveraged) {
    console.log('  ✓ TRADEABLE — positive EV and beats buy&hold');
    console.log(`  → recommended risk: ${Math.min(metrics.kelly * 25, 5).toFixed(1)}% per trade`);
  } else if (metrics.ev > 0) {
    console.log('  ⚠ MARGINAL — positive EV but may not beat buy&hold');
    console.log('  → consider adding filters or using as secondary signal');
  } else {
    console.log('  ✗ NO EDGE — negative EV');
    console.log('  → do not trade this strategy');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (showTrades) {
    console.log('TRADE LOG:');
    console.log('─────────────────────────────────────────────────────────────────────────');
    for (const t of trades) {
      const emoji = t.pnlPercent > 0 ? '✓' : '✗';
      const status = t.isOpen ? '(OPEN)' : '';
      console.log(`${emoji} ${t.direction.padEnd(5)} ${t.entryDate} → ${t.exitDate} | $${t.entry.toFixed(0)} → $${t.exit.toFixed(0)} | ${(t.pnlPercent * 100).toFixed(1)}% | ${t.hoursHeld}h ${status}`);
    }
  }
  
  // Save
  const resultsFile = join(WORKSPACE, '.cache', 'btc-4h-ema-results.json');
  writeFileSync(resultsFile, JSON.stringify({
    runDate: new Date().toISOString(),
    period: { start: startDate, end: endDate, days },
    leverage,
    metrics,
    buyHoldReturn,
    buyHoldLeveraged,
    trades,
  }, null, 2));
  console.log(`saved to .cache/btc-4h-ema-results.json`);
}

main().catch(console.error);

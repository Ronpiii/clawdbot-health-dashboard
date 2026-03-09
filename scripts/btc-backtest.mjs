#!/usr/bin/env node
/**
 * BTC Strategy Backtester
 * 
 * Tests the EMA signal strategy against historical data.
 * Calculates: win rate, EV, max drawdown, sharpe, kelly fraction
 * 
 * Usage:
 *   ./scripts/btc-backtest.mjs              # full backtest (2 years)
 *   ./scripts/btc-backtest.mjs --days 365   # custom period
 *   ./scripts/btc-backtest.mjs --json       # machine output
 *   ./scripts/btc-backtest.mjs --trades     # show individual trades
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

// --- Config (mirror btc-signal.mjs) ---
const CONFIG = {
  shortEMA: 20,
  longEMA: 200,
  ema4H: 50,
  chopZone: 0.03,
  stopPercent: 0.06,
  takeProfitPercent: 0.12, // 2:1 RR
  leverage: 3,
  initialCapital: 10000,
  positionSizePercent: 0.02, // risk 2% per trade
};

// --- Fetch Historical Data ---
async function fetchDailyKlines(days = 730) {
  const limit = Math.min(days, 1000);
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${limit}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (err) {
    console.error('Failed to fetch daily data:', err.message);
    return null;
  }
}

async function fetch4HKlines(days = 730) {
  // 4H = 6 candles per day, max 1000 per request
  const limit = Math.min(days * 6, 1000);
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=${limit}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (err) {
    console.error('Failed to fetch 4H data:', err.message);
    return null;
  }
}

// --- EMA Calculation ---
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const emaArray = [];
  let ema = prices[0];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      // Use SMA for initial period
      const slice = prices.slice(0, i + 1);
      ema = slice.reduce((a, b) => a + b, 0) / slice.length;
    } else {
      ema = prices[i] * k + ema * (1 - k);
    }
    emaArray.push(ema);
  }
  
  return emaArray;
}

// --- Determine Regime ---
function getRegime(price, ema200) {
  const distance = (price - ema200) / ema200;
  if (distance > CONFIG.chopZone) return 'BULL';
  if (distance < -CONFIG.chopZone) return 'BEAR';
  return 'CHOP';
}

// --- Generate Signals ---
function generateSignals(dailyData, ema20, ema200) {
  const signals = [];
  
  for (let i = CONFIG.longEMA; i < dailyData.length; i++) {
    const price = dailyData[i].close;
    const regime = getRegime(price, ema200[i]);
    const above20 = price > ema20[i];
    
    let signal = null;
    
    if (regime === 'BULL' && above20) {
      signal = 'LONG';
    } else if (regime === 'BEAR' && !above20) {
      signal = 'SHORT';
    }
    // CHOP = no signal
    
    signals.push({
      time: dailyData[i].time,
      date: new Date(dailyData[i].time).toISOString().split('T')[0],
      price,
      ema20: ema20[i],
      ema200: ema200[i],
      regime,
      signal,
    });
  }
  
  return signals;
}

// --- Simulate Trades ---
function simulateTrades(signals) {
  const trades = [];
  let position = null;
  
  for (let i = 1; i < signals.length; i++) {
    const prev = signals[i - 1];
    const curr = signals[i];
    
    // Check if we need to close existing position
    if (position) {
      const pnlPercent = position.direction === 'LONG'
        ? (curr.price - position.entry) / position.entry
        : (position.entry - curr.price) / position.entry;
      
      // Check stop loss
      if (pnlPercent <= -CONFIG.stopPercent) {
        trades.push({
          ...position,
          exit: position.entry * (1 - CONFIG.stopPercent * (position.direction === 'LONG' ? 1 : -1)),
          exitDate: curr.date,
          exitReason: 'STOP',
          pnlPercent: -CONFIG.stopPercent,
          pnlLeveraged: -CONFIG.stopPercent * CONFIG.leverage,
        });
        position = null;
      }
      // Check take profit
      else if (pnlPercent >= CONFIG.takeProfitPercent) {
        trades.push({
          ...position,
          exit: position.entry * (1 + CONFIG.takeProfitPercent * (position.direction === 'LONG' ? 1 : -1)),
          exitDate: curr.date,
          exitReason: 'TP',
          pnlPercent: CONFIG.takeProfitPercent,
          pnlLeveraged: CONFIG.takeProfitPercent * CONFIG.leverage,
        });
        position = null;
      }
      // Check signal flip
      else if (curr.signal && curr.signal !== position.direction) {
        trades.push({
          ...position,
          exit: curr.price,
          exitDate: curr.date,
          exitReason: 'FLIP',
          pnlPercent,
          pnlLeveraged: pnlPercent * CONFIG.leverage,
        });
        position = null;
      }
    }
    
    // Open new position if signal changed and we're flat
    if (!position && curr.signal && curr.signal !== prev.signal) {
      position = {
        direction: curr.signal,
        entry: curr.price,
        entryDate: curr.date,
        regime: curr.regime,
        stop: curr.price * (1 - CONFIG.stopPercent * (curr.signal === 'LONG' ? 1 : -1)),
        tp: curr.price * (1 + CONFIG.takeProfitPercent * (curr.signal === 'LONG' ? 1 : -1)),
      };
    }
  }
  
  // Close any open position at end
  if (position) {
    const lastPrice = signals[signals.length - 1].price;
    const pnlPercent = position.direction === 'LONG'
      ? (lastPrice - position.entry) / position.entry
      : (position.entry - lastPrice) / position.entry;
    
    trades.push({
      ...position,
      exit: lastPrice,
      exitDate: signals[signals.length - 1].date,
      exitReason: 'END',
      pnlPercent,
      pnlLeveraged: pnlPercent * CONFIG.leverage,
    });
  }
  
  return trades;
}

// --- Calculate Metrics ---
function calculateMetrics(trades, initialPrice, finalPrice) {
  if (trades.length === 0) {
    return { error: 'No trades generated' };
  }
  
  const winners = trades.filter(t => t.pnlPercent > 0);
  const losers = trades.filter(t => t.pnlPercent <= 0);
  
  const winRate = winners.length / trades.length;
  const lossRate = 1 - winRate;
  
  const avgWin = winners.length > 0
    ? winners.reduce((sum, t) => sum + t.pnlPercent, 0) / winners.length
    : 0;
  const avgLoss = losers.length > 0
    ? Math.abs(losers.reduce((sum, t) => sum + t.pnlPercent, 0) / losers.length)
    : 0;
  
  const avgWinLeveraged = avgWin * CONFIG.leverage;
  const avgLossLeveraged = avgLoss * CONFIG.leverage;
  
  // Expected Value per trade
  const ev = (winRate * avgWin) - (lossRate * avgLoss);
  const evLeveraged = ev * CONFIG.leverage;
  
  // Profit Factor
  const grossProfit = winners.reduce((sum, t) => sum + t.pnlPercent, 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
  
  // Simulate equity curve for drawdown and sharpe
  let equity = CONFIG.initialCapital;
  let peak = equity;
  let maxDrawdown = 0;
  const returns = [];
  
  for (const trade of trades) {
    const riskAmount = equity * CONFIG.positionSizePercent;
    const pnl = riskAmount * (trade.pnlLeveraged / CONFIG.stopPercent); // normalize to risk unit
    
    const prevEquity = equity;
    equity += pnl;
    returns.push((equity - prevEquity) / prevEquity);
    
    if (equity > peak) peak = equity;
    const drawdown = (peak - equity) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  const finalEquity = equity;
  const totalReturn = (finalEquity - CONFIG.initialCapital) / CONFIG.initialCapital;
  
  // Sharpe Ratio (simplified, assuming 0 risk-free rate)
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(trades.length) : 0;
  
  // Kelly Criterion
  const b = avgWin / avgLoss; // win/loss ratio
  const kelly = avgLoss > 0 ? (winRate * b - lossRate) / b : 0;
  const halfKelly = kelly / 2;
  const quarterKelly = kelly / 4;
  
  // Buy and Hold comparison
  const buyHoldReturn = (finalPrice - initialPrice) / initialPrice;
  const buyHoldLeveraged = buyHoldReturn * CONFIG.leverage;
  
  return {
    // Trade stats
    totalTrades: trades.length,
    winners: winners.length,
    losers: losers.length,
    winRate: (winRate * 100).toFixed(1) + '%',
    winRateRaw: winRate,
    
    // P&L stats
    avgWin: (avgWin * 100).toFixed(2) + '%',
    avgLoss: (avgLoss * 100).toFixed(2) + '%',
    avgWinLeveraged: (avgWinLeveraged * 100).toFixed(2) + '%',
    avgLossLeveraged: (avgLossLeveraged * 100).toFixed(2) + '%',
    profitFactor: profitFactor.toFixed(2),
    
    // Expected Value
    evPerTrade: (ev * 100).toFixed(2) + '%',
    evPerTradeLeveraged: (evLeveraged * 100).toFixed(2) + '%',
    evRaw: ev,
    
    // Risk metrics
    maxDrawdown: (maxDrawdown * 100).toFixed(1) + '%',
    sharpeRatio: sharpe.toFixed(2),
    
    // Kelly
    kellyFraction: (kelly * 100).toFixed(1) + '%',
    halfKelly: (halfKelly * 100).toFixed(1) + '%',
    quarterKelly: (quarterKelly * 100).toFixed(1) + '%',
    recommendedRisk: (Math.max(0, Math.min(quarterKelly, 0.05)) * 100).toFixed(1) + '%',
    
    // Returns
    totalReturn: (totalReturn * 100).toFixed(1) + '%',
    finalEquity: finalEquity.toFixed(0),
    
    // Comparison
    buyHoldReturn: (buyHoldReturn * 100).toFixed(1) + '%',
    buyHoldLeveraged: (buyHoldLeveraged * 100).toFixed(1) + '%',
    beatsBuyHold: totalReturn > buyHoldLeveraged,
    
    // By exit reason
    exitReasons: {
      TP: trades.filter(t => t.exitReason === 'TP').length,
      STOP: trades.filter(t => t.exitReason === 'STOP').length,
      FLIP: trades.filter(t => t.exitReason === 'FLIP').length,
      END: trades.filter(t => t.exitReason === 'END').length,
    },
    
    // By direction
    longTrades: trades.filter(t => t.direction === 'LONG').length,
    shortTrades: trades.filter(t => t.direction === 'SHORT').length,
    longWinRate: trades.filter(t => t.direction === 'LONG').length > 0
      ? (trades.filter(t => t.direction === 'LONG' && t.pnlPercent > 0).length / 
         trades.filter(t => t.direction === 'LONG').length * 100).toFixed(1) + '%'
      : 'N/A',
    shortWinRate: trades.filter(t => t.direction === 'SHORT').length > 0
      ? (trades.filter(t => t.direction === 'SHORT' && t.pnlPercent > 0).length / 
         trades.filter(t => t.direction === 'SHORT').length * 100).toFixed(1) + '%'
      : 'N/A',
  };
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const days = args.includes('--days') 
    ? parseInt(args[args.indexOf('--days') + 1]) 
    : 730;
  const showJson = args.includes('--json');
  const showTrades = args.includes('--trades');
  
  console.log(`fetching ${days} days of BTC data...`);
  
  const dailyData = await fetchDailyKlines(days);
  if (!dailyData || dailyData.length < CONFIG.longEMA + 50) {
    console.error('insufficient data');
    process.exit(1);
  }
  
  console.log(`got ${dailyData.length} daily candles`);
  
  // Calculate EMAs
  const closes = dailyData.map(d => d.close);
  const ema20 = calculateEMA(closes, CONFIG.shortEMA);
  const ema200 = calculateEMA(closes, CONFIG.longEMA);
  
  // Generate signals
  const signals = generateSignals(dailyData, ema20, ema200);
  console.log(`generated ${signals.length} signal days`);
  
  // Simulate trades
  const trades = simulateTrades(signals);
  console.log(`simulated ${trades.length} trades\n`);
  
  // Calculate metrics
  const initialPrice = dailyData[CONFIG.longEMA].close;
  const finalPrice = dailyData[dailyData.length - 1].close;
  const metrics = calculateMetrics(trades, initialPrice, finalPrice);
  
  if (showJson) {
    console.log(JSON.stringify({ metrics, trades: showTrades ? trades : undefined }, null, 2));
    return;
  }
  
  // Pretty output
  console.log('═══════════════════════════════════════════════════════');
  console.log('  BTC EMA STRATEGY BACKTEST');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  period: ${dailyData[CONFIG.longEMA].time ? new Date(dailyData[CONFIG.longEMA].time).toISOString().split('T')[0] : 'N/A'} → ${new Date(dailyData[dailyData.length-1].time).toISOString().split('T')[0]}`);
  console.log(`  config: EMA ${CONFIG.shortEMA}/${CONFIG.longEMA}, stop ${CONFIG.stopPercent*100}%, TP ${CONFIG.takeProfitPercent*100}%, ${CONFIG.leverage}x`);
  console.log('');
  
  console.log('  TRADE STATS');
  console.log('  ───────────────────────────────────────────────────');
  console.log(`  total trades:     ${metrics.totalTrades}`);
  console.log(`  winners:          ${metrics.winners} (${metrics.winRate})`);
  console.log(`  losers:           ${metrics.losers}`);
  console.log(`  long/short:       ${metrics.longTrades}/${metrics.shortTrades}`);
  console.log(`  long win rate:    ${metrics.longWinRate}`);
  console.log(`  short win rate:   ${metrics.shortWinRate}`);
  console.log('');
  
  console.log('  P&L ANALYSIS');
  console.log('  ───────────────────────────────────────────────────');
  console.log(`  avg win:          ${metrics.avgWin} (${metrics.avgWinLeveraged} leveraged)`);
  console.log(`  avg loss:         ${metrics.avgLoss} (${metrics.avgLossLeveraged} leveraged)`);
  console.log(`  profit factor:    ${metrics.profitFactor}`);
  console.log(`  EV per trade:     ${metrics.evPerTrade} (${metrics.evPerTradeLeveraged} leveraged)`);
  console.log('');
  
  console.log('  RISK METRICS');
  console.log('  ───────────────────────────────────────────────────');
  console.log(`  max drawdown:     ${metrics.maxDrawdown}`);
  console.log(`  sharpe ratio:     ${metrics.sharpeRatio}`);
  console.log('');
  
  console.log('  KELLY CRITERION');
  console.log('  ───────────────────────────────────────────────────');
  console.log(`  full kelly:       ${metrics.kellyFraction}`);
  console.log(`  half kelly:       ${metrics.halfKelly}`);
  console.log(`  quarter kelly:    ${metrics.quarterKelly}`);
  console.log(`  → recommended:    ${metrics.recommendedRisk} risk per trade`);
  console.log('');
  
  console.log('  RETURNS');
  console.log('  ───────────────────────────────────────────────────');
  console.log(`  strategy return:  ${metrics.totalReturn} ($${CONFIG.initialCapital} → $${metrics.finalEquity})`);
  console.log(`  buy & hold:       ${metrics.buyHoldReturn} (${metrics.buyHoldLeveraged} at ${CONFIG.leverage}x)`);
  console.log(`  beats buy&hold:   ${metrics.beatsBuyHold ? '✓ YES' : '✗ NO'}`);
  console.log('');
  
  console.log('  EXIT REASONS');
  console.log('  ───────────────────────────────────────────────────');
  console.log(`  take profit:      ${metrics.exitReasons.TP}`);
  console.log(`  stop loss:        ${metrics.exitReasons.STOP}`);
  console.log(`  signal flip:      ${metrics.exitReasons.FLIP}`);
  console.log(`  end of period:    ${metrics.exitReasons.END}`);
  console.log('');
  
  // Verdict
  console.log('  VERDICT');
  console.log('  ───────────────────────────────────────────────────');
  if (metrics.evRaw > 0 && metrics.beatsBuyHold) {
    console.log('  ✓ POSITIVE EV + beats buy&hold');
    console.log(`  → strategy has edge. use ${metrics.recommendedRisk} position size.`);
  } else if (metrics.evRaw > 0) {
    console.log('  ⚠ POSITIVE EV but underperforms buy&hold');
    console.log('  → edge exists but not worth the complexity. consider simplifying.');
  } else {
    console.log('  ✗ NEGATIVE EV');
    console.log('  → strategy does not have edge. do not trade this.');
  }
  console.log('═══════════════════════════════════════════════════════\n');
  
  if (showTrades) {
    console.log('\nTRADE LOG:');
    console.log('─────────────────────────────────────────────────────────────────');
    for (const t of trades) {
      const emoji = t.pnlPercent > 0 ? '✓' : '✗';
      console.log(`${emoji} ${t.direction.padEnd(5)} ${t.entryDate} → ${t.exitDate} | entry: $${t.entry.toFixed(0)} exit: $${t.exit.toFixed(0)} | ${(t.pnlPercent * 100).toFixed(1)}% (${t.exitReason})`);
    }
  }
  
  // Save results
  const resultsFile = join(WORKSPACE, '.cache', 'btc-backtest-results.json');
  writeFileSync(resultsFile, JSON.stringify({ 
    runDate: new Date().toISOString(),
    config: CONFIG,
    metrics,
    trades 
  }, null, 2));
  console.log(`results saved to .cache/btc-backtest-results.json`);
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * BTC Strategy Backtester v2 — Testing Improvements
 * 
 * Option 2: Add filters (volume spike, RSI confirmation)
 * Option 3: Wider stops (8%, 10%, 12%)
 * 
 * Usage:
 *   ./scripts/btc-backtest-v2.mjs                    # run all variants
 *   ./scripts/btc-backtest-v2.mjs --variant filters  # only filtered version
 *   ./scripts/btc-backtest-v2.mjs --variant stops    # only wider stops
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

// --- Fetch Historical Data ---
async function fetchDailyKlines(days = 730) {
  const limit = Math.min(days, 1000);
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${limit}`;
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
}

// --- Indicators ---
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

function calculateRSI(prices, period = 14) {
  const rsi = [];
  let gains = 0, losses = 0;
  
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      rsi.push(50);
      continue;
    }
    
    const change = prices[i] - prices[i - 1];
    
    if (i <= period) {
      if (change > 0) gains += change;
      else losses -= change;
      
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      } else {
        rsi.push(50);
      }
    } else {
      const avgGain = gains / period;
      const avgLoss = losses / period;
      
      const currentGain = change > 0 ? change : 0;
      const currentLoss = change < 0 ? -change : 0;
      
      gains = (avgGain * (period - 1) + currentGain);
      losses = (avgLoss * (period - 1) + currentLoss);
      
      const rs = losses === 0 ? 100 : gains / losses;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  return rsi;
}

function calculateVolumeMA(volumes, period = 20) {
  const ma = [];
  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) {
      ma.push(volumes[i]);
    } else {
      const slice = volumes.slice(i - period + 1, i + 1);
      ma.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return ma;
}

// --- Regime Detection ---
function getRegime(price, ema200, chopZone = 0.03) {
  const distance = (price - ema200) / ema200;
  if (distance > chopZone) return 'BULL';
  if (distance < -chopZone) return 'BEAR';
  return 'CHOP';
}

// --- Strategy Variants ---
const VARIANTS = {
  baseline: {
    name: 'Baseline (current)',
    stopPercent: 0.06,
    takeProfitPercent: 0.12,
    useVolumeFilter: false,
    useRSIFilter: false,
    volumeMultiple: 1.5,
    rsiOverbought: 70,
    rsiOversold: 30,
  },
  
  // Option 2: Add filters
  filters_light: {
    name: 'Filters Light (volume only)',
    stopPercent: 0.06,
    takeProfitPercent: 0.12,
    useVolumeFilter: true,
    useRSIFilter: false,
    volumeMultiple: 1.3,
  },
  filters_full: {
    name: 'Filters Full (volume + RSI)',
    stopPercent: 0.06,
    takeProfitPercent: 0.12,
    useVolumeFilter: true,
    useRSIFilter: true,
    volumeMultiple: 1.3,
    rsiOverbought: 65,
    rsiOversold: 35,
  },
  filters_strict: {
    name: 'Filters Strict (high thresholds)',
    stopPercent: 0.06,
    takeProfitPercent: 0.12,
    useVolumeFilter: true,
    useRSIFilter: true,
    volumeMultiple: 1.5,
    rsiOverbought: 60,
    rsiOversold: 40,
  },
  
  // Option 3: Wider stops
  stop_8: {
    name: 'Stop 8% / TP 16%',
    stopPercent: 0.08,
    takeProfitPercent: 0.16,
    useVolumeFilter: false,
    useRSIFilter: false,
  },
  stop_10: {
    name: 'Stop 10% / TP 20%',
    stopPercent: 0.10,
    takeProfitPercent: 0.20,
    useVolumeFilter: false,
    useRSIFilter: false,
  },
  stop_12: {
    name: 'Stop 12% / TP 24%',
    stopPercent: 0.12,
    takeProfitPercent: 0.24,
    useVolumeFilter: false,
    useRSIFilter: false,
  },
  
  // Combined: filters + wider stop
  combined_best: {
    name: 'Combined (filters + 10% stop)',
    stopPercent: 0.10,
    takeProfitPercent: 0.20,
    useVolumeFilter: true,
    useRSIFilter: true,
    volumeMultiple: 1.3,
    rsiOverbought: 65,
    rsiOversold: 35,
  },
};

// --- Generate Signals with Filters ---
function generateSignals(dailyData, ema20, ema200, rsi, volumeMA, config) {
  const signals = [];
  
  for (let i = 200; i < dailyData.length; i++) {
    const candle = dailyData[i];
    const price = candle.close;
    const regime = getRegime(price, ema200[i]);
    const above20 = price > ema20[i];
    
    let signal = null;
    let filters = [];
    
    // Base signal
    if (regime === 'BULL' && above20) {
      signal = 'LONG';
    } else if (regime === 'BEAR' && !above20) {
      signal = 'SHORT';
    }
    
    // Apply filters if signal exists
    if (signal && config.useVolumeFilter) {
      const volumeSpike = candle.volume > volumeMA[i] * config.volumeMultiple;
      if (!volumeSpike) {
        filters.push('LOW_VOLUME');
        signal = null;
      }
    }
    
    if (signal && config.useRSIFilter) {
      const rsiVal = rsi[i];
      if (signal === 'LONG' && rsiVal > config.rsiOverbought) {
        filters.push('RSI_OVERBOUGHT');
        signal = null;
      }
      if (signal === 'SHORT' && rsiVal < config.rsiOversold) {
        filters.push('RSI_OVERSOLD');
        signal = null;
      }
    }
    
    signals.push({
      time: candle.time,
      date: new Date(candle.time).toISOString().split('T')[0],
      price,
      regime,
      signal,
      rsi: rsi[i],
      volumeRatio: candle.volume / volumeMA[i],
      filters,
    });
  }
  
  return signals;
}

// --- Simulate Trades ---
function simulateTrades(signals, config) {
  const trades = [];
  let position = null;
  
  for (let i = 1; i < signals.length; i++) {
    const prev = signals[i - 1];
    const curr = signals[i];
    
    if (position) {
      const pnlPercent = position.direction === 'LONG'
        ? (curr.price - position.entry) / position.entry
        : (position.entry - curr.price) / position.entry;
      
      if (pnlPercent <= -config.stopPercent) {
        trades.push({
          ...position,
          exit: position.entry * (1 - config.stopPercent * (position.direction === 'LONG' ? 1 : -1)),
          exitDate: curr.date,
          exitReason: 'STOP',
          pnlPercent: -config.stopPercent,
        });
        position = null;
      }
      else if (pnlPercent >= config.takeProfitPercent) {
        trades.push({
          ...position,
          exit: position.entry * (1 + config.takeProfitPercent * (position.direction === 'LONG' ? 1 : -1)),
          exitDate: curr.date,
          exitReason: 'TP',
          pnlPercent: config.takeProfitPercent,
        });
        position = null;
      }
      else if (curr.signal && curr.signal !== position.direction) {
        trades.push({
          ...position,
          exit: curr.price,
          exitDate: curr.date,
          exitReason: 'FLIP',
          pnlPercent,
        });
        position = null;
      }
    }
    
    if (!position && curr.signal && curr.signal !== prev.signal) {
      position = {
        direction: curr.signal,
        entry: curr.price,
        entryDate: curr.date,
        regime: curr.regime,
      };
    }
  }
  
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
    });
  }
  
  return trades;
}

// --- Calculate Metrics ---
function calculateMetrics(trades, initialPrice, finalPrice, config) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      ev: 0,
      maxDrawdown: 0,
      sharpe: 0,
      kelly: 0,
      totalReturn: 0,
      beatsBuyHold: false,
    };
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
  
  const ev = (winRate * avgWin) - (lossRate * avgLoss);
  
  const grossProfit = winners.reduce((sum, t) => sum + t.pnlPercent, 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  // Equity curve
  let equity = 10000;
  let peak = equity;
  let maxDrawdown = 0;
  const returns = [];
  
  for (const trade of trades) {
    const riskAmount = equity * 0.02;
    const pnl = riskAmount * (trade.pnlPercent * 3 / config.stopPercent);
    
    const prevEquity = equity;
    equity += pnl;
    returns.push((equity - prevEquity) / prevEquity);
    
    if (equity > peak) peak = equity;
    const drawdown = (peak - equity) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  const totalReturn = (equity - 10000) / 10000;
  
  // Sharpe
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdReturn = returns.length > 0 
    ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
    : 0;
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(trades.length) : 0;
  
  // Kelly
  const b = avgLoss > 0 ? avgWin / avgLoss : 0;
  const kelly = b > 0 ? (winRate * b - lossRate) / b : 0;
  
  // Buy and Hold
  const buyHoldReturn = (finalPrice - initialPrice) / initialPrice;
  
  return {
    totalTrades: trades.length,
    winners: winners.length,
    losers: losers.length,
    winRate,
    avgWin,
    avgLoss,
    ev,
    profitFactor,
    maxDrawdown,
    sharpe,
    kelly,
    totalReturn,
    finalEquity: equity,
    buyHoldReturn,
    beatsBuyHold: totalReturn > buyHoldReturn * 3,
    trades,
  };
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const variantFilter = args.includes('--variant') 
    ? args[args.indexOf('--variant') + 1] 
    : null;
  
  console.log('fetching BTC data...\n');
  
  const dailyData = await fetchDailyKlines(730);
  if (!dailyData || dailyData.length < 250) {
    console.error('insufficient data');
    process.exit(1);
  }
  
  // Calculate indicators
  const closes = dailyData.map(d => d.close);
  const volumes = dailyData.map(d => d.volume);
  const ema20 = calculateEMA(closes, 20);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes, 14);
  const volumeMA = calculateVolumeMA(volumes, 20);
  
  const initialPrice = dailyData[200].close;
  const finalPrice = dailyData[dailyData.length - 1].close;
  const buyHold = ((finalPrice - initialPrice) / initialPrice * 100).toFixed(1);
  const buyHold3x = ((finalPrice - initialPrice) / initialPrice * 300).toFixed(1);
  
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  BTC STRATEGY OPTIMIZATION — TESTING VARIANTS');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`  period: ${new Date(dailyData[200].time).toISOString().split('T')[0]} → ${new Date(dailyData[dailyData.length-1].time).toISOString().split('T')[0]}`);
  console.log(`  buy & hold: ${buyHold}% (${buyHold3x}% at 3x leverage)`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  const results = [];
  
  for (const [key, config] of Object.entries(VARIANTS)) {
    if (variantFilter && !key.includes(variantFilter)) continue;
    
    const signals = generateSignals(dailyData, ema20, ema200, rsi, volumeMA, config);
    const trades = simulateTrades(signals, config);
    const metrics = calculateMetrics(trades, initialPrice, finalPrice, config);
    
    results.push({ key, config, metrics });
    
    const ev = (metrics.ev * 100).toFixed(2);
    const wr = (metrics.winRate * 100).toFixed(1);
    const dd = (metrics.maxDrawdown * 100).toFixed(1);
    const ret = (metrics.totalReturn * 100).toFixed(1);
    const kelly = (metrics.kelly * 100).toFixed(1);
    const pf = metrics.profitFactor.toFixed(2);
    const sharpe = metrics.sharpe.toFixed(2);
    const beats = metrics.beatsBuyHold ? '✓' : '✗';
    
    console.log(`  ${config.name}`);
    console.log(`  ${'─'.repeat(70)}`);
    console.log(`  trades: ${metrics.totalTrades.toString().padEnd(3)} │ win rate: ${wr.padStart(5)}% │ EV/trade: ${ev.padStart(6)}% │ PF: ${pf.padStart(5)}`);
    console.log(`  return: ${ret.padStart(6)}% │ drawdown: ${dd.padStart(5)}% │ sharpe: ${sharpe.padStart(6)} │ kelly: ${kelly.padStart(5)}%`);
    console.log(`  beats buy&hold: ${beats}`);
    console.log('');
  }
  
  // Rank results
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  RANKING (by EV per trade)');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  results.sort((a, b) => b.metrics.ev - a.metrics.ev);
  
  for (let i = 0; i < results.length; i++) {
    const { config, metrics } = results[i];
    const ev = (metrics.ev * 100).toFixed(2);
    const wr = (metrics.winRate * 100).toFixed(1);
    const ret = (metrics.totalReturn * 100).toFixed(1);
    const beats = metrics.beatsBuyHold ? '✓' : '✗';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    
    console.log(`  ${medal} ${config.name.padEnd(35)} EV: ${ev.padStart(6)}%  WR: ${wr.padStart(5)}%  Return: ${ret.padStart(6)}%  ${beats}`);
  }
  
  console.log('\n');
  
  // Best variant analysis
  const best = results[0];
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  BEST VARIANT ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  console.log(`  winner: ${best.config.name}`);
  console.log(`  stop: ${best.config.stopPercent * 100}% / TP: ${best.config.takeProfitPercent * 100}%`);
  console.log(`  volume filter: ${best.config.useVolumeFilter ? 'yes (' + best.config.volumeMultiple + 'x)' : 'no'}`);
  console.log(`  RSI filter: ${best.config.useRSIFilter ? 'yes (' + best.config.rsiOversold + '/' + best.config.rsiOverbought + ')' : 'no'}`);
  console.log('');
  console.log(`  EV per trade:     ${(best.metrics.ev * 100).toFixed(2)}%`);
  console.log(`  win rate:         ${(best.metrics.winRate * 100).toFixed(1)}%`);
  console.log(`  avg win:          ${(best.metrics.avgWin * 100).toFixed(2)}%`);
  console.log(`  avg loss:         ${(best.metrics.avgLoss * 100).toFixed(2)}%`);
  console.log(`  profit factor:    ${best.metrics.profitFactor.toFixed(2)}`);
  console.log(`  max drawdown:     ${(best.metrics.maxDrawdown * 100).toFixed(1)}%`);
  console.log(`  sharpe:           ${best.metrics.sharpe.toFixed(2)}`);
  console.log(`  kelly:            ${(best.metrics.kelly * 100).toFixed(1)}%`);
  console.log(`  total return:     ${(best.metrics.totalReturn * 100).toFixed(1)}%`);
  console.log(`  beats buy&hold:   ${best.metrics.beatsBuyHold ? 'YES ✓' : 'NO ✗'}`);
  console.log('');
  
  if (best.metrics.ev > 0.005 && best.metrics.beatsBuyHold) {
    console.log('  VERDICT: ✓ TRADEABLE');
    console.log(`  → recommended risk: ${Math.min(best.metrics.kelly * 25, 5).toFixed(1)}% per trade (quarter kelly, capped)`);
  } else if (best.metrics.ev > 0) {
    console.log('  VERDICT: ⚠ MARGINAL EDGE');
    console.log('  → not worth trading costs. need more filters or different approach.');
  } else {
    console.log('  VERDICT: ✗ NO EDGE');
    console.log('  → do not trade. buy and hold outperforms.');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
  
  // Save results
  const resultsFile = join(WORKSPACE, '.cache', 'btc-backtest-v2-results.json');
  writeFileSync(resultsFile, JSON.stringify({ 
    runDate: new Date().toISOString(),
    buyHoldReturn: parseFloat(buyHold),
    results: results.map(r => ({
      variant: r.key,
      name: r.config.name,
      config: r.config,
      trades: r.metrics.totalTrades,
      winRate: r.metrics.winRate,
      ev: r.metrics.ev,
      profitFactor: r.metrics.profitFactor,
      maxDrawdown: r.metrics.maxDrawdown,
      sharpe: r.metrics.sharpe,
      kelly: r.metrics.kelly,
      totalReturn: r.metrics.totalReturn,
      beatsBuyHold: r.metrics.beatsBuyHold,
    }))
  }, null, 2));
  console.log(`results saved to .cache/btc-backtest-v2-results.json`);
}

main().catch(console.error);

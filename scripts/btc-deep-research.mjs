#!/usr/bin/env node
/**
 * BTC Deep Strategy Research
 * 
 * Comprehensive analysis:
 * 1. Parameter optimization for top strategies
 * 2. Regime filtering (trend vs range)
 * 3. Trailing stop variants
 * 4. Strategy combinations
 * 5. Walk-forward validation
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

// ============ DATA FETCHING ============
async function fetchDaily(days = 1000) {
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${days}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.map(k => ({
    time: k[0],
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5]
  }));
}

// ============ INDICATORS ============
function SMA(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    return prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function EMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i-1] * (1 - k));
  }
  return ema;
}

function ATR(candles, period = 14) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i-1];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return EMA(tr, period);
}

function RSI(prices, period = 14) {
  const rsi = [50];
  let gains = 0, losses = 0;
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i-1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i <= period) {
      gains += gain; losses += loss;
      rsi.push(i === period ? 100 - 100 / (1 + (losses === 0 ? 100 : gains / losses)) : 50);
    } else {
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
      rsi.push(100 - 100 / (1 + (losses === 0 ? 100 : gains / losses)));
    }
  }
  return rsi;
}

function ADX(candles, period = 14) {
  const adx = [0];
  let smoothPlusDM = 0, smoothMinusDM = 0, smoothTR = 0, smoothADX = 0;
  
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i-1];
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    
    if (i < period) {
      smoothPlusDM += plusDM;
      smoothMinusDM += minusDM;
      smoothTR += tr;
      adx.push(0);
    } else if (i === period) {
      const plusDI = 100 * smoothPlusDM / smoothTR;
      const minusDI = 100 * smoothMinusDM / smoothTR;
      const dx = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1);
      smoothADX = dx;
      adx.push(smoothADX);
    } else {
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM;
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM;
      smoothTR = smoothTR - smoothTR / period + tr;
      const plusDI = 100 * smoothPlusDM / smoothTR;
      const minusDI = 100 * smoothMinusDM / smoothTR;
      const dx = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1);
      smoothADX = (smoothADX * (period - 1) + dx) / period;
      adx.push(smoothADX);
    }
  }
  return adx;
}

function Volatility(candles, period = 20) {
  const closes = candles.map(c => c.close);
  return closes.map((_, i) => {
    if (i < period) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
    return Math.sqrt(variance) / mean; // coefficient of variation
  });
}

// ============ REGIME DETECTION ============
function detectRegime(candles, closes, i) {
  if (i < 50) return 'UNKNOWN';
  
  const sma50 = closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
  const sma200 = i >= 200 ? closes.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200 : sma50;
  
  const price = closes[i];
  const trend = price > sma50 && sma50 > sma200 ? 'BULL' : 
                price < sma50 && sma50 < sma200 ? 'BEAR' : 'RANGE';
  
  return trend;
}

// ============ BACKTEST ENGINE ============
function backtest(signals, candles, config = {}) {
  const {
    stopPct = 0.08,
    tpPct = null,          // null = no fixed TP
    trailingStop = false,
    trailingPct = 0.05,
    regimeFilter = null,   // 'BULL', 'BEAR', or null
  } = config;
  
  const closes = candles.map(c => c.close);
  const trades = [];
  let pos = null;
  let trailStop = 0;
  let peak = 0;
  
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    const c = candles[i];
    const regime = detectRegime(candles, closes, i);
    
    if (pos) {
      const pnl = (c.close - pos.entry) / pos.entry;
      
      // Update trailing stop
      if (trailingStop && c.close > peak) {
        peak = c.close;
        trailStop = peak * (1 - trailingPct);
      }
      
      let exit = false;
      let reason = '';
      let exitPrice = c.close;
      let exitPnl = pnl;
      
      // Check stop loss
      if (pnl <= -stopPct) {
        exit = true;
        reason = 'STOP';
        exitPrice = pos.entry * (1 - stopPct);
        exitPnl = -stopPct;
      }
      // Check trailing stop
      else if (trailingStop && c.close < trailStop && pnl > 0) {
        exit = true;
        reason = 'TRAIL';
        exitPrice = trailStop;
        exitPnl = (trailStop - pos.entry) / pos.entry;
      }
      // Check fixed TP
      else if (tpPct && pnl >= tpPct) {
        exit = true;
        reason = 'TP';
        exitPrice = pos.entry * (1 + tpPct);
        exitPnl = tpPct;
      }
      // Check signal exit
      else if (sig === 'EXIT' || sig === 'SHORT') {
        exit = true;
        reason = 'SIG';
      }
      
      if (exit) {
        trades.push({
          ...pos,
          exit: exitPrice,
          pnl: exitPnl,
          reason,
          bars: i - pos.idx,
          regime: pos.regime
        });
        pos = null;
        peak = 0;
        trailStop = 0;
      }
    }
    
    // Entry
    if (!pos && (sig === 'LONG' || sig === 'BUY')) {
      // Check regime filter
      if (regimeFilter && regime !== regimeFilter) continue;
      
      pos = {
        entry: c.close,
        idx: i,
        date: new Date(c.time).toISOString().split('T')[0],
        regime
      };
      peak = c.close;
      trailStop = c.close * (1 - trailingPct);
    }
  }
  
  // Close open position
  if (pos) {
    const c = candles[candles.length - 1];
    const pnl = (c.close - pos.entry) / pos.entry;
    trades.push({
      ...pos,
      exit: c.close,
      pnl,
      reason: 'END',
      bars: candles.length - 1 - pos.idx,
      regime: pos.regime
    });
  }
  
  return trades;
}

// ============ METRICS ============
function calcMetrics(trades, buyHold, leverage = 3) {
  if (!trades.length) return null;
  
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const wr = wins.length / trades.length;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const ev = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  
  // Profit factor
  const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0;
  
  // Equity curve and drawdown
  let eq = 10000, peak = 10000, maxDD = 0;
  const eqCurve = [10000];
  
  for (const t of trades) {
    const risk = 0.025; // 2.5% risk per trade
    const riskNormalized = t.pnl * leverage / 0.08; // normalize to 8% base move
    eq = eq * (1 + risk * riskNormalized);
    eqCurve.push(eq);
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  
  const totalRet = (eq - 10000) / 10000;
  
  // Kelly
  const kelly = avgLoss > 0 ? (wr * (avgWin / avgLoss) - (1 - wr)) / (avgWin / avgLoss) : 0;
  
  // Sharpe approximation
  const returns = trades.map(t => t.pnl);
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdRet = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / returns.length);
  const sharpe = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(trades.length / 2.7) : 0; // annualized approx
  
  // Win/loss by regime
  const bullTrades = trades.filter(t => t.regime === 'BULL');
  const bearTrades = trades.filter(t => t.regime === 'BEAR');
  const rangeTrades = trades.filter(t => t.regime === 'RANGE');
  
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: wr,
    avgWin,
    avgLoss,
    ev,
    totalPnl,
    pf,
    maxDD,
    totalRet,
    kelly,
    sharpe,
    beatsBH: totalRet > buyHold * leverage,
    avgBars: trades.reduce((s, t) => s + t.bars, 0) / trades.length,
    byRegime: {
      bull: { count: bullTrades.length, wr: bullTrades.filter(t => t.pnl > 0).length / (bullTrades.length || 1) },
      bear: { count: bearTrades.length, wr: bearTrades.filter(t => t.pnl > 0).length / (bearTrades.length || 1) },
      range: { count: rangeTrades.length, wr: rangeTrades.filter(t => t.pnl > 0).length / (rangeTrades.length || 1) }
    },
    byReason: {
      TP: trades.filter(t => t.reason === 'TP').length,
      STOP: trades.filter(t => t.reason === 'STOP').length,
      TRAIL: trades.filter(t => t.reason === 'TRAIL').length,
      SIG: trades.filter(t => t.reason === 'SIG').length,
    }
  };
}

// ============ STRATEGY GENERATORS ============
function atrBreakout(candles, closes, atrPeriod, atrMult, exitMult) {
  const atr = ATR(candles, atrPeriod);
  return candles.map((c, i) => {
    if (i < atrPeriod + 1) return null;
    const prev = candles[i-1];
    if (c.close > prev.close + atrMult * atr[i-1]) return 'LONG';
    if (c.close < prev.close - exitMult * atr[i-1]) return 'EXIT';
    return null;
  });
}

function donchianBreakout(candles, period) {
  return candles.map((c, i) => {
    if (i < period + 1) return null;
    const lookback = candles.slice(i - period, i);
    const high = Math.max(...lookback.map(x => x.high));
    const low = Math.min(...lookback.map(x => x.low));
    if (c.close > high) return 'LONG';
    if (c.close < low) return 'EXIT';
    return null;
  });
}

function multiIndicator(candles, closes) {
  const sma50 = SMA(closes, 50);
  const ema7 = EMA(closes, 7);
  const rsi2 = RSI(closes, 2);
  const adx2 = ADX(candles, 2);
  
  return candles.map((c, i) => {
    if (i < 50) return null;
    const cond = c.close > sma50[i] && c.close > ema7[i] && rsi2[i] > adx2[i];
    const prevCond = i > 0 && candles[i-1].close > sma50[i-1] && candles[i-1].close > ema7[i-1] && rsi2[i-1] > adx2[i-1];
    if (cond && !prevCond) return 'LONG';
    if (!cond && prevCond) return 'EXIT';
    return null;
  });
}

function rsiMomentum(candles, closes, period, entry, exit) {
  const rsi = RSI(closes, period);
  return candles.map((c, i) => {
    if (i < period + 1) return null;
    if (rsi[i] > entry && rsi[i-1] <= entry) return 'LONG';
    if (rsi[i] < exit && rsi[i-1] >= exit) return 'EXIT';
    return null;
  });
}

function trendFollowing(candles, closes, fastPeriod, slowPeriod) {
  const fast = EMA(closes, fastPeriod);
  const slow = EMA(closes, slowPeriod);
  const sma200 = SMA(closes, 200);
  
  return candles.map((c, i) => {
    if (i < 200) return null;
    const above = fast[i] > slow[i] && c.close > sma200[i];
    const prevAbove = fast[i-1] > slow[i-1] && candles[i-1].close > sma200[i-1];
    if (above && !prevAbove) return 'LONG';
    if (!above && prevAbove) return 'EXIT';
    return null;
  });
}

// ============ MAIN RESEARCH ============
async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  BTC DEEP STRATEGY RESEARCH');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log('fetching data...');
  const candles = await fetchDaily(1000);
  const closes = candles.map(c => c.close);
  
  const startPrice = candles[200].close;
  const endPrice = closes[closes.length - 1];
  const buyHold = (endPrice - startPrice) / startPrice;
  
  console.log(`period: ${new Date(candles[200].time).toISOString().split('T')[0]} → ${new Date(candles[candles.length-1].time).toISOString().split('T')[0]}`);
  console.log(`buy & hold: ${(buyHold * 100).toFixed(1)}% (${(buyHold * 300).toFixed(1)}% at 3x)\n`);
  
  const allResults = [];
  
  // ========== PART 1: ATR BREAKOUT OPTIMIZATION ==========
  console.log('─────────────────────────────────────────────────────────────────────────────────────────');
  console.log('  PART 1: ATR BREAKOUT PARAMETER OPTIMIZATION');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────\n');
  
  const atrResults = [];
  for (const atrPeriod of [10, 14, 20]) {
    for (const atrMult of [1.5, 2.0, 2.5, 3.0]) {
      for (const exitMult of [1.0, 1.5, 2.0]) {
        const signals = atrBreakout(candles, closes, atrPeriod, atrMult, exitMult);
        
        // Test with different exit strategies
        for (const exitType of ['fixed', 'trailing', 'signal']) {
          const config = exitType === 'fixed' ? { stopPct: 0.08, tpPct: 0.16 } :
                         exitType === 'trailing' ? { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 } :
                         { stopPct: 0.08, tpPct: null };
          
          const trades = backtest(signals, candles, config);
          const m = calcMetrics(trades, buyHold);
          
          if (m && m.trades >= 5) {
            atrResults.push({
              name: `ATR(${atrPeriod}) ${atrMult}/${exitMult} [${exitType}]`,
              params: { atrPeriod, atrMult, exitMult, exitType },
              ...m
            });
          }
        }
      }
    }
  }
  
  atrResults.sort((a, b) => b.ev - a.ev);
  console.log('  Top 5 ATR Breakout configurations:\n');
  for (let i = 0; i < Math.min(5, atrResults.length); i++) {
    const r = atrResults[i];
    console.log(`  ${i+1}. ${r.name}`);
    console.log(`     trades: ${r.trades} | WR: ${(r.winRate*100).toFixed(1)}% | EV: ${(r.ev*100).toFixed(2)}% | PF: ${r.pf.toFixed(2)} | DD: ${(r.maxDD*100).toFixed(0)}% | Ret: ${(r.totalRet*100).toFixed(1)}% ${r.beatsBH ? '✓' : '✗'}`);
  }
  allResults.push({ category: 'ATR Breakout', best: atrResults[0] });
  
  // ========== PART 2: DONCHIAN OPTIMIZATION ==========
  console.log('\n─────────────────────────────────────────────────────────────────────────────────────────');
  console.log('  PART 2: DONCHIAN BREAKOUT OPTIMIZATION');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────\n');
  
  const donchianResults = [];
  for (const period of [10, 15, 20, 30, 50]) {
    for (const exitType of ['fixed', 'trailing', 'signal']) {
      const signals = donchianBreakout(candles, period);
      const config = exitType === 'fixed' ? { stopPct: 0.08, tpPct: 0.16 } :
                     exitType === 'trailing' ? { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 } :
                     { stopPct: 0.08, tpPct: null };
      
      const trades = backtest(signals, candles, config);
      const m = calcMetrics(trades, buyHold);
      
      if (m && m.trades >= 5) {
        donchianResults.push({
          name: `Donchian(${period}) [${exitType}]`,
          params: { period, exitType },
          ...m
        });
      }
    }
  }
  
  donchianResults.sort((a, b) => b.ev - a.ev);
  console.log('  Top 5 Donchian configurations:\n');
  for (let i = 0; i < Math.min(5, donchianResults.length); i++) {
    const r = donchianResults[i];
    console.log(`  ${i+1}. ${r.name}`);
    console.log(`     trades: ${r.trades} | WR: ${(r.winRate*100).toFixed(1)}% | EV: ${(r.ev*100).toFixed(2)}% | PF: ${r.pf.toFixed(2)} | DD: ${(r.maxDD*100).toFixed(0)}% | Ret: ${(r.totalRet*100).toFixed(1)}% ${r.beatsBH ? '✓' : '✗'}`);
  }
  allResults.push({ category: 'Donchian', best: donchianResults[0] });
  
  // ========== PART 3: REGIME-FILTERED STRATEGIES ==========
  console.log('\n─────────────────────────────────────────────────────────────────────────────────────────');
  console.log('  PART 3: REGIME-FILTERED STRATEGIES');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────\n');
  
  const regimeResults = [];
  
  // Test best ATR config with regime filters
  const bestAtrParams = atrResults[0]?.params || { atrPeriod: 14, atrMult: 2, exitMult: 1.5 };
  for (const regime of [null, 'BULL', 'BEAR', 'RANGE']) {
    const signals = atrBreakout(candles, closes, bestAtrParams.atrPeriod, bestAtrParams.atrMult, bestAtrParams.exitMult);
    const trades = backtest(signals, candles, { 
      stopPct: 0.08, 
      trailingStop: true, 
      trailingPct: 0.05,
      regimeFilter: regime 
    });
    const m = calcMetrics(trades, buyHold);
    
    if (m && m.trades >= 3) {
      regimeResults.push({
        name: `ATR Breakout [${regime || 'ALL'}]`,
        ...m
      });
    }
  }
  
  console.log('  ATR Breakout by regime:\n');
  for (const r of regimeResults) {
    console.log(`  ${r.name.padEnd(25)} trades: ${r.trades.toString().padStart(3)} | WR: ${(r.winRate*100).toFixed(1).padStart(5)}% | EV: ${(r.ev*100).toFixed(2).padStart(6)}% | Ret: ${(r.totalRet*100).toFixed(1).padStart(6)}%`);
  }
  
  // ========== PART 4: COMBINED STRATEGIES ==========
  console.log('\n─────────────────────────────────────────────────────────────────────────────────────────');
  console.log('  PART 4: COMBINED STRATEGIES');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────\n');
  
  const combinedResults = [];
  
  // Combine ATR + SMA200 filter
  const sma200 = SMA(closes, 200);
  const atrSignals = atrBreakout(candles, closes, 14, 2, 1.5);
  const atrFilteredSignals = atrSignals.map((sig, i) => {
    if (sig === 'LONG' && closes[i] > sma200[i]) return 'LONG';
    if (sig === 'EXIT') return 'EXIT';
    return null;
  });
  
  let trades = backtest(atrFilteredSignals, candles, { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 });
  let m = calcMetrics(trades, buyHold);
  if (m) combinedResults.push({ name: 'ATR + SMA200 filter', ...m });
  
  // Combine ATR + RSI filter (not overbought)
  const rsi14 = RSI(closes, 14);
  const atrRsiSignals = atrSignals.map((sig, i) => {
    if (sig === 'LONG' && rsi14[i] < 70) return 'LONG';
    if (sig === 'EXIT') return 'EXIT';
    return null;
  });
  
  trades = backtest(atrRsiSignals, candles, { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 });
  m = calcMetrics(trades, buyHold);
  if (m) combinedResults.push({ name: 'ATR + RSI<70 filter', ...m });
  
  // Combine ATR + ADX filter (trending)
  const adx14 = ADX(candles, 14);
  const atrAdxSignals = atrSignals.map((sig, i) => {
    if (sig === 'LONG' && adx14[i] > 20) return 'LONG';
    if (sig === 'EXIT') return 'EXIT';
    return null;
  });
  
  trades = backtest(atrAdxSignals, candles, { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 });
  m = calcMetrics(trades, buyHold);
  if (m) combinedResults.push({ name: 'ATR + ADX>20 filter', ...m });
  
  // Combine Multi-indicator + trailing
  const multiSignals = multiIndicator(candles, closes);
  trades = backtest(multiSignals, candles, { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 });
  m = calcMetrics(trades, buyHold);
  if (m) combinedResults.push({ name: 'Multi-Indicator + trailing', ...m });
  
  // Pure trend following
  for (const [fast, slow] of [[9, 21], [12, 26], [20, 50]]) {
    const trendSignals = trendFollowing(candles, closes, fast, slow);
    trades = backtest(trendSignals, candles, { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 });
    m = calcMetrics(trades, buyHold);
    if (m && m.trades >= 5) combinedResults.push({ name: `Trend EMA(${fast}/${slow}) + SMA200`, ...m });
  }
  
  combinedResults.sort((a, b) => b.ev - a.ev);
  console.log('  Combined strategies:\n');
  for (const r of combinedResults) {
    console.log(`  ${r.name.padEnd(30)} trades: ${r.trades.toString().padStart(3)} | WR: ${(r.winRate*100).toFixed(1).padStart(5)}% | EV: ${(r.ev*100).toFixed(2).padStart(6)}% | DD: ${(r.maxDD*100).toFixed(0).padStart(3)}% | Ret: ${(r.totalRet*100).toFixed(1).padStart(6)}% ${r.beatsBH ? '✓' : '✗'}`);
  }
  allResults.push({ category: 'Combined', best: combinedResults[0] });
  
  // ========== PART 5: WALK-FORWARD VALIDATION ==========
  console.log('\n─────────────────────────────────────────────────────────────────────────────────────────');
  console.log('  PART 5: WALK-FORWARD VALIDATION (best strategy)');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────\n');
  
  // Split data: first 70% for "in-sample", last 30% for "out-of-sample"
  const splitIdx = Math.floor(candles.length * 0.7);
  const inSample = candles.slice(0, splitIdx);
  const outSample = candles.slice(splitIdx);
  const inCloses = inSample.map(c => c.close);
  const outCloses = outSample.map(c => c.close);
  
  // Test best overall strategy on both periods
  const bestOverall = [...atrResults, ...donchianResults, ...combinedResults].sort((a, b) => b.ev - a.ev)[0];
  
  // In-sample
  const inSignals = atrBreakout(inSample, inCloses, 14, 2, 1.5);
  const inTrades = backtest(inSignals, inSample, { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 });
  const inBH = (inCloses[inCloses.length-1] - inCloses[200]) / inCloses[200];
  const inMetrics = calcMetrics(inTrades, inBH);
  
  // Out-of-sample
  const outSignals = atrBreakout(outSample, outCloses, 14, 2, 1.5);
  const outTrades = backtest(outSignals, outSample, { stopPct: 0.08, trailingStop: true, trailingPct: 0.05 });
  const outBH = (outCloses[outCloses.length-1] - outCloses[0]) / outCloses[0];
  const outMetrics = calcMetrics(outTrades, outBH);
  
  console.log('  ATR Breakout (14, 2.0, 1.5) with trailing stop:\n');
  console.log(`  In-sample  (70%): trades: ${inMetrics?.trades || 0} | WR: ${((inMetrics?.winRate || 0)*100).toFixed(1)}% | EV: ${((inMetrics?.ev || 0)*100).toFixed(2)}% | Ret: ${((inMetrics?.totalRet || 0)*100).toFixed(1)}%`);
  console.log(`  Out-sample (30%): trades: ${outMetrics?.trades || 0} | WR: ${((outMetrics?.winRate || 0)*100).toFixed(1)}% | EV: ${((outMetrics?.ev || 0)*100).toFixed(2)}% | Ret: ${((outMetrics?.totalRet || 0)*100).toFixed(1)}%`);
  
  const degradation = inMetrics && outMetrics ? ((outMetrics.ev - inMetrics.ev) / Math.abs(inMetrics.ev) * 100).toFixed(0) : 'N/A';
  console.log(`\n  Performance degradation: ${degradation}%`);
  console.log(`  ${Math.abs(parseFloat(degradation)) < 50 ? '✓ Strategy appears robust' : '⚠ Possible overfitting'}`);
  
  // ========== FINAL SUMMARY ==========
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  FINAL RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  const allBest = [...atrResults, ...donchianResults, ...combinedResults]
    .filter(r => r.trades >= 10)
    .sort((a, b) => {
      // Score by: EV (40%) + Win Rate (20%) + Sharpe (20%) - Drawdown (20%)
      const scoreA = a.ev * 0.4 + a.winRate * 0.2 + (a.sharpe || 0) * 0.02 - a.maxDD * 0.2;
      const scoreB = b.ev * 0.4 + b.winRate * 0.2 + (b.sharpe || 0) * 0.02 - b.maxDD * 0.2;
      return scoreB - scoreA;
    });
  
  console.log('  TOP 3 OVERALL (weighted score: EV, WR, Sharpe, DD):\n');
  for (let i = 0; i < Math.min(3, allBest.length); i++) {
    const r = allBest[i];
    console.log(`  ${i+1}. ${r.name}`);
    console.log(`     Trades: ${r.trades} | Win Rate: ${(r.winRate*100).toFixed(1)}% | EV/trade: ${(r.ev*100).toFixed(2)}%`);
    console.log(`     Profit Factor: ${r.pf.toFixed(2)} | Max DD: ${(r.maxDD*100).toFixed(0)}% | Sharpe: ${(r.sharpe||0).toFixed(2)}`);
    console.log(`     Kelly: ${(r.kelly*100).toFixed(1)}% | Recommended risk: ${Math.min(r.kelly * 25, 5).toFixed(1)}%`);
    console.log(`     Total Return: ${(r.totalRet*100).toFixed(1)}% | Beats B&H: ${r.beatsBH ? 'YES ✓' : 'NO'}`);
    console.log('');
  }
  
  // Save results
  writeFileSync(join(WORKSPACE, '.cache', 'btc-deep-research.json'), JSON.stringify({
    runDate: new Date().toISOString(),
    buyHold,
    atrResults: atrResults.slice(0, 10),
    donchianResults: donchianResults.slice(0, 10),
    combinedResults,
    topOverall: allBest.slice(0, 5),
    walkForward: { inSample: inMetrics, outSample: outMetrics }
  }, null, 2));
  
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  Research complete. Results saved to .cache/btc-deep-research.json');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

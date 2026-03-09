#!/usr/bin/env node
/**
 * BTC Strategy Lab — Mega Backtester
 * 
 * Tests 12+ strategies found online against historical data
 * All on daily timeframe for consistency
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

// Fetch data
async function fetchDaily(days = 1000) {
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${days}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.map(k => ({
    time: k[0],
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5]
  }));
}

// Indicators
function SMA(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const slice = prices.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
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

function RSI(prices, period = 14) {
  const rsi = [50];
  let gains = 0, losses = 0;
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i-1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        const rs = losses === 0 ? 100 : gains / losses;
        rsi.push(100 - 100 / (1 + rs));
      } else {
        rsi.push(50);
      }
    } else {
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  return rsi;
}

function ATR(candles, period = 14) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i-1];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return EMA(tr, period);
}

function MACD(prices, fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(prices, fast);
  const emaSlow = EMA(prices, slow);
  const macd = emaFast.map((f, i) => f - emaSlow[i]);
  const sig = EMA(macd, signal);
  return { macd, signal: sig, histogram: macd.map((m, i) => m - sig[i]) };
}

function BollingerBands(prices, period = 20, mult = 2) {
  const sma = SMA(prices, period);
  return prices.map((p, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null, width: null };
    const slice = prices.slice(i - period + 1, i + 1);
    const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - sma[i], 2), 0) / period);
    return {
      upper: sma[i] + mult * std,
      middle: sma[i],
      lower: sma[i] - mult * std,
      width: (2 * mult * std) / sma[i]
    };
  });
}

function SuperTrend(candles, period = 10, mult = 3) {
  const atr = ATR(candles, period);
  const st = [];
  let trend = 1;
  let upperBand = 0, lowerBand = 0;
  
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const hl2 = (c.high + c.low) / 2;
    const newUpper = hl2 + mult * atr[i];
    const newLower = hl2 - mult * atr[i];
    
    if (i === 0) {
      upperBand = newUpper;
      lowerBand = newLower;
    } else {
      upperBand = newUpper < upperBand || candles[i-1].close > upperBand ? newUpper : upperBand;
      lowerBand = newLower > lowerBand || candles[i-1].close < lowerBand ? newLower : lowerBand;
      
      if (trend === 1 && c.close < lowerBand) trend = -1;
      else if (trend === -1 && c.close > upperBand) trend = 1;
    }
    
    st.push({ trend, upper: upperBand, lower: lowerBand, value: trend === 1 ? lowerBand : upperBand });
  }
  return st;
}

function ADX(candles, period = 14) {
  const adx = [0];
  let prevPlusDM = 0, prevMinusDM = 0, prevTR = 0;
  let prevDX = 0;
  
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i-1];
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    
    if (i <= period) {
      prevPlusDM += plusDM;
      prevMinusDM += minusDM;
      prevTR += tr;
      adx.push(0);
    } else {
      prevPlusDM = prevPlusDM - prevPlusDM/period + plusDM;
      prevMinusDM = prevMinusDM - prevMinusDM/period + minusDM;
      prevTR = prevTR - prevTR/period + tr;
      
      const plusDI = 100 * prevPlusDM / prevTR;
      const minusDI = 100 * prevMinusDM / prevTR;
      const dx = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1);
      
      prevDX = (prevDX * (period - 1) + dx) / period;
      adx.push(prevDX);
    }
  }
  return adx;
}

function DonchianChannel(candles, period = 20) {
  return candles.map((_, i) => {
    if (i < period - 1) return { upper: null, lower: null };
    const slice = candles.slice(i - period + 1, i + 1);
    return {
      upper: Math.max(...slice.map(c => c.high)),
      lower: Math.min(...slice.map(c => c.low))
    };
  });
}

// Strategy definitions
const STRATEGIES = {
  // 1. RSI Momentum (counterintuitive - buy strength)
  rsi_momentum: {
    name: 'RSI(5) Momentum',
    desc: 'Buy when RSI > 70 (momentum), exit when < 50',
    fn: (candles, closes) => {
      const rsi = RSI(closes, 5);
      return candles.map((c, i) => {
        if (i < 5) return null;
        if (rsi[i] > 70 && rsi[i-1] <= 70) return 'LONG';
        if (rsi[i] < 50 && rsi[i-1] >= 50) return 'EXIT';
        return null;
      });
    }
  },
  
  // 2. RSI Mean Reversion (classic - buy weakness)
  rsi_reversion: {
    name: 'RSI(14) Mean Reversion',
    desc: 'Buy when RSI < 30, exit when > 70',
    fn: (candles, closes) => {
      const rsi = RSI(closes, 14);
      return candles.map((c, i) => {
        if (i < 14) return null;
        if (rsi[i] < 30 && rsi[i-1] >= 30) return 'LONG';
        if (rsi[i] > 70 && rsi[i-1] <= 70) return 'EXIT';
        return null;
      });
    }
  },
  
  // 3. Golden Cross (50/200 SMA)
  golden_cross: {
    name: 'Golden/Death Cross',
    desc: 'Long when 50 SMA > 200 SMA',
    fn: (candles, closes) => {
      const sma50 = SMA(closes, 50);
      const sma200 = SMA(closes, 200);
      return candles.map((c, i) => {
        if (i < 200) return null;
        const cross = sma50[i] > sma200[i];
        const prevCross = sma50[i-1] > sma200[i-1];
        if (cross && !prevCross) return 'LONG';
        if (!cross && prevCross) return 'EXIT';
        return null;
      });
    }
  },
  
  // 4. MACD Crossover
  macd_cross: {
    name: 'MACD Crossover',
    desc: 'Long when MACD crosses above signal',
    fn: (candles, closes) => {
      const { macd, signal } = MACD(closes);
      return candles.map((c, i) => {
        if (i < 26) return null;
        const above = macd[i] > signal[i];
        const prevAbove = macd[i-1] > signal[i-1];
        if (above && !prevAbove) return 'LONG';
        if (!above && prevAbove) return 'EXIT';
        return null;
      });
    }
  },
  
  // 5. SuperTrend
  supertrend: {
    name: 'SuperTrend (10,3)',
    desc: 'Follow SuperTrend direction',
    fn: (candles, closes) => {
      const st = SuperTrend(candles, 10, 3);
      return candles.map((c, i) => {
        if (i < 10) return null;
        if (st[i].trend === 1 && st[i-1].trend === -1) return 'LONG';
        if (st[i].trend === -1 && st[i-1].trend === 1) return 'EXIT';
        return null;
      });
    }
  },
  
  // 6. Bollinger Squeeze Breakout
  bb_squeeze: {
    name: 'Bollinger Squeeze',
    desc: 'Enter on low volatility breakout',
    fn: (candles, closes) => {
      const bb = BollingerBands(closes, 20, 2);
      const widths = bb.map(b => b.width).filter(w => w !== null);
      const minWidth = Math.min(...widths.slice(-100));
      
      return candles.map((c, i) => {
        if (i < 25) return null;
        const squeeze = bb[i-1].width && bb[i-1].width < minWidth * 1.2;
        if (squeeze && c.close > bb[i].upper) return 'LONG';
        if (c.close < bb[i].middle) return 'EXIT';
        return null;
      });
    }
  },
  
  // 7. EMA 20/50 Cross
  ema_cross: {
    name: 'EMA 20/50 Cross',
    desc: 'Fast EMA crosses slow EMA',
    fn: (candles, closes) => {
      const ema20 = EMA(closes, 20);
      const ema50 = EMA(closes, 50);
      return candles.map((c, i) => {
        if (i < 50) return null;
        const above = ema20[i] > ema50[i];
        const prevAbove = ema20[i-1] > ema50[i-1];
        if (above && !prevAbove) return 'LONG';
        if (!above && prevAbove) return 'EXIT';
        return null;
      });
    }
  },
  
  // 8. Price > SMA200 (trend filter)
  sma200_trend: {
    name: 'SMA 200 Trend',
    desc: 'Long only above 200 SMA',
    fn: (candles, closes) => {
      const sma = SMA(closes, 200);
      return candles.map((c, i) => {
        if (i < 200) return null;
        const above = c.close > sma[i];
        const prevAbove = candles[i-1].close > sma[i-1];
        if (above && !prevAbove) return 'LONG';
        if (!above && prevAbove) return 'EXIT';
        return null;
      });
    }
  },
  
  // 9. Donchian Breakout (Turtle style)
  donchian: {
    name: 'Donchian Breakout (20)',
    desc: '20-day high breakout',
    fn: (candles, closes) => {
      const dc = DonchianChannel(candles, 20);
      return candles.map((c, i) => {
        if (i < 21) return null;
        if (c.close > dc[i-1].upper) return 'LONG';
        if (c.close < dc[i-1].lower) return 'EXIT';
        return null;
      });
    }
  },
  
  // 10. ADX Trend Strength
  adx_trend: {
    name: 'ADX + EMA',
    desc: 'Long when ADX > 25 and price > EMA 20',
    fn: (candles, closes) => {
      const adx = ADX(candles, 14);
      const ema = EMA(closes, 20);
      return candles.map((c, i) => {
        if (i < 20) return null;
        const strong = adx[i] > 25 && c.close > ema[i];
        const prevStrong = adx[i-1] > 25 && candles[i-1].close > ema[i-1];
        if (strong && !prevStrong) return 'LONG';
        if (!strong && prevStrong) return 'EXIT';
        return null;
      });
    }
  },
  
  // 11. Multi-indicator (from Reddit)
  multi_indicator: {
    name: 'Multi-Indicator',
    desc: 'Close > SMA50, > EMA7, RSI(2) > ADX(2)',
    fn: (candles, closes) => {
      const sma50 = SMA(closes, 50);
      const ema7 = EMA(closes, 7);
      const rsi2 = RSI(closes, 2);
      const adx2 = ADX(candles, 2);
      return candles.map((c, i) => {
        if (i < 50) return null;
        const cond = c.close > sma50[i] && c.close > ema7[i] && rsi2[i] > adx2[i];
        const prevCond = candles[i-1].close > sma50[i-1] && candles[i-1].close > ema7[i-1] && rsi2[i-1] > adx2[i-1];
        if (cond && !prevCond) return 'LONG';
        if (!cond && prevCond) return 'EXIT';
        return null;
      });
    }
  },
  
  // 12. ATR Breakout
  atr_breakout: {
    name: 'ATR Breakout',
    desc: 'Price breaks above prev close + 2*ATR',
    fn: (candles, closes) => {
      const atr = ATR(candles, 14);
      return candles.map((c, i) => {
        if (i < 15) return null;
        const breakout = c.close > candles[i-1].close + 2 * atr[i-1];
        if (breakout) return 'LONG';
        if (c.close < candles[i-1].close - 1.5 * atr[i-1]) return 'EXIT';
        return null;
      });
    }
  },
};

// Backtest engine
function backtest(signals, candles, stopPct = 0.08, tpPct = 0.16) {
  const trades = [];
  let pos = null;
  
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    const c = candles[i];
    
    if (pos) {
      const pnl = (c.close - pos.entry) / pos.entry;
      
      if (pnl <= -stopPct) {
        trades.push({ ...pos, exit: pos.entry * (1 - stopPct), pnl: -stopPct, reason: 'STOP', bars: i - pos.idx });
        pos = null;
      } else if (pnl >= tpPct) {
        trades.push({ ...pos, exit: pos.entry * (1 + tpPct), pnl: tpPct, reason: 'TP', bars: i - pos.idx });
        pos = null;
      } else if (sig === 'EXIT') {
        trades.push({ ...pos, exit: c.close, pnl, reason: 'SIG', bars: i - pos.idx });
        pos = null;
      }
    }
    
    if (!pos && sig === 'LONG') {
      pos = { entry: c.close, idx: i, date: new Date(c.time).toISOString().split('T')[0] };
    }
  }
  
  // Close open
  if (pos) {
    const c = candles[candles.length - 1];
    const pnl = (c.close - pos.entry) / pos.entry;
    trades.push({ ...pos, exit: c.close, pnl, reason: 'END', bars: candles.length - 1 - pos.idx });
  }
  
  return trades;
}

// Calculate metrics
function metrics(trades, buyHold) {
  if (!trades.length) return null;
  
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const wr = wins.length / trades.length;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const ev = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const pf = avgLoss ? (wr * avgWin) / ((1 - wr) * avgLoss) : 0;
  
  // Equity curve
  let eq = 10000, peak = 10000, maxDD = 0;
  for (const t of trades) {
    eq *= (1 + t.pnl * 3 * 0.025 / 0.08); // normalized
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  
  const totalRet = (eq - 10000) / 10000;
  const kelly = avgLoss > 0 ? (wr * (avgWin / avgLoss) - (1 - wr)) / (avgWin / avgLoss) : 0;
  
  return {
    trades: trades.length,
    winRate: wr,
    avgWin, avgLoss, ev, pf, maxDD, totalRet, kelly,
    beatsBH: totalRet > buyHold * 3,
    avgBars: trades.reduce((s, t) => s + t.bars, 0) / trades.length,
  };
}

async function main() {
  console.log('fetching data...\n');
  const candles = await fetchDaily(1000);
  const closes = candles.map(c => c.close);
  
  const startPrice = candles[200].close;
  const endPrice = closes[closes.length - 1];
  const buyHold = (endPrice - startPrice) / startPrice;
  
  const startDate = new Date(candles[200].time).toISOString().split('T')[0];
  const endDate = new Date(candles[candles.length-1].time).toISOString().split('T')[0];
  
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  BTC STRATEGY LAB — MEGA BACKTEST');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(`  period: ${startDate} → ${endDate} (${candles.length} days)`);
  console.log(`  buy & hold: ${(buyHold * 100).toFixed(1)}% (${(buyHold * 300).toFixed(1)}% at 3x)`);
  console.log(`  stop: 8%, TP: 16%, risk: 2.5%/trade`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  const results = [];
  
  for (const [key, strat] of Object.entries(STRATEGIES)) {
    const signals = strat.fn(candles, closes);
    const trades = backtest(signals, candles, 0.08, 0.16);
    const m = metrics(trades, buyHold);
    
    if (m) {
      results.push({ key, name: strat.name, desc: strat.desc, ...m });
      
      const beats = m.beatsBH ? '✓' : '✗';
      console.log(`  ${strat.name.padEnd(24)} │ trades: ${m.trades.toString().padStart(3)} │ WR: ${(m.winRate*100).toFixed(1).padStart(5)}% │ EV: ${(m.ev*100).toFixed(2).padStart(6)}% │ PF: ${m.pf.toFixed(2).padStart(5)} │ DD: ${(m.maxDD*100).toFixed(0).padStart(3)}% │ Ret: ${(m.totalRet*100).toFixed(1).padStart(6)}% ${beats}`);
    }
  }
  
  // Rank by EV
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  RANKING BY EXPECTED VALUE');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  results.sort((a, b) => b.ev - a.ev);
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    const beats = r.beatsBH ? '✓' : '✗';
    console.log(`  ${medal} ${r.name.padEnd(24)} EV: ${(r.ev*100).toFixed(2).padStart(6)}%  WR: ${(r.winRate*100).toFixed(1).padStart(5)}%  Kelly: ${(r.kelly*100).toFixed(1).padStart(5)}%  Return: ${(r.totalRet*100).toFixed(1).padStart(6)}% ${beats}`);
  }
  
  // Top 3 analysis
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  TOP 3 STRATEGIES');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  for (let i = 0; i < 3 && i < results.length; i++) {
    const r = results[i];
    console.log(`  #${i+1} ${r.name}`);
    console.log(`      ${r.desc}`);
    console.log(`      trades: ${r.trades} | win rate: ${(r.winRate*100).toFixed(1)}% | avg win: ${(r.avgWin*100).toFixed(1)}% | avg loss: ${(r.avgLoss*100).toFixed(1)}%`);
    console.log(`      EV: ${(r.ev*100).toFixed(2)}% | PF: ${r.pf.toFixed(2)} | max DD: ${(r.maxDD*100).toFixed(0)}% | kelly: ${(r.kelly*100).toFixed(1)}%`);
    console.log(`      return: ${(r.totalRet*100).toFixed(1)}% | beats B&H: ${r.beatsBH ? 'YES' : 'NO'} | avg hold: ${r.avgBars.toFixed(0)} days`);
    console.log('');
  }
  
  // Strategies that beat buy & hold
  const winners = results.filter(r => r.beatsBH);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(`  STRATEGIES THAT BEAT BUY & HOLD: ${winners.length}/${results.length}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  if (winners.length) {
    for (const w of winners) {
      console.log(`  ✓ ${w.name}: ${(w.totalRet*100).toFixed(1)}% return (B&H: ${(buyHold*300).toFixed(1)}%)`);
    }
  } else {
    console.log('  None. Consider: longer timeframes, different stop/TP, or combined strategies.');
  }
  
  console.log('\n');
  
  // Save
  writeFileSync(join(WORKSPACE, '.cache', 'btc-strategy-lab-results.json'), JSON.stringify({
    runDate: new Date().toISOString(),
    period: { start: startDate, end: endDate },
    buyHold,
    results: results.map(r => ({ ...r }))
  }, null, 2));
  
  console.log('saved to .cache/btc-strategy-lab-results.json\n');
}

main().catch(console.error);

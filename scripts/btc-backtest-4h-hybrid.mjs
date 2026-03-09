#!/usr/bin/env node
/**
 * BTC 4H 200 EMA Hybrid Strategy
 * 
 * Entry: 4H close crosses 200 EMA
 * Exit: EITHER fixed stop/TP OR EMA cross back (whichever first)
 * 
 * Tests multiple stop levels to find optimal
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');

async function fetch4HKlines(days = 730) {
  const allCandles = [];
  let endTime = Date.now();
  const totalNeeded = days * 6;
  
  while (allCandles.length < totalNeeded) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=1000&endTime=${endTime}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data || data.length === 0) break;
    
    const candles = data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
    }));
    
    allCandles.unshift(...candles);
    endTime = data[0][0] - 1;
    await new Promise(r => setTimeout(r, 100));
  }
  
  const seen = new Set();
  return allCandles.filter(c => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  }).sort((a, b) => a.time - b.time);
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [];
  let val = prices[0];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      val = prices.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
    } else {
      val = prices[i] * k + val * (1 - k);
    }
    ema.push(val);
  }
  return ema;
}

function backtest(candles, ema200, config) {
  const { stopPercent, tpPercent, leverage = 3 } = config;
  const trades = [];
  let position = null;
  
  for (let i = 201; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const ema = ema200[i];
    const prevEma = ema200[i - 1];
    
    const above = c.close > ema;
    const prevAbove = prev.close > prevEma;
    
    if (position) {
      const pnl = position.direction === 'LONG'
        ? (c.close - position.entry) / position.entry
        : (position.entry - c.close) / position.entry;
      
      let exit = false;
      let reason = '';
      
      // Check stop
      if (pnl <= -stopPercent) {
        exit = true;
        reason = 'STOP';
      }
      // Check TP
      else if (pnl >= tpPercent) {
        exit = true;
        reason = 'TP';
      }
      // Check EMA cross back
      else if ((position.direction === 'LONG' && !above) || 
               (position.direction === 'SHORT' && above)) {
        exit = true;
        reason = 'EMA';
      }
      
      if (exit) {
        let exitPrice = c.close;
        let exitPnl = pnl;
        
        if (reason === 'STOP') {
          exitPrice = position.entry * (1 + (position.direction === 'LONG' ? -stopPercent : stopPercent));
          exitPnl = -stopPercent;
        } else if (reason === 'TP') {
          exitPrice = position.entry * (1 + (position.direction === 'LONG' ? tpPercent : -tpPercent));
          exitPnl = tpPercent;
        }
        
        trades.push({
          ...position,
          exit: exitPrice,
          exitDate: new Date(c.time).toISOString().split('T')[0],
          pnl: exitPnl,
          reason,
          bars: i - position.entryIdx,
        });
        position = null;
      }
    }
    
    // Entry on cross
    if (!position) {
      if (above && !prevAbove) {
        position = {
          direction: 'LONG',
          entry: c.close,
          entryDate: new Date(c.time).toISOString().split('T')[0],
          entryIdx: i,
        };
      } else if (!above && prevAbove) {
        position = {
          direction: 'SHORT',
          entry: c.close,
          entryDate: new Date(c.time).toISOString().split('T')[0],
          entryIdx: i,
        };
      }
    }
  }
  
  // Close open position
  if (position) {
    const last = candles[candles.length - 1];
    const pnl = position.direction === 'LONG'
      ? (last.close - position.entry) / position.entry
      : (position.entry - last.close) / position.entry;
    trades.push({
      ...position,
      exit: last.close,
      exitDate: new Date(last.time).toISOString().split('T')[0],
      pnl,
      reason: 'END',
      bars: candles.length - 1 - position.entryIdx,
    });
  }
  
  return trades;
}

function calcMetrics(trades, leverage = 3) {
  const closed = trades.filter(t => t.reason !== 'END');
  if (closed.length === 0) return null;
  
  const wins = closed.filter(t => t.pnl > 0);
  const losses = closed.filter(t => t.pnl <= 0);
  
  const winRate = wins.length / closed.length;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const ev = closed.reduce((s, t) => s + t.pnl, 0) / closed.length;
  
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  
  // Equity curve
  let equity = 10000;
  let peak = equity;
  let maxDD = 0;
  
  for (const t of closed) {
    const risk = equity * 0.025;
    equity += risk * (t.pnl * leverage / 0.08);
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  
  const kelly = avgLoss > 0 ? (winRate * (avgWin / avgLoss) - (1 - winRate)) / (avgWin / avgLoss) : 0;
  
  // Exit reasons
  const byReason = {
    STOP: closed.filter(t => t.reason === 'STOP').length,
    TP: closed.filter(t => t.reason === 'TP').length,
    EMA: closed.filter(t => t.reason === 'EMA').length,
  };
  
  return {
    trades: closed.length,
    winRate,
    avgWin,
    avgLoss,
    ev,
    evLev: ev * leverage,
    pf,
    maxDD,
    totalReturn: (equity - 10000) / 10000,
    equity,
    kelly,
    byReason,
  };
}

async function main() {
  console.log('fetching 4H data...\n');
  const candles = await fetch4HKlines(730);
  console.log(`got ${candles.length} candles\n`);
  
  const closes = candles.map(c => c.close);
  const ema200 = calculateEMA(closes, 200);
  
  const startPrice = candles[200].close;
  const endPrice = candles[candles.length - 1].close;
  const buyHold = (endPrice - startPrice) / startPrice;
  
  // Test configurations
  const configs = [
    { name: 'No stop (pure EMA)', stopPercent: 1.0, tpPercent: 1.0 },
    { name: '3% stop / 6% TP', stopPercent: 0.03, tpPercent: 0.06 },
    { name: '4% stop / 8% TP', stopPercent: 0.04, tpPercent: 0.08 },
    { name: '5% stop / 10% TP', stopPercent: 0.05, tpPercent: 0.10 },
    { name: '6% stop / 12% TP', stopPercent: 0.06, tpPercent: 0.12 },
    { name: '8% stop / 16% TP', stopPercent: 0.08, tpPercent: 0.16 },
    { name: '3% stop / EMA exit', stopPercent: 0.03, tpPercent: 1.0 },
    { name: '5% stop / EMA exit', stopPercent: 0.05, tpPercent: 1.0 },
    { name: '8% stop / EMA exit', stopPercent: 0.08, tpPercent: 1.0 },
  ];
  
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('  4H 200 EMA HYBRID — TESTING STOP/TP COMBINATIONS');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`  buy & hold: ${(buyHold * 100).toFixed(1)}% (${(buyHold * 300).toFixed(1)}% at 3x)`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
  
  const results = [];
  
  for (const cfg of configs) {
    const trades = backtest(candles, ema200, cfg);
    const m = calcMetrics(trades);
    if (!m) continue;
    
    results.push({ config: cfg, metrics: m });
    
    const beats = m.totalReturn > buyHold * 3 ? '✓' : '✗';
    console.log(`  ${cfg.name.padEnd(22)} │ trades: ${m.trades.toString().padStart(3)} │ WR: ${(m.winRate*100).toFixed(1).padStart(5)}% │ EV: ${(m.ev*100).toFixed(2).padStart(6)}% │ PF: ${m.pf.toFixed(2).padStart(5)} │ DD: ${(m.maxDD*100).toFixed(0).padStart(3)}% │ Return: ${(m.totalReturn*100).toFixed(1).padStart(6)}% ${beats}`);
    console.log(`  ${''.padEnd(22)} │ exits: STOP ${m.byReason.STOP}, TP ${m.byReason.TP}, EMA ${m.byReason.EMA}`);
    console.log('');
  }
  
  // Rank
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('  RANKING BY EV');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
  
  results.sort((a, b) => b.metrics.ev - a.metrics.ev);
  
  for (let i = 0; i < results.length; i++) {
    const { config, metrics } = results[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    const beats = metrics.totalReturn > buyHold * 3 ? '✓' : '✗';
    console.log(`  ${medal} ${config.name.padEnd(22)} EV: ${(metrics.ev*100).toFixed(2).padStart(6)}%  WR: ${(metrics.winRate*100).toFixed(1).padStart(5)}%  Return: ${(metrics.totalReturn*100).toFixed(1).padStart(6)}% ${beats}`);
  }
  
  const best = results[0];
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('  BEST CONFIG');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
  console.log(`  ${best.config.name}`);
  console.log(`  stop: ${(best.config.stopPercent * 100)}% / TP: ${best.config.tpPercent < 1 ? (best.config.tpPercent * 100) + '%' : 'EMA cross'}`);
  console.log(`  trades: ${best.metrics.trades}`);
  console.log(`  win rate: ${(best.metrics.winRate * 100).toFixed(1)}%`);
  console.log(`  EV/trade: ${(best.metrics.ev * 100).toFixed(2)}% (${(best.metrics.evLev * 100).toFixed(2)}% at 3x)`);
  console.log(`  profit factor: ${best.metrics.pf.toFixed(2)}`);
  console.log(`  max drawdown: ${(best.metrics.maxDD * 100).toFixed(1)}%`);
  console.log(`  total return: ${(best.metrics.totalReturn * 100).toFixed(1)}%`);
  console.log(`  kelly: ${(best.metrics.kelly * 100).toFixed(1)}%`);
  console.log(`  beats buy&hold: ${best.metrics.totalReturn > buyHold * 3 ? 'YES ✓' : 'NO ✗'}`);
  console.log('');
  
  // Save
  writeFileSync(join(WORKSPACE, '.cache', 'btc-4h-hybrid-results.json'), JSON.stringify({
    runDate: new Date().toISOString(),
    buyHold,
    results: results.map(r => ({ ...r.config, ...r.metrics })),
  }, null, 2));
  
  console.log('saved to .cache/btc-4h-hybrid-results.json\n');
}

main().catch(console.error);

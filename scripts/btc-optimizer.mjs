#!/usr/bin/env node
/**
 * BTC Strategy Optimizer — Brute Force Edition
 * 
 * Tests thousands of parameter combinations to find winning formula
 * Includes walk-forward validation to filter overfitting
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============ INDICATORS ============
const EMA = (p, n) => {
  const k = 2/(n+1), r = [p[0]];
  for (let i = 1; i < p.length; i++) r.push(p[i]*k + r[i-1]*(1-k));
  return r;
};

const SMA = (p, n) => p.map((_, i) => i < n-1 ? null : p.slice(i-n+1, i+1).reduce((a,b)=>a+b,0)/n);

const ATR = (c, n) => {
  const tr = c.map((x,i) => i === 0 ? x.high-x.low : Math.max(x.high-x.low, Math.abs(x.high-c[i-1].close), Math.abs(x.low-c[i-1].close)));
  return EMA(tr, n);
};

const RSI = (p, n) => {
  const r = [50]; let g = 0, l = 0;
  for (let i = 1; i < p.length; i++) {
    const d = p[i] - p[i-1], gn = d > 0 ? d : 0, ln = d < 0 ? -d : 0;
    if (i <= n) { g += gn; l += ln; r.push(i === n ? 100-100/(1+(l===0?100:g/l)) : 50); }
    else { g = (g*(n-1)+gn)/n; l = (l*(n-1)+ln)/n; r.push(100-100/(1+(l===0?100:g/l))); }
  }
  return r;
};

const BB = (p, n, m) => {
  const sma = SMA(p, n);
  return p.map((_, i) => {
    if (i < n-1) return { u: null, l: null, w: null };
    const sl = p.slice(i-n+1, i+1), std = Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-sma[i],2),0)/n);
    return { u: sma[i]+m*std, l: sma[i]-m*std, w: 2*m*std/sma[i] };
  });
};

const ADX = (c, n) => {
  const r = [0]; let pDM = 0, mDM = 0, sTR = 0, sADX = 0;
  for (let i = 1; i < c.length; i++) {
    const up = c[i].high - c[i-1].high, dn = c[i-1].low - c[i].low;
    const plusDM = up > dn && up > 0 ? up : 0, minusDM = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(c[i].high-c[i].low, Math.abs(c[i].high-c[i-1].close), Math.abs(c[i].low-c[i-1].close));
    if (i < n) { pDM += plusDM; mDM += minusDM; sTR += tr; r.push(0); }
    else if (i === n) { const pDI = 100*pDM/sTR, mDI = 100*mDM/sTR; sADX = 100*Math.abs(pDI-mDI)/(pDI+mDI||1); r.push(sADX); }
    else { pDM = pDM-pDM/n+plusDM; mDM = mDM-mDM/n+minusDM; sTR = sTR-sTR/n+tr; const pDI = 100*pDM/sTR, mDI = 100*mDM/sTR, dx = 100*Math.abs(pDI-mDI)/(pDI+mDI||1); sADX = (sADX*(n-1)+dx)/n; r.push(sADX); }
  }
  return r;
};

// ============ SIGNAL GENERATORS ============
const generators = {
  atr: (c, cl, { atrP, entryM, exitM }) => {
    const atr = ATR(c, atrP);
    return c.map((x, i) => {
      if (i < atrP+1) return null;
      if (x.close > c[i-1].close + entryM*atr[i-1]) return 'L';
      if (x.close < c[i-1].close - exitM*atr[i-1]) return 'X';
      return null;
    });
  },
  
  donchian: (c, cl, { period }) => {
    return c.map((x, i) => {
      if (i < period+1) return null;
      const lb = c.slice(i-period, i);
      if (x.close > Math.max(...lb.map(y=>y.high))) return 'L';
      if (x.close < Math.min(...lb.map(y=>y.low))) return 'X';
      return null;
    });
  },
  
  emaCross: (c, cl, { fast, slow }) => {
    const f = EMA(cl, fast), s = EMA(cl, slow);
    return c.map((_, i) => {
      if (i < slow+1) return null;
      if (f[i] > s[i] && f[i-1] <= s[i-1]) return 'L';
      if (f[i] < s[i] && f[i-1] >= s[i-1]) return 'X';
      return null;
    });
  },
  
  rsiMom: (c, cl, { rsiP, entry, exit }) => {
    const rsi = RSI(cl, rsiP);
    return c.map((_, i) => {
      if (i < rsiP+1) return null;
      if (rsi[i] > entry && rsi[i-1] <= entry) return 'L';
      if (rsi[i] < exit && rsi[i-1] >= exit) return 'X';
      return null;
    });
  },
  
  bbBreak: (c, cl, { bbP, bbM }) => {
    const bb = BB(cl, bbP, bbM);
    return c.map((x, i) => {
      if (i < bbP+1 || !bb[i].u) return null;
      if (x.close > bb[i].u && c[i-1].close <= bb[i-1].u) return 'L';
      if (x.close < bb[i].l) return 'X';
      return null;
    });
  },
};

// ============ FILTERS ============
const filters = {
  none: () => true,
  sma200: (c, cl, i) => { const s = SMA(cl, 200); return i >= 200 && cl[i] > s[i]; },
  adx25: (c, cl, i) => { const a = ADX(c, 14); return a[i] > 25; },
  rsiNot70: (c, cl, i) => { const r = RSI(cl, 14); return r[i] < 70; },
  rsiNot30: (c, cl, i) => { const r = RSI(cl, 14); return r[i] > 30; },
  volExpand: (c, cl, i) => { const a = ATR(c, 14), avg = a.slice(Math.max(0,i-20), i).reduce((s,v)=>s+v,0)/20; return a[i] > avg * 1.2; },
};

// Memoize filter results
const filterCache = {};
const getFilter = (name, c, cl) => {
  if (!filterCache[name]) {
    if (name === 'none') filterCache[name] = c.map(() => true);
    else if (name === 'sma200') { const s = SMA(cl, 200); filterCache[name] = c.map((_, i) => i >= 200 && cl[i] > s[i]); }
    else if (name === 'adx25') { const a = ADX(c, 14); filterCache[name] = c.map((_, i) => a[i] > 25); }
    else if (name === 'rsiNot70') { const r = RSI(cl, 14); filterCache[name] = c.map((_, i) => r[i] < 70); }
    else if (name === 'rsiNot30') { const r = RSI(cl, 14); filterCache[name] = c.map((_, i) => r[i] > 30); }
    else if (name === 'volExpand') { 
      const a = ATR(c, 14); 
      filterCache[name] = c.map((_, i) => {
        const avg = a.slice(Math.max(0,i-20), i).reduce((s,v)=>s+v,0)/Math.min(20, i||1);
        return a[i] > avg * 1.2;
      });
    }
  }
  return filterCache[name];
};

// ============ BACKTEST ============
function backtest(signals, filterArr, candles, cfg) {
  const { stop, tp, trail, trailPct } = cfg;
  const trades = [];
  let pos = null, peak = 0;
  
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i], c = candles[i];
    
    if (pos) {
      const pnl = (c.close - pos.e) / pos.e;
      if (trail && c.close > peak) peak = c.close;
      const trailStop = trail ? peak * (1 - trailPct) : 0;
      
      if (pnl <= -stop) { trades.push({ pnl: -stop, r: 'S' }); pos = null; }
      else if (trail && c.close < trailStop && pnl > 0) { trades.push({ pnl: (trailStop - pos.e) / pos.e, r: 'T' }); pos = null; }
      else if (tp && pnl >= tp) { trades.push({ pnl: tp, r: 'P' }); pos = null; }
      else if (sig === 'X') { trades.push({ pnl, r: 'X' }); pos = null; }
    }
    
    if (!pos && sig === 'L' && filterArr[i]) {
      pos = { e: c.close }; peak = c.close;
    }
  }
  
  if (pos) {
    const pnl = (candles[candles.length-1].close - pos.e) / pos.e;
    trades.push({ pnl, r: 'E' });
  }
  
  return trades;
}

function metrics(trades, bh) {
  if (trades.length < 5) return null;
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
  const wr = wins.length / trades.length;
  const avgW = wins.length ? wins.reduce((s,t) => s+t.pnl, 0) / wins.length : 0;
  const avgL = losses.length ? Math.abs(losses.reduce((s,t) => s+t.pnl, 0) / losses.length) : 0.01;
  const ev = trades.reduce((s,t) => s+t.pnl, 0) / trades.length;
  const pf = (wr * avgW) / ((1-wr) * avgL);
  
  let eq = 1, peak = 1, maxDD = 0;
  for (const t of trades) {
    eq *= (1 + t.pnl * 3); // 3x leverage full position for comparison
    if (eq > peak) peak = eq;
    maxDD = Math.max(maxDD, (peak - eq) / peak);
  }
  
  return { n: trades.length, wr, ev, pf, dd: maxDD, ret: eq - 1, beat: eq - 1 > bh * 3 };
}

// ============ PARAMETER SPACES ============
const paramSpace = {
  atr: [
    ...([7,10,14,20].flatMap(atrP => 
      [1.0,1.5,2.0,2.5,3.0].flatMap(entryM => 
        [0.5,1.0,1.5,2.0].map(exitM => ({ atrP, entryM, exitM }))
      )
    ))
  ],
  donchian: [10,15,20,30,40,50,55].map(period => ({ period })),
  emaCross: [[5,13],[8,21],[9,21],[12,26],[13,34],[20,50],[21,55]].map(([fast,slow]) => ({ fast, slow })),
  rsiMom: [
    ...[3,5,7,14].flatMap(rsiP => 
      [[60,40],[65,35],[70,30],[70,50],[75,25],[80,20]].map(([entry,exit]) => ({ rsiP, entry, exit }))
    )
  ],
  bbBreak: [[20,2],[20,2.5],[10,1.5],[10,2]].map(([bbP,bbM]) => ({ bbP, bbM })),
};

const exitConfigs = [
  { stop: 0.06, tp: 0.12, trail: false },
  { stop: 0.08, tp: 0.16, trail: false },
  { stop: 0.10, tp: 0.20, trail: false },
  { stop: 0.05, tp: null, trail: true, trailPct: 0.05 },
  { stop: 0.08, tp: null, trail: true, trailPct: 0.05 },
  { stop: 0.08, tp: null, trail: true, trailPct: 0.08 },
  { stop: 0.10, tp: null, trail: true, trailPct: 0.10 },
  { stop: 0.08, tp: 0.24, trail: false }, // 1:3 R:R
  { stop: 0.06, tp: 0.24, trail: false }, // 1:4 R:R
];

const filterNames = ['none', 'sma200', 'adx25', 'rsiNot70', 'volExpand'];

// ============ MAIN ============
async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  BTC STRATEGY OPTIMIZER — BRUTE FORCE');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  // Fetch data
  const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000';
  const data = await (await fetch(url)).json();
  const candles = data.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
  const closes = candles.map(c => c.close);
  
  // Split for walk-forward
  const split = Math.floor(candles.length * 0.7);
  const inC = candles.slice(0, split), inCl = closes.slice(0, split);
  const outC = candles.slice(split), outCl = closes.slice(split);
  
  const inBH = (inCl[inCl.length-1] - inCl[200]) / inCl[200];
  const outBH = (outCl[outCl.length-1] - outCl[0]) / outCl[0];
  const fullBH = (closes[closes.length-1] - closes[200]) / closes[200];
  
  console.log(`data: ${candles.length} days | in-sample: ${inC.length} | out-sample: ${outC.length}`);
  console.log(`buy&hold: in=${(inBH*100).toFixed(1)}% out=${(outBH*100).toFixed(1)}% full=${(fullBH*100).toFixed(1)}% (${(fullBH*300).toFixed(1)}% @3x)\n`);
  
  let total = 0, tested = 0;
  const results = [];
  
  // Calculate total combinations
  for (const gen of Object.keys(generators)) total += paramSpace[gen].length * exitConfigs.length * filterNames.length;
  console.log(`testing ${total} combinations...\n`);
  
  // Clear filter cache between datasets
  const clearCache = () => { for (const k in filterCache) delete filterCache[k]; };
  
  for (const [genName, genFn] of Object.entries(generators)) {
    for (const params of paramSpace[genName]) {
      for (const exitCfg of exitConfigs) {
        for (const filterName of filterNames) {
          tested++;
          if (tested % 500 === 0) process.stdout.write(`  ${tested}/${total} (${((tested/total)*100).toFixed(0)}%)\r`);
          
          // In-sample test
          clearCache();
          const inSig = genFn(inC, inCl, params);
          const inFilter = getFilter(filterName, inC, inCl);
          const inTrades = backtest(inSig, inFilter, inC, exitCfg);
          const inM = metrics(inTrades, inBH);
          
          if (!inM || inM.ev < 0.01 || inM.wr < 0.35) continue; // Skip bad in-sample
          
          // Out-of-sample test
          clearCache();
          const outSig = genFn(outC, outCl, params);
          const outFilter = getFilter(filterName, outC, outCl);
          const outTrades = backtest(outSig, outFilter, outC, exitCfg);
          const outM = metrics(outTrades, outBH);
          
          if (!outM) continue;
          
          // Full period test
          clearCache();
          const fullSig = genFn(candles, closes, params);
          const fullFilter = getFilter(filterName, candles, closes);
          const fullTrades = backtest(fullSig, fullFilter, candles, exitCfg);
          const fullM = metrics(fullTrades, fullBH);
          
          if (!fullM) continue;
          
          // Calculate robustness score
          const evDegradation = inM.ev > 0 ? (outM.ev - inM.ev) / inM.ev : -1;
          const robust = evDegradation > -0.5 && outM.ev > 0; // Less than 50% degradation
          
          results.push({
            name: `${genName}(${Object.values(params).join(',')}) + ${filterName}`,
            gen: genName, params, filter: filterName, exit: exitCfg,
            in: inM, out: outM, full: fullM,
            degradation: evDegradation,
            robust,
            score: robust ? (fullM.ev * 0.4 + fullM.wr * 0.3 + (1 - fullM.dd) * 0.3) : 0
          });
        }
      }
    }
  }
  
  console.log(`\n\ntested: ${tested} | passed initial filter: ${results.length}\n`);
  
  // Sort by score (robust strategies first)
  results.sort((a, b) => b.score - a.score);
  
  // Find strategies that beat B&H
  const beaters = results.filter(r => r.full.beat && r.robust);
  
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(`  STRATEGIES THAT BEAT BUY & HOLD (${(fullBH*300).toFixed(0)}% @3x): ${beaters.length}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  if (beaters.length) {
    for (let i = 0; i < Math.min(10, beaters.length); i++) {
      const r = beaters[i];
      console.log(`  ${i+1}. ${r.name}`);
      console.log(`     exit: stop=${(r.exit.stop*100).toFixed(0)}% ${r.exit.tp ? `tp=${(r.exit.tp*100).toFixed(0)}%` : `trail=${(r.exit.trailPct*100).toFixed(0)}%`}`);
      console.log(`     IN:  n=${r.in.n.toString().padStart(2)} wr=${(r.in.wr*100).toFixed(0).padStart(2)}% ev=${(r.in.ev*100).toFixed(1).padStart(5)}% ret=${(r.in.ret*100).toFixed(0).padStart(4)}%`);
      console.log(`     OUT: n=${r.out.n.toString().padStart(2)} wr=${(r.out.wr*100).toFixed(0).padStart(2)}% ev=${(r.out.ev*100).toFixed(1).padStart(5)}% ret=${(r.out.ret*100).toFixed(0).padStart(4)}%`);
      console.log(`     FULL: n=${r.full.n.toString().padStart(2)} wr=${(r.full.wr*100).toFixed(0).padStart(2)}% ev=${(r.full.ev*100).toFixed(1).padStart(5)}% ret=${(r.full.ret*100).toFixed(0).padStart(4)}% dd=${(r.full.dd*100).toFixed(0)}%`);
      console.log(`     degradation: ${(r.degradation*100).toFixed(0)}% ✓ ROBUST`);
      console.log('');
    }
  } else {
    console.log('  none found with walk-forward validation.\n');
    
    // Show best overall anyway
    console.log('  TOP 5 BY RAW PERFORMANCE (may be overfit):\n');
    const topRaw = results.sort((a,b) => b.full.ret - a.full.ret).slice(0, 5);
    for (let i = 0; i < topRaw.length; i++) {
      const r = topRaw[i];
      console.log(`  ${i+1}. ${r.name}`);
      console.log(`     exit: stop=${(r.exit.stop*100).toFixed(0)}% ${r.exit.tp ? `tp=${(r.exit.tp*100).toFixed(0)}%` : `trail=${(r.exit.trailPct*100).toFixed(0)}%`}`);
      console.log(`     ret: ${(r.full.ret*100).toFixed(0)}% | wr: ${(r.full.wr*100).toFixed(0)}% | ev: ${(r.full.ev*100).toFixed(1)}% | dd: ${(r.full.dd*100).toFixed(0)}%`);
      console.log(`     degradation: ${(r.degradation*100).toFixed(0)}% ${r.robust ? '✓' : '⚠'}`);
      console.log('');
    }
  }
  
  // Show most robust strategies (regardless of beating B&H)
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  MOST ROBUST STRATEGIES (lowest degradation)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  const mostRobust = results
    .filter(r => r.out.ev > 0 && r.out.n >= 5)
    .sort((a, b) => a.degradation - b.degradation)
    .slice(0, 5);
  
  for (let i = 0; i < mostRobust.length; i++) {
    const r = mostRobust[i];
    console.log(`  ${i+1}. ${r.name}`);
    console.log(`     exit: stop=${(r.exit.stop*100).toFixed(0)}% ${r.exit.tp ? `tp=${(r.exit.tp*100).toFixed(0)}%` : `trail=${(r.exit.trailPct*100).toFixed(0)}%`}`);
    console.log(`     IN ev: ${(r.in.ev*100).toFixed(1)}% → OUT ev: ${(r.out.ev*100).toFixed(1)}% (${(r.degradation*100).toFixed(0)}% change)`);
    console.log(`     FULL: n=${r.full.n} wr=${(r.full.wr*100).toFixed(0)}% ret=${(r.full.ret*100).toFixed(0)}% dd=${(r.full.dd*100).toFixed(0)}%`);
    console.log('');
  }
  
  // Save results
  writeFileSync(join(__dirname, '..', '.cache', 'btc-optimizer-results.json'), JSON.stringify({
    runDate: new Date().toISOString(),
    buyHold: { in: inBH, out: outBH, full: fullBH },
    tested,
    beaters: beaters.slice(0, 20),
    topRobust: mostRobust,
    topReturns: results.sort((a,b) => b.full.ret - a.full.ret).slice(0, 20)
  }, null, 2));
  
  console.log('saved to .cache/btc-optimizer-results.json\n');
}

main().catch(console.error);

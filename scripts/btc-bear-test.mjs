#!/usr/bin/env node
/**
 * BTC Bear Market Analysis
 * 
 * The key insight: out-of-sample had -36% B&H (bear market)
 * Strategies that stay positive in BOTH bull and bear are gold
 */

// Indicators
const EMA = (p, n) => {
  const k = 2/(n+1), r = [p[0]];
  for (let i = 1; i < p.length; i++) r.push(p[i]*k + r[i-1]*(1-k));
  return r;
};
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
const SMA = (p, n) => p.map((_, i) => i < n-1 ? null : p.slice(i-n+1, i+1).reduce((a,b)=>a+b,0)/n);

// Best strategies from optimizer to test
const strategies = [
  {
    name: 'EMA(8,21) + 8% trail',
    signal: (c, cl) => {
      const f = EMA(cl, 8), s = EMA(cl, 21);
      return c.map((_, i) => {
        if (i < 22) return null;
        if (f[i] > s[i] && f[i-1] <= s[i-1]) return 'L';
        if (f[i] < s[i] && f[i-1] >= s[i-1]) return 'X';
        return null;
      });
    },
    stop: 0.08, trail: 0.08
  },
  {
    name: 'ATR(20,1,1) + RSI filter + 8% trail',
    signal: (c, cl) => {
      const atr = ATR(c, 20), rsi = RSI(cl, 14);
      return c.map((x, i) => {
        if (i < 21 || rsi[i] >= 70) return null;
        if (x.close > c[i-1].close + 1*atr[i-1]) return 'L';
        if (x.close < c[i-1].close - 1*atr[i-1]) return 'X';
        return null;
      });
    },
    stop: 0.08, trail: 0.08
  },
  {
    name: 'EMA(12,26) + SMA200 filter + 8% trail',
    signal: (c, cl) => {
      const f = EMA(cl, 12), s = EMA(cl, 26), sma = SMA(cl, 200);
      return c.map((x, i) => {
        if (i < 201 || cl[i] < sma[i]) return null;
        if (f[i] > s[i] && f[i-1] <= s[i-1]) return 'L';
        if (f[i] < s[i] && f[i-1] >= s[i-1]) return 'X';
        return null;
      });
    },
    stop: 0.08, trail: 0.08
  },
  {
    name: 'Donchian(20) + SMA200 + 8% trail',
    signal: (c, cl) => {
      const sma = SMA(cl, 200);
      return c.map((x, i) => {
        if (i < 201 || cl[i] < sma[i]) return null;
        const lb = c.slice(i-20, i);
        if (x.close > Math.max(...lb.map(y=>y.high))) return 'L';
        if (x.close < Math.min(...lb.map(y=>y.low))) return 'X';
        return null;
      });
    },
    stop: 0.08, trail: 0.08
  },
  {
    name: 'RSI(5) Momentum > 65 + 8% trail',
    signal: (c, cl) => {
      const rsi = RSI(cl, 5);
      return c.map((_, i) => {
        if (i < 6) return null;
        if (rsi[i] > 65 && rsi[i-1] <= 65) return 'L';
        if (rsi[i] < 45 && rsi[i-1] >= 45) return 'X';
        return null;
      });
    },
    stop: 0.08, trail: 0.08
  },
];

function backtest(signals, candles, stop, trail) {
  const trades = [];
  let pos = null, peak = 0;
  
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i], c = candles[i];
    
    if (pos) {
      const pnl = (c.close - pos.e) / pos.e;
      if (c.close > peak) peak = c.close;
      const trailStop = peak * (1 - trail);
      
      if (pnl <= -stop) { trades.push({ pnl: -stop, date: new Date(c.time).toISOString().slice(0,10) }); pos = null; }
      else if (c.close < trailStop && pnl > 0) { trades.push({ pnl: (trailStop - pos.e) / pos.e, date: new Date(c.time).toISOString().slice(0,10) }); pos = null; }
      else if (sig === 'X') { trades.push({ pnl, date: new Date(c.time).toISOString().slice(0,10) }); pos = null; }
    }
    
    if (!pos && sig === 'L') {
      pos = { e: c.close, date: new Date(c.time).toISOString().slice(0,10) }; peak = c.close;
    }
  }
  
  if (pos) {
    const c = candles[candles.length-1];
    trades.push({ pnl: (c.close - pos.e) / pos.e, date: new Date(c.time).toISOString().slice(0,10) });
  }
  
  return trades;
}

function analyze(trades, label) {
  if (!trades.length) return { label, n: 0 };
  const wins = trades.filter(t => t.pnl > 0);
  const wr = wins.length / trades.length;
  const ev = trades.reduce((s,t) => s + t.pnl, 0) / trades.length;
  let eq = 1;
  for (const t of trades) eq *= (1 + t.pnl * 3); // 3x leverage
  return { label, n: trades.length, wr, ev, ret: eq - 1 };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  BTC STRATEGY ANALYSIS: BULL vs BEAR PERFORMANCE');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000';
  const data = await (await fetch(url)).json();
  const candles = data.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
  const closes = candles.map(c => c.close);
  
  const split = Math.floor(candles.length * 0.7);
  const bullC = candles.slice(0, split), bullCl = closes.slice(0, split);
  const bearC = candles.slice(split), bearCl = closes.slice(split);
  
  const bullBH = (bullCl[bullCl.length-1] - bullCl[0]) / bullCl[0];
  const bearBH = (bearCl[bearCl.length-1] - bearCl[0]) / bearCl[0];
  const fullBH = (closes[closes.length-1] - closes[0]) / closes[0];
  
  console.log(`BULL PERIOD: ${new Date(bullC[0].time).toISOString().slice(0,10)} → ${new Date(bullC[bullC.length-1].time).toISOString().slice(0,10)}`);
  console.log(`  B&H: ${(bullBH*100).toFixed(1)}% (${(bullBH*300).toFixed(1)}% @3x)\n`);
  console.log(`BEAR PERIOD: ${new Date(bearC[0].time).toISOString().slice(0,10)} → ${new Date(bearC[bearC.length-1].time).toISOString().slice(0,10)}`);
  console.log(`  B&H: ${(bearBH*100).toFixed(1)}% (${(bearBH*300).toFixed(1)}% @3x)\n`);
  console.log(`FULL PERIOD: ${new Date(candles[0].time).toISOString().slice(0,10)} → ${new Date(candles[candles.length-1].time).toISOString().slice(0,10)}`);
  console.log(`  B&H: ${(fullBH*100).toFixed(1)}% (${(fullBH*300).toFixed(1)}% @3x)\n`);
  
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  STRATEGY COMPARISON');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log('                                        │ BULL PERIOD        │ BEAR PERIOD        │ FULL PERIOD');
  console.log('  Strategy                              │ n   WR    Ret      │ n   WR    Ret      │ n   WR    Ret');
  console.log('  ──────────────────────────────────────┼────────────────────┼────────────────────┼────────────────────');
  
  const results = [];
  
  for (const strat of strategies) {
    const bullSig = strat.signal(bullC, bullCl);
    const bearSig = strat.signal(bearC, bearCl);
    const fullSig = strat.signal(candles, closes);
    
    const bullTrades = backtest(bullSig, bullC, strat.stop, strat.trail);
    const bearTrades = backtest(bearSig, bearC, strat.stop, strat.trail);
    const fullTrades = backtest(fullSig, candles, strat.stop, strat.trail);
    
    const bull = analyze(bullTrades, 'bull');
    const bear = analyze(bearTrades, 'bear');
    const full = analyze(fullTrades, 'full');
    
    const name = strat.name.padEnd(38);
    const bStr = bull.n ? `${bull.n.toString().padStart(2)}  ${(bull.wr*100).toFixed(0).padStart(2)}%  ${(bull.ret*100).toFixed(0).padStart(5)}%` : '  -    -      -  ';
    const rStr = bear.n ? `${bear.n.toString().padStart(2)}  ${(bear.wr*100).toFixed(0).padStart(2)}%  ${(bear.ret*100).toFixed(0).padStart(5)}%` : '  -    -      -  ';
    const fStr = full.n ? `${full.n.toString().padStart(2)}  ${(full.wr*100).toFixed(0).padStart(2)}%  ${(full.ret*100).toFixed(0).padStart(5)}%` : '  -    -      -  ';
    
    console.log(`  ${name} │ ${bStr} │ ${rStr} │ ${fStr}`);
    
    results.push({
      name: strat.name,
      bull, bear, full,
      beatsBullBH: bull.ret > bullBH * 3,
      beatsBearBH: bear.ret > bearBH * 3,
      beatsFullBH: full.ret > fullBH * 3,
      edge: bear.ret > 0 && bull.ret > bullBH * 0.5 // positive in bear + captures half of bull
    });
  }
  
  console.log('  ──────────────────────────────────────┼────────────────────┼────────────────────┼────────────────────');
  console.log(`  Buy & Hold (benchmark)                │  -   -  ${(bullBH*300).toFixed(0).padStart(5)}% │  -   -  ${(bearBH*300).toFixed(0).padStart(5)}% │  -   -  ${(fullBH*300).toFixed(0).padStart(5)}%`);
  
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  KEY INSIGHTS');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  const winners = results.filter(r => r.bear.ret > 0);
  if (winners.length) {
    console.log('  STRATEGIES WITH POSITIVE RETURNS IN BEAR MARKET:\n');
    for (const r of winners) {
      console.log(`  ✓ ${r.name}`);
      console.log(`    Bear: ${(r.bear.ret*100).toFixed(0)}% (vs B&H ${(bearBH*300).toFixed(0)}%)`);
      console.log(`    Bull: ${(r.bull.ret*100).toFixed(0)}% (vs B&H ${(bullBH*300).toFixed(0)}%)`);
      console.log(`    → Edge: ${r.edge ? 'YES — protects downside while capturing upside' : 'partial'}\n`);
    }
  }
  
  const edgeStrats = results.filter(r => r.edge);
  if (edgeStrats.length) {
    console.log('  🏆 WINNER: Strategies that work in BOTH conditions');
    console.log('     (positive bear returns + captures at least half of bull):\n');
    for (const r of edgeStrats) {
      console.log(`     ${r.name}`);
    }
  }
  
  console.log('\n');
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * BTC Perfect Config Finder
 * 
 * Goal: Maximum returns with <60% max drawdown
 * Testing thousands of parameter combinations
 */

const EMA = (p, n) => {
  const k = 2/(n+1), r = [p[0]];
  for (let i = 1; i < p.length; i++) r.push(p[i]*k + r[i-1]*(1-k));
  return r;
};

function backtest(signals, candles, leverage, riskPct, stopPct, trailPct) {
  let equity = 10000;
  let pos = null, peak = 0, maxEq = 10000, maxDD = 0;
  let trades = 0, wins = 0;
  
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i], c = candles[i];
    
    if (pos) {
      const pnl = (c.close - pos.entry) / pos.entry;
      if (c.close > peak) peak = c.close;
      const trailStop = peak * (1 - trailPct);
      
      let exit = false, exitPnl = pnl;
      
      if (pnl <= -stopPct) { exit = true; exitPnl = -stopPct; }
      else if (c.close < trailStop && pnl > 0) { exit = true; exitPnl = (trailStop - pos.entry) / pos.entry; }
      else if (sig === 'X') { exit = true; }
      
      if (exit) {
        const posSize = equity * riskPct / stopPct;
        equity += posSize * exitPnl * leverage;
        trades++;
        if (exitPnl > 0) wins++;
        
        if (equity > maxEq) maxEq = equity;
        const dd = (maxEq - equity) / maxEq;
        if (dd > maxDD) maxDD = dd;
        
        pos = null; peak = 0;
        if (equity <= 0) break;
      }
    }
    
    if (!pos && sig === 'L' && equity > 0) {
      pos = { entry: c.close }; peak = c.close;
    }
  }
  
  if (pos && equity > 0) {
    const pnl = (candles[candles.length-1].close - pos.entry) / pos.entry;
    const posSize = equity * riskPct / stopPct;
    equity += posSize * pnl * leverage;
    trades++;
    if (pnl > 0) wins++;
  }
  
  return {
    equity: Math.max(0, equity),
    ret: (Math.max(0, equity) - 10000) / 10000,
    maxDD,
    trades,
    wr: trades ? wins / trades : 0,
    busted: equity <= 0 || maxDD > 0.95
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  BTC PERFECT CONFIG FINDER');
  console.log('  Target: Maximum returns with <60% drawdown');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000';
  const data = await (await fetch(url)).json();
  const candles = data.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
  const closes = candles.map(c => c.close);
  
  // EMA combinations to test
  const emaPairs = [
    [5,13], [5,21], [7,14], [7,21], [8,21], [9,21], [10,21], [12,26], [13,34]
  ];
  
  // Parameter ranges
  const leverages = [3, 4, 5, 6, 7, 8, 10, 12];
  const riskPcts = [0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.10];
  const stopPcts = [0.04, 0.05, 0.06, 0.07, 0.08, 0.10];
  const trailPcts = [0.04, 0.05, 0.06, 0.07, 0.08, 0.10];
  
  let tested = 0;
  const results = [];
  
  const total = emaPairs.length * leverages.length * riskPcts.length * stopPcts.length * trailPcts.length;
  console.log(`  Testing ${total.toLocaleString()} configurations...\n`);
  
  for (const [fast, slow] of emaPairs) {
    // Generate signals once per EMA pair
    const emaFast = EMA(closes, fast);
    const emaSlow = EMA(closes, slow);
    
    const signals = candles.map((_, i) => {
      if (i < slow + 1) return null;
      if (emaFast[i] > emaSlow[i] && emaFast[i-1] <= emaSlow[i-1]) return 'L';
      if (emaFast[i] < emaSlow[i] && emaFast[i-1] >= emaSlow[i-1]) return 'X';
      return null;
    });
    
    for (const lev of leverages) {
      for (const risk of riskPcts) {
        for (const stop of stopPcts) {
          for (const trail of trailPcts) {
            tested++;
            if (tested % 5000 === 0) process.stdout.write(`  ${tested.toLocaleString()}/${total.toLocaleString()}\r`);
            
            const r = backtest(signals, candles, lev, risk, stop, trail);
            
            // Only keep configs that don't bust and have <60% DD
            if (!r.busted && r.maxDD < 0.60 && r.ret > 1) {
              results.push({
                ema: `${fast}/${slow}`,
                leverage: lev,
                risk: risk,
                stop: stop,
                trail: trail,
                ...r
              });
            }
          }
        }
      }
    }
  }
  
  console.log(`\n\n  Tested: ${tested.toLocaleString()} | Passed filters: ${results.length}\n`);
  
  if (!results.length) {
    console.log('  No configs found with <60% DD and >100% returns');
    console.log('  Relaxing constraints...\n');
    return;
  }
  
  // Sort by return
  results.sort((a, b) => b.ret - a.ret);
  
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  TOP 10 CONFIGURATIONS (by return, <60% DD)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log('  Rank │ EMA    │ Lev │ Risk │ Stop │ Trail │ Trades │  WR  │  DD  │ $10k →       │ Return');
  console.log('  ─────┼────────┼─────┼──────┼──────┼───────┼────────┼──────┼──────┼──────────────┼────────');
  
  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    console.log(`  ${(i+1).toString().padStart(4)} │ ${r.ema.padStart(6)} │ ${r.leverage.toString().padStart(3)}x │ ${(r.risk*100).toFixed(0).padStart(3)}% │ ${(r.stop*100).toFixed(0).padStart(3)}% │ ${(r.trail*100).toFixed(0).padStart(4)}% │ ${r.trades.toString().padStart(6)} │ ${(r.wr*100).toFixed(0).padStart(3)}% │ ${(r.maxDD*100).toFixed(0).padStart(3)}% │ $${r.equity.toFixed(0).padStart(11)} │ ${(r.ret*100).toFixed(0)}%`);
  }
  
  // Best overall
  const best = results[0];
  
  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  🏆 THE PERFECT CONFIG');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log(`  Strategy:     EMA(${best.ema}) Crossover`);
  console.log(`  Leverage:     ${best.leverage}x`);
  console.log(`  Risk/trade:   ${(best.risk*100).toFixed(0)}% of equity`);
  console.log(`  Stop loss:    ${(best.stop*100).toFixed(0)}%`);
  console.log(`  Trail stop:   ${(best.trail*100).toFixed(0)}%\n`);
  
  console.log(`  RESULTS:`);
  console.log(`  ────────`);
  console.log(`  Starting:     $10,000`);
  console.log(`  Final:        $${best.equity.toLocaleString(undefined, {maximumFractionDigits: 0})}`);
  console.log(`  Return:       ${(best.ret*100).toFixed(0)}%`);
  console.log(`  Max Drawdown: ${(best.maxDD*100).toFixed(0)}%`);
  console.log(`  Trades:       ${best.trades}`);
  console.log(`  Win Rate:     ${(best.wr*100).toFixed(0)}%\n`);
  
  // Risk analysis
  console.log('  RISK ANALYSIS:');
  console.log('  ──────────────');
  console.log(`  Return/DD:    ${(best.ret / best.maxDD).toFixed(1)}x`);
  console.log(`  Kelly edge:   ${((best.wr * 2 - 1) * 100).toFixed(0)}%`);
  console.log(`  Ruin risk:    ${best.maxDD > 0.5 ? 'MODERATE' : 'LOW'}\n`);
  
  // Find best at different DD tolerances
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  BEST AT DIFFERENT RISK LEVELS');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  for (const maxDDTarget of [0.30, 0.40, 0.50, 0.60]) {
    const filtered = results.filter(r => r.maxDD <= maxDDTarget);
    if (filtered.length) {
      const b = filtered[0];
      console.log(`  Max ${(maxDDTarget*100).toFixed(0)}% DD: EMA(${b.ema}) ${b.leverage}x ${(b.risk*100).toFixed(0)}%risk → ${(b.ret*100).toFixed(0)}% return ($${b.equity.toLocaleString(undefined, {maximumFractionDigits: 0})})`);
    }
  }
  
  console.log('\n');
}

main().catch(console.error);

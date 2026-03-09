#!/usr/bin/env node
/**
 * BTC Aggressive Strategy Lab
 * 
 * Testing high-risk/high-reward configurations:
 * - Higher leverage (5x, 10x, 20x)
 * - Full kelly vs quarter kelly
 * - Tighter entries, more trades
 * - Compounding vs fixed sizing
 */

const EMA = (p, n) => {
  const k = 2/(n+1), r = [p[0]];
  for (let i = 1; i < p.length; i++) r.push(p[i]*k + r[i-1]*(1-k));
  return r;
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

const ATR = (c, n) => {
  const tr = c.map((x,i) => i === 0 ? x.high-x.low : Math.max(x.high-x.low, Math.abs(x.high-c[i-1].close), Math.abs(x.low-c[i-1].close)));
  return EMA(tr, n);
};

// Aggressive signal generators
const strategies = {
  // Our proven winner, but more aggressive entries
  ema_fast: {
    name: 'EMA(5,13) Fast Cross',
    signal: (c, cl) => {
      const f = EMA(cl, 5), s = EMA(cl, 13);
      return c.map((_, i) => {
        if (i < 14) return null;
        if (f[i] > s[i] && f[i-1] <= s[i-1]) return 'L';
        if (f[i] < s[i] && f[i-1] >= s[i-1]) return 'X';
        return null;
      });
    }
  },
  
  // RSI momentum - ride the wave
  rsi_momentum: {
    name: 'RSI(7) Momentum Rider',
    signal: (c, cl) => {
      const rsi = RSI(cl, 7);
      return c.map((_, i) => {
        if (i < 8) return null;
        if (rsi[i] > 55 && rsi[i-1] <= 55) return 'L'; // Enter early
        if (rsi[i] < 45) return 'X';
        return null;
      });
    }
  },
  
  // Breakout scalper
  breakout: {
    name: 'Daily High Breakout',
    signal: (c, cl) => {
      return c.map((x, i) => {
        if (i < 3) return null;
        const prev3High = Math.max(c[i-1].high, c[i-2].high, c[i-3].high);
        if (x.close > prev3High) return 'L';
        const prev3Low = Math.min(c[i-1].low, c[i-2].low, c[i-3].low);
        if (x.close < prev3Low) return 'X';
        return null;
      });
    }
  },
  
  // Dip buyer
  dip_buyer: {
    name: 'ATR Dip Buyer',
    signal: (c, cl) => {
      const atr = ATR(c, 14), ema = EMA(cl, 50);
      return c.map((x, i) => {
        if (i < 51) return null;
        // Buy dips in uptrend
        if (cl[i] > ema[i] && x.close < c[i-1].close - atr[i-1] * 0.5) return 'L';
        if (x.close > c[i-1].close + atr[i-1] * 1.5) return 'X'; // Take profit on bounce
        return null;
      });
    }
  },
  
  // Our winner for comparison
  ema_winner: {
    name: 'EMA(8,21) [baseline]',
    signal: (c, cl) => {
      const f = EMA(cl, 8), s = EMA(cl, 21);
      return c.map((_, i) => {
        if (i < 22) return null;
        if (f[i] > s[i] && f[i-1] <= s[i-1]) return 'L';
        if (f[i] < s[i] && f[i-1] >= s[i-1]) return 'X';
        return null;
      });
    }
  },
};

function backtest(signals, candles, config) {
  const { leverage, riskPct, stopPct, trailPct, compound } = config;
  
  let equity = 10000;
  let pos = null;
  let peak = 0;
  let maxDD = 0;
  let maxEquity = equity;
  const trades = [];
  
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i], c = candles[i];
    
    if (pos) {
      const pnl = (c.close - pos.entry) / pos.entry;
      if (c.close > peak) peak = c.close;
      const trailStop = peak * (1 - trailPct);
      
      let exit = false, exitPnl = pnl, reason = '';
      
      if (pnl <= -stopPct) {
        exit = true; exitPnl = -stopPct; reason = 'STOP';
      } else if (c.close < trailStop && pnl > 0) {
        exit = true; exitPnl = (trailStop - pos.entry) / pos.entry; reason = 'TRAIL';
      } else if (sig === 'X') {
        exit = true; reason = 'SIG';
      }
      
      if (exit) {
        const positionSize = compound ? equity * riskPct / stopPct : 10000 * riskPct / stopPct;
        const dollarPnl = positionSize * exitPnl * leverage;
        equity += dollarPnl;
        
        if (equity > maxEquity) maxEquity = equity;
        const dd = (maxEquity - equity) / maxEquity;
        if (dd > maxDD) maxDD = dd;
        
        trades.push({ pnl: exitPnl, dollarPnl, equity, reason });
        pos = null;
        peak = 0;
      }
    }
    
    if (!pos && sig === 'L' && equity > 0) {
      pos = { entry: c.close, idx: i };
      peak = c.close;
    }
  }
  
  // Close open position
  if (pos && equity > 0) {
    const c = candles[candles.length - 1];
    const pnl = (c.close - pos.entry) / pos.entry;
    const positionSize = compound ? equity * riskPct / stopPct : 10000 * riskPct / stopPct;
    const dollarPnl = positionSize * pnl * leverage;
    equity += dollarPnl;
    trades.push({ pnl, dollarPnl, equity, reason: 'END' });
  }
  
  const wins = trades.filter(t => t.pnl > 0);
  const finalReturn = (equity - 10000) / 10000;
  const wr = trades.length ? wins.length / trades.length : 0;
  const avgPnl = trades.length ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0;
  
  return {
    trades: trades.length,
    winRate: wr,
    avgPnl,
    finalEquity: equity,
    return: finalReturn,
    maxDD,
    ruinRisk: equity <= 0 || maxDD > 0.95
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  BTC AGGRESSIVE STRATEGY LAB');
  console.log('  "What if we crank up the risk?"');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000';
  const data = await (await fetch(url)).json();
  const candles = data.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
  const closes = candles.map(c => c.close);
  
  const startPrice = closes[0];
  const endPrice = closes[closes.length - 1];
  
  console.log(`  Period: ${new Date(candles[0].time).toISOString().slice(0,10)} → ${new Date(candles[candles.length-1].time).toISOString().slice(0,10)}`);
  console.log(`  BTC: $${startPrice.toFixed(0)} → $${endPrice.toFixed(0)} (${((endPrice/startPrice-1)*100).toFixed(0)}%)\n`);
  
  // Risk configurations to test
  const riskConfigs = [
    { name: 'Conservative (baseline)', leverage: 3, riskPct: 0.025, stopPct: 0.08, trailPct: 0.08, compound: false },
    { name: 'Moderate compound', leverage: 3, riskPct: 0.05, stopPct: 0.08, trailPct: 0.08, compound: true },
    { name: 'Aggressive 5x', leverage: 5, riskPct: 0.05, stopPct: 0.06, trailPct: 0.06, compound: true },
    { name: 'High risk 10x', leverage: 10, riskPct: 0.05, stopPct: 0.05, trailPct: 0.05, compound: true },
    { name: 'Degen 20x', leverage: 20, riskPct: 0.10, stopPct: 0.04, trailPct: 0.04, compound: true },
    { name: 'Full send 50x', leverage: 50, riskPct: 0.20, stopPct: 0.02, trailPct: 0.02, compound: true },
  ];
  
  const results = [];
  
  for (const [stratKey, strat] of Object.entries(strategies)) {
    const signals = strat.signal(candles, closes);
    
    console.log('─────────────────────────────────────────────────────────────────────────────────────────');
    console.log(`  ${strat.name}`);
    console.log('─────────────────────────────────────────────────────────────────────────────────────────\n');
    
    console.log('  Config                  │ Trades │  WR   │ Max DD │ Final Equity  │ Return');
    console.log('  ────────────────────────┼────────┼───────┼────────┼───────────────┼─────────────');
    
    for (const cfg of riskConfigs) {
      const r = backtest(signals, candles, cfg);
      
      const ruined = r.ruinRisk ? ' 💀' : '';
      const returnStr = r.finalEquity > 0 ? 
        `${(r.return * 100).toFixed(0).padStart(8)}%${ruined}` : 
        '  REKT 💀';
      
      console.log(`  ${cfg.name.padEnd(22)} │ ${r.trades.toString().padStart(6)} │ ${(r.winRate*100).toFixed(0).padStart(4)}% │ ${(r.maxDD*100).toFixed(0).padStart(5)}% │ $${r.finalEquity.toFixed(0).padStart(12)} │ ${returnStr}`);
      
      results.push({
        strategy: strat.name,
        config: cfg.name,
        ...r,
        leverage: cfg.leverage
      });
    }
    console.log('');
  }
  
  // Find best risk-adjusted and best absolute
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('  FINDINGS');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  
  const validResults = results.filter(r => !r.ruinRisk && r.return > 0);
  const bestAbsolute = validResults.sort((a, b) => b.return - a.return)[0];
  const bestRiskAdj = validResults.sort((a, b) => (b.return / b.maxDD) - (a.return / a.maxDD))[0];
  
  if (bestAbsolute) {
    console.log('  🚀 HIGHEST RETURN (without blowing up):');
    console.log(`     ${bestAbsolute.strategy} + ${bestAbsolute.config}`);
    console.log(`     Return: ${(bestAbsolute.return * 100).toFixed(0)}% ($10k → $${bestAbsolute.finalEquity.toFixed(0)})`);
    console.log(`     Max DD: ${(bestAbsolute.maxDD * 100).toFixed(0)}% | Trades: ${bestAbsolute.trades}\n`);
  }
  
  if (bestRiskAdj) {
    console.log('  📊 BEST RISK-ADJUSTED:');
    console.log(`     ${bestRiskAdj.strategy} + ${bestRiskAdj.config}`);
    console.log(`     Return: ${(bestRiskAdj.return * 100).toFixed(0)}% | DD: ${(bestRiskAdj.maxDD * 100).toFixed(0)}%`);
    console.log(`     Return/DD ratio: ${(bestRiskAdj.return / bestRiskAdj.maxDD).toFixed(1)}x\n`);
  }
  
  // Show the blowups
  const blowups = results.filter(r => r.ruinRisk);
  if (blowups.length) {
    console.log('  💀 CONFIGS THAT BLEW UP:');
    for (const b of blowups) {
      console.log(`     ${b.strategy} + ${b.config} (${b.leverage}x leverage)`);
    }
    console.log('');
  }
  
  // Sweet spot analysis
  console.log('  📈 SWEET SPOT ANALYSIS:\n');
  
  const by5x = results.filter(r => r.leverage === 5 && !r.ruinRisk);
  const by10x = results.filter(r => r.leverage === 10 && !r.ruinRisk);
  const by20x = results.filter(r => r.leverage === 20 && !r.ruinRisk);
  
  if (by5x.length) {
    const best5x = by5x.sort((a, b) => b.return - a.return)[0];
    console.log(`     5x leverage best: ${best5x.strategy} → ${(best5x.return * 100).toFixed(0)}% (DD: ${(best5x.maxDD * 100).toFixed(0)}%)`);
  }
  if (by10x.length) {
    const best10x = by10x.sort((a, b) => b.return - a.return)[0];
    console.log(`     10x leverage best: ${best10x.strategy} → ${(best10x.return * 100).toFixed(0)}% (DD: ${(best10x.maxDD * 100).toFixed(0)}%)`);
  }
  if (by20x.length) {
    const best20x = by20x.sort((a, b) => b.return - a.return)[0];
    console.log(`     20x leverage best: ${best20x.strategy} → ${(best20x.return * 100).toFixed(0)}% (DD: ${(best20x.maxDD * 100).toFixed(0)}%)`);
  }
  
  console.log('\n');
}

main().catch(console.error);

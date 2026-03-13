#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BacktestEngine } from './backtest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// BOT TUNER: autonomous variant generation + real backtest evaluation
// ============================================================================

class BotTuner {
  constructor(baselineFile = 'baseline.json', dataPath = null) {
    this.baselinePath = path.join(__dirname, baselineFile);
    this.resultsPath = path.join(__dirname, 'results.jsonl');
    
    // use provided data path or default to hyperliquid backtest data
    this.dataPath = dataPath || path.join(__dirname, '../hyperliquid-bot/backtest-data/BTCUSDT_5m.jsonl');
    
    this.baseline = this.loadBaseline();
    this.backtest = new BacktestEngine(this.dataPath);
    this.ensureResultsFile();
  }

  loadBaseline() {
    const data = fs.readFileSync(this.baselinePath, 'utf-8');
    return JSON.parse(data);
  }

  ensureResultsFile() {
    if (!fs.existsSync(this.resultsPath)) {
      fs.writeFileSync(this.resultsPath, '');
    }
  }

  // search space definition
  getSearchSpace() {
    return {
      ema_period: [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300],
      slope_threshold: [0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.003, 0.0035, 0.004, 0.0045, 0.005],
      target_profit: [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08],
      stop_loss: [0.01, 0.015, 0.02, 0.025, 0.03],
      slopeLookback: [24, 36, 48, 60, 72]
    };
  }

  // random variant generator
  generateVariant(variantId) {
    const space = this.getSearchSpace();
    const config = {};

    for (const [key, values] of Object.entries(space)) {
      config[key] = values[Math.floor(Math.random() * values.length)];
    }

    return {
      variant_id: `var_${String(variantId).padStart(4, '0')}`,
      config,
      timestamp: new Date().toISOString()
    };
  }

  // real backtest using historical data
  async backtest(config) {
    return await this.backtest.simulate(config);
  }

  // evaluate variant against baseline
  // baseline is currently LOSING (-$5.77), so variants that:
  // - lose less $ 
  // - are profitable
  // - have better win_rate
  // - have better profit_factor
  // will beat it
  beatsBaseline(metrics) {
    if (metrics.error) return false;

    const base = this.baseline.metrics;

    // condition 1: profitable (baseline is not)
    if (metrics.total_pnl > 0 && base.total_pnl < 0) return true;

    // condition 2: loses less AND better win_rate
    if (metrics.total_pnl > base.total_pnl && metrics.win_rate > base.win_rate * 0.9) {
      return true;
    }

    // condition 3: better profit_factor AND acceptable max_dd
    if (metrics.profit_factor > base.profit_factor * 1.5 && metrics.max_drawdown < base.max_drawdown * 1.5) {
      return true;
    }

    // condition 4: significantly better win_rate (less whipsaw)
    if (metrics.win_rate > base.win_rate * 1.3 && metrics.total_pnl >= base.total_pnl * 0.8) {
      return true;
    }

    return false;
  }

  // log result to results.jsonl
  logResult(variant, metrics, beats) {
    const result = {
      ...variant,
      metrics,
      beats_baseline: beats,
      comparison: {
        pnl_delta: parseFloat((metrics.total_pnl - this.baseline.metrics.total_pnl).toFixed(2)),
        wr_delta: parseFloat((metrics.win_rate - this.baseline.metrics.win_rate).toFixed(4)),
        pf_delta: parseFloat((metrics.profit_factor - this.baseline.metrics.profit_factor).toFixed(2))
      }
    };

    fs.appendFileSync(this.resultsPath, JSON.stringify(result) + '\n');
    return result;
  }

  // display result
  displayResult(loggedResult, index, total) {
    const { variant_id, config, metrics, beats_baseline, comparison } = loggedResult;
    const status = beats_baseline ? '✓ BEATS' : '  ';

    console.log(`\n[${index}/${total}] ${status} ${variant_id}`);
    console.log(`  config: EMA=${config.ema_period}, slope=${config.slope_threshold}, target=${(config.target_profit*100).toFixed(1)}%, stop=${(config.stop_loss*100).toFixed(1)}%`);
    
    if (metrics.error) {
      console.log(`  ERROR: ${metrics.error}`);
      return;
    }

    console.log(`  trades: ${metrics.num_trades} | WR=${(metrics.win_rate*100).toFixed(1)}% (${comparison.wr_delta >= 0 ? '+' : ''}${(comparison.wr_delta*100).toFixed(1)}%)`);
    console.log(`  metrics: PnL=$${metrics.total_pnl.toFixed(2)} (${comparison.pnl_delta >= 0 ? '+' : ''}${comparison.pnl_delta.toFixed(2)}) | PF=${metrics.profit_factor.toFixed(2)} (${comparison.pf_delta >= 0 ? '+' : ''}${comparison.pf_delta.toFixed(2)}) | DD=${(metrics.max_drawdown*100).toFixed(2)}%`);
  }

  // run N experiments
  async runExperiments(count = 5) {
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`BOT TUNER | ${count} variants vs baseline (REAL BACKTEST)`);
    console.log(`data: ${path.basename(this.dataPath)} (24h window)`);
    console.log(`════════════════════════════════════════════════════════════════\n`);
    console.log(`baseline: EMA=${this.baseline.config.ema_period}, slope=${this.baseline.config.slope_threshold}, target=${(this.baseline.config.target_profit*100).toFixed(1)}%, stop=${(this.baseline.config.stop_loss*100).toFixed(1)}%`);
    console.log(`baseline metrics: PnL=$${this.baseline.metrics.total_pnl} | trades=${this.baseline.metrics.num_trades} | WR=${(this.baseline.metrics.win_rate*100).toFixed(1)}% | PF=${this.baseline.metrics.profit_factor.toFixed(2)}\n`);

    const results = [];
    const winners = [];

    for (let i = 1; i <= count; i++) {
      const variant = this.generateVariant(i);
      const metrics = await this.backtest.simulate(variant.config);
      const beats = this.beatsBaseline(metrics);
      const logged = this.logResult(variant, metrics, beats);

      results.push(logged);
      if (beats) winners.push(logged);

      this.displayResult(logged, i, count);

      await new Promise(r => setTimeout(r, 10));
    }

    // summary
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`SUMMARY: ${winners.length}/${count} variants beat baseline`);
    console.log(`════════════════════════════════════════════════════════════════\n`);

    if (winners.length > 0) {
      console.log('🏆 WINNERS:\n');
      winners.sort((a, b) => b.metrics.profit_factor - a.metrics.profit_factor);
      winners.slice(0, 5).forEach((w, idx) => {
        if (!w.metrics.error) {
          console.log(`${idx + 1}. ${w.variant_id}`);
          console.log(`   config: EMA=${w.config.ema_period}, slope=${w.config.slope_threshold}, target=${(w.config.target_profit*100).toFixed(1)}%, stop=${(w.config.stop_loss*100).toFixed(1)}%`);
          console.log(`   trades=${w.metrics.num_trades} | WR=${(w.metrics.win_rate*100).toFixed(1)}% | PnL=$${w.metrics.total_pnl.toFixed(2)} | PF=${w.metrics.profit_factor.toFixed(2)}\n`);
        }
      });
    } else {
      console.log('no variants beat baseline this round.\n');
    }

    return { results, winners };
  }

  // read results file (for analysis)
  readResults() {
    if (!fs.existsSync(this.resultsPath)) return [];
    const lines = fs.readFileSync(this.resultsPath, 'utf-8').trim().split('\n').filter(l => l);
    return lines.map(l => JSON.parse(l));
  }

  // print top winners (all-time)
  topWinners(limit = 5) {
    const all = this.readResults().filter(r => r.beats_baseline && !r.metrics.error);
    const sorted = all.sort((a, b) => b.metrics.profit_factor - a.metrics.profit_factor);
    
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`TOP ${Math.min(limit, sorted.length)} WINNERS (all-time)`);
    console.log(`════════════════════════════════════════════════════════════════\n`);

    sorted.slice(0, limit).forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.variant_id} (${r.timestamp.split('T')[0]})`);
      console.log(`   config: EMA=${r.config.ema_period}, slope=${r.config.slope_threshold}, target=${(r.config.target_profit*100).toFixed(1)}%, stop=${(r.config.stop_loss*100).toFixed(1)}%`);
      console.log(`   trades=${r.metrics.num_trades} | WR=${(r.metrics.win_rate*100).toFixed(1)}% | PnL=$${r.metrics.total_pnl.toFixed(2)} | PF=${r.metrics.profit_factor.toFixed(2)}\n`);
    });
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const tuner = new BotTuner('baseline.json');
  
  const args = process.argv.slice(2);
  const mode = args[0] || 'run';
  const count = parseInt(args[1]) || 5;

  if (mode === 'run') {
    await tuner.runExperiments(count);
  } else if (mode === 'top') {
    tuner.topWinners(count);
  } else if (mode === 'results') {
    const all = tuner.readResults();
    const winners = all.filter(r => r.beats_baseline && !r.metrics.error);
    console.log(`\ntotal experiments: ${all.length}`);
    console.log(`winners: ${winners.length}`);
    console.log(`win rate: ${(winners.length / all.length * 100).toFixed(1)}%\n`);
  }
}

main().catch(console.error);

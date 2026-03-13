#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// BOT TUNER: autonomous variant generation + backtest evaluation
// ============================================================================

class BotTuner {
  constructor(baselineFile = 'baseline.json') {
    this.baselinePath = path.join(__dirname, baselineFile);
    this.resultsPath = path.join(__dirname, 'results.jsonl');
    this.baseline = this.loadBaseline();
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
      stop_loss: [0.01, 0.015, 0.02, 0.025, 0.03]
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

  // mock backtest (replace with real backtest harness)
  async backtest(config) {
    // TODO: hook this to real historical data + ema-bot-v2 logic
    // for now: simulated results with variance

    const baseline = this.baseline.metrics;
    const variance = (Math.random() - 0.5) * 0.15; // ±7.5% random variance

    // construct a plausible result
    const total_pnl = baseline.total_pnl * (1 + variance);
    const win_rate = Math.min(0.85, Math.max(0.25, baseline.win_rate + (Math.random() - 0.5) * 0.15));
    const max_dd = Math.max(0.008, baseline.max_drawdown * (1 + (Math.random() - 0.5) * 0.4));
    const profit_factor = total_pnl > 0 ? 1.05 + Math.random() * 0.5 : 0.9 + Math.random() * 0.3;
    const sharpe = profit_factor > 1.2 ? baseline.sharpe_ratio * 1.1 : baseline.sharpe_ratio * (0.8 + Math.random() * 0.4);

    return {
      total_pnl: parseFloat(total_pnl.toFixed(2)),
      win_rate: parseFloat(win_rate.toFixed(4)),
      sharpe_ratio: parseFloat(sharpe.toFixed(2)),
      max_drawdown: parseFloat(max_dd.toFixed(4)),
      profit_factor: parseFloat(profit_factor.toFixed(2))
    };
  }

  // evaluate variant against baseline
  beatsBaseline(metrics) {
    const base = this.baseline.metrics;

    // condition 1: improved sharpe + acceptable drawdown
    const cond1 = (metrics.sharpe_ratio > base.sharpe_ratio) && (metrics.max_drawdown <= base.max_drawdown * 1.1);

    // condition 2: much better pnl with lower drawdown
    const cond2 = (metrics.total_pnl > base.total_pnl * 1.05) && (metrics.max_drawdown < base.max_drawdown * 0.95);

    return cond1 || cond2;
  }

  // log result to results.jsonl
  logResult(variant, metrics, beats) {
    const result = {
      ...variant,
      metrics,
      beats_baseline: beats,
      comparison: {
        pnl_delta: parseFloat((metrics.total_pnl - this.baseline.metrics.total_pnl).toFixed(2)),
        sharpe_delta: parseFloat((metrics.sharpe_ratio - this.baseline.metrics.sharpe_ratio).toFixed(2)),
        drawdown_delta: parseFloat((metrics.max_drawdown - this.baseline.metrics.max_drawdown).toFixed(4))
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
    console.log(`  metrics: PnL=$${metrics.total_pnl.toFixed(2)} (${comparison.pnl_delta >= 0 ? '+' : ''}${comparison.pnl_delta.toFixed(2)}) | sharpe=${metrics.sharpe_ratio.toFixed(2)} (${comparison.sharpe_delta >= 0 ? '+' : ''}${comparison.sharpe_delta.toFixed(2)}) | dd=${(metrics.max_drawdown*100).toFixed(2)}% (${comparison.drawdown_delta >= 0 ? '+' : ''}${(comparison.drawdown_delta*100).toFixed(2)}%)`);
  }

  // run N experiments
  async runExperiments(count = 5) {
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`BOT TUNER | ${count} variants vs baseline`);
    console.log(`════════════════════════════════════════════════════════════════\n`);
    console.log(`baseline config: EMA=${this.baseline.config.ema_period}, slope=${this.baseline.config.slope_threshold}, target=${(this.baseline.config.target_profit*100).toFixed(1)}%, stop=${(this.baseline.config.stop_loss*100).toFixed(1)}%`);
    console.log(`baseline metrics: PnL=$${this.baseline.metrics.total_pnl} | sharpe=${this.baseline.metrics.sharpe_ratio} | dd=${(this.baseline.metrics.max_drawdown*100).toFixed(2)}%\n`);

    const results = [];
    const winners = [];

    for (let i = 1; i <= count; i++) {
      const variant = this.generateVariant(i);
      const metrics = await this.backtest(variant.config);
      const beats = this.beatsBaseline(metrics);
      const logged = this.logResult(variant, metrics, beats);

      results.push(logged);
      if (beats) winners.push(logged);

      this.displayResult(logged, i, count);
    }

    // summary
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`SUMMARY: ${winners.length}/${count} variants beat baseline`);
    console.log(`════════════════════════════════════════════════════════════════\n`);

    if (winners.length > 0) {
      console.log('🏆 WINNERS:\n');
      winners.forEach((w, idx) => {
        console.log(`${idx + 1}. ${w.variant_id}`);
        console.log(`   EMA=${w.config.ema_period}, slope=${w.config.slope_threshold}, target=${(w.config.target_profit*100).toFixed(1)}%, stop=${(w.config.stop_loss*100).toFixed(1)}%`);
        console.log(`   → PnL +${w.comparison.pnl_delta.toFixed(2)} | sharpe +${w.comparison.sharpe_delta.toFixed(2)} | dd ${(w.comparison.drawdown_delta*100).toFixed(2)}%\n`);
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
    const all = this.readResults().filter(r => r.beats_baseline);
    const sorted = all.sort((a, b) => b.metrics.sharpe_ratio - a.metrics.sharpe_ratio);
    
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`TOP ${Math.min(limit, sorted.length)} WINNERS (all-time)`);
    console.log(`════════════════════════════════════════════════════════════════\n`);

    sorted.slice(0, limit).forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.variant_id} (${r.timestamp})`);
      console.log(`   config: EMA=${r.config.ema_period}, slope=${r.config.slope_threshold}, target=${(r.config.target_profit*100).toFixed(1)}%, stop=${(r.config.stop_loss*100).toFixed(1)}%`);
      console.log(`   metrics: PnL=$${r.metrics.total_pnl} | sharpe=${r.metrics.sharpe_ratio} | dd=${(r.metrics.max_drawdown*100).toFixed(2)}%\n`);
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
    const winners = all.filter(r => r.beats_baseline);
    console.log(`\ntotal experiments: ${all.length}`);
    console.log(`winners: ${winners.length}`);
    console.log(`win rate: ${(winners.length / all.length * 100).toFixed(1)}%\n`);
  }
}

main().catch(console.error);

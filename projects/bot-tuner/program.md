# bot-tuner: autonomous EMA bot optimization

## objective
automatically discover EMA/slope/leverage configurations that beat baseline on historical backtest data.

## search space
| parameter | range | default | notes |
|-----------|-------|---------|-------|
| ema_period | 100–300 | 200 | primary trend smoothing |
| slope_threshold | 0.0005–0.005 | 0.001 | entry signal sensitivity |
| target_profit | 2–8% | 5 | take-profit level |
| stop_loss | 1–3% | 2 | stop-loss level |

## variant generation
each experiment: randomly sample one point per parameter
```
ema_period: [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300]
slope_threshold: [0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.003, 0.0035, 0.004, 0.0045, 0.005]
target_profit: [2, 3, 4, 5, 6, 7, 8]
stop_loss: [1, 1.5, 2, 2.5, 3]
```

## constraints (non-negotiable)
- **regime guard**: never override BTC EXIT/LONG regime check — test within regime only
- **leverage**: capped at 5x (absolute max)
- **backtest only**: no live deployment from variants, human approval required
- **revert on degrade**: if live variant underperforms baseline by >10% over 50 trades, auto-revert

## evaluation metrics (2-min backtest window)
1. **total_pnl**: $ made (baseline = current bot performance)
2. **win_rate**: % winning trades
3. **sharpe_ratio**: risk-adjusted return (higher = better)
4. **max_drawdown**: worst peak-to-valley (lower = safer)
5. **profit_factor**: gross_profit / gross_loss (>1.0 = profitable)

## keep/discard logic
variant beats baseline if:
- (sharpe_ratio > baseline_sharpe) AND (max_drawdown <= baseline_drawdown × 1.1)
- OR (total_pnl > baseline_pnl × 1.05) AND (max_drawdown < baseline_drawdown × 0.95)

## logging
every experiment logged to `results.jsonl`:
```json
{
  "timestamp": "2026-03-13T13:00:00Z",
  "variant_id": "var_001",
  "config": {"ema_period": 220, "slope_threshold": 0.0015, "target_profit": 6, "stop_loss": 1.5},
  "metrics": {"total_pnl": 350.25, "win_rate": 0.58, "sharpe": 2.1, "max_dd": 0.045, "profit_factor": 1.8},
  "beats_baseline": true,
  "notes": "higher EMA + tighter stop = fewer trades but better risk/reward"
}
```

## daily routine
- run ~100 variants overnight (2 min each = ~200 min wall time, can parallelize)
- log all results
- identify top 3 performers
- backtest winners on fresh window (out-of-sample validation)
- commit winning configs to git with explanation
- don't deploy live without human review

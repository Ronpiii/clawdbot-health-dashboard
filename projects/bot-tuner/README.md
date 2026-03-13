# bot-tuner: autonomous EMA bot optimization

following karpathy's autoresearch pattern — automatic variant generation + backtest evaluation.

## structure

```
bot-tuner/
├── program.md         # agent instructions (search space, constraints, evaluation logic)
├── baseline.json      # current bot config + metrics (control)
├── tune-ema-bot.mjs   # backtest harness (variant gen → backtest → compare → log)
├── results.jsonl      # experiment log (one JSON per line)
└── README.md          # this file
```

## how it works

1. **baseline**: current bot (EMA=200, slope=0.001%) with metrics (PnL=$1.02, sharpe=0.85, dd=1.5%)
2. **variant generation**: random sample from search space per iteration
   - EMA period: 100–300
   - slope threshold: 0.0005–0.005
   - target profit: 2–8%
   - stop loss: 1–3%
3. **backtest**: evaluate variant config on historical data (5–10 min window)
4. **compare**: beats baseline if (sharpe↑ + dd≤baseline×1.1) OR (PnL↑5% + dd↓5%)
5. **log**: every result → results.jsonl
6. **iterate**: run 100+ experiments overnight

## usage

### run 10 variants
```bash
cd projects/bot-tuner
node tune-ema-bot.mjs run 10
```

### show top winners (all-time)
```bash
node tune-ema-bot.mjs top 5
```

### show results summary
```bash
node tune-ema-bot.mjs results
```

## output

each run prints:
- baseline config/metrics
- each variant (config → metrics → vs baseline)
- summary (winners count)
- top performers

results.jsonl logs every experiment:
```json
{
  "variant_id": "var_0002",
  "config": {"ema_period": 260, "slope_threshold": 0.004, "target_profit": 0.07, "stop_loss": 0.025},
  "metrics": {"total_pnl": 1.07, "win_rate": 0.5155, "sharpe_ratio": 0.94, "max_drawdown": 0.0135, "profit_factor": 1.25},
  "beats_baseline": true,
  "comparison": {"pnl_delta": 0.05, "sharpe_delta": 0.09, "drawdown_delta": -0.0015}
}
```

## next steps

### 1. connect real backtest harness
replace the mock `backtest()` function in tune-ema-bot.mjs with real historical data:
- load OHLCV candles from hyperliquid-bot/backtest-data/ or live API
- feed config variant to ema-bot-v2 logic
- measure: PnL, win_rate, sharpe, max_dd, profit_factor

### 2. integrate into heartbeat
add to HEARTBEAT.md:
```bash
# autonomous bot tuning (daily, ~2 hours)
[ ] cd projects/bot-tuner && node tune-ema-bot.mjs run 100 --time-budget 2m
[ ] node tune-ema-bot.mjs top 3 → review winners
[ ] if top winner looks good, log suggestion for manual review
```

### 3. validation before deploy
- top winner runs out-of-sample backtest (fresh data window)
- human review: compare to baseline live performance (50 trades min)
- only deploy if:
  - backtests beat baseline >15%
  - live performance doesn't degrade after 1 day
  - regime guards never broken
- commit winning config + timestamp to git

### 4. iterate
weekly review of results.jsonl:
- identify patterns (e.g., "lower EMA + tighter stops = better for fast markets")
- update program.md constraints based on learnings
- spawn new tuner run with refined search space

## safety constraints (hardcoded)

- regime guard: variant respects BTC EXIT/LONG — no override
- leverage: capped at 5x absolute
- backtest only: no live deployment without human approval
- auto-revert: if live variant underperforms baseline by >10%, revert

## metrics

**win/lose**: variant beats baseline if:
```
(sharpe_ratio > baseline) AND (max_drawdown <= baseline × 1.1)
  OR
(pnl > baseline × 1.05) AND (max_drawdown < baseline × 0.95)
```

**best for**: discovering non-obvious parameter combos that outperform manual tuning

## current status

- [x] program.md (instructions + constraints)
- [x] baseline.json (current bot snapshot)
- [x] tune-ema-bot.mjs (variant gen + mock backtest)
- [x] results.jsonl (experiment log)
- [ ] real backtest harness (blocked: need ema-bot-v2 integration)
- [ ] heartbeat integration (blocked: backtest harness)
- [ ] daily autonomous runs (blocked: heartbeat)

## blockers

1. **real backtest data**: need historical OHLCV from hyperliquid-bot or Binance
2. **ema-bot logic extraction**: move trend-detection + entry/exit to function for isolated backtest
3. **metrics collection**: standardize PnL, sharpe, drawdown calculation

once blocked, bot-tuner can run ~100 experiments/night and identify winning configs by morning.

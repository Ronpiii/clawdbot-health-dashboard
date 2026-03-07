# Trading Strategy Research — Work in Progress

*Started: 2026-03-07*

## What Actually Works (Evidence-Based)

### 1. Trend Following / Momentum

**The most backtested and validated approach for crypto.**

**Simple Moving Average Strategy:**
- Buy when price > 20-day EMA, sell when below
- Backtested results (BTC 2015-2021):
  - 127 trades
  - **33% win rate** (low, but winners are big)
  - Average gain: 5.99% per trade
  - Max drawdown: 39% (vs 82% buy-and-hold)
  - Profit factor: 2.69
  - CAGR: 126% vs 94% buy-and-hold

**25-Day Momentum:**
- Buy when close > close 25 days ago
- 40% win rate, 8.7% avg gain
- Profit factor: 3.84

**Key insight:** Low win rate doesn't mean unprofitable. Big winners offset many small losers.

### 2. Funding Rate Arbitrage

**The closest thing to "free money" in crypto (but not risk-free).**

**How it works:**
- Perpetual futures have funding rates paid between longs/shorts every 8h
- When funding is positive (longs pay shorts):
  - Buy spot BTC
  - Short perpetual BTC (delta neutral)
  - Collect funding every 8 hours
- Typical returns: 10-30% APY during bull markets

**Risks:**
- Funding can flip negative (you pay instead of collect)
- Exchange risk (not your keys, not your coins)
- Liquidation risk if position sizing is wrong
- Opportunity cost when funding is low

**Where to monitor:** coinglass.com/FundingRate

### 3. Mean Reversion

**Works in ranging markets, fails in trends.**

- Buy oversold (RSI < 30), sell overbought (RSI > 70)
- Better for altcoins than BTC
- Requires tight stops (trends kill mean reversion)

### 4. Cross-Exchange Arbitrage

**Mostly arbitraged away by HFT bots.**

- Price differences between exchanges
- Requires: fast execution, accounts on multiple exchanges, capital on both sides
- Realistic edge: nearly zero for retail

---

## What Doesn't Work

### 1. Most Technical Indicators Alone
- RSI, MACD, Bollinger Bands — slight edge at best
- Easily overfitted in backtests
- Signals lag price action

### 2. Predictive Models (without edge)
- Neural networks sound fancy but overfit easily
- "10x returns in 2 months" claims don't survive out-of-sample

### 3. Leverage Without Risk Management
- 10x leverage + 10% move = liquidation
- Most retail traders blow up within months

### 4. Following "Signals" Groups
- Survivorship bias — you see winners, not losers
- Often pump-and-dump schemes

---

## Risk Management (The Actual Edge)

### Position Sizing

**Kelly Criterion (simplified):**
```
f = (bp - q) / b

Where:
f = fraction of bankroll to bet
b = odds received (e.g., 2:1 = 2)
p = probability of winning
q = probability of losing (1 - p)
```

**In practice:** Use half-Kelly or less. Full Kelly is too aggressive.

**Fixed Fractional:**
- Risk 1-2% of account per trade
- Survives long losing streaks

### Stop Losses

- ATR-based stops (2x ATR from entry)
- Percentage stops (2-5% depending on volatility)
- Never move stops to "give trade room"

### Max Drawdown Rules
- Stop trading if down 10% in a day
- Stop trading if down 20% in a month
- Reassess strategy after 15 consecutive losses

---

## Crypto-Specific Factors

### Funding Rates
- Positive = longs paying shorts (bullish sentiment)
- Negative = shorts paying longs (bearish sentiment)
- Extreme funding often precedes reversals

### Liquidation Cascades
- Leveraged positions get liquidated in waves
- Creates sharp moves in both directions
- Monitor liquidation levels via coinglass.com

### BTC Dominance
- BTC.D rising = risk-off (altcoins bleeding)
- BTC.D falling = risk-on (alt season)

### Halving Cycles
- Every ~4 years, BTC block reward halves
- Historically bullish 6-18 months post-halving
- Next halving: ~2028

### On-Chain Signals
- Exchange inflows = potential selling
- Exchange outflows = accumulation
- Whale movements via whale-alert.io

---

## Implementation Considerations

### Fees Matter
- Maker: 0.01-0.02%
- Taker: 0.04-0.06%
- Funding: paid/received every 8h on perps
- At high frequency, fees destroy edge

### Slippage
- Worse on large orders
- Worse on low-liquidity pairs
- Backtest assumes perfect fills (reality is worse)

### Backtest ≠ Live
- Backtest: no slippage, no fees, no emotions
- Live: all of the above
- Expect 30-50% worse performance live

### API Limitations
- Rate limits per minute
- Occasional downtime
- Latency matters for HFT (we can't compete here)

---

## Strategy Candidates for Us

### Option A: Simple Momentum (Best for Starting)
- 20-day EMA crossover on BTC
- Long only (no shorting)
- 2% risk per trade
- Stop: 2x ATR below entry
- Check once per day

**Pros:** Simple, backtested, low maintenance
**Cons:** Low win rate feels bad, drawdowns

### Option B: Funding Rate Collection
- Spot long + perp short when funding > 0.03%
- Close when funding drops or flips negative
- Monitor every 8 hours

**Pros:** "Passive" income, delta neutral
**Cons:** Requires capital on exchange, funding can flip

### Option C: Mean Reversion on Altcoins
- RSI oversold + high volume = entry
- Tight stops, small positions
- Higher frequency, more work

**Pros:** More trades, faster feedback
**Cons:** More fees, harder to automate correctly

---

## Next Steps

1. Pick ONE strategy to paper trade
2. Define exact rules (no ambiguity)
3. Backtest on recent data (last 6 months)
4. Paper trade 2 weeks minimum
5. Start live with tiny size
6. Scale up only after proven

---

## Resources

- quantpedia.com — academic research on strategies
- coinglass.com — funding rates, liquidations, OI
- tradingview.com — charting and backtests
- ccxt.trade — unified crypto exchange API

*Research ongoing — will update as I find more.*

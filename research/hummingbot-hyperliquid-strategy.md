# Hummingbot + Hyperliquid Trading Strategy Research

## TL;DR

**Most viable path:** Funding rate arbitrage between Hyperliquid and Binance using the built-in `v2_funding_rate_arb.py` script.

- Delta-neutral (limited directional risk)
- Hyperliquid's hourly funding = 8x more capture opportunities than Binance's 8h
- Existing tested code — no custom development needed
- Measurable hypothesis: are there consistent funding rate differences?

**Expected profitability:** Uncertain but testable. Not a money printer, but reasonable risk/reward for the effort.

---

## Integration Status

### Hummingbot ↔ Hyperliquid

| Component | Status | Notes |
|-----------|--------|-------|
| Spot Connector | ✅ | `hyperliquid` |
| Perp Connector | ✅ | `hyperliquid_perpetual` |
| Candles Feed | ✅ | 1m to 1M intervals |
| Testnet | ✅ | Paper trading available |
| Auth | ✅ | API key or wallet private key |

Hyperliquid is an **official sponsor** of Hummingbot Foundation — connector is well-maintained.

---

## Hyperliquid Market Characteristics

### Fees (Tier 0 - Default)

| Market | Taker | Maker |
|--------|-------|-------|
| Perps | 0.045% | 0.015% |
| Spot | 0.070% | 0.040% |

Volume tiers reduce fees. Tier 4 ($500M+ 14d volume) = 0% maker fees.

### Funding Rates

| Parameter | Value |
|-----------|-------|
| Interval | **Hourly** (vs 8h on most CEXs) |
| Base rate | 0.01% / 8h = 11.6% APR to shorts |
| Cap | 4% / hour |
| Settlement | Peer-to-peer (no protocol fees) |

**Key insight:** Hourly funding means 8x more opportunities to capture funding differentials compared to Binance/Bybit.

---

## Strategy Options

### 1. Funding Rate Arbitrage ⭐ (Recommended)

**How it works:**
- Go long on exchange with lower funding rate
- Go short on exchange with higher funding rate
- Collect the funding rate differential
- Exit when profit target hit or rates converge

**Built-in script:** `v2_funding_rate_arb.py`

```python
# Default config
connectors: "hyperliquid_perpetual,binance_perpetual"
tokens: "WIF,FET"  # configurable
position_size_quote: 100  # USD per side
leverage: 20
min_funding_rate_profitability: 0.001  # 0.1%
profitability_to_take_profit: 0.01  # 1%
```

**Logic:**
1. Scan funding rates across both exchanges
2. Find tokens with significant rate differential
3. Open delta-neutral positions (long one, short other)
4. Track funding payments received
5. Exit when: PnL > target OR funding differential reverses

**Pros:**
- Delta neutral = limited directional risk
- Non-latency dependent
- Existing tested code
- Hyperliquid's hourly funding = more frequent capture

**Cons:**
- Entry/exit slippage
- Requires capital on both exchanges
- Funding rates can converge quickly
- Fee drag

### 2. Pure Market Making (Avellaneda-Stoikov)

**How it works:**
- Post limit orders on both sides
- Adjust spreads dynamically based on inventory and volatility
- Profit from bid-ask spread

**Scripts:** `simple_pmm.py`, V2 market making controllers

**Viability on Hyperliquid:**
- Spreads already tight on major pairs
- Competing against sophisticated market makers
- Better on illiquid pairs (wider spreads, lower volume)

**Verdict:** Harder to profit without edge. Skip unless targeting specific low-volume pairs.

### 3. Grid Trading

**How it works:**
- Place orders at fixed price intervals
- Buy low, sell high within a range
- Profits in sideways markets

**Viability:**
- Works if you correctly identify ranging markets
- Loses money in strong trends
- No existing Hyperliquid-specific implementation

**Verdict:** Possible but requires market timing skill.

### 4. Directional (RSI, Momentum)

**How it works:**
- Use technical indicators to predict direction
- Enter long/short based on signals

**Scripts:** `v2_directional_rsi.py`

**Viability:**
- Requires alpha (correct predictions > 50%)
- High variance
- Competes with everyone else using same indicators

**Verdict:** Only if you have a tested edge.

---

## Funding Rate Arbitrage Deep Dive

### Why This Strategy

| Factor | Assessment |
|--------|------------|
| Complexity | Low (existing script) |
| Risk | Medium (delta neutral, but execution + funding risk) |
| Capital requirement | Low-medium ($500-2000 recommended start) |
| Time investment | Low once configured |
| Edge source | Structural (hourly vs 8h funding) |

### How Profitability Works

```
Daily Funding Capture = Position Size × Funding Rate Diff × 24h / Funding Interval

Example:
- Position: $1000 per side
- Funding diff: 0.05% (5 bps)
- Hyperliquid: hourly, Binance: 8h

Hyperliquid captures: $1000 × 0.05% × 24 = $12/day (if rate constant)
Minus fees: ~$0.90 round trip (0.045% × 2 × $1000 × 2)
Minus slippage: ~$1-5 (market orders)

Net: Maybe $5-10/day on $1000 position IF rates stay favorable
Annualized: 180-365% IF consistent (they won't be)
```

**Reality check:** Funding rates fluctuate. Some days positive, some negative. Expect significant variance.

### Configuration Recommendations

```yaml
# Conservative start
leverage: 5-10  # lower leverage = lower liquidation risk
position_size_quote: 500  # start small
min_funding_rate_profitability: 0.002  # 0.2% min diff
profitability_to_take_profit: 0.02  # 2% target
funding_rate_diff_stop_loss: -0.002  # exit if rates flip
trade_profitability_condition_to_enter: true  # check slippage
```

### Token Selection

Best candidates:
- Mid-cap alts with high funding rate volatility
- Tokens listed on both Hyperliquid and Binance
- Avoid majors (BTC, ETH) — tight funding, low diff

Current examples: WIF, FET, PEPE, DOGE (check current rates)

---

## Implementation Path

### Phase 1: Setup (Day 1)

1. **Install Hummingbot**
   ```bash
   git clone https://github.com/hummingbot/hummingbot.git
   cd hummingbot
   docker compose up -d
   docker attach hummingbot
   ```

2. **Connect exchanges**
   ```
   connect hyperliquid_perpetual
   connect binance_perpetual
   ```

3. **Fund accounts**
   - Hyperliquid: Deposit USDC (need Arbitrum bridge)
   - Binance: Deposit USDT to futures wallet

### Phase 2: Paper Trade (Week 1)

1. Use Hyperliquid testnet
   ```
   connect hyperliquid_perpetual_testnet
   ```

2. Configure funding rate arb script
   ```
   create --script-config v2_funding_rate_arb.py
   ```

3. Run for 1 week, track:
   - Funding payments received
   - Entry/exit slippage
   - Rate differential stability

### Phase 3: Small Live (Week 2-3)

1. Start with $500-1000 total capital
2. Single token pair initially
3. Monitor daily
4. Track actual vs expected performance

### Phase 4: Scale or Pivot

Based on results:
- **Profitable:** Gradually increase position size, add more tokens
- **Break-even:** Tune parameters, try different tokens
- **Losing:** Analyze why, consider alternatives or stop

---

## Tools

### Hummingbot Dashboard

Web-based backtesting and bot management:
```bash
git clone https://github.com/hummingbot/deploy.git
cd deploy
bash setup.sh
```

Features:
- Strategy backtesting with Optuna optimization
- Live bot monitoring
- Performance analytics

### Hyperliquid API

Direct API for custom analysis:
```python
import requests

# Get funding rates
resp = requests.post(
    "https://api.hyperliquid.xyz/info",
    json={"type": "meta"}
)
# Returns universe with funding info per asset
```

### Monitoring

Track in real-time:
- Current funding rates: https://app.hyperliquid.xyz/funding
- Position PnL in Hummingbot status
- Funding payments in executor logs

---

## Risk Management

| Risk | Mitigation |
|------|------------|
| Liquidation | Use lower leverage (5-10x), keep margin buffer |
| Funding reversal | Set stop-loss on funding diff |
| Exchange risk | Don't keep full capital on either exchange |
| Execution slippage | Use limit orders where possible, small sizes |
| API failure | Monitor bot health, set alerts |

---

## Expected Outcomes

**Optimistic:** 20-50% annual returns with consistent funding differentials
**Realistic:** 5-15% annual returns with significant variance
**Pessimistic:** Break-even or small loss after fees

This is NOT a guaranteed profit strategy. It's a testable hypothesis with reasonable risk/reward.

---

## Next Steps

1. [ ] Set up Hummingbot with Docker
2. [ ] Generate Hyperliquid API keys
3. [ ] Paper trade for 1 week
4. [ ] Analyze results
5. [ ] Decide: scale, tune, or abandon

Want me to help with any of these steps?

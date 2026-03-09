# Trading Strategy Research

goal: find strategies that outperform in both bull AND bear regimes

## approach
1. research proven quant strategies
2. implement backtests (python/js)
3. parameter optimization
4. regime-aware performance analysis

## strategies to test
- [ ] momentum (trend-following with regime filter)
- [ ] mean reversion (range trading)
- [ ] funding rate arbitrage (delta-neutral)
- [ ] volatility harvesting (premium selling)
- [ ] dual momentum (absolute + relative)
- [ ] breakout systems
- [ ] pairs/stat arb

## data sources
- binance historical (klines, funding)
- coinglass (funding history)
- alternative.me (fear/greed)

## success criteria
- positive returns in both bull AND bear
- sharpe > 1.5
- max drawdown < 25%
- realistic execution assumptions

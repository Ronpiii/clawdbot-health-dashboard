#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * SIMPLIFIED BACKTEST HARNESS
 * 
 * Core: signal generation + stop/target logic, fixed notional position sizing
 * Measure: win_rate, profit_factor, total_pnl, max_drawdown, sharpe
 * No leverage complexity — just $ in / $ out
 */

class BacktestEngine {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.candles = this.loadCandles();
  }

  loadCandles() {
    try {
      const lines = fs.readFileSync(this.dataPath, 'utf-8').trim().split('\n').filter(l => l);
      return lines.map(line => {
        const [ts, o, h, l, c, v] = JSON.parse(line);
        return {
          timestamp: ts,
          open: parseFloat(o),
          high: parseFloat(h),
          low: parseFloat(l),
          close: parseFloat(c),
          volume: parseFloat(v)
        };
      });
    } catch (e) {
      console.error('failed to load candles:', e.message);
      return [];
    }
  }

  // EMA calculation
  calculateEMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  calculateEMAArray(prices, period) {
    if (!prices || prices.length < period) return [];
    const k = 2 / (period + 1);
    const emaArray = [];
    let ema = prices[0];
    
    for (let i = 0; i < prices.length; i++) {
      if (i < period) {
        const slice = prices.slice(0, i + 1);
        ema = slice.reduce((a, b) => a + b, 0) / slice.length;
      } else {
        ema = prices[i] * k + ema * (1 - k);
      }
      emaArray.push(ema);
    }
    return emaArray;
  }

  // generate signal: LONG / SHORT / HOLD
  generateSignal(prices, config) {
    const { ema_period, slope_threshold, slopeLookback = 48 } = config;

    if (prices.length < ema_period + slopeLookback) {
      return null;
    }

    const emaArray = this.calculateEMAArray(prices, ema_period);
    const currentEMA = emaArray[emaArray.length - 1];
    const lookbackEMA = emaArray[emaArray.length - 1 - slopeLookback];
    const currentPrice = prices[prices.length - 1];

    if (!currentEMA || !lookbackEMA) {
      return null;
    }

    const aboveEMA = currentPrice > currentEMA;
    const emaDiff = currentEMA - lookbackEMA;
    const slopePercent = (emaDiff / lookbackEMA) * 100;
    const emaRising = slopePercent > slope_threshold;
    const emaFalling = slopePercent < -slope_threshold;

    // LONG: price > EMA AND EMA rising
    if (aboveEMA && emaRising) {
      return { signal: 'LONG', ema: currentEMA, slope: slopePercent, price: currentPrice };
    }
    // SHORT: price < EMA AND EMA falling
    else if (!aboveEMA && emaFalling) {
      return { signal: 'SHORT', ema: currentEMA, slope: slopePercent, price: currentPrice };
    }
    // HOLD
    else {
      return { signal: 'HOLD', ema: currentEMA, slope: slopePercent, price: currentPrice };
    }
  }

  // simulate trades with fixed notional position size
  async simulate(config) {
    if (this.candles.length < config.ema_period + 100) {
      return {
        num_trades: 0,
        total_pnl: 0,
        win_rate: 0,
        sharpe_ratio: 0,
        max_drawdown: 0,
        profit_factor: 0,
        error: 'insufficient candles'
      };
    }

    const prices = this.candles.map(c => c.close);
    const trades = [];

    // Fixed position: $3 per trade (2% of $150 account)
    const notionalPerTrade = 3;

    let position = null;
    let entryPrice = null;
    let entryIndex = null;
    let equity = 150;
    let peakEquity = equity;
    let equityCurve = [equity];

    const minDataIdx = config.ema_period + Math.max(48, config.slopeLookback || 48);

    // main loop
    for (let i = minDataIdx; i < this.candles.length; i++) {
      const currentPrice = prices[i];
      const windowPrices = prices.slice(Math.max(0, i - config.ema_period - 60), i + 1);
      const signal = this.generateSignal(windowPrices, config);

      if (!signal) continue;

      // UPDATE: check for exit conditions if in position
      if (position) {
        let exitPrice = null;
        let exitReason = null;

        if (position === 'LONG') {
          // TARGET: price >= entry * (1 + target_profit)
          if (currentPrice >= entryPrice * (1 + config.target_profit)) {
            exitPrice = entryPrice * (1 + config.target_profit);
            exitReason = 'target';
          }
          // STOP: price <= entry * (1 - stop_loss)
          else if (currentPrice <= entryPrice * (1 - config.stop_loss)) {
            exitPrice = entryPrice * (1 - config.stop_loss);
            exitReason = 'stop';
          }
          // SIGNAL: SHORT signal triggers exit
          else if (signal.signal === 'SHORT') {
            exitPrice = currentPrice;
            exitReason = 'opposite_signal';
          }
        } else if (position === 'SHORT') {
          // TARGET: price <= entry * (1 - target_profit)
          if (currentPrice <= entryPrice * (1 - config.target_profit)) {
            exitPrice = entryPrice * (1 - config.target_profit);
            exitReason = 'target';
          }
          // STOP: price >= entry * (1 + stop_loss)
          else if (currentPrice >= entryPrice * (1 + config.stop_loss)) {
            exitPrice = entryPrice * (1 + config.stop_loss);
            exitReason = 'stop';
          }
          // SIGNAL: LONG signal triggers exit
          else if (signal.signal === 'LONG') {
            exitPrice = currentPrice;
            exitReason = 'opposite_signal';
          }
        }

        // Process exit
        if (exitPrice) {
          const priceDiff = position === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
          const pnl = notionalPerTrade * (priceDiff / entryPrice);
          equity += pnl;

          trades.push({
            entry: entryPrice,
            exit: exitPrice,
            pnl: parseFloat(pnl.toFixed(2)),
            direction: position,
            bars: i - entryIndex,
            win: pnl > 0,
            reason: exitReason
          });

          position = null;
        }
      }

      peakEquity = Math.max(peakEquity, equity);
      equityCurve.push(equity);

      // ENTER new position if signal and no current position
      if (!position && signal.signal === 'LONG') {
        position = 'LONG';
        entryPrice = signal.price;
        entryIndex = i;
      } else if (!position && signal.signal === 'SHORT') {
        position = 'SHORT';
        entryPrice = signal.price;
        entryIndex = i;
      }
    }

    // CLOSE any open position at end of data
    if (position) {
      const lastPrice = prices[prices.length - 1];
      const priceDiff = position === 'LONG' ? lastPrice - entryPrice : entryPrice - lastPrice;
      const pnl = notionalPerTrade * (priceDiff / entryPrice);
      equity += pnl;

      trades.push({
        entry: entryPrice,
        exit: lastPrice,
        pnl: parseFloat(pnl.toFixed(2)),
        direction: position,
        bars: this.candles.length - entryIndex,
        win: pnl > 0,
        reason: 'eof'
      });
    }

    return this.calculateMetrics(trades, equity, peakEquity, equityCurve);
  }

  calculateMetrics(trades, finalEquity, peakEquity, equityCurve) {
    if (trades.length === 0) {
      return {
        num_trades: 0,
        total_pnl: 0,
        win_rate: 0,
        sharpe_ratio: 0,
        max_drawdown: 0,
        profit_factor: 0,
        error: 'no trades'
      };
    }

    const initialEquity = 150;
    const totalPnL = finalEquity - initialEquity;
    const wins = trades.filter(t => t.win).length;
    const losses = trades.filter(t => !t.win).length;
    const winRate = wins / trades.length;

    // Profit factor
    const winPnL = trades.filter(t => t.win).reduce((sum, t) => sum + t.pnl, 0);
    const lossPnL = Math.abs(trades.filter(t => !t.win).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = lossPnL > 0.01 ? (winPnL / lossPnL) : (winPnL > 0 ? 999 : 0.01);

    // Sharpe ratio from equity curve returns
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      if (equityCurve[i - 1] > 0) {
        returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
      }
    }

    let sharpeRatio = 0;
    if (returns.length > 1) {
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0.0001) {
        sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252 * 24 / 5);
        sharpeRatio = Math.min(999, Math.max(-999, sharpeRatio)); // clamp outliers
      }
    }

    // Max drawdown
    let maxDD = 0;
    let runningMax = initialEquity;
    for (const eq of equityCurve) {
      runningMax = Math.max(runningMax, eq);
      const dd = (runningMax - eq) / runningMax;
      maxDD = Math.max(maxDD, dd);
    }

    return {
      num_trades: trades.length,
      total_pnl: parseFloat(totalPnL.toFixed(2)),
      win_rate: parseFloat(winRate.toFixed(4)),
      sharpe_ratio: parseFloat(sharpeRatio.toFixed(2)),
      max_drawdown: parseFloat(maxDD.toFixed(4)),
      profit_factor: parseFloat(Math.min(999, profitFactor).toFixed(2)),
      wins,
      losses,
      final_equity: parseFloat(finalEquity.toFixed(2))
    };
  }
}

export { BacktestEngine };

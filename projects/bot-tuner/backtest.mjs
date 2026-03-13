#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * BACKTEST HARNESS: load historical data, simulate variant trading, measure performance
 * 
 * Position sizing: 5x leverage on 2% of account = ~0.67% notional per trade
 * e.g., account=$150, pos=0.67%*150=$1 notional, with 5x = effective $5 exposure
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

  // generate trend signal
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

    if (aboveEMA && emaRising) {
      return { signal: 'LONG', ema: currentEMA, slope: slopePercent, price: currentPrice };
    } else if (!aboveEMA && emaFalling) {
      return { signal: 'SHORT', ema: currentEMA, slope: slopePercent, price: currentPrice };
    } else {
      return { signal: 'HOLD', ema: currentEMA, slope: slopePercent, price: currentPrice };
    }
  }

  // simulate trades
  async simulate(config) {
    if (this.candles.length < config.ema_period + 100) {
      return { error: 'insufficient candles', num_trades: 0, total_pnl: 0, win_rate: 0, sharpe_ratio: 0, max_drawdown: 0, profit_factor: 0 };
    }

    const prices = this.candles.map(c => c.close);
    const trades = [];
    const leverage = 5;
    const positionSizePercent = 0.02; // 2% of account per trade

    let position = null;
    let positionSize = 0;
    let equity = 150;
    let entryPrice = null;
    let entryIndex = null;
    let peakEquity = equity;
    let equityCurve = [equity];

    const minDataIdx = config.ema_period + Math.max(48, config.slopeLookback || 48);

    for (let i = minDataIdx; i < this.candles.length; i++) {
      const currentPrice = prices[i];
      const windowPrices = prices.slice(Math.max(0, i - config.ema_period - 60), i + 1);
      const signal = this.generateSignal(windowPrices, config);

      if (!signal) continue;

      // UPDATE POSITION P&L
      if (position) {
        const priceChange = currentPrice - entryPrice;
        const pnl = positionSize * priceChange * leverage;

        // STOP-LOSS
        if (position === 'LONG' && currentPrice <= entryPrice * (1 - config.stop_loss)) {
          equity += positionSize * (entryPrice * (1 - config.stop_loss) - entryPrice) * leverage;
          trades.push({
            entry: entryPrice,
            exit: entryPrice * (1 - config.stop_loss),
            pnl: trades.length > 0 ? positionSize * (entryPrice * (1 - config.stop_loss) - entryPrice) * leverage : 0,
            direction: 'LONG',
            bars: i - entryIndex,
            win: false,
            reason: 'stop'
          });
          position = null;
        }
        // TAKE-PROFIT
        else if (position === 'LONG' && currentPrice >= entryPrice * (1 + config.target_profit)) {
          equity += positionSize * (entryPrice * (1 + config.target_profit) - entryPrice) * leverage;
          trades.push({
            entry: entryPrice,
            exit: entryPrice * (1 + config.target_profit),
            pnl: positionSize * (entryPrice * (1 + config.target_profit) - entryPrice) * leverage,
            direction: 'LONG',
            bars: i - entryIndex,
            win: true,
            reason: 'tp'
          });
          position = null;
        }
        // SHORT STOP
        else if (position === 'SHORT' && currentPrice >= entryPrice * (1 + config.stop_loss)) {
          equity += positionSize * (entryPrice - entryPrice * (1 + config.stop_loss)) * leverage;
          trades.push({
            entry: entryPrice,
            exit: entryPrice * (1 + config.stop_loss),
            pnl: positionSize * (entryPrice - entryPrice * (1 + config.stop_loss)) * leverage,
            direction: 'SHORT',
            bars: i - entryIndex,
            win: false,
            reason: 'stop'
          });
          position = null;
        }
        // SHORT TAKE-PROFIT
        else if (position === 'SHORT' && currentPrice <= entryPrice * (1 - config.target_profit)) {
          equity += positionSize * (entryPrice - entryPrice * (1 - config.target_profit)) * leverage;
          trades.push({
            entry: entryPrice,
            exit: entryPrice * (1 - config.target_profit),
            pnl: positionSize * (entryPrice - entryPrice * (1 - config.target_profit)) * leverage,
            direction: 'SHORT',
            bars: i - entryIndex,
            win: true,
            reason: 'tp'
          });
          position = null;
        }
        // EXIT SIGNAL
        else if (position === 'LONG' && signal.signal === 'SHORT') {
          const pnl = positionSize * (currentPrice - entryPrice) * leverage;
          equity += pnl;
          trades.push({
            entry: entryPrice,
            exit: currentPrice,
            pnl,
            direction: 'LONG',
            bars: i - entryIndex,
            win: pnl > 0,
            reason: 'signal'
          });
          position = null;
        } else if (position === 'SHORT' && signal.signal === 'LONG') {
          const pnl = positionSize * (entryPrice - currentPrice) * leverage;
          equity += pnl;
          trades.push({
            entry: entryPrice,
            exit: currentPrice,
            pnl,
            direction: 'SHORT',
            bars: i - entryIndex,
            win: pnl > 0,
            reason: 'signal'
          });
          position = null;
        }
      }

      peakEquity = Math.max(peakEquity, equity);
      equityCurve.push(equity);

      // ENTER
      if (!position && signal.signal === 'LONG') {
        position = 'LONG';
        positionSize = equity * positionSizePercent;
        entryPrice = signal.price;
        entryIndex = i;
      } else if (!position && signal.signal === 'SHORT') {
        position = 'SHORT';
        positionSize = equity * positionSizePercent;
        entryPrice = signal.price;
        entryIndex = i;
      }
    }

    // CLOSE OPEN POSITION
    if (position) {
      const lastPrice = prices[prices.length - 1];
      const pnl = position === 'LONG'
        ? positionSize * (lastPrice - entryPrice) * leverage
        : positionSize * (entryPrice - lastPrice) * leverage;
      equity += pnl;
      trades.push({
        entry: entryPrice,
        exit: lastPrice,
        pnl,
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
      return { error: 'no trades', num_trades: 0, total_pnl: 0, win_rate: 0, sharpe_ratio: 0, max_drawdown: 0, profit_factor: 0 };
    }

    const initialEquity = 150;
    const totalPnL = finalEquity - initialEquity;
    const wins = trades.filter(t => t.win).length;
    const losses = trades.filter(t => !t.win).length;
    const winRate = wins / trades.length;

    const winPnL = trades.filter(t => t.win).reduce((sum, t) => sum + t.pnl, 0);
    const lossPnL = Math.abs(trades.filter(t => !t.win).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = lossPnL > 0.001 ? Math.min(999, winPnL / lossPnL) : (winPnL > 0 ? 999 : 0);

    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
    }
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0.0001 ? (avgReturn / stdDev) * Math.sqrt(252 * 24 / 5) : 0;

    const maxDD = peakEquity > initialEquity ? ((peakEquity - finalEquity) / peakEquity) : 0;

    return {
      total_pnl: parseFloat(totalPnL.toFixed(2)),
      win_rate: parseFloat(winRate.toFixed(4)),
      profit_factor: parseFloat(profitFactor.toFixed(2)),
      sharpe_ratio: parseFloat(Math.min(999, sharpeRatio).toFixed(2)),
      max_drawdown: parseFloat(Math.max(maxDD, 0).toFixed(4)),
      num_trades: trades.length,
      wins,
      losses,
      final_equity: parseFloat(finalEquity.toFixed(2))
    };
  }
}

export { BacktestEngine };

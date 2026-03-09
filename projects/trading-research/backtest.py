#!/usr/bin/env python3
"""
Backtesting framework for crypto trading strategies
Realistic assumptions: 0.1% fees, slippage model
"""

import json
import urllib.request
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import os

# ============== DATA FETCHING ==============

def fetch_binance_klines(symbol: str, interval: str, start_date: str, end_date: str = None) -> pd.DataFrame:
    """Fetch historical OHLCV from Binance"""
    base_url = "https://api.binance.com/api/v3/klines"
    
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d") if end_date else datetime.now()
    
    start_ts = int(start_dt.timestamp() * 1000)
    end_ts = int(end_dt.timestamp() * 1000)
    
    all_klines = []
    current_start = start_ts
    
    print(f"Fetching {symbol} {interval} data...")
    
    while current_start < end_ts:
        url = f"{base_url}?symbol={symbol}&interval={interval}&startTime={current_start}&endTime={end_ts}&limit=1000"
        
        with urllib.request.urlopen(url) as response:
            klines = json.loads(response.read().decode())
        
        if not klines:
            break
            
        all_klines.extend(klines)
        current_start = klines[-1][0] + 1
        
        if len(klines) < 1000:
            break
    
    df = pd.DataFrame(all_klines, columns=[
        'timestamp', 'open', 'high', 'low', 'close', 'volume',
        'close_time', 'quote_volume', 'trades', 'taker_buy_base',
        'taker_buy_quote', 'ignore'
    ])
    
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df.set_index('timestamp', inplace=True)
    
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = df[col].astype(float)
    
    df = df[['open', 'high', 'low', 'close', 'volume']]
    print(f"  Got {len(df)} candles from {df.index[0]} to {df.index[-1]}")
    
    return df

# ============== INDICATORS ==============

def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period).mean()

def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df['high'], df['low'], df['close']
    tr1 = high - low
    tr2 = abs(high - close.shift(1))
    tr3 = abs(low - close.shift(1))
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0).rolling(period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

# ============== BACKTEST ENGINE ==============

class Backtest:
    def __init__(self, df: pd.DataFrame, fee_pct: float = 0.001):
        self.df = df.copy()
        self.fee_pct = fee_pct  # 0.1% per trade
        
    def run(self, signals: pd.Series) -> Dict:
        """
        Run backtest with position signals
        signals: -1 (short), 0 (flat), 1 (long)
        """
        df = self.df.copy()
        df['signal'] = signals
        df['signal'] = df['signal'].fillna(0)
        
        # Calculate returns
        df['returns'] = df['close'].pct_change()
        
        # Position changes (for fee calculation)
        df['pos_change'] = df['signal'].diff().abs()
        df['pos_change'] = df['pos_change'].fillna(0)
        
        # Strategy returns: signal * returns - fees on position changes
        df['strat_returns'] = df['signal'].shift(1) * df['returns'] - (df['pos_change'] * self.fee_pct)
        df['strat_returns'] = df['strat_returns'].fillna(0)
        
        # Equity curve
        df['equity'] = (1 + df['strat_returns']).cumprod()
        df['buyhold'] = (1 + df['returns'].fillna(0)).cumprod()
        
        # Calculate metrics
        metrics = self._calc_metrics(df)
        
        return {
            'metrics': metrics,
            'equity': df['equity'],
            'buyhold': df['buyhold'],
            'signals': df['signal']
        }
    
    def _calc_metrics(self, df: pd.DataFrame) -> Dict:
        returns = df['strat_returns'].dropna()
        
        # Basic metrics
        total_return = df['equity'].iloc[-1] - 1
        
        # Annualized (assuming daily data)
        days = (df.index[-1] - df.index[0]).days
        years = days / 365.25
        annual_return = (1 + total_return) ** (1/years) - 1 if years > 0 else 0
        
        # Sharpe (annualized, assuming daily)
        daily_rf = 0  # Assume 0 risk-free rate for simplicity
        excess_returns = returns - daily_rf
        sharpe = np.sqrt(365) * excess_returns.mean() / excess_returns.std() if excess_returns.std() > 0 else 0
        
        # Max drawdown
        equity = df['equity']
        rolling_max = equity.expanding().max()
        drawdown = (equity - rolling_max) / rolling_max
        max_dd = drawdown.min()
        
        # Win rate
        trades = df[df['pos_change'] > 0]
        if len(trades) > 0:
            # Simplified: count positive return days when in position
            in_position = df[df['signal'] != 0]['strat_returns']
            win_rate = (in_position > 0).sum() / len(in_position) if len(in_position) > 0 else 0
        else:
            win_rate = 0
        
        # Trade count
        num_trades = int(df['pos_change'].sum() / 2)  # Each trade is entry + exit
        
        # Buy & hold comparison
        bh_return = df['buyhold'].iloc[-1] - 1
        
        return {
            'total_return': total_return,
            'annual_return': annual_return,
            'sharpe': sharpe,
            'max_drawdown': max_dd,
            'win_rate': win_rate,
            'num_trades': num_trades,
            'buyhold_return': bh_return,
            'years': years
        }

# ============== STRATEGIES ==============

def strategy_ema_crossover(df: pd.DataFrame, fast: int = 20, slow: int = 50, with_shorts: bool = True) -> pd.Series:
    """EMA crossover: long when fast > slow, short when fast < slow"""
    fast_ema = ema(df['close'], fast)
    slow_ema = ema(df['close'], slow)
    
    signals = pd.Series(0, index=df.index)
    signals[fast_ema > slow_ema] = 1
    if with_shorts:
        signals[fast_ema < slow_ema] = -1
    
    return signals

def strategy_dual_momentum(df: pd.DataFrame, lookback: int = 90, to_cash_threshold: float = 0) -> pd.Series:
    """
    Dual momentum: 
    - Long if return over lookback > threshold
    - Cash otherwise (no shorts in classic version)
    """
    returns = df['close'].pct_change(lookback)
    
    signals = pd.Series(0, index=df.index)
    signals[returns > to_cash_threshold] = 1
    
    return signals

def strategy_rsi_mean_reversion(df: pd.DataFrame, period: int = 14, oversold: int = 30, overbought: int = 70) -> pd.Series:
    """RSI mean reversion: long when oversold, short when overbought"""
    rsi_val = rsi(df['close'], period)
    
    signals = pd.Series(0, index=df.index)
    
    # Hold position until opposite signal
    position = 0
    for i in range(len(df)):
        if rsi_val.iloc[i] < oversold:
            position = 1
        elif rsi_val.iloc[i] > overbought:
            position = -1
        signals.iloc[i] = position
    
    return signals

def strategy_vol_adjusted_trend(df: pd.DataFrame, trend_period: int = 50, vol_period: int = 20) -> pd.Series:
    """
    Trend following with volatility adjustment:
    - Base signal from price vs SMA
    - Reduce position size when vol is high
    """
    trend_ma = sma(df['close'], trend_period)
    vol = atr(df, vol_period)
    vol_percentile = vol.rolling(252).apply(lambda x: pd.Series(x).rank(pct=True).iloc[-1], raw=False)
    
    # Base signal
    base_signal = pd.Series(0, index=df.index)
    base_signal[df['close'] > trend_ma] = 1
    base_signal[df['close'] < trend_ma] = -1
    
    # Vol adjustment: full size when vol < 50th percentile, half when > 75th
    vol_mult = pd.Series(1.0, index=df.index)
    vol_mult[vol_percentile > 0.75] = 0.5
    vol_mult[vol_percentile > 0.90] = 0.25
    
    signals = base_signal * vol_mult
    
    return signals

def strategy_breakout(df: pd.DataFrame, period: int = 20) -> pd.Series:
    """Donchian channel breakout: long on new high, short on new low"""
    high_channel = df['high'].rolling(period).max()
    low_channel = df['low'].rolling(period).min()
    
    signals = pd.Series(0, index=df.index)
    
    position = 0
    for i in range(period, len(df)):
        if df['close'].iloc[i] >= high_channel.iloc[i-1]:
            position = 1
        elif df['close'].iloc[i] <= low_channel.iloc[i-1]:
            position = -1
        signals.iloc[i] = position
    
    return signals

# ============== REGIME ANALYSIS ==============

def analyze_by_regime(df: pd.DataFrame, equity: pd.Series, regime_period: int = 200) -> Dict:
    """Analyze performance in bull vs bear regimes"""
    trend_ma = sma(df['close'], regime_period)
    
    bull_mask = df['close'] > trend_ma
    bear_mask = df['close'] <= trend_ma
    
    strat_returns = equity.pct_change()
    
    bull_returns = strat_returns[bull_mask]
    bear_returns = strat_returns[bear_mask]
    
    def calc_regime_metrics(returns):
        if len(returns) == 0:
            return {'annual_return': 0, 'sharpe': 0, 'days': 0}
        annual = (1 + returns.mean()) ** 365 - 1
        sharpe = np.sqrt(365) * returns.mean() / returns.std() if returns.std() > 0 else 0
        return {'annual_return': annual, 'sharpe': sharpe, 'days': len(returns)}
    
    return {
        'bull': calc_regime_metrics(bull_returns),
        'bear': calc_regime_metrics(bear_returns)
    }

# ============== MAIN ==============

def run_all_backtests():
    """Run backtests on all strategies and compare"""
    
    # Fetch data
    print("=" * 60)
    print("FETCHING DATA")
    print("=" * 60)
    
    btc = fetch_binance_klines("BTCUSDT", "1d", "2019-01-01", "2026-03-09")
    
    # Initialize backtest engine
    bt = Backtest(btc, fee_pct=0.001)
    
    # Define strategies to test
    strategies = {
        'EMA 20/50 Long Only': lambda df: strategy_ema_crossover(df, 20, 50, with_shorts=False),
        'EMA 20/50 Long+Short': lambda df: strategy_ema_crossover(df, 20, 50, with_shorts=True),
        'EMA 10/30 Long+Short': lambda df: strategy_ema_crossover(df, 10, 30, with_shorts=True),
        'Dual Momentum 90d': lambda df: strategy_dual_momentum(df, 90),
        'Dual Momentum 60d': lambda df: strategy_dual_momentum(df, 60),
        'Dual Momentum 30d': lambda df: strategy_dual_momentum(df, 30),
        'RSI Mean Reversion': lambda df: strategy_rsi_mean_reversion(df, 14, 30, 70),
        'Vol-Adjusted Trend': lambda df: strategy_vol_adjusted_trend(df, 50, 20),
        'Breakout 20d': lambda df: strategy_breakout(df, 20),
        'Breakout 10d': lambda df: strategy_breakout(df, 10),
    }
    
    results = {}
    
    print("\n" + "=" * 60)
    print("RUNNING BACKTESTS")
    print("=" * 60 + "\n")
    
    for name, strategy_fn in strategies.items():
        signals = strategy_fn(btc)
        result = bt.run(signals)
        regime = analyze_by_regime(btc, result['equity'])
        result['regime'] = regime
        results[name] = result
        
        m = result['metrics']
        print(f"{name}:")
        print(f"  Return: {m['total_return']:>8.1%} | Annual: {m['annual_return']:>7.1%} | Sharpe: {m['sharpe']:>5.2f} | MaxDD: {m['max_drawdown']:>7.1%} | Trades: {m['num_trades']:>4}")
        print(f"  Bull: {regime['bull']['annual_return']:>7.1%} | Bear: {regime['bear']['annual_return']:>7.1%}")
        print()
    
    # Summary table
    print("\n" + "=" * 60)
    print("SUMMARY - SORTED BY SHARPE")
    print("=" * 60 + "\n")
    
    sorted_results = sorted(results.items(), key=lambda x: x[1]['metrics']['sharpe'], reverse=True)
    
    print(f"{'Strategy':<25} {'Return':>10} {'Annual':>10} {'Sharpe':>8} {'MaxDD':>10} {'Bull':>10} {'Bear':>10}")
    print("-" * 95)
    
    for name, result in sorted_results:
        m = result['metrics']
        r = result['regime']
        print(f"{name:<25} {m['total_return']:>10.1%} {m['annual_return']:>10.1%} {m['sharpe']:>8.2f} {m['max_drawdown']:>10.1%} {r['bull']['annual_return']:>10.1%} {r['bear']['annual_return']:>10.1%}")
    
    print("-" * 95)
    m = {'total_return': btc['close'].iloc[-1]/btc['close'].iloc[0]-1}
    bh_annual = (1 + m['total_return']) ** (1/((btc.index[-1]-btc.index[0]).days/365.25)) - 1
    print(f"{'Buy & Hold':<25} {m['total_return']:>10.1%} {bh_annual:>10.1%}")
    
    return results

if __name__ == "__main__":
    results = run_all_backtests()

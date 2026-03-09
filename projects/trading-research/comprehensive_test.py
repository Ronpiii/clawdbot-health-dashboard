#!/usr/bin/env python3
"""
Comprehensive parameter testing for:
1. Dual Momentum (various lookbacks)
2. EMA Long Only (various periods)

Both with trailing stop loss variations
"""

import json
import urllib.request
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Tuple
from itertools import product

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
    print(f"  Got {len(df)} candles")
    
    return df

# ============== INDICATORS ==============

def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df['high'], df['low'], df['close']
    tr1 = high - low
    tr2 = abs(high - close.shift(1))
    tr3 = abs(low - close.shift(1))
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(period).mean()

# ============== BACKTEST WITH TRAILING STOP ==============

def backtest_with_trailing_stop(
    df: pd.DataFrame,
    signals: pd.Series,
    trailing_stop_pct: float = None,  # e.g., 0.10 for 10%
    atr_trailing_mult: float = None,  # e.g., 3.0 for 3x ATR
    fee_pct: float = 0.001
) -> Dict:
    """
    Backtest with optional trailing stop loss
    
    signals: 1 = long, 0 = flat, -1 = short
    trailing_stop_pct: fixed percentage trailing stop
    atr_trailing_mult: ATR-based trailing stop multiplier
    """
    df = df.copy()
    df['signal'] = signals.reindex(df.index).fillna(0)
    df['atr'] = atr(df, 14)
    
    # Track positions with trailing stop
    position = 0
    entry_price = 0
    highest_since_entry = 0
    lowest_since_entry = float('inf')
    
    actual_positions = []
    
    for i in range(len(df)):
        price = df['close'].iloc[i]
        high = df['high'].iloc[i]
        low = df['low'].iloc[i]
        target_signal = df['signal'].iloc[i]
        current_atr = df['atr'].iloc[i] if not pd.isna(df['atr'].iloc[i]) else 0
        
        # Update trailing levels
        if position == 1:
            highest_since_entry = max(highest_since_entry, high)
            
            # Check trailing stop
            if trailing_stop_pct:
                stop_price = highest_since_entry * (1 - trailing_stop_pct)
                if low <= stop_price:
                    position = 0  # stopped out
            elif atr_trailing_mult and current_atr > 0:
                stop_price = highest_since_entry - (atr_trailing_mult * current_atr)
                if low <= stop_price:
                    position = 0
        
        elif position == -1:
            lowest_since_entry = min(lowest_since_entry, low)
            
            if trailing_stop_pct:
                stop_price = lowest_since_entry * (1 + trailing_stop_pct)
                if high >= stop_price:
                    position = 0
            elif atr_trailing_mult and current_atr > 0:
                stop_price = lowest_since_entry + (atr_trailing_mult * current_atr)
                if high >= stop_price:
                    position = 0
        
        # New signal overrides (re-entry)
        if target_signal != 0 and target_signal != position:
            position = int(target_signal)
            entry_price = price
            highest_since_entry = high
            lowest_since_entry = low
        elif target_signal == 0 and position != 0:
            # Signal says exit
            position = 0
        
        actual_positions.append(position)
    
    df['position'] = actual_positions
    
    # Calculate returns
    df['returns'] = df['close'].pct_change()
    df['pos_change'] = df['position'].diff().abs().fillna(0)
    df['strat_returns'] = df['position'].shift(1).fillna(0) * df['returns'] - (df['pos_change'] * fee_pct)
    df['equity'] = (1 + df['strat_returns'].fillna(0)).cumprod()
    df['buyhold'] = (1 + df['returns'].fillna(0)).cumprod()
    
    # Metrics
    total_return = df['equity'].iloc[-1] - 1
    days = (df.index[-1] - df.index[0]).days
    years = days / 365.25
    annual_return = (1 + total_return) ** (1/years) - 1 if years > 0 else 0
    
    returns = df['strat_returns'].dropna()
    sharpe = np.sqrt(365) * returns.mean() / returns.std() if returns.std() > 0 else 0
    
    equity = df['equity']
    rolling_max = equity.expanding().max()
    drawdown = (equity - rolling_max) / rolling_max
    max_dd = drawdown.min()
    
    num_trades = int(df['pos_change'].sum() / 2)
    
    bh_return = df['buyhold'].iloc[-1] - 1
    bh_annual = (1 + bh_return) ** (1/years) - 1 if years > 0 else 0
    
    return {
        'total_return': total_return,
        'annual_return': annual_return,
        'sharpe': sharpe,
        'max_drawdown': max_dd,
        'num_trades': num_trades,
        'buyhold_return': bh_return,
        'buyhold_annual': bh_annual,
        'years': years,
        'beats_bh': annual_return > bh_annual
    }

# ============== STRATEGIES ==============

def strategy_dual_momentum(df: pd.DataFrame, lookback: int = 30) -> pd.Series:
    """Long when return over lookback > 0, else flat"""
    returns = df['close'].pct_change(lookback)
    signals = pd.Series(0, index=df.index)
    signals[returns > 0] = 1
    return signals

def strategy_ema_crossover(df: pd.DataFrame, fast: int = 20, slow: int = 50) -> pd.Series:
    """Long when fast EMA > slow EMA"""
    fast_ema = ema(df['close'], fast)
    slow_ema = ema(df['close'], slow)
    signals = pd.Series(0, index=df.index)
    signals[fast_ema > slow_ema] = 1
    return signals

# ============== MAIN TESTING ==============

def run_comprehensive_tests():
    """Test all parameter combinations"""
    
    # Fetch data
    print("=" * 70)
    print("COMPREHENSIVE STRATEGY TESTING")
    print("=" * 70)
    
    btc = fetch_binance_klines("BTCUSDT", "1d", "2019-01-01", "2026-03-09")
    
    results = []
    
    # ============== DUAL MOMENTUM TESTS ==============
    print("\n" + "=" * 70)
    print("DUAL MOMENTUM - Parameter Sweep")
    print("=" * 70)
    
    lookbacks = [14, 20, 30, 45, 60, 90, 120]
    trailing_stops = [None, 0.05, 0.08, 0.10, 0.15, 0.20]
    atr_stops = [None, 2.0, 3.0, 4.0, 5.0]
    
    for lookback in lookbacks:
        # No trailing stop
        signals = strategy_dual_momentum(btc, lookback)
        result = backtest_with_trailing_stop(btc, signals)
        result['strategy'] = 'Dual Momentum'
        result['params'] = f'lookback={lookback}'
        result['trailing'] = 'none'
        results.append(result)
        
        # Fixed % trailing stops
        for ts in trailing_stops:
            if ts is None:
                continue
            result = backtest_with_trailing_stop(btc, signals, trailing_stop_pct=ts)
            result['strategy'] = 'Dual Momentum'
            result['params'] = f'lookback={lookback}'
            result['trailing'] = f'{ts:.0%} trail'
            results.append(result)
        
        # ATR trailing stops
        for atr_mult in atr_stops:
            if atr_mult is None:
                continue
            result = backtest_with_trailing_stop(btc, signals, atr_trailing_mult=atr_mult)
            result['strategy'] = 'Dual Momentum'
            result['params'] = f'lookback={lookback}'
            result['trailing'] = f'{atr_mult}x ATR'
            results.append(result)
    
    # ============== EMA CROSSOVER TESTS ==============
    print("\n" + "=" * 70)
    print("EMA CROSSOVER - Parameter Sweep")
    print("=" * 70)
    
    ema_pairs = [
        (5, 20), (10, 30), (10, 50), (15, 45),
        (20, 50), (20, 100), (25, 75), (30, 100),
        (50, 200), (12, 26)  # MACD-like
    ]
    
    for fast, slow in ema_pairs:
        signals = strategy_ema_crossover(btc, fast, slow)
        
        # No trailing stop
        result = backtest_with_trailing_stop(btc, signals)
        result['strategy'] = 'EMA Crossover'
        result['params'] = f'EMA({fast}/{slow})'
        result['trailing'] = 'none'
        results.append(result)
        
        # Fixed % trailing stops
        for ts in trailing_stops:
            if ts is None:
                continue
            result = backtest_with_trailing_stop(btc, signals, trailing_stop_pct=ts)
            result['strategy'] = 'EMA Crossover'
            result['params'] = f'EMA({fast}/{slow})'
            result['trailing'] = f'{ts:.0%} trail'
            results.append(result)
        
        # ATR trailing stops
        for atr_mult in atr_stops:
            if atr_mult is None:
                continue
            result = backtest_with_trailing_stop(btc, signals, atr_trailing_mult=atr_mult)
            result['strategy'] = 'EMA Crossover'
            result['params'] = f'EMA({fast}/{slow})'
            result['trailing'] = f'{atr_mult}x ATR'
            results.append(result)
    
    # ============== RESULTS ==============
    df_results = pd.DataFrame(results)
    
    # Filter to only those that beat buy & hold
    bh_annual = df_results['buyhold_annual'].iloc[0]
    winners = df_results[df_results['annual_return'] > bh_annual].copy()
    winners = winners.sort_values('annual_return', ascending=False)
    
    print("\n" + "=" * 70)
    print(f"STRATEGIES THAT BEAT BUY & HOLD ({bh_annual:.1%} annual)")
    print("=" * 70)
    print(f"\nFound {len(winners)} winning combinations out of {len(results)} tested\n")
    
    # Top 20
    print("TOP 20 BY ANNUAL RETURN:")
    print("-" * 100)
    print(f"{'Strategy':<15} {'Params':<20} {'Trailing':<12} {'Annual':>10} {'Sharpe':>8} {'MaxDD':>10} {'Trades':>8} {'vs B&H':>10}")
    print("-" * 100)
    
    for _, row in winners.head(20).iterrows():
        vs_bh = row['annual_return'] - bh_annual
        print(f"{row['strategy']:<15} {row['params']:<20} {row['trailing']:<12} {row['annual_return']:>10.1%} {row['sharpe']:>8.2f} {row['max_drawdown']:>10.1%} {row['num_trades']:>8} {vs_bh:>+10.1%}")
    
    # Best by Sharpe (risk-adjusted)
    print("\n" + "=" * 70)
    print("TOP 10 BY SHARPE RATIO (risk-adjusted):")
    print("-" * 100)
    
    by_sharpe = winners.sort_values('sharpe', ascending=False)
    for _, row in by_sharpe.head(10).iterrows():
        vs_bh = row['annual_return'] - bh_annual
        print(f"{row['strategy']:<15} {row['params']:<20} {row['trailing']:<12} {row['annual_return']:>10.1%} {row['sharpe']:>8.2f} {row['max_drawdown']:>10.1%} {row['num_trades']:>8}")
    
    # Best by Max Drawdown (lowest risk)
    print("\n" + "=" * 70)
    print("TOP 10 BY LOWEST MAX DRAWDOWN:")
    print("-" * 100)
    
    by_dd = winners.sort_values('max_drawdown', ascending=False)  # Less negative = better
    for _, row in by_dd.head(10).iterrows():
        print(f"{row['strategy']:<15} {row['params']:<20} {row['trailing']:<12} {row['annual_return']:>10.1%} {row['sharpe']:>8.2f} {row['max_drawdown']:>10.1%} {row['num_trades']:>8}")
    
    # Summary stats
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Total combinations tested: {len(results)}")
    print(f"Beat buy & hold: {len(winners)} ({len(winners)/len(results)*100:.1f}%)")
    print(f"Buy & hold annual return: {bh_annual:.1%}")
    print(f"\nBest overall: {winners.iloc[0]['strategy']} {winners.iloc[0]['params']} {winners.iloc[0]['trailing']} = {winners.iloc[0]['annual_return']:.1%}")
    print(f"Best Sharpe: {by_sharpe.iloc[0]['strategy']} {by_sharpe.iloc[0]['params']} {by_sharpe.iloc[0]['trailing']} = {by_sharpe.iloc[0]['sharpe']:.2f}")
    print(f"Lowest DD: {by_dd.iloc[0]['strategy']} {by_dd.iloc[0]['params']} {by_dd.iloc[0]['trailing']} = {by_dd.iloc[0]['max_drawdown']:.1%}")
    
    # Save full results
    df_results.to_csv('projects/trading-research/full_results.csv', index=False)
    winners.to_csv('projects/trading-research/winners.csv', index=False)
    print("\nResults saved to projects/trading-research/")
    
    return df_results, winners

if __name__ == "__main__":
    results, winners = run_comprehensive_tests()

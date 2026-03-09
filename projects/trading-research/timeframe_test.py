#!/usr/bin/env python3
"""
Test EMA 10/30 strategy across different timeframes
"""

import json
import urllib.request
import pandas as pd
import numpy as np
from datetime import datetime

def fetch_binance_klines(symbol: str, interval: str, start_date: str, end_date: str = None) -> pd.DataFrame:
    base_url = "https://api.binance.com/api/v3/klines"
    
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d") if end_date else datetime.now()
    
    start_ts = int(start_dt.timestamp() * 1000)
    end_ts = int(end_dt.timestamp() * 1000)
    
    all_klines = []
    current_start = start_ts
    
    print(f"Fetching {symbol} {interval}...", end=" ", flush=True)
    
    while current_start < end_ts:
        url = f"{base_url}?symbol={symbol}&interval={interval}&startTime={current_start}&endTime={end_ts}&limit=1000"
        
        try:
            with urllib.request.urlopen(url) as response:
                klines = json.loads(response.read().decode())
        except Exception as e:
            print(f"Error: {e}")
            break
        
        if not klines:
            break
            
        all_klines.extend(klines)
        current_start = klines[-1][0] + 1
        
        if len(klines) < 1000:
            break
    
    if not all_klines:
        return None
        
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
    print(f"{len(df)} candles")
    
    return df

def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def backtest_ema(df: pd.DataFrame, fast: int = 10, slow: int = 30, fee_pct: float = 0.001) -> dict:
    df = df.copy()
    
    fast_ema = ema(df['close'], fast)
    slow_ema = ema(df['close'], slow)
    
    df['signal'] = 0
    df.loc[fast_ema > slow_ema, 'signal'] = 1
    
    df['returns'] = df['close'].pct_change()
    df['pos_change'] = df['signal'].diff().abs().fillna(0)
    df['strat_returns'] = df['signal'].shift(1).fillna(0) * df['returns'] - (df['pos_change'] * fee_pct)
    df['equity'] = (1 + df['strat_returns'].fillna(0)).cumprod()
    df['buyhold'] = (1 + df['returns'].fillna(0)).cumprod()
    
    total_return = df['equity'].iloc[-1] - 1
    days = (df.index[-1] - df.index[0]).days
    years = days / 365.25 if days > 0 else 1
    annual_return = (1 + total_return) ** (1/years) - 1 if years > 0 else 0
    
    returns = df['strat_returns'].dropna()
    
    # Annualization factor depends on timeframe
    periods_per_year = len(df) / years
    sharpe = np.sqrt(periods_per_year) * returns.mean() / returns.std() if returns.std() > 0 else 0
    
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
        'trades_per_year': num_trades / years if years > 0 else 0,
        'buyhold_annual': bh_annual,
        'years': years,
        'candles': len(df)
    }

def main():
    print("=" * 70)
    print("EMA 10/30 STRATEGY - TIMEFRAME COMPARISON")
    print("=" * 70)
    
    # Test different timeframes
    # Lower timeframes = more recent data only (API limits)
    timeframes = [
        ('1d', '2019-01-01', '2026-03-09'),   # Full history
        ('4h', '2021-01-01', '2026-03-09'),   # 5 years
        ('1h', '2023-01-01', '2026-03-09'),   # 3 years
        ('15m', '2024-06-01', '2026-03-09'),  # ~9 months
    ]
    
    results = []
    
    for interval, start, end in timeframes:
        df = fetch_binance_klines("BTCUSDT", interval, start, end)
        if df is None or len(df) < 100:
            print(f"  Skipping {interval} - not enough data")
            continue
            
        result = backtest_ema(df, 10, 30)
        result['timeframe'] = interval
        result['period'] = f"{start} to {end}"
        results.append(result)
    
    # Print results
    print("\n" + "=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"\n{'TF':<6} {'Annual':>10} {'Sharpe':>8} {'MaxDD':>10} {'Trades':>8} {'Trades/Yr':>10} {'B&H':>10} {'Alpha':>10}")
    print("-" * 82)
    
    for r in results:
        alpha = r['annual_return'] - r['buyhold_annual']
        print(f"{r['timeframe']:<6} {r['annual_return']:>10.1%} {r['sharpe']:>8.2f} {r['max_drawdown']:>10.1%} {r['num_trades']:>8} {r['trades_per_year']:>10.1f} {r['buyhold_annual']:>10.1%} {alpha:>+10.1%}")
    
    print("\n" + "=" * 70)
    print("ANALYSIS")
    print("=" * 70)
    
    # Find best
    best = max(results, key=lambda x: x['annual_return'])
    best_sharpe = max(results, key=lambda x: x['sharpe'])
    
    print(f"\nBest annual return: {best['timeframe']} = {best['annual_return']:.1%}")
    print(f"Best risk-adjusted: {best_sharpe['timeframe']} = Sharpe {best_sharpe['sharpe']:.2f}")
    
    # Trade frequency analysis
    print("\nTrade frequency scaling:")
    for r in results:
        print(f"  {r['timeframe']}: {r['trades_per_year']:.0f} trades/year ({r['num_trades']} total)")

if __name__ == "__main__":
    main()

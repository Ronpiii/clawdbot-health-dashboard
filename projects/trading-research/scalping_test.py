#!/usr/bin/env python3
"""
Scalping strategies for low timeframes
Focus on quick entries/exits, tight stops, high win rate
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

# ============== INDICATORS ==============

def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period).mean()

def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0).rolling(period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def bollinger_bands(series: pd.Series, period: int = 20, std_dev: float = 2.0):
    middle = sma(series, period)
    std = series.rolling(period).std()
    upper = middle + (std * std_dev)
    lower = middle - (std * std_dev)
    return lower, middle, upper

def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df['high'], df['low'], df['close']
    tr1 = high - low
    tr2 = abs(high - close.shift(1))
    tr3 = abs(low - close.shift(1))
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def vwap(df: pd.DataFrame, period: int = 20) -> pd.Series:
    typical_price = (df['high'] + df['low'] + df['close']) / 3
    return (typical_price * df['volume']).rolling(period).sum() / df['volume'].rolling(period).sum()

# ============== SCALPING STRATEGIES ==============

def strategy_rsi_scalp(df: pd.DataFrame, period: int = 7, oversold: int = 25, overbought: int = 75, 
                       hold_bars: int = 3) -> pd.Series:
    """Quick RSI mean reversion - enter on extreme, exit after N bars"""
    rsi_val = rsi(df['close'], period)
    
    signals = pd.Series(0, index=df.index)
    position = 0
    bars_held = 0
    
    for i in range(len(df)):
        if position != 0:
            bars_held += 1
            if bars_held >= hold_bars:
                position = 0
                bars_held = 0
        
        if position == 0:
            if rsi_val.iloc[i] < oversold:
                position = 1
                bars_held = 0
            elif rsi_val.iloc[i] > overbought:
                position = -1
                bars_held = 0
        
        signals.iloc[i] = position
    
    return signals

def strategy_bb_bounce(df: pd.DataFrame, period: int = 20, std_dev: float = 2.0,
                       hold_bars: int = 5) -> pd.Series:
    """Bollinger Band bounce - long at lower band, short at upper"""
    lower, middle, upper = bollinger_bands(df['close'], period, std_dev)
    
    signals = pd.Series(0, index=df.index)
    position = 0
    bars_held = 0
    
    for i in range(len(df)):
        if position != 0:
            bars_held += 1
            # Exit at middle band or after hold_bars
            if bars_held >= hold_bars:
                position = 0
                bars_held = 0
            elif position == 1 and df['close'].iloc[i] >= middle.iloc[i]:
                position = 0
            elif position == -1 and df['close'].iloc[i] <= middle.iloc[i]:
                position = 0
        
        if position == 0:
            if df['close'].iloc[i] <= lower.iloc[i]:
                position = 1
                bars_held = 0
            elif df['close'].iloc[i] >= upper.iloc[i]:
                position = -1
                bars_held = 0
        
        signals.iloc[i] = position
    
    return signals

def strategy_vwap_reversion(df: pd.DataFrame, period: int = 20, threshold: float = 0.01,
                            hold_bars: int = 4) -> pd.Series:
    """VWAP mean reversion - enter when price deviates, exit on return"""
    vwap_val = vwap(df, period)
    deviation = (df['close'] - vwap_val) / vwap_val
    
    signals = pd.Series(0, index=df.index)
    position = 0
    bars_held = 0
    
    for i in range(len(df)):
        if position != 0:
            bars_held += 1
            if bars_held >= hold_bars:
                position = 0
                bars_held = 0
            elif position == 1 and df['close'].iloc[i] >= vwap_val.iloc[i]:
                position = 0
            elif position == -1 and df['close'].iloc[i] <= vwap_val.iloc[i]:
                position = 0
        
        if position == 0:
            if deviation.iloc[i] < -threshold:
                position = 1
                bars_held = 0
            elif deviation.iloc[i] > threshold:
                position = -1
                bars_held = 0
        
        signals.iloc[i] = position
    
    return signals

def strategy_momentum_breakout(df: pd.DataFrame, lookback: int = 10, atr_mult: float = 1.5,
                               hold_bars: int = 6) -> pd.Series:
    """Momentum breakout with ATR filter"""
    highest = df['high'].rolling(lookback).max()
    lowest = df['low'].rolling(lookback).min()
    atr_val = atr(df, 14)
    
    signals = pd.Series(0, index=df.index)
    position = 0
    bars_held = 0
    entry_price = 0
    
    for i in range(lookback, len(df)):
        if position != 0:
            bars_held += 1
            
            # ATR-based stop
            if position == 1 and df['close'].iloc[i] < entry_price - (atr_mult * atr_val.iloc[i]):
                position = 0
            elif position == -1 and df['close'].iloc[i] > entry_price + (atr_mult * atr_val.iloc[i]):
                position = 0
            elif bars_held >= hold_bars:
                position = 0
        
        if position == 0:
            # Breakout above recent high
            if df['close'].iloc[i] > highest.iloc[i-1]:
                position = 1
                bars_held = 0
                entry_price = df['close'].iloc[i]
            # Breakdown below recent low
            elif df['close'].iloc[i] < lowest.iloc[i-1]:
                position = -1
                bars_held = 0
                entry_price = df['close'].iloc[i]
        
        signals.iloc[i] = position
    
    return signals

def strategy_ema_scalp(df: pd.DataFrame, fast: int = 3, slow: int = 8, 
                       trend_ema: int = 21, hold_bars: int = 4) -> pd.Series:
    """EMA crossover scalping with trend filter"""
    fast_ema = ema(df['close'], fast)
    slow_ema = ema(df['close'], slow)
    trend = ema(df['close'], trend_ema)
    
    signals = pd.Series(0, index=df.index)
    position = 0
    bars_held = 0
    
    for i in range(trend_ema, len(df)):
        if position != 0:
            bars_held += 1
            
            # Exit on opposite cross or max hold
            if position == 1 and fast_ema.iloc[i] < slow_ema.iloc[i]:
                position = 0
            elif position == -1 and fast_ema.iloc[i] > slow_ema.iloc[i]:
                position = 0
            elif bars_held >= hold_bars:
                position = 0
        
        if position == 0:
            # Long: fast crosses above slow, price above trend
            if fast_ema.iloc[i] > slow_ema.iloc[i] and fast_ema.iloc[i-1] <= slow_ema.iloc[i-1]:
                if df['close'].iloc[i] > trend.iloc[i]:
                    position = 1
                    bars_held = 0
            # Short: fast crosses below slow, price below trend
            elif fast_ema.iloc[i] < slow_ema.iloc[i] and fast_ema.iloc[i-1] >= slow_ema.iloc[i-1]:
                if df['close'].iloc[i] < trend.iloc[i]:
                    position = -1
                    bars_held = 0
        
        signals.iloc[i] = position
    
    return signals

def strategy_volume_spike(df: pd.DataFrame, vol_mult: float = 2.0, lookback: int = 20,
                          hold_bars: int = 3) -> pd.Series:
    """Trade on volume spikes in direction of move"""
    avg_vol = df['volume'].rolling(lookback).mean()
    vol_ratio = df['volume'] / avg_vol
    price_change = df['close'].pct_change()
    
    signals = pd.Series(0, index=df.index)
    position = 0
    bars_held = 0
    
    for i in range(lookback, len(df)):
        if position != 0:
            bars_held += 1
            if bars_held >= hold_bars:
                position = 0
        
        if position == 0:
            if vol_ratio.iloc[i] > vol_mult:
                if price_change.iloc[i] > 0:
                    position = 1
                    bars_held = 0
                elif price_change.iloc[i] < 0:
                    position = -1
                    bars_held = 0
        
        signals.iloc[i] = position
    
    return signals

# ============== BACKTEST ==============

def backtest(df: pd.DataFrame, signals: pd.Series, fee_pct: float = 0.001) -> dict:
    df = df.copy()
    df['signal'] = signals.reindex(df.index).fillna(0)
    
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
    periods_per_year = len(df) / years
    sharpe = np.sqrt(periods_per_year) * returns.mean() / returns.std() if returns.std() > 0 else 0
    
    equity = df['equity']
    rolling_max = equity.expanding().max()
    drawdown = (equity - rolling_max) / rolling_max
    max_dd = drawdown.min()
    
    num_trades = int(df['pos_change'].sum() / 2)
    
    # Win rate
    trade_returns = []
    in_trade = False
    trade_start_equity = 1
    
    for i in range(1, len(df)):
        if df['signal'].iloc[i] != 0 and df['signal'].iloc[i-1] == 0:
            in_trade = True
            trade_start_equity = df['equity'].iloc[i-1]
        elif df['signal'].iloc[i] == 0 and df['signal'].iloc[i-1] != 0:
            if in_trade:
                trade_ret = (df['equity'].iloc[i] / trade_start_equity) - 1
                trade_returns.append(trade_ret)
            in_trade = False
    
    win_rate = sum(1 for r in trade_returns if r > 0) / len(trade_returns) if trade_returns else 0
    avg_win = np.mean([r for r in trade_returns if r > 0]) if any(r > 0 for r in trade_returns) else 0
    avg_loss = np.mean([r for r in trade_returns if r < 0]) if any(r < 0 for r in trade_returns) else 0
    
    bh_return = df['buyhold'].iloc[-1] - 1
    bh_annual = (1 + bh_return) ** (1/years) - 1 if years > 0 else 0
    
    return {
        'total_return': total_return,
        'annual_return': annual_return,
        'sharpe': sharpe,
        'max_drawdown': max_dd,
        'num_trades': num_trades,
        'trades_per_year': num_trades / years if years > 0 else 0,
        'win_rate': win_rate,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'buyhold_annual': bh_annual,
        'years': years
    }

def main():
    print("=" * 80)
    print("SCALPING STRATEGY COMPARISON")
    print("=" * 80)
    
    # Test on 15m and 1h timeframes
    timeframes = [
        ('15m', '2024-06-01', '2026-03-09'),
        ('1h', '2023-06-01', '2026-03-09'),
        ('4h', '2022-01-01', '2026-03-09'),
    ]
    
    strategies = {
        'RSI Scalp (7,25/75)': lambda df: strategy_rsi_scalp(df, 7, 25, 75, 3),
        'RSI Scalp (5,20/80)': lambda df: strategy_rsi_scalp(df, 5, 20, 80, 2),
        'BB Bounce (20,2.0)': lambda df: strategy_bb_bounce(df, 20, 2.0, 5),
        'BB Bounce (10,2.5)': lambda df: strategy_bb_bounce(df, 10, 2.5, 3),
        'VWAP Reversion 1%': lambda df: strategy_vwap_reversion(df, 20, 0.01, 4),
        'VWAP Reversion 0.5%': lambda df: strategy_vwap_reversion(df, 20, 0.005, 3),
        'Momentum Breakout': lambda df: strategy_momentum_breakout(df, 10, 1.5, 6),
        'EMA Scalp (3/8/21)': lambda df: strategy_ema_scalp(df, 3, 8, 21, 4),
        'EMA Scalp (5/13/34)': lambda df: strategy_ema_scalp(df, 5, 13, 34, 6),
        'Volume Spike 2x': lambda df: strategy_volume_spike(df, 2.0, 20, 3),
        'Volume Spike 3x': lambda df: strategy_volume_spike(df, 3.0, 20, 4),
    }
    
    for interval, start, end in timeframes:
        print(f"\n{'=' * 80}")
        print(f"TIMEFRAME: {interval}")
        print(f"{'=' * 80}")
        
        df = fetch_binance_klines("BTCUSDT", interval, start, end)
        if df is None or len(df) < 500:
            print("  Not enough data")
            continue
        
        results = []
        
        for name, strategy_fn in strategies.items():
            try:
                signals = strategy_fn(df)
                result = backtest(df, signals)
                result['strategy'] = name
                results.append(result)
            except Exception as e:
                print(f"  Error with {name}: {e}")
        
        # Sort by annual return
        results.sort(key=lambda x: x['annual_return'], reverse=True)
        
        print(f"\n{'Strategy':<25} {'Annual':>10} {'Sharpe':>8} {'MaxDD':>10} {'WinRate':>10} {'Trades/Yr':>10} {'vs B&H':>10}")
        print("-" * 95)
        
        bh = results[0]['buyhold_annual'] if results else 0
        
        for r in results:
            alpha = r['annual_return'] - r['buyhold_annual']
            marker = "✓" if r['annual_return'] > r['buyhold_annual'] else ""
            print(f"{r['strategy']:<25} {r['annual_return']:>10.1%} {r['sharpe']:>8.2f} {r['max_drawdown']:>10.1%} {r['win_rate']:>10.1%} {r['trades_per_year']:>10.0f} {alpha:>+10.1%} {marker}")
        
        # Winners summary
        winners = [r for r in results if r['annual_return'] > r['buyhold_annual']]
        print(f"\n{len(winners)}/{len(results)} strategies beat buy & hold on {interval}")

if __name__ == "__main__":
    main()

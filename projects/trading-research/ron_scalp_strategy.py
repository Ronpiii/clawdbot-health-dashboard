#!/usr/bin/env python3
"""
Ron's scalping framework:
1. Higher TF trend filter (daily)
2. Key level identification (recent swing highs/lows)
3. Failed breakdown detection (level tested but holds)
4. Tight stop under level, TP at range opposite
5. Session filtering (optional)
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

def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df['high'], df['low'], df['close']
    tr1 = high - low
    tr2 = abs(high - close.shift(1))
    tr3 = abs(low - close.shift(1))
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def find_key_levels(df: pd.DataFrame, lookback: int = 50, tolerance_pct: float = 0.002) -> tuple:
    """Find recent swing highs and lows that act as key levels"""
    recent = df.tail(lookback)
    
    # Find swing highs and lows
    highs = recent['high'].values
    lows = recent['low'].values
    
    # Cluster nearby levels
    resistance_levels = []
    support_levels = []
    
    for i in range(2, len(recent) - 2):
        # Swing high
        if highs[i] > highs[i-1] and highs[i] > highs[i-2] and highs[i] > highs[i+1] and highs[i] > highs[i+2]:
            resistance_levels.append(highs[i])
        # Swing low
        if lows[i] < lows[i-1] and lows[i] < lows[i-2] and lows[i] < lows[i+1] and lows[i] < lows[i+2]:
            support_levels.append(lows[i])
    
    return support_levels, resistance_levels

def count_level_tests(df: pd.DataFrame, level: float, lookback: int = 20, tolerance_pct: float = 0.003) -> int:
    """Count how many times price tested a level without breaking"""
    recent = df.tail(lookback)
    tolerance = level * tolerance_pct
    
    tests = 0
    for i in range(len(recent)):
        low = recent['low'].iloc[i]
        high = recent['high'].iloc[i]
        close = recent['close'].iloc[i]
        
        # Test = price touched level but closed away from it
        if abs(low - level) < tolerance and close > level + tolerance:
            tests += 1
        elif abs(high - level) < tolerance and close < level - tolerance:
            tests += 1
    
    return tests

def strategy_key_level_bounce(df: pd.DataFrame, 
                               level_lookback: int = 50,
                               test_lookback: int = 20,
                               min_tests: int = 2,
                               stop_atr_mult: float = 0.5,
                               tp_atr_mult: float = 2.0,
                               trend_ema: int = 50) -> pd.Series:
    """
    Ron's key level bounce strategy:
    - Find key support/resistance levels
    - Enter when level tested multiple times but holds
    - Tight stop under level
    - TP at range opposite or X ATR
    - Filter by higher TF trend
    """
    df = df.copy()
    df['atr'] = atr(df, 14)
    df['trend'] = ema(df['close'], trend_ema)
    
    signals = pd.Series(0.0, index=df.index)
    position = 0
    entry_price = 0
    stop_price = 0
    tp_price = 0
    
    for i in range(level_lookback + 10, len(df)):
        current_price = df['close'].iloc[i]
        current_low = df['low'].iloc[i]
        current_high = df['high'].iloc[i]
        current_atr = df['atr'].iloc[i]
        trend_val = df['trend'].iloc[i]
        
        # Check stops and TPs first
        if position == 1:
            if current_low <= stop_price:
                position = 0
            elif current_high >= tp_price:
                position = 0
        elif position == -1:
            if current_high >= stop_price:
                position = 0
            elif current_low <= tp_price:
                position = 0
        
        # Look for new entries
        if position == 0:
            # Get recent data for level finding
            recent_df = df.iloc[i-level_lookback:i]
            support_levels, resistance_levels = find_key_levels(recent_df, level_lookback)
            
            # Check support levels for long entries (bullish trend)
            if current_price > trend_val:  # Bullish bias
                for level in support_levels:
                    if current_low <= level * 1.003 and current_price > level:
                        # Price touched support but bounced
                        tests = count_level_tests(df.iloc[i-test_lookback:i], level, test_lookback)
                        if tests >= min_tests:
                            position = 1
                            entry_price = current_price
                            stop_price = level - (current_atr * stop_atr_mult)
                            tp_price = current_price + (current_atr * tp_atr_mult)
                            break
            
            # Check resistance levels for short entries (bearish trend)
            elif current_price < trend_val:  # Bearish bias
                for level in resistance_levels:
                    if current_high >= level * 0.997 and current_price < level:
                        # Price touched resistance but rejected
                        tests = count_level_tests(df.iloc[i-test_lookback:i], level, test_lookback)
                        if tests >= min_tests:
                            position = -1
                            entry_price = current_price
                            stop_price = level + (current_atr * stop_atr_mult)
                            tp_price = current_price - (current_atr * tp_atr_mult)
                            break
        
        signals.iloc[i] = position
    
    return signals

def strategy_range_trading(df: pd.DataFrame,
                           range_lookback: int = 30,
                           entry_threshold: float = 0.02,
                           stop_pct: float = 0.01,
                           trend_ema: int = 100) -> pd.Series:
    """
    Range trading with trend filter:
    - Identify range (recent high/low)
    - Long near range low in uptrend
    - Short near range high in downtrend
    - Tight stop, TP at opposite end
    """
    df = df.copy()
    df['trend'] = ema(df['close'], trend_ema)
    df['range_high'] = df['high'].rolling(range_lookback).max()
    df['range_low'] = df['low'].rolling(range_lookback).min()
    df['range_size'] = df['range_high'] - df['range_low']
    
    signals = pd.Series(0.0, index=df.index)
    position = 0
    entry_price = 0
    stop_price = 0
    tp_price = 0
    
    for i in range(range_lookback + 10, len(df)):
        current_price = df['close'].iloc[i]
        current_low = df['low'].iloc[i]
        current_high = df['high'].iloc[i]
        trend_val = df['trend'].iloc[i]
        range_high = df['range_high'].iloc[i-1]  # Previous range
        range_low = df['range_low'].iloc[i-1]
        range_size = df['range_size'].iloc[i-1]
        
        # Check stops and TPs
        if position == 1:
            if current_low <= stop_price:
                position = 0
            elif current_high >= tp_price:
                position = 0
        elif position == -1:
            if current_high >= stop_price:
                position = 0
            elif current_low <= tp_price:
                position = 0
        
        # New entries
        if position == 0 and range_size > 0:
            # Position in range (0 = at low, 1 = at high)
            range_position = (current_price - range_low) / range_size
            
            # Long near range low in uptrend
            if range_position < entry_threshold and current_price > trend_val:
                position = 1
                entry_price = current_price
                stop_price = range_low * (1 - stop_pct)
                tp_price = range_high * 0.99  # Slightly below resistance
            
            # Short near range high in downtrend
            elif range_position > (1 - entry_threshold) and current_price < trend_val:
                position = -1
                entry_price = current_price
                stop_price = range_high * (1 + stop_pct)
                tp_price = range_low * 1.01  # Slightly above support
        
        signals.iloc[i] = position
    
    return signals

def strategy_failed_breakdown(df: pd.DataFrame,
                               lookback: int = 20,
                               breakdown_threshold: float = 0.005,
                               recovery_threshold: float = 0.003,
                               stop_mult: float = 1.5,
                               tp_mult: float = 3.0) -> pd.Series:
    """
    Failed breakdown/breakout detection:
    - Price breaks level but quickly recovers
    - Enter on recovery, stop below the false break
    - This is the "level just not breaking" pattern
    """
    df = df.copy()
    df['atr'] = atr(df, 14)
    df['recent_low'] = df['low'].rolling(lookback).min()
    df['recent_high'] = df['high'].rolling(lookback).max()
    
    signals = pd.Series(0.0, index=df.index)
    position = 0
    entry_price = 0
    stop_price = 0
    tp_price = 0
    
    for i in range(lookback + 5, len(df)):
        current_price = df['close'].iloc[i]
        current_low = df['low'].iloc[i]
        current_high = df['high'].iloc[i]
        prev_close = df['close'].iloc[i-1]
        current_atr = df['atr'].iloc[i]
        
        recent_low = df['recent_low'].iloc[i-1]
        recent_high = df['recent_high'].iloc[i-1]
        
        # Check stops and TPs
        if position == 1:
            if current_low <= stop_price:
                position = 0
            elif current_high >= tp_price:
                position = 0
        elif position == -1:
            if current_high >= stop_price:
                position = 0
            elif current_low <= tp_price:
                position = 0
        
        if position == 0:
            # Failed breakdown: price went below recent low but closed back above
            if current_low < recent_low * (1 - breakdown_threshold):
                if current_price > recent_low * (1 + recovery_threshold):
                    # Failed breakdown - go long
                    position = 1
                    entry_price = current_price
                    stop_price = current_low - (current_atr * stop_mult)
                    tp_price = current_price + (current_atr * tp_mult)
            
            # Failed breakout: price went above recent high but closed back below
            elif current_high > recent_high * (1 + breakdown_threshold):
                if current_price < recent_high * (1 - recovery_threshold):
                    # Failed breakout - go short
                    position = -1
                    entry_price = current_price
                    stop_price = current_high + (current_atr * stop_mult)
                    tp_price = current_price - (current_atr * tp_mult)
        
        signals.iloc[i] = position
    
    return signals

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
    
    # Win rate calculation
    trade_returns = []
    in_trade = False
    trade_start_equity = 1
    
    for i in range(1, len(df)):
        if df['signal'].iloc[i] != 0 and df['signal'].iloc[i-1] == 0:
            in_trade = True
            trade_start_equity = df['equity'].iloc[i-1] if df['equity'].iloc[i-1] > 0 else 1
        elif df['signal'].iloc[i] == 0 and df['signal'].iloc[i-1] != 0:
            if in_trade and trade_start_equity > 0:
                trade_ret = (df['equity'].iloc[i] / trade_start_equity) - 1
                trade_returns.append(trade_ret)
            in_trade = False
    
    win_rate = sum(1 for r in trade_returns if r > 0) / len(trade_returns) if trade_returns else 0
    
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
        'buyhold_annual': bh_annual,
        'years': years,
        'beats_bh': annual_return > bh_annual
    }

def main():
    print("=" * 80)
    print("RON'S SCALPING FRAMEWORK - CODIFIED")
    print("=" * 80)
    
    timeframes = [
        ('15m', '2024-06-01', '2026-03-09'),
        ('1h', '2023-06-01', '2026-03-09'),
        ('4h', '2022-01-01', '2026-03-09'),
    ]
    
    for interval, start, end in timeframes:
        print(f"\n{'=' * 80}")
        print(f"TIMEFRAME: {interval}")
        print(f"{'=' * 80}")
        
        df = fetch_binance_klines("BTCUSDT", interval, start, end)
        if df is None or len(df) < 500:
            print("  Not enough data")
            continue
        
        strategies = {
            'Key Level Bounce (tight)': lambda d: strategy_key_level_bounce(d, 50, 20, 2, 0.5, 2.0, 50),
            'Key Level Bounce (wide)': lambda d: strategy_key_level_bounce(d, 100, 30, 3, 1.0, 3.0, 100),
            'Range Trading (tight)': lambda d: strategy_range_trading(d, 20, 0.02, 0.01, 50),
            'Range Trading (wide)': lambda d: strategy_range_trading(d, 50, 0.05, 0.02, 100),
            'Failed Breakdown (tight)': lambda d: strategy_failed_breakdown(d, 15, 0.003, 0.002, 1.0, 2.0),
            'Failed Breakdown (wide)': lambda d: strategy_failed_breakdown(d, 30, 0.005, 0.003, 1.5, 3.0),
            'Failed Breakdown (3:1 RR)': lambda d: strategy_failed_breakdown(d, 20, 0.004, 0.002, 1.0, 3.0),
            'Failed Breakdown (5:1 RR)': lambda d: strategy_failed_breakdown(d, 20, 0.004, 0.002, 1.0, 5.0),
        }
        
        results = []
        
        for name, strategy_fn in strategies.items():
            try:
                signals = strategy_fn(df)
                result = backtest(df, signals)
                result['strategy'] = name
                results.append(result)
            except Exception as e:
                print(f"  Error with {name}: {e}")
        
        results.sort(key=lambda x: x['annual_return'], reverse=True)
        
        print(f"\n{'Strategy':<30} {'Annual':>10} {'Sharpe':>8} {'MaxDD':>10} {'WinRate':>10} {'Trades/Yr':>10} {'vs B&H':>10}")
        print("-" * 100)
        
        for r in results:
            alpha = r['annual_return'] - r['buyhold_annual']
            marker = "✓" if r['beats_bh'] else ""
            print(f"{r['strategy']:<30} {r['annual_return']:>10.1%} {r['sharpe']:>8.2f} {r['max_drawdown']:>10.1%} {r['win_rate']:>10.1%} {r['trades_per_year']:>10.0f} {alpha:>+10.1%} {marker}")
        
        winners = [r for r in results if r['beats_bh']]
        print(f"\n{len(winners)}/{len(results)} strategies beat buy & hold on {interval}")

if __name__ == "__main__":
    main()

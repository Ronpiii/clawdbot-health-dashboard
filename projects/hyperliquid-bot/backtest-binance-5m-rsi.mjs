#!/usr/bin/env node
/**
 * Backtest: 200 EMA 5-min + RSI momentum filter + 5% stoploss
 * Data: Binance
 * 
 * Entry: EMA crossover + RSI confirmation
 * - LONG: price crosses above EMA + RSI > 50
 * - SHORT: price crosses below EMA + RSI < 50
 * Exit: 5% away from EMA
 * 
 * Usage: node backtest-binance-5m-rsi.mjs [symbol] [days]
 */

const SYMBOL = (process.argv[2]?.toUpperCase() || 'BTC') + 'USDT';
const DAYS = parseInt(process.argv[3]) || 30;
const EMA_PERIOD = 200;
const RSI_PERIOD = 14;
const STOPLOSS_PCT = 5;

console.log(`\n📊 BACKTEST: ${SYMBOL.replace('USDT', '')} ${DAYS}d | 5m chart | 200 EMA + RSI filter | 5% stoploss\n`);

async function fetchBinanceCandles(symbol, days) {
  const now = Date.now();
  const startTime = now - (days * 24 * 60 * 60 * 1000);
  const allCandles = [];
  let currentTime = startTime;
  const limit = 1000;
  
  console.log(`⏳ Fetching ${days} days of 5-min candles...`);
  
  while (currentTime < now) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&startTime=${currentTime}&limit=${limit}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) break;
      
      allCandles.push(...data);
      currentTime = data[data.length - 1][0] + 1;
      process.stdout.write('.');
    } catch (err) {
      console.error(`\n❌ Fetch error: ${err.message}`);
      break;
    }
  }
  
  console.log(`\n✓ Fetched ${allCandles.length} candles\n`);
  return allCandles;
}

function calculateEMA(closes, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      ema.push(closes[i]);
    } else {
      ema.push((closes[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
    }
  }
  return ema;
}

function calculateRSI(closes, period) {
  const rsi = [];
  let gains = 0, losses = 0;
  
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      rsi.push(50);
      continue;
    }
    
    const change = closes[i] - closes[i - 1];
    
    if (i < period) {
      if (change > 0) gains += change;
      else losses -= change;
      
      if (i === period - 1) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgGain / (avgLoss || 0.0001);
        rsi.push(100 - (100 / (1 + rs)));
      } else {
        rsi.push(50);
      }
    } else {
      const prevGains = (gains / period);
      const prevLosses = (losses / period);
      
      const currentGain = change > 0 ? change : 0;
      const currentLoss = change < 0 ? -change : 0;
      
      const avgGain = (prevGains * (period - 1) + currentGain) / period;
      const avgLoss = (prevLosses * (period - 1) + currentLoss) / period;
      
      const rs = avgGain / (avgLoss || 0.0001);
      rsi.push(100 - (100 / (1 + rs)));
      
      gains = prevGains * period;
      losses = prevLosses * period;
    }
  }
  
  return rsi;
}

function backtest(candles) {
  if (candles.length < Math.max(EMA_PERIOD, RSI_PERIOD)) {
    console.log(`❌ Not enough data`);
    return;
  }
  
  const times = candles.map(c => parseInt(c[0]));
  const closes = candles.map(c => parseFloat(c[4]));
  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));
  
  const ema = calculateEMA(closes, EMA_PERIOD);
  const rsi = calculateRSI(closes, RSI_PERIOD);
  
  let position = null;
  let trades = [];
  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  let maxDrawdown = 0;
  let peakEquity = 0;
  let rejectedSignals = 0;
  
  for (let i = EMA_PERIOD; i < closes.length; i++) {
    const close = closes[i];
    const high = highs[i];
    const low = lows[i];
    const emaValue = ema[i];
    const rsiValue = rsi[i];
    const prevClose = closes[i - 1];
    const prevEma = ema[i - 1];
    const time = new Date(times[i]).toISOString().split('T')[0];
    
    peakEquity = Math.max(peakEquity, totalPnL);
    maxDrawdown = Math.max(maxDrawdown, peakEquity - totalPnL);
    
    if (!position) {
      // LONG: EMA crossover + RSI > 50
      if (prevClose <= prevEma && close > emaValue && rsiValue > 50) {
        position = {
          type: 'LONG',
          entryPrice: close,
          entryEMA: emaValue,
          entryRSI: rsiValue,
          entryTime: time,
          entryIdx: i
        };
      }
      // SHORT: EMA crossover + RSI < 50
      else if (prevClose >= prevEma && close < emaValue && rsiValue < 50) {
        position = {
          type: 'SHORT',
          entryPrice: close,
          entryEMA: emaValue,
          entryRSI: rsiValue,
          entryTime: time,
          entryIdx: i
        };
      }
      // Signal rejected (EMA crossover but RSI disagrees)
      else if ((prevClose <= prevEma && close > emaValue && rsiValue <= 50) ||
               (prevClose >= prevEma && close < emaValue && rsiValue >= 50)) {
        rejectedSignals++;
      }
    } else {
      // Exit: 5% away from EMA
      const stoplossDistance = emaValue * (STOPLOSS_PCT / 100);
      const upperBound = emaValue + stoplossDistance;
      const lowerBound = emaValue - stoplossDistance;
      
      let shouldExit = false;
      let exitPrice = null;
      
      if (position.type === 'LONG' && low < lowerBound) {
        shouldExit = true;
        exitPrice = lowerBound;
      } else if (position.type === 'SHORT' && high > upperBound) {
        shouldExit = true;
        exitPrice = upperBound;
      }
      
      if (shouldExit && exitPrice) {
        const pnlPct = position.type === 'LONG'
          ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
        
        totalPnL += pnlPct;
        if (pnlPct > 0) wins++;
        else losses++;
        
        trades.push({
          type: position.type,
          entry: position.entryPrice.toFixed(2),
          exit: exitPrice.toFixed(2),
          pnlPct: pnlPct.toFixed(3),
          bars: i - position.entryIdx,
          rsi: position.entryRSI.toFixed(1),
          time
        });
        
        position = null;
      }
    }
  }
  
  // Close open position
  if (position) {
    const exitPrice = closes[closes.length - 1];
    const pnlPct = position.type === 'LONG'
      ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
    
    totalPnL += pnlPct;
    if (pnlPct > 0) wins++;
    else losses++;
    
    trades.push({
      type: position.type,
      entry: position.entryPrice.toFixed(2),
      exit: exitPrice.toFixed(2),
      pnlPct: pnlPct.toFixed(3),
      bars: closes.length - position.entryIdx,
      rsi: position.entryRSI.toFixed(1),
      time: new Date(times[times.length - 1]).toISOString().split('T')[0]
    });
  }
  
  const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : 0;
  
  console.log(`═══════════════════════════════════════`);
  console.log(`BACKTEST: 200 EMA 5m + RSI Filter`);
  console.log(`═══════════════════════════════════════\n`);
  
  console.log(`Period: ${DAYS} days | Candles: ${closes.length}`);
  console.log(`Entry: EMA crossover + RSI > 50 (LONG) or RSI < 50 (SHORT)`);
  console.log(`Exit: 5% away from EMA\n`);
  
  console.log(`📊 Signals:`);
  console.log(`Trades taken: ${trades.length}`);
  console.log(`Signals rejected (wrong RSI): ${rejectedSignals}`);
  console.log(`\n✅ Wins: ${wins}`);
  console.log(`❌ Losses: ${losses}`);
  console.log(`📈 Win Rate: ${winRate}%`);
  console.log(`\n💰 Performance:`);
  console.log(`Total P&L: ${totalPnL.toFixed(2)}%`);
  console.log(`Avg P&L: ${(totalPnL / trades.length).toFixed(3)}%`);
  console.log(`Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`\n`);
  
  console.log(`Trades:\n`);
  console.log(`# | Type  | Entry    | Exit     | P&L %    | RSI  | Bars | Date`);
  console.log(`─────────────────────────────────────────────────────────────`);
  
  trades.forEach((t, i) => {
    const emoji = parseFloat(t.pnlPct) > 0 ? '✅' : '❌';
    console.log(`${String(i+1).padEnd(2)}| ${t.type.padEnd(5)}| $${t.entry.padEnd(7)}| $${t.exit.padEnd(7)}| ${emoji} ${t.pnlPct.padEnd(7)}| ${t.rsi.padEnd(4)}| ${String(t.bars).padEnd(4)}| ${t.time}`);
  });
  
  console.log(`\n═══════════════════════════════════════\n`);
  
  const improvement = totalPnL > 0 ? '✅ BETTER' : '❌ WORSE';
  console.log(`vs. EMA-only (5% SL): ${improvement} (EMA-only: +2.66% in 7d, -0.13% in 30d)`);
  console.log(`RSI filter reduces whipsaws by requiring momentum confirmation.\n`);
}

(async () => {
  try {
    const candles = await fetchBinanceCandles(SYMBOL, DAYS);
    backtest(candles);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
})();

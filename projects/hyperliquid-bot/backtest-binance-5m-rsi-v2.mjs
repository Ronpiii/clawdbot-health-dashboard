#!/usr/bin/env node
/**
 * 200 EMA 5m + RSI 40-60 bands + 5% stoploss
 * More trades, less strict filtering
 */

const SYMBOL = (process.argv[2]?.toUpperCase() || 'BTC') + 'USDT';
const DAYS = parseInt(process.argv[3]) || 30;
const EMA_PERIOD = 50;
const RSI_PERIOD = 14;
const STOPLOSS_PCT = 2;
const RSI_LONG_MIN = 40;  // LONG if RSI > 40
const RSI_SHORT_MAX = 60; // SHORT if RSI < 60

console.log(`\n📊 BACKTEST: ${SYMBOL.replace('USDT', '')} ${DAYS}d | 200 EMA + RSI 40-60 | 5% SL\n`);

async function fetchBinanceCandles(symbol, days) {
  const now = Date.now();
  const startTime = now - (days * 24 * 60 * 60 * 1000);
  const allCandles = [];
  let currentTime = startTime;
  
  console.log(`⏳ Fetching ${days} days...`);
  while (currentTime < now) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&startTime=${currentTime}&limit=1000`;
      const data = await fetch(url).then(r => r.json());
      if (!Array.isArray(data) || data.length === 0) break;
      allCandles.push(...data);
      currentTime = data[data.length - 1][0] + 1;
      process.stdout.write('.');
    } catch (err) { break; }
  }
  console.log(`\n✓ ${allCandles.length} candles\n`);
  return allCandles;
}

function calculateEMA(closes, period) {
  const ema = [];
  const m = 2 / (period + 1);
  for (let i = 0; i < closes.length; i++) {
    ema.push(i === 0 ? closes[i] : (closes[i] * m) + (ema[i - 1] * (1 - m)));
  }
  return ema;
}

function calculateRSI(closes, period) {
  const rsi = [];
  let gains = 0, losses = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { rsi.push(50); continue; }
    const change = closes[i] - closes[i - 1];
    if (i < period) {
      if (change > 0) gains += change; else losses -= change;
      if (i === period - 1) {
        const rs = (gains / period) / ((losses / period) || 0.0001);
        rsi.push(100 - (100 / (1 + rs)));
      } else rsi.push(50);
    } else {
      const pg = (gains / period), pl = (losses / period);
      const cg = change > 0 ? change : 0, cl = change < 0 ? -change : 0;
      const ag = (pg * (period - 1) + cg) / period;
      const al = (pl * (period - 1) + cl) / period;
      const rs = ag / (al || 0.0001);
      rsi.push(100 - (100 / (1 + rs)));
      gains = pg * period;
      losses = pl * period;
    }
  }
  return rsi;
}

function backtest(candles) {
  const times = candles.map(c => parseInt(c[0]));
  const closes = candles.map(c => parseFloat(c[4]));
  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));
  
  const ema = calculateEMA(closes, EMA_PERIOD);
  const rsi = calculateRSI(closes, RSI_PERIOD);
  
  let position = null, trades = [], totalPnL = 0, wins = 0, losses = 0;
  let maxDD = 0, peakEquity = 0;
  
  for (let i = EMA_PERIOD; i < closes.length; i++) {
    const close = closes[i], high = highs[i], low = lows[i];
    const emaVal = ema[i], rsiVal = rsi[i];
    const prevClose = closes[i - 1], prevEma = ema[i - 1];
    const time = new Date(times[i]).toISOString().split('T')[0];
    
    peakEquity = Math.max(peakEquity, totalPnL);
    maxDD = Math.max(maxDD, peakEquity - totalPnL);
    
    if (!position) {
      if (prevClose <= prevEma && close > emaVal && rsiVal > RSI_LONG_MIN) {
        position = { type: 'LONG', entry: close, ema: emaVal, rsi: rsiVal.toFixed(1), idx: i, time };
      } else if (prevClose >= prevEma && close < emaVal && rsiVal < RSI_SHORT_MAX) {
        position = { type: 'SHORT', entry: close, ema: emaVal, rsi: rsiVal.toFixed(1), idx: i, time };
      }
    } else {
      const sl = emaVal * (STOPLOSS_PCT / 100);
      const ub = emaVal + sl, lb = emaVal - sl;
      let exit = null;
      
      if (position.type === 'LONG' && low < lb) exit = lb;
      else if (position.type === 'SHORT' && high > ub) exit = ub;
      
      if (exit) {
        const pnl = position.type === 'LONG'
          ? ((exit - position.entry) / position.entry) * 100
          : ((position.entry - exit) / position.entry) * 100;
        totalPnL += pnl;
        if (pnl > 0) wins++; else losses++;
        trades.push({ type: position.type, entry: position.entry.toFixed(2), exit: exit.toFixed(2), pnl: pnl.toFixed(3), rsi: position.rsi, bars: i - position.idx, time: position.time });
        position = null;
      }
    }
  }
  
  if (position) {
    const exit = closes[closes.length - 1];
    const pnl = position.type === 'LONG' ? ((exit - position.entry) / position.entry) * 100 : ((position.entry - exit) / position.entry) * 100;
    totalPnL += pnl;
    if (pnl > 0) wins++; else losses++;
    trades.push({ type: position.type, entry: position.entry.toFixed(2), exit: exit.toFixed(2), pnl: pnl.toFixed(3), rsi: position.rsi, bars: closes.length - position.idx, time: position.time });
  }
  
  const wr = trades.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  console.log(`═══════════════════════════════════════`);
  console.log(`RESULTS: 200 EMA 5m + RSI 40-60`);
  console.log(`═══════════════════════════════════════\n`);
  console.log(`Trades: ${trades.length} | Wins: ${wins} (${wr}%) | Losses: ${losses}`);
  console.log(`Total P&L: ${totalPnL.toFixed(2)}% | Avg: ${(totalPnL / trades.length).toFixed(3)}% | Max DD: ${maxDD.toFixed(2)}%\n`);
  
  console.log(`# | Type  | Entry    | Exit     | P&L %  | RSI  | Bars`);
  trades.forEach((t, i) => {
    const emoji = parseFloat(t.pnl) > 0 ? '✅' : '❌';
    console.log(`${i+1} | ${t.type.padEnd(5)}| $${t.entry.padEnd(7)}| $${t.exit.padEnd(7)}| ${emoji} ${t.pnl.padEnd(5)}| ${t.rsi.padEnd(4)}| ${t.bars}`);
  });
  
  console.log(`\n═══════════════════════════════════════\n`);
  console.log(`Verdict: ${totalPnL > 0 && wr > 50 ? '✅ PROFITABLE' : '⚠️ NEEDS WORK'}\n`);
}

(async () => {
  try {
    const candles = await fetchBinanceCandles(SYMBOL, DAYS);
    backtest(candles);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
})();

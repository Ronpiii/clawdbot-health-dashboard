#!/usr/bin/env node
/**
 * Multi-Asset EMA(8/21) Validation
 * Tests strategy across penny stocks and altcoins using Yahoo Finance
 */

const LEVERAGE = 6;
const RISK_PER_TRADE = 0.07;
const STOP_LOSS_PCT = 0.04;
const EMA_FAST = 8;
const EMA_SLOW = 21;

const PENNY_STOCKS = ["SNDL", "TLRY", "CLOV", "WISH", "SOFI", "AMC", "GME", "PLTR"];
const ALTCOINS = ["ETH-USD", "SOL-USD", "DOGE-USD", "XRP-USD", "ADA-USD", "AVAX-USD", "MATIC-USD", "LINK-USD"];

async function fetchYahoo(ticker, years = 3) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - (years * 365 * 24 * 60 * 60);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${start}&period2=${end}&interval=1d`;
  
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result?.timestamp) return null;
    
    const quotes = result.indicators.quote[0];
    return result.timestamp.map((t, i) => ({
      close: quotes.close[i],
      low: quotes.low[i]
    })).filter(c => c.close != null);
  } catch { return null; }
}

function calcEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function backtest(candles) {
  const closes = candles.map(c => c.close);
  const emaFast = calcEMA(closes, EMA_FAST);
  const emaSlow = calcEMA(closes, EMA_SLOW);
  
  let capital = 10000;
  const initialCapital = capital;
  let position = null;
  let trades = 0, wins = 0;
  let peakCapital = capital;
  let maxDrawdown = 0;
  
  for (let i = EMA_SLOW + 1; i < candles.length; i++) {
    const prevFast = emaFast[i - 1], prevSlow = emaSlow[i - 1];
    const currFast = emaFast[i], currSlow = emaSlow[i];
    const candle = candles[i];
    
    if (position) {
      const stopPrice = position.entry * (1 - STOP_LOSS_PCT);
      if (candle.low <= stopPrice) {
        const pnl = (stopPrice - position.entry) / position.entry * position.size * LEVERAGE;
        capital += pnl;
        if (pnl > 0) wins++;
        trades++;
        position = null;
      }
    }
    
    const bullishCross = prevFast <= prevSlow && currFast > currSlow;
    const bearishCross = prevFast >= prevSlow && currFast < currSlow;
    
    if (position && bearishCross) {
      const pnl = (candle.close - position.entry) / position.entry * position.size * LEVERAGE;
      capital += pnl;
      if (pnl > 0) wins++;
      trades++;
      position = null;
    }
    
    if (!position && bullishCross) {
      position = { entry: candle.close, size: capital * RISK_PER_TRADE };
    }
    
    if (capital > peakCapital) peakCapital = capital;
    const dd = (peakCapital - capital) / peakCapital;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  
  if (position) {
    const pnl = (candles[candles.length - 1].close - position.entry) / position.entry * position.size * LEVERAGE;
    capital += pnl;
    if (pnl > 0) wins++;
    trades++;
  }
  
  return {
    return: ((capital - initialCapital) / initialCapital * 100).toFixed(1),
    maxDD: (maxDrawdown * 100).toFixed(1),
    winRate: trades > 0 ? (wins / trades * 100).toFixed(0) : "0",
    trades
  };
}

async function testAssets(tickers, label) {
  console.log(`\n=== ${label} ===`);
  console.log("Ticker".padEnd(10) + "Return %".padStart(10) + "Max DD %".padStart(10) + "Win Rate".padStart(10) + "Trades".padStart(8));
  console.log("-".repeat(48));
  
  const results = [];
  for (const ticker of tickers) {
    const displayName = ticker.replace("-USD", "").padEnd(10);
    process.stdout.write(displayName);
    const candles = await fetchYahoo(ticker, 3);
    if (!candles || candles.length < 50) {
      console.log("NO DATA");
      continue;
    }
    const r = backtest(candles);
    console.log(`${r.return.padStart(10)}${r.maxDD.padStart(10)}${(r.winRate + "%").padStart(10)}${String(r.trades).padStart(8)}`);
    results.push({ ticker: ticker.replace("-USD", ""), ...r });
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

async function main() {
  console.log("EMA(8/21) Strategy Validation - Multi-Asset");
  console.log(`Parameters: ${LEVERAGE}x leverage, ${RISK_PER_TRADE*100}% risk, ${STOP_LOSS_PCT*100}% stops`);
  console.log(`Period: ~3 years daily data`);
  
  const pennyResults = await testAssets(PENNY_STOCKS, "PENNY/MEME STOCKS");
  const altResults = await testAssets(ALTCOINS, "ALTCOINS");
  
  // summary
  console.log("\n=== VERDICT ===");
  const allResults = [...pennyResults, ...altResults];
  const positive = allResults.filter(r => parseFloat(r.return) > 0);
  const avgReturn = allResults.reduce((s, r) => s + parseFloat(r.return), 0) / allResults.length;
  const avgDD = allResults.reduce((s, r) => s + parseFloat(r.maxDD), 0) / allResults.length;
  
  console.log(`Profitable: ${positive.length}/${allResults.length} assets`);
  console.log(`Avg Return: ${avgReturn.toFixed(1)}%`);
  console.log(`Avg Max DD: ${avgDD.toFixed(1)}%`);
  
  if (positive.length >= allResults.length * 0.7) {
    console.log("\n✅ Strategy generalizes — works across asset classes");
  } else if (positive.length >= allResults.length * 0.5) {
    console.log("\n⚠️  Mixed results — may need parameter tuning per asset");
  } else {
    console.log("\n❌ Strategy struggles outside BTC — possible overfitting");
  }
}

main().catch(console.error);

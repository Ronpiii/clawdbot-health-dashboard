#!/usr/bin/env node
/**
 * Hyperliquid 200 EMA + Slope Scanner
 * Finds attractive entries across all pairs
 */

const HL_API = 'https://api.hyperliquid.xyz';

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function calculateEMAArray(prices, period) {
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

async function getCandles(symbol, interval = '4h', lookback = 300) {
  const intervalMs = 4 * 60 * 60 * 1000;
  const endTime = Date.now();
  const startTime = endTime - (lookback * intervalMs);
  
  try {
    const data = await hlPost('/info', {
      type: 'candleSnapshot',
      req: { coin: symbol, interval, startTime, endTime },
    });
    return data || [];
  } catch {
    return [];
  }
}

async function analyzeAsset(symbol, mids) {
  const currentPrice = parseFloat(mids[symbol] || 0);
  if (!currentPrice) return null;
  
  const candles = await getCandles(symbol, '4h', 300);
  const closes = candles.map(c => parseFloat(c.c)).filter(p => p > 0);
  
  if (closes.length < 250) return null;
  
  const emaArray = calculateEMAArray(closes, 200);
  const currentEMA = emaArray[emaArray.length - 1];
  const lookbackEMA = emaArray[emaArray.length - 49]; // 48 candle lookback
  const prevEMA = emaArray[emaArray.length - 2];
  
  if (!currentEMA || !lookbackEMA) return null;
  
  const prevClose = closes[closes.length - 2];
  const aboveEMA = currentPrice > currentEMA;
  const prevAboveEMA = prevClose > prevEMA;
  const emaRising = currentEMA > lookbackEMA;
  const emaFalling = currentEMA < lookbackEMA;
  
  // Calculate slope strength (% change over lookback)
  const slopeStrength = ((currentEMA - lookbackEMA) / lookbackEMA) * 100;
  
  // Distance from EMA
  const distFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;
  
  // Fresh cross detection
  const freshLongCross = aboveEMA && !prevAboveEMA;
  const freshShortCross = !aboveEMA && prevAboveEMA;
  
  // Signal quality
  let signal = 'NONE';
  let quality = 0;
  
  if (aboveEMA && emaRising) {
    signal = 'LONG';
    quality = Math.abs(slopeStrength) * (freshLongCross ? 2 : 1);
  } else if (!aboveEMA && emaFalling) {
    signal = 'SHORT';
    quality = Math.abs(slopeStrength) * (freshShortCross ? 2 : 1);
  }
  
  return {
    symbol,
    price: currentPrice,
    ema200: currentEMA,
    distFromEMA,
    slopeStrength,
    signal,
    quality,
    freshCross: freshLongCross || freshShortCross,
    aboveEMA,
    emaRising,
  };
}

async function scan() {
  console.log('═'.repeat(70));
  console.log('HYPERLIQUID 200 EMA + SLOPE SCANNER');
  console.log(new Date().toISOString());
  console.log('═'.repeat(70));
  
  // Get all available assets
  const meta = await hlPost('/info', { type: 'meta' });
  const mids = await hlPost('/info', { type: 'allMids' });
  
  const assets = meta.universe.map(a => a.name);
  console.log(`\nScanning ${assets.length} assets...\n`);
  
  const results = [];
  
  for (const symbol of assets) {
    process.stdout.write(`  ${symbol}...`);
    const analysis = await analyzeAsset(symbol, mids);
    if (analysis && analysis.signal !== 'NONE') {
      results.push(analysis);
      process.stdout.write(` ${analysis.signal} (quality: ${analysis.quality.toFixed(1)})\n`);
    } else {
      process.stdout.write(` skip\n`);
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 50));
  }
  
  // Sort by quality score
  results.sort((a, b) => b.quality - a.quality);
  
  // Display results
  console.log('\n' + '═'.repeat(70));
  console.log('TOP OPPORTUNITIES (sorted by quality)');
  console.log('═'.repeat(70));
  
  console.log('\n🟢 LONGS (price > EMA, slope rising):');
  console.log('─'.repeat(70));
  const longs = results.filter(r => r.signal === 'LONG').slice(0, 10);
  if (longs.length === 0) {
    console.log('  None found');
  } else {
    console.log('  Symbol     Price          EMA 200       Dist%    Slope%   Fresh?');
    for (const r of longs) {
      const fresh = r.freshCross ? '🔥 YES' : '   no';
      console.log(`  ${r.symbol.padEnd(10)} $${r.price.toPrecision(5).padStart(10)} $${r.ema200.toPrecision(5).padStart(10)}  ${r.distFromEMA.toFixed(1).padStart(6)}%  ${r.slopeStrength.toFixed(1).padStart(6)}%  ${fresh}`);
    }
  }
  
  console.log('\n🔴 SHORTS (price < EMA, slope falling):');
  console.log('─'.repeat(70));
  const shorts = results.filter(r => r.signal === 'SHORT').slice(0, 10);
  if (shorts.length === 0) {
    console.log('  None found');
  } else {
    console.log('  Symbol     Price          EMA 200       Dist%    Slope%   Fresh?');
    for (const r of shorts) {
      const fresh = r.freshCross ? '🔥 YES' : '   no';
      console.log(`  ${r.symbol.padEnd(10)} $${r.price.toPrecision(5).padStart(10)} $${r.ema200.toPrecision(5).padStart(10)}  ${r.distFromEMA.toFixed(1).padStart(6)}%  ${r.slopeStrength.toFixed(1).padStart(6)}%  ${fresh}`);
    }
  }
  
  // Fresh crosses are the best opportunities
  const freshCrosses = results.filter(r => r.freshCross);
  if (freshCrosses.length > 0) {
    console.log('\n🔥 FRESH CROSSES (just signaled):');
    console.log('─'.repeat(70));
    for (const r of freshCrosses) {
      console.log(`  ${r.signal} ${r.symbol}: $${r.price.toPrecision(5)} | EMA: $${r.ema200.toPrecision(5)} | slope: ${r.slopeStrength.toFixed(1)}%`);
    }
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log(`Scanned ${assets.length} assets | ${longs.length} longs | ${shorts.length} shorts | ${freshCrosses.length} fresh crosses`);
}

scan().catch(console.error);

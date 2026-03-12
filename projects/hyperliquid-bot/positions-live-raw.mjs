#!/usr/bin/env node
/**
 * Positions Card - UNIFIED LIVE VIEW
 * Combines positions + 5M slope bot metrics into single card
 * Fetches LIVE positions from Hyperliquid API (not cached)
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEVERAGE = 5;

function calculatePnL(entry, current, direction) {
  if (direction === 'LONG') {
    return ((current - entry) / entry) * 100;
  } else {
    return ((entry - current) / entry) * 100;
  }
}

function getWinrate(pnlArray) {
  const winners = pnlArray.filter(pnl => pnl > 0.5).length;
  return pnlArray.length > 0 ? Math.round((winners / pnlArray.length) * 100) : 0;
}

function getAccountHealth(account) {
  if (account > 120) return '🟢 Excellent';
  if (account > 110) return '🟢 Healthy';
  if (account > 100) return '🟡 Caution';
  return '🔴 Critical';
}

function formatPnL(pnl) {
  if (pnl >= 0) return `+${pnl.toFixed(2)}%`;
  return `${pnl.toFixed(2)}%`;
}

function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
}

async function fetchPrices() {
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (err) {
    console.warn(`⚠️  Price fetch failed: ${err.message}. Using entry prices.`);
    return {};
  }
}

async function getPositionsFromAPI(address) {
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: address }),
      timeout: 8000
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    if (!data) return null;
    
    // Account value from marginSummary (correct field)
    const accountValue = parseFloat(data.marginSummary?.accountValue || data.withdrawable || 0);
    
    const positions = {};
    
    if (data.assetPositions && Array.isArray(data.assetPositions)) {
      for (const posData of data.assetPositions) {
        const coin = posData.position.coin.replace('-PERP', '');
        const szi = parseFloat(posData.position.szi);
        
        if (szi !== 0) {
          // entry price comes from the position data
          const entryPx = parseFloat(posData.position.entryPx);
          positions[coin] = {
            direction: szi > 0 ? 'LONG' : 'SHORT',
            size: Math.abs(szi),
            entryPrice: entryPx,
          };
        }
      }
    }
    
    return { positions, accountValue };
  } catch (err) {
    return null;
  }
}

function getBotStatus() {
  try {
    const psSlope = execSync("pgrep -f 'ema-bot-btc-slope' > /dev/null 2>&1 && echo 1 || echo 0", { encoding: 'utf8' }).trim();
    const psTrading = execSync("pgrep -f 'ema-bot-v2' > /dev/null 2>&1 && echo 1 || echo 0", { encoding: 'utf8' }).trim();
    
    const slopeRunning = psSlope === '1';
    const tradingRunning = psTrading === '1';
    
    return {
      slope: slopeRunning ? '🟢 SLOPE BOT' : '🔴 slope bot offline',
      trading: tradingRunning ? '🟢 TRADING BOT' : '🔴 trading bot offline',
      both: slopeRunning && tradingRunning
    };
  } catch (err) {
    return {
      slope: '⚠️  unknown',
      trading: '⚠️  unknown',
      both: false
    };
  }
}

async function generateCard() {
  try {
    // Load slope bot state (real-time slope/EMA - updated every 5m)
    const slopeStateFile = path.join(__dirname, 'btc-slope-state.json');
    let slopeState = {};
    try {
      slopeState = JSON.parse(readFileSync(slopeStateFile, 'utf8'));
    } catch (e) {
      // slope state may not exist yet, use defaults
    }
    
    // Fetch LIVE positions from Hyperliquid API
    const address = process.env.HL_WALLET_ADDRESS || '0x18a4Cc59804AB711F30897C71f3C3580D91ff641';
    let apiData = await getPositionsFromAPI(address);
    
    // Load bot state for entry prices (more accurate than API for scaled positions)
    let botState = {};
    try {
      botState = JSON.parse(readFileSync(path.join(__dirname, 'bot-state-v2.json'), 'utf8'));
    } catch (e) {
      // no cached state
    }
    
    // Use API for live positions, but fill in entry prices from bot state
    let positions = {};
    let accountValue = 119.00;
    
    if (apiData) {
      positions = apiData.positions;
      accountValue = apiData.accountValue;
      
      // Override entry prices with bot state (more accurate for scaled positions)
      Object.keys(positions).forEach(symbol => {
        if (botState.positions && botState.positions[symbol]) {
          positions[symbol].entryPrice = botState.positions[symbol].entryPrice;
        }
      });
    } else {
      // Fallback to cached bot state only
      positions = botState.positions || {};
      accountValue = botState.account || 119.00;
    }
    
    // Fetch live prices with timeout
    let mids = {};
    try {
      const pricePromise = fetchPrices();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Price fetch timeout')), 8000)
      );
      mids = await Promise.race([pricePromise, timeoutPromise]);
    } catch (err) {
      console.warn(`⚠️  Using entry prices: ${err.message}`);
    }
    
    // Build positions with live price data
    const positionsList = [];
    const positionMetrics = [];
    let totalMarginUsed = 0;
    
    Object.entries(positions || {}).forEach(([symbol, pos]) => {
      const currentPrice = parseFloat(mids[symbol]) || pos.entryPrice;
      const direction = pos.direction === 'LONG' ? 'LONG' : 'SHORT';
      const absSize = Math.abs(pos.size);
      
      // Calculate P&L with live prices
      let pnlPct, pnlDollars;
      if (direction === 'LONG') {
        pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        pnlDollars = (currentPrice - pos.entryPrice) * absSize;
      } else {
        pnlPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
        pnlDollars = (pos.entryPrice - currentPrice) * absSize;
      }
      
      positionsList.push({
        symbol,
        size: absSize,
        entryPrice: pos.entryPrice,
        currentPrice,
        direction,
        leverage: LEVERAGE,
      });
      
      positionMetrics.push({ pnlPct, pnlDollars });
      
      const notional = absSize * currentPrice;
      const margin = notional / LEVERAGE;
      totalMarginUsed += margin;
    });
    
    // Calculate metrics
    const positionPnLs = positionMetrics.map(m => m.pnlPct);
    const totalPnL = positionPnLs.reduce((a, b) => a + b, 0);
    const totalPnLDollars = positionMetrics.reduce((a, b) => a + b.pnlDollars, 0);
    const avgPnL = positionsList.length > 0 ? totalPnL / positionsList.length : 0;
    const winrate = getWinrate(positionPnLs);
    const health = getAccountHealth(accountValue);
    const currentTime = getCurrentTime();
    
    // Get bot metrics from slope state
    const ema200 = slopeState.ema200 || 69716;
    const slopeVal = slopeState.slope || -0.043;
    const btcStatus = slopeState.status || 'FLAT';
    
    // Get bot process status
    const botStatus = getBotStatus();
    
    const card = `
╔════════════════════════════════════════════════════════════════╗
║                  POSITIONS CARD (LIVE)                         ║
╚════════════════════════════════════════════════════════════════╝

💰 ACCOUNT: $${accountValue.toFixed(2)} | ${health}
📊 TOTAL P&L: ${formatPnL(totalPnL)} ($${totalPnLDollars > 0 ? '+' : ''}${totalPnLDollars.toFixed(0)}) | Avg: ${formatPnL(avgPnL)}
🏆 WINRATE: ${winrate}%

OPEN POSITIONS (${positionsList.length}):
${positionsList.map((pos, idx) => {
  const { pnlPct, pnlDollars } = positionMetrics[idx];
  const emoji = pnlPct > 0.5 ? '✓' : pnlPct < -0.5 ? '✗' : '─';
  const direction = pos.direction === 'LONG' ? '▲' : '▼';
  const notional = pos.size * pos.currentPrice;
  const margin = notional / pos.leverage;
  const pnlStr = `${formatPnL(pnlPct)} ($${pnlDollars > 0 ? '+' : ''}${pnlDollars.toFixed(0)})`;
  
  return `  ${emoji} ${pos.symbol.padEnd(6)} ${direction} ${pos.size.toFixed(4).padEnd(8)} @ $${pos.entryPrice.toFixed(4)} | Size: $${notional.toFixed(0).padEnd(4)} | Mgn: $${margin.toFixed(0).padEnd(2)} | PnL: ${pnlStr}`;
}).join('\n')}

Margin Used: $${totalMarginUsed.toFixed(0)} / $${accountValue.toFixed(0)} (${((totalMarginUsed / accountValue) * 100).toFixed(0)}%)

════════════════════════════════════════════════════════════════
5M SLOPE BOT (200 EMA + 0.01% slope filter)
════════════════════════════════════════════════════════════════

📉 EMA200: $${ema200.toFixed(2)} | Slope: ${slopeVal.toFixed(3)}% | Status: ${btcStatus}

BOT PROCESSES:
  ${botStatus.slope}
  ${botStatus.trading}

⏰ Last check: ${currentTime} | 🔗 BTC Regime: EXIT
════════════════════════════════════════════════════════════════`;

    console.log(card);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

generateCard();

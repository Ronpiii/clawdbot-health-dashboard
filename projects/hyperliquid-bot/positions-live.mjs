#!/usr/bin/env node
/**
 * Positions Card - LIVE PRICES, CACHED POSITIONS
 * Reads positions from bot state but fetches live prices from Hyperliquid API
 * Updates P&L and account health in real-time
 */

import { config } from 'dotenv';
import { Hyperliquid } from 'hyperliquid';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sdk = new Hyperliquid({
  privateKey: process.env.HL_PRIVATE_KEY,
  testnet: false,
  enableWs: false,
});

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

function formatPnL(pnl, dollars) {
  const pctStr = pnl >= 0 ? `+${pnl.toFixed(2)}%` : `${pnl.toFixed(2)}%`;
  const dollarStr = dollars >= 0 ? `+$${dollars.toFixed(0)}` : `-$${Math.abs(dollars).toFixed(0)}`;
  return `${pctStr} (${dollarStr})`;
}

function getTodayStart() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
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

async function generateCard() {
  try {
    // Load bot state (cached positions)
    const stateFile = path.join(__dirname, 'bot-state-v2.json');
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    
    // Fetch live prices from Hyperliquid
    const mids = await sdk.info.getAllMids();
    
    // Get account value from state
    const accountValue = state.account || 119.00;
    const startingBalance = state.startingBalance || accountValue;
    
    // Build positions with live price data
    const positions = [];
    const positionMetrics = [];
    const todayStart = getTodayStart();
    
    let dailyPnLDollars = 0;
    let totalPnLDollars = 0;
    
    Object.entries(state.positions || {}).forEach(([symbol, pos]) => {
      const currentPrice = parseFloat(mids[symbol]) || pos.entryPrice;
      const direction = pos.size > 0 ? 'LONG' : 'SHORT';
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
      
      // Track daily vs total P&L
      totalPnLDollars += pnlDollars;
      if (pos.entryTime && new Date(pos.entryTime) >= new Date(todayStart)) {
        dailyPnLDollars += pnlDollars;
      }
      
      positions.push({
        symbol,
        size: absSize,
        entryPrice: pos.entryPrice,
        currentPrice,
        direction,
        leverage: LEVERAGE,
      });
      
      positionMetrics.push({ pnlPct, pnlDollars });
    });
    
    // Calculate metrics
    const positionPnLs = positionMetrics.map(m => m.pnlPct);
    const totalPnL = (totalPnLDollars / startingBalance) * 100;
    const dailyPnL = (dailyPnLDollars / startingBalance) * 100;
    const avgPnL = positions.length > 0 ? positionPnLs.reduce((a, b) => a + b) / positions.length : 0;
    const winrate = getWinrate(positionPnLs);
    const health = getAccountHealth(accountValue);
    const currentTime = getCurrentTime();
    
    // Calculate total margin used
    let totalMarginUsed = 0;
    
    const card = `
╔════════════════════════════════════════════════════════════════╗
║                    POSITIONS CARD (LIVE)                       ║
╚════════════════════════════════════════════════════════════════╝

💰 ACCOUNT: $${accountValue.toFixed(2)} | ${health}
📊 TOTAL P&L:  ${formatPnL(totalPnL, totalPnLDollars)} | Avg: ${formatPnL(avgPnL, 0)}
📈 DAILY P&L:  ${formatPnL(dailyPnL, dailyPnLDollars)}
🏆 WINRATE: ${winrate}%

OPEN POSITIONS (${positions.length}):
${positions.map((pos, idx) => {
  const { pnlPct, pnlDollars } = positionMetrics[idx];
  const emoji = pnlPct > 0.5 ? '✓' : pnlPct < -0.5 ? '✗' : '─';
  const direction = pos.direction === 'LONG' ? '▲' : '▼';
  
  const notional = pos.size * pos.currentPrice;
  const margin = notional / pos.leverage;
  totalMarginUsed += margin;
  
  const pnlStr = formatPnL(pnlPct, pnlDollars);
  
  return `  ${emoji} ${pos.symbol} ${direction} ${pos.size.toFixed(4)} @ $${pos.entryPrice.toFixed(4)}
      ├ Size: $${notional.toFixed(0)} | Margin: $${margin.toFixed(0)} | Lev: ${pos.leverage}x | PnL: ${pnlStr}`;
}).join('\n')}

─── SUMMARY ───
Margin Used: $${totalMarginUsed.toFixed(0)} / $${accountValue.toFixed(0)} (${((totalMarginUsed / accountValue) * 100).toFixed(0)}%)

⏰ Last check: ${currentTime}
🔗 BTC Regime: EXIT
`;

    console.log(card);
  } catch (err) {
    console.error('Error generating positions card:', err.message);
    process.exit(1);
  }
}

generateCard();

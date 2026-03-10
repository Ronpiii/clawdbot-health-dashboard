#!/usr/bin/env node
/**
 * Positions Card - RAW API (no SDK)
 * Uses fetch directly to avoid SDK hanging issues
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function getLastTrades(count = 5, positionMetrics, positionMap) {
  try {
    const logFile = path.join(__dirname, 'trades-v2.log');
    const content = readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n');
    const lastLines = lines.slice(-count).reverse();
    const now = new Date();
    
    // Track which symbols we've already added (avoid duplicates for scales)
    const seenSymbols = new Set();
    
    return lastLines.map(line => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 5) {
        const fullTimestamp = parts[0];
        const type = parts[1];
        const symbol = parts[2];
        
        // Only show entry/scale trades, skip exits, avoid duplicate symbols
        if (!['LONG', 'SHORT', 'SCALE'].includes(type) || seenSymbols.has(symbol)) {
          return null;
        }
        
        seenSymbols.add(symbol);
        
        // Calculate duration
        const tradeTime = new Date(fullTimestamp);
        const durationMs = now - tradeTime;
        const durationStr = formatDuration(durationMs);
        
        // Get P&L from position metrics
        const posIdx = positionMap[symbol];
        let pnlStr = '-';
        if (posIdx !== undefined && positionMetrics[posIdx]) {
          const { pnlPct, pnlDollars } = positionMetrics[posIdx];
          pnlStr = pnlDollars >= 0 ? `+$${pnlDollars.toFixed(0)}` : `-$${Math.abs(pnlDollars).toFixed(0)}`;
        }
        
        return {
          type,
          symbol,
          duration: durationStr,
          pnl: pnlStr
        };
      }
      return null;
    }).filter(t => t !== null);
  } catch (err) {
    return [];
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d${hours % 24}h`;
  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
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

async function generateCard() {
  try {
    // Load bot state (cached positions)
    const stateFile = path.join(__dirname, 'bot-state-v2.json');
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    
    // Fetch live prices with timeout
    let mids = {};
    try {
      const pricePromise = fetchPrices();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Price fetch timeout')), 8000)
      );
      mids = await Promise.race([pricePromise, timeoutPromise]);
    } catch (err) {
      console.warn(`⚠️  Using cached prices: ${err.message}`);
    }
    
    // Get account value from state
    const accountValue = state.account || 119.00;
    
    // Build positions with live price data
    const positions = [];
    const positionMetrics = [];
    let totalMarginUsed = 0;
    
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
      
      positions.push({
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
    const avgPnL = positions.length > 0 ? totalPnL / positions.length : 0;
    const winrate = getWinrate(positionPnLs);
    const health = getAccountHealth(accountValue);
    const currentTime = getCurrentTime();
    
    // Build position map for last trades lookup
    const positionMap = {};
    positions.forEach((pos, idx) => {
      positionMap[pos.symbol] = idx;
    });
    
    // Get last trades with P&L and duration
    const lastTrades = getLastTrades(5, positionMetrics, positionMap);
    
    // Build compact single-block card
    let tradesStr = '';
    if (lastTrades.length > 0) {
      tradesStr = '\n\nLAST TRADES:\n' + lastTrades.map((t, i) => {
        const typeEmoji = {
          'LONG': '▲', 'SHORT': '▼',
          'SCALE': '📈'
        }[t.type] || '●';
        return `  ${typeEmoji} ${t.symbol.padEnd(5)} ${t.pnl.padEnd(8)} ${t.duration.padEnd(6)}`;
      }).join('\n');
    }
    
    const card = `
╔════════════════════════════════════════════════════════════════╗
║                    POSITIONS CARD (LIVE)                       ║
╚════════════════════════════════════════════════════════════════╝

💰 ACCOUNT: $${accountValue.toFixed(2)} | ${health}
📊 TOTAL P&L: ${formatPnL(totalPnL)} ($${totalPnLDollars > 0 ? '+' : ''}${totalPnLDollars.toFixed(0)}) | Avg: ${formatPnL(avgPnL)}
🏆 WINRATE: ${winrate}%

OPEN POSITIONS (${positions.length}):
${positions.map((pos, idx) => {
  const { pnlPct, pnlDollars } = positionMetrics[idx];
  const emoji = pnlPct > 0.5 ? '✓' : pnlPct < -0.5 ? '✗' : '─';
  const direction = pos.direction === 'LONG' ? '▲' : '▼';
  const notional = pos.size * pos.currentPrice;
  const margin = notional / pos.leverage;
  const pnlStr = `${formatPnL(pnlPct)} ($${pnlDollars > 0 ? '+' : ''}${pnlDollars.toFixed(0)})`;
  
  return `  ${emoji} ${pos.symbol.padEnd(5)} ${direction} ${pos.size.toFixed(4).padEnd(8)} @ $${pos.entryPrice.toFixed(4)} | Size: $${notional.toFixed(0)} | Mgn: $${margin.toFixed(0)} | PnL: ${pnlStr}`;
}).join('\n')}

Margin Used: $${totalMarginUsed.toFixed(0)} / $${accountValue.toFixed(0)} (${((totalMarginUsed / accountValue) * 100).toFixed(0)}%)${tradesStr}

⏰ Last check: ${currentTime} | 🔗 BTC Regime: EXIT`;

    console.log(card);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

generateCard();

#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const botStateFile = path.join(process.cwd(), 'projects/hyperliquid-bot/bot-state-v2.json');
const lastAccountFile = path.join(process.cwd(), '.cache/last-account-balance.txt');

function getLastAccountBalance() {
  try {
    if (fs.existsSync(lastAccountFile)) {
      return parseFloat(fs.readFileSync(lastAccountFile, 'utf8').trim());
    }
  } catch (e) {}
  return 119.00; // fallback estimate
}

function calculatePnL(symbol, entry, highest, direction) {
  if (direction === 'LONG') {
    return ((highest - entry) / entry) * 100;
  } else {
    return ((entry - highest) / entry) * 100;
  }
}

function getWinrate(positions, pnlArray) {
  const winners = pnlArray.filter(pnl => pnl > 0.5).length;
  return positions.length > 0 ? Math.round((winners / positions.length) * 100) : 0;
}

function getAccountHealth(account) {
  if (account > 120) return '🟢 Excellent';
  if (account > 110) return '🟡 Healthy';
  if (account > 100) return '🟠 Caution';
  return '🔴 Critical';
}

function formatPnL(pnl) {
  if (pnl >= 0) return `+${pnl.toFixed(2)}%`;
  return `${pnl.toFixed(2)}%`;
}

async function generateCard() {
  try {
    const state = JSON.parse(fs.readFileSync(botStateFile, 'utf8'));
    const account = getLastAccountBalance();
    global.highestPrices = state.highestPrice || {};
    const dailyPnL = state.dailyPnL || 0;

    const positions = Object.entries(state.positions);
    
    // Calculate position PnLs
    const positionPnLs = positions.map(([symbol, pos]) => {
      const highest = global.highestPrices[symbol] || pos.entryPrice;
      return calculatePnL(symbol, pos.entryPrice, highest, pos.direction);
    });

    const totalPnL = positionPnLs.reduce((a, b) => a + b, 0);
    const avgPnL = positions.length > 0 ? totalPnL / positions.length : 0;
    const winrate = getWinrate(positions, positionPnLs);
    const health = getAccountHealth(account);
    const lastCheck = new Date(state.lastCheck).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });

    const card = `
╔════════════════════════════════════════════╗
║           POSITIONS CARD                   ║
╚════════════════════════════════════════════╝

💰 ACCOUNT: $${account.toFixed(2)} | ${health}
📊 DAILY P&L: ${formatPnL(dailyPnL)} | Avg: ${formatPnL(avgPnL)}
🏆 WINRATE: ${winrate}%

OPEN POSITIONS (${positions.length}):
${positions.map(([symbol, pos], idx) => {
  const pnl = positionPnLs[idx];
  const emoji = pnl > 0.5 ? '✓' : pnl < -0.5 ? '✗' : '─';
  const direction = pos.direction === 'LONG' ? '▲' : '▼';
  return `  ${emoji} ${symbol} ${direction} ${Math.abs(pos.size).toFixed(2)} @ $${pos.entryPrice.toFixed(4)} → ${formatPnL(pnl)}`;
}).join('\n')}

⏰ Last check: ${lastCheck}
🔗 BTC Regime: EXIT
`;

    console.log(card);
  } catch (err) {
    console.error('Error reading bot state:', err.message);
    process.exit(1);
  }
}

generateCard();

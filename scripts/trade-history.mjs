#!/usr/bin/env node
/**
 * Trade History Viewer
 * Shows recent trades and performance summary
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const botDir = path.join(__dirname, '../projects/hyperliquid-bot');
const tradesPath = path.join(botDir, 'trades.jsonl');

function getRecentTrades(limit = 20) {
  try {
    if (!fs.existsSync(tradesPath)) {
      console.log('📋 No trades logged yet.');
      return [];
    }
    
    const lines = fs.readFileSync(tradesPath, 'utf8').split('\n').filter(l => l.trim());
    return lines.slice(-limit).map(line => JSON.parse(line));
  } catch (err) {
    console.error(`Error reading trades: ${err.message}`);
    return [];
  }
}

function formatTrade(trade) {
  const ts = new Date(trade.timestamp).toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
  
  let status = '';
  if (trade.status === 'OPEN') {
    status = '🟢 OPEN';
  } else if (trade.status === 'CLOSED') {
    status = trade.pnl >= 0 ? '🎯 CLOSED✓' : '❌ CLOSED';
  } else if (trade.status === 'SCALED') {
    status = '📈 SCALED';
  }
  
  let pnlStr = '';
  if (trade.pnl !== null) {
    pnlStr = ` | PnL: $${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)} (${trade.pnlPct > 0 ? '+' : ''}${trade.pnlPct.toFixed(2)}%)`;
  }
  
  const price = trade.exitPrice ? `$${trade.exitPrice.toFixed(4)}` : `entry: $${trade.entryPrice.toFixed(4)}`;
  
  return `${ts} | ${trade.symbol.padEnd(6)} ${trade.direction.padEnd(6)} ${trade.size.toFixed(4).padEnd(8)} @ ${price} | ${status}${pnlStr}`;
}

function getSummary() {
  try {
    if (!fs.existsSync(tradesPath)) return null;
    
    const lines = fs.readFileSync(tradesPath, 'utf8').split('\n').filter(l => l.trim());
    const trades = lines.map(line => JSON.parse(line));
    
    const closed = trades.filter(t => t.status === 'CLOSED' && t.pnl !== null);
    const winners = closed.filter(t => t.pnl > 0);
    const losers = closed.filter(t => t.pnl < 0);
    
    const totalPnL = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winnersPnL = winners.reduce((sum, t) => sum + t.pnl, 0);
    const losersPnL = losers.reduce((sum, t) => sum + t.pnl, 0);
    const avgWin = winners.length > 0 ? winnersPnL / winners.length : 0;
    const avgLoss = losers.length > 0 ? losersPnL / losers.length : 0;
    
    return {
      totalTrades: closed.length,
      winners: winners.length,
      losers: losers.length,
      winRate: closed.length > 0 ? ((winners.length / closed.length) * 100).toFixed(1) : 0,
      totalPnL: totalPnL.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitFactor: Math.abs(avgLoss) > 0 ? (avgWin / Math.abs(avgLoss)).toFixed(2) : 'N/A',
    };
  } catch (err) {
    console.error(`Error calculating summary: ${err.message}`);
    return null;
  }
}

// Display
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                    TRADE HISTORY                               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const trades = getRecentTrades(20);
if (trades.length > 0) {
  trades.forEach(trade => console.log(formatTrade(trade)));
} else {
  console.log('No trades found.');
}

const summary = getSummary();
if (summary) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('PERFORMANCE SUMMARY (Closed Trades Only)');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`
Total Trades: ${summary.totalTrades}
Winners: ${summary.winners} | Losers: ${summary.losers}
Win Rate: ${summary.winRate}%

Total PnL: $${summary.totalPnL}
Avg Win: $${summary.avgWin}
Avg Loss: $${summary.avgLoss}
Profit Factor: ${summary.profitFactor}
════════════════════════════════════════════════════════════════\n`);
}

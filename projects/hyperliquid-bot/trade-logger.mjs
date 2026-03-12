/**
 * Trade Logger - Audit trail for all trades
 * Logs to trades.jsonl for structured querying
 */

import fs from 'fs';
import path from 'path';

const TRADES_LOG = 'trades.jsonl';
const __dirname = new URL('.', import.meta.url).pathname;
const logPath = path.join(__dirname, TRADES_LOG);

export function logTrade(tradeData) {
  const entry = {
    timestamp: new Date().toISOString(),
    symbol: tradeData.symbol,
    direction: tradeData.direction, // LONG, SHORT
    size: tradeData.size,
    entryPrice: tradeData.entryPrice,
    exitPrice: tradeData.exitPrice || null,
    status: tradeData.status, // OPEN, CLOSED, SCALED
    pnl: tradeData.pnl || null,
    pnlPct: tradeData.pnlPct || null,
    leverage: tradeData.leverage || 5,
    notes: tradeData.notes || '',
  };

  // Append to JSONL file
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error(`[TradeLogger] Failed to log trade: ${err.message}`);
  }
}

export function logEntry(symbol, direction, size, entryPrice, notes = '') {
  logTrade({
    symbol,
    direction,
    size,
    entryPrice,
    status: 'OPEN',
    notes: `ENTRY: ${notes}`,
  });
}

export function logExit(symbol, direction, size, entryPrice, exitPrice, pnl, pnlPct, notes = '') {
  logTrade({
    symbol,
    direction,
    size,
    entryPrice,
    exitPrice,
    pnl,
    pnlPct,
    status: 'CLOSED',
    notes: `EXIT: ${notes}`,
  });
}

export function logScale(symbol, direction, addSize, currentPrice, totalSize, notes = '') {
  logTrade({
    symbol,
    direction,
    size: addSize,
    entryPrice: currentPrice,
    status: 'SCALED',
    notes: `SCALE IN: +${addSize} (total: ${totalSize}) - ${notes}`,
  });
}

export function getRecentTrades(limit = 10) {
  try {
    if (!fs.existsSync(logPath)) return [];
    
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(l => l.trim());
    return lines.slice(-limit).map(line => JSON.parse(line));
  } catch (err) {
    console.error(`[TradeLogger] Failed to read trades: ${err.message}`);
    return [];
  }
}

export function getTradeSummary() {
  try {
    if (!fs.existsSync(logPath)) return null;
    
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(l => l.trim());
    const trades = lines.map(line => JSON.parse(line));
    
    const closed = trades.filter(t => t.status === 'CLOSED' && t.pnl !== null);
    const winners = closed.filter(t => t.pnl > 0);
    const losers = closed.filter(t => t.pnl < 0);
    
    const totalPnL = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = winners.length > 0 ? closed.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? closed.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / losers.length : 0;
    
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
    console.error(`[TradeLogger] Failed to calculate summary: ${err.message}`);
    return null;
  }
}

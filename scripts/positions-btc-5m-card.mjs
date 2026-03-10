#!/usr/bin/env node
/**
 * BTC 5m Slope Bot Performance Card
 * Displays: Position status, EMA/slope, P&L, trade history
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '../projects/hyperliquid-bot/btc-slope-state.json');
const TRADE_LOG = path.join(__dirname, '../projects/hyperliquid-bot/btc-trades-5m.log');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { position: null, entryPrice: null, peakPrice: null, profitTaken: false };
}

function getLastTrades(count = 5) {
  try {
    if (!fs.existsSync(TRADE_LOG)) return [];
    
    const content = fs.readFileSync(TRADE_LOG, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const trades = [];
    
    for (const line of lines.slice(-count).reverse()) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 6) {
        const timestamp = parts[0];
        const action = parts[1];
        const price = parseFloat(parts[3]?.replace('$', ''));
        const reason = parts[5];
        
        trades.push({
          timestamp: new Date(timestamp).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
          action,
          price: isNaN(price) ? 'N/A' : `$${price.toFixed(2)}`,
          reason
        });
      }
    }
    
    return trades;
  } catch (e) {
    return [];
  }
}

function generateCard() {
  const state = loadState();
  const trades = getLastTrades(5);
  
  const now = new Date().toISOString();
  const hasPosition = !!state.position;
  
  // Position status
  const posColor = !hasPosition ? '⚪' : state.position === 'LONG' ? '📈' : '📉';
  const posStatus = !hasPosition ? 'FLAT' : state.position;
  
  // P&L calculation
  let pnlPct = 0;
  let pnlColor = '⚪';
  if (hasPosition && state.currentPrice) {
    pnlPct = state.position === 'LONG'
      ? ((state.currentPrice - state.entryPrice) / state.entryPrice) * 100
      : ((state.entryPrice - state.currentPrice) / state.entryPrice) * 100;
    
    pnlColor = pnlPct > 0 ? '🟢' : pnlPct < -2 ? '🔴' : '🟡';
  }
  
  // Display
  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`BTC 5M SLOPE BOT | 200 EMA + 0.01% slope + 2% profit take`);
  console.log(`${now}`);
  console.log(`════════════════════════════════════════════════════════\n`);
  
  console.log(`${posColor} STATUS: ${posStatus}`);
  
  if (hasPosition) {
    console.log(`\nEntry: $${state.entryPrice?.toFixed(2) || 'N/A'}`);
    console.log(`Current: $${state.currentPrice?.toFixed(2) || 'N/A'}`);
    console.log(`Peak: $${state.peakPrice?.toFixed(2) || 'N/A'}`);
    console.log(`\n${pnlColor} P&L: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%`);
    
    if (state.peakPrice && state.entryPrice) {
      const maxGain = state.position === 'LONG'
        ? ((state.peakPrice - state.entryPrice) / state.entryPrice) * 100
        : ((state.entryPrice - state.peakPrice) / state.entryPrice) * 100;
      console.log(`Max Gain: ${maxGain.toFixed(2)}%`);
    }
    
    // Entry time
    if (state.entryTime) {
      const entryDate = new Date(state.entryTime);
      const now = new Date();
      const hoursHeld = (now - entryDate) / (1000 * 60 * 60);
      console.log(`Held: ${hoursHeld.toFixed(1)}h`);
    }
  }
  
  // Last trades
  if (trades.length > 0) {
    console.log(`\n─── LAST TRADES ───\n`);
    trades.forEach((t, i) => {
      const actionEmoji = t.action === 'LONG' ? '📈' : t.action === 'SHORT' ? '📉' : '🚪';
      console.log(`${i + 1}. ${actionEmoji} ${t.action.padEnd(5)} @ ${t.price} | ${t.timestamp}`);
    });
  }
  
  console.log(`\n════════════════════════════════════════════════════════\n`);
}

generateCard();

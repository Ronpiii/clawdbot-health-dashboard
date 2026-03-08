#!/usr/bin/env node
/**
 * portfolio.mjs - trading portfolio tracker
 * 
 * usage:
 *   arc portfolio                    # dashboard
 *   arc portfolio add <amount>       # log deposit
 *   arc portfolio withdraw <amount>  # log withdrawal
 *   arc portfolio trade              # log trade (interactive)
 *   arc portfolio trade <entry> <exit> <size> [leverage]
 *   arc portfolio history            # trade history
 *   arc portfolio stats              # detailed stats
 *   arc portfolio export             # CSV export
 *   arc portfolio reset              # clear all data (careful!)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const DATA_FILE = join(WORKSPACE, 'data', 'portfolio.json');

// Ensure data dir exists
const dataDir = dirname(DATA_FILE);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// --- Config ---
const CONFIG = {
  targetAnnualReturn: 0.30, // 30%
  monthlyContribution: 70,  // $70 (€65)
  startingCapital: 100,
};

// --- Data Management ---
function loadData() {
  try {
    if (existsSync(DATA_FILE)) {
      return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    }
  } catch {}
  return {
    created: new Date().toISOString(),
    deposits: [],
    withdrawals: [],
    trades: [],
  };
}

function saveData(data) {
  data.updated = new Date().toISOString();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Calculations ---
function getTotalDeposited(data) {
  const deps = data.deposits.reduce((sum, d) => sum + d.amount, 0);
  const withs = data.withdrawals.reduce((sum, w) => sum + w.amount, 0);
  return deps - withs;
}

function getTotalPnL(data) {
  return data.trades.reduce((sum, t) => sum + t.pnl, 0);
}

function getBalance(data) {
  return getTotalDeposited(data) + getTotalPnL(data);
}

function getWinRate(data) {
  if (data.trades.length === 0) return 0;
  const wins = data.trades.filter(t => t.pnl > 0).length;
  return wins / data.trades.length;
}

function getAvgWin(data) {
  const wins = data.trades.filter(t => t.pnl > 0);
  if (wins.length === 0) return 0;
  return wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length;
}

function getAvgLoss(data) {
  const losses = data.trades.filter(t => t.pnl < 0);
  if (losses.length === 0) return 0;
  return losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length;
}

function getProfitFactor(data) {
  const grossProfit = data.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(data.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

function getMaxDrawdown(data) {
  if (data.trades.length === 0) return 0;
  
  let peak = getTotalDeposited(data);
  let maxDD = 0;
  let runningBalance = peak;
  
  for (const trade of data.trades) {
    runningBalance += trade.pnl;
    if (runningBalance > peak) peak = runningBalance;
    const dd = (peak - runningBalance) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  
  return maxDD;
}

function getProjectedBalance(data) {
  // Calculate what balance "should" be based on target return
  const firstDeposit = data.deposits[0];
  if (!firstDeposit) return CONFIG.startingCapital;
  
  const startDate = new Date(firstDeposit.date);
  const now = new Date();
  const monthsElapsed = (now - startDate) / (1000 * 60 * 60 * 24 * 30.44);
  
  // Compound monthly at target rate
  const monthlyRate = Math.pow(1 + CONFIG.targetAnnualReturn, 1/12) - 1;
  
  let projected = 0;
  for (const dep of data.deposits) {
    const depDate = new Date(dep.date);
    const monthsSinceDep = (now - depDate) / (1000 * 60 * 60 * 24 * 30.44);
    projected += dep.amount * Math.pow(1 + monthlyRate, monthsSinceDep);
  }
  
  return projected;
}

// --- Display Functions ---
function formatCurrency(amount) {
  const sign = amount >= 0 ? '' : '-';
  return `${sign}$${Math.abs(amount).toFixed(0)}`;
}

function formatPercent(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

function showDashboard(data) {
  const balance = getBalance(data);
  const deposited = getTotalDeposited(data);
  const pnl = getTotalPnL(data);
  const pnlPercent = deposited > 0 ? pnl / deposited : 0;
  const projected = getProjectedBalance(data);
  const vsProjected = balance - projected;
  
  const winRate = getWinRate(data);
  const avgWin = getAvgWin(data);
  const avgLoss = getAvgLoss(data);
  
  console.log(`
┌─────────────────────────────────────────────┐
│  PORTFOLIO — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).padEnd(20)}       │
├─────────────────────────────────────────────┤
│  Balance:     ${formatCurrency(balance).padEnd(10)}                    │
│  Invested:    ${formatCurrency(deposited).padEnd(10)}                    │
│  P&L:         ${(formatCurrency(pnl) + ` (${formatPercent(pnlPercent)})`).padEnd(20)}    │
├─────────────────────────────────────────────┤
│  vs Target:   ${(vsProjected >= 0 ? '📈' : '📉') + ' ' + formatCurrency(Math.abs(vsProjected)) + (vsProjected >= 0 ? ' ahead' : ' behind')}${' '.repeat(Math.max(0, 14 - formatCurrency(Math.abs(vsProjected)).length))}│
│  Projected:   ${formatCurrency(projected).padEnd(10)}                    │
├─────────────────────────────────────────────┤
│  Trades:      ${String(data.trades.length).padEnd(10)}                    │
│  Win Rate:    ${formatPercent(winRate).padEnd(10)}                    │
│  Avg Win:     ${formatCurrency(avgWin).padEnd(10)}                    │
│  Avg Loss:    ${formatCurrency(avgLoss).padEnd(10)}                    │
└─────────────────────────────────────────────┘`);
}

function showStats(data) {
  const balance = getBalance(data);
  const deposited = getTotalDeposited(data);
  const pnl = getTotalPnL(data);
  const winRate = getWinRate(data);
  const avgWin = getAvgWin(data);
  const avgLoss = getAvgLoss(data);
  const profitFactor = getProfitFactor(data);
  const maxDD = getMaxDrawdown(data);
  
  const wins = data.trades.filter(t => t.pnl > 0).length;
  const losses = data.trades.filter(t => t.pnl < 0).length;
  
  console.log(`
DETAILED STATS
══════════════

Portfolio
  Balance:        ${formatCurrency(balance)}
  Total Invested: ${formatCurrency(deposited)}
  Total P&L:      ${formatCurrency(pnl)} (${formatPercent(pnl/deposited || 0)})
  
Performance
  Total Trades:   ${data.trades.length}
  Wins:           ${wins}
  Losses:         ${losses}
  Win Rate:       ${formatPercent(winRate)}
  
Risk Metrics
  Avg Win:        ${formatCurrency(avgWin)}
  Avg Loss:       ${formatCurrency(avgLoss)}
  Profit Factor:  ${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
  Max Drawdown:   ${formatPercent(maxDD)}
  R:R Ratio:      ${Math.abs(avgLoss) > 0 ? (avgWin / Math.abs(avgLoss)).toFixed(2) : 'N/A'}

Deposits
  Count:          ${data.deposits.length}
  Total:          ${formatCurrency(data.deposits.reduce((s,d) => s + d.amount, 0))}
  
Withdrawals
  Count:          ${data.withdrawals.length}
  Total:          ${formatCurrency(data.withdrawals.reduce((s,w) => s + w.amount, 0))}
`);
}

function showHistory(data) {
  if (data.trades.length === 0) {
    console.log('no trades yet');
    return;
  }
  
  console.log('\nTRADE HISTORY');
  console.log('═════════════\n');
  console.log('Date       | Direction | Entry    | Exit     | Size   | Lev | P&L');
  console.log('-----------|-----------|----------|----------|--------|-----|--------');
  
  for (const trade of data.trades.slice(-20)) {
    const date = new Date(trade.date).toLocaleDateString('en-CA');
    const dir = trade.direction.toUpperCase().padEnd(5);
    const entry = `$${trade.entry.toFixed(0)}`.padEnd(8);
    const exit = `$${trade.exit.toFixed(0)}`.padEnd(8);
    const size = `$${trade.size.toFixed(0)}`.padEnd(6);
    const lev = `${trade.leverage}x`.padEnd(3);
    const pnl = formatCurrency(trade.pnl);
    
    console.log(`${date} | ${dir}     | ${entry} | ${exit} | ${size} | ${lev} | ${pnl}`);
  }
  
  if (data.trades.length > 20) {
    console.log(`\n... and ${data.trades.length - 20} more trades`);
  }
}

function exportCSV(data) {
  const lines = ['date,type,direction,entry,exit,size,leverage,pnl,balance'];
  
  let balance = 0;
  
  // Combine deposits and trades, sort by date
  const events = [
    ...data.deposits.map(d => ({ ...d, type: 'deposit' })),
    ...data.withdrawals.map(w => ({ ...w, type: 'withdrawal' })),
    ...data.trades.map(t => ({ ...t, type: 'trade' })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  for (const event of events) {
    if (event.type === 'deposit') {
      balance += event.amount;
      lines.push(`${event.date},deposit,,,,,,,${balance}`);
    } else if (event.type === 'withdrawal') {
      balance -= event.amount;
      lines.push(`${event.date},withdrawal,,,,,,,${balance}`);
    } else {
      balance += event.pnl;
      lines.push(`${event.date},trade,${event.direction},${event.entry},${event.exit},${event.size},${event.leverage},${event.pnl},${balance}`);
    }
  }
  
  const csvPath = join(WORKSPACE, 'data', 'portfolio-export.csv');
  writeFileSync(csvPath, lines.join('\n'));
  console.log(`exported to ${csvPath}`);
}

// --- Actions ---
function addDeposit(data, amount) {
  data.deposits.push({
    date: new Date().toISOString(),
    amount: parseFloat(amount),
  });
  saveData(data);
  console.log(`✓ added deposit: ${formatCurrency(amount)}`);
  console.log(`  new balance: ${formatCurrency(getBalance(data))}`);
}

function addWithdrawal(data, amount) {
  data.withdrawals.push({
    date: new Date().toISOString(),
    amount: parseFloat(amount),
  });
  saveData(data);
  console.log(`✓ added withdrawal: ${formatCurrency(amount)}`);
  console.log(`  new balance: ${formatCurrency(getBalance(data))}`);
}

function addTrade(data, entry, exit, size, leverage = 1, direction = null) {
  entry = parseFloat(entry);
  exit = parseFloat(exit);
  size = parseFloat(size);
  leverage = parseFloat(leverage);
  
  // Auto-detect direction if not provided
  if (!direction) {
    direction = exit > entry ? 'long' : 'short';
  }
  
  // Calculate P&L
  let pnl;
  if (direction === 'long') {
    pnl = ((exit - entry) / entry) * size * leverage;
  } else {
    pnl = ((entry - exit) / entry) * size * leverage;
  }
  
  data.trades.push({
    date: new Date().toISOString(),
    direction,
    entry,
    exit,
    size,
    leverage,
    pnl,
  });
  
  saveData(data);
  
  const emoji = pnl >= 0 ? '📈' : '📉';
  console.log(`${emoji} trade logged: ${direction.toUpperCase()}`);
  console.log(`   entry: $${entry} → exit: $${exit}`);
  console.log(`   size: $${size} @ ${leverage}x`);
  console.log(`   P&L: ${formatCurrency(pnl)}`);
  console.log(`   balance: ${formatCurrency(getBalance(data))}`);
}

async function interactiveTrade(data) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));
  
  console.log('\nLOG TRADE\n');
  
  const direction = await ask('direction (long/short): ');
  const entry = await ask('entry price: $');
  const exit = await ask('exit price: $');
  const size = await ask('position size: $');
  const leverage = await ask('leverage (default 1): ') || '1';
  
  rl.close();
  
  addTrade(data, entry, exit, size, leverage, direction.toLowerCase());
}

function resetData() {
  const fresh = {
    created: new Date().toISOString(),
    deposits: [],
    withdrawals: [],
    trades: [],
  };
  saveData(fresh);
  console.log('✓ portfolio reset');
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'dashboard';
  const data = loadData();
  
  switch (command) {
    case 'dashboard':
    case 'status':
      showDashboard(data);
      break;
      
    case 'add':
    case 'deposit':
      if (!args[1]) {
        console.error('usage: portfolio add <amount>');
        process.exit(1);
      }
      addDeposit(data, args[1]);
      break;
      
    case 'withdraw':
      if (!args[1]) {
        console.error('usage: portfolio withdraw <amount>');
        process.exit(1);
      }
      addWithdrawal(data, args[1]);
      break;
      
    case 'trade':
      if (args[1] && args[2] && args[3]) {
        // Direct: trade <entry> <exit> <size> [leverage] [direction]
        addTrade(data, args[1], args[2], args[3], args[4] || 1, args[5]);
      } else {
        await interactiveTrade(data);
      }
      break;
      
    case 'history':
    case 'trades':
      showHistory(data);
      break;
      
    case 'stats':
      showStats(data);
      break;
      
    case 'export':
    case 'csv':
      exportCSV(data);
      break;
      
    case 'reset':
      if (args[1] === '--confirm') {
        resetData();
      } else {
        console.log('this will delete all data. run with --confirm to proceed.');
      }
      break;
      
    default:
      console.log(`
PORTFOLIO TRACKER

commands:
  arc portfolio              dashboard
  arc portfolio add <amt>    log deposit
  arc portfolio withdraw     log withdrawal
  arc portfolio trade        log trade (interactive)
  arc portfolio history      trade history
  arc portfolio stats        detailed statistics
  arc portfolio export       export to CSV
  arc portfolio reset        clear all data
`);
  }
}

main().catch(console.error);

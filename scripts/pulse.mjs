#!/usr/bin/env node
/**
 * arc pulse — live service health monitor
 * 
 * Checks all production endpoints, reports status + response times.
 * Like a mini uptime monitor you run from the terminal.
 * 
 * Usage:
 *   arc pulse              - check all services
 *   arc pulse --short      - one-liner summary
 *   arc pulse --json       - machine-readable
 *   arc pulse --history    - show recent check history
 *   arc pulse --watch N    - continuous monitoring every N seconds
 * 
 * nightly build 2026-02-14
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HISTORY_FILE = join(ROOT, 'memory', 'pulse-history.json');

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

const SERVICES = [
  {
    name: 'anivia',
    url: 'https://anivia.vercel.app',
    desc: 'AI sales automation',
    project: 'anivia',
    category: 'app',
    critical: true,
  },
  {
    name: 'ventok.eu',
    url: 'https://www.ventok.eu',
    desc: 'company website',
    project: 'ventok-site',
    category: 'site',
    critical: true,
  },
  {
    name: 'collabo',
    url: 'https://collabo-v2-nq9w.vercel.app',
    desc: 'collabo v2',
    project: 'collabo-v2',
    category: 'app',
    critical: false,
    expectCodes: [200, 301, 302, 304, 307, 308, 404], // 404 = server alive, just no root page
  },
  {
    name: 'health dashboard',
    url: 'https://clawdbot-health-dashboard.vercel.app',
    desc: 'clawdbot monitoring',
    project: 'clawdbot',
    category: 'infra',
    critical: false,
  },
  {
    name: 'supabase api',
    url: 'https://onhcynfklqbazcvqskuf.supabase.co/rest/v1/',
    desc: 'database backend',
    project: 'anivia',
    category: 'infra',
    critical: true,
    headers: { 'apikey': 'check' }, // will just check if it responds (401 is fine = service is up)
    expectCodes: [200, 401, 403],
  },
  {
    name: 'moltbook profile',
    url: 'https://moltbook.com/u/arc0x',
    desc: 'social profile',
    project: 'moltbook',
    category: 'social',
    critical: false,
    expectCodes: [200, 301, 302, 304, 307, 308],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP CHECK
// ═══════════════════════════════════════════════════════════════════════════════

function checkService(service, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const isHttps = service.url.startsWith('https');
    const mod = isHttps ? https : http;
    
    const url = new URL(service.url);
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'arc-pulse/1.0',
        ...(service.headers || {}),
      },
      // don't reject self-signed certs for local services
      rejectUnauthorized: !service.local,
    };

    const req = mod.request(options, (res) => {
      const elapsed = Date.now() - start;
      const acceptCodes = service.expectCodes || [200, 301, 302, 304, 307, 308];
      const ok = acceptCodes.includes(res.statusCode);
      
      // consume response body
      res.on('data', () => {});
      res.on('end', () => {
        resolve({
          name: service.name,
          url: service.url,
          status: ok ? 'up' : 'degraded',
          statusCode: res.statusCode,
          responseMs: elapsed,
          category: service.category,
          critical: service.critical,
          desc: service.desc,
          project: service.project,
        });
      });
    });

    req.on('error', (err) => {
      const elapsed = Date.now() - start;
      resolve({
        name: service.name,
        url: service.url,
        status: 'down',
        error: err.code || err.message,
        responseMs: elapsed,
        category: service.category,
        critical: service.critical,
        desc: service.desc,
        project: service.project,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: service.name,
        url: service.url,
        status: 'timeout',
        error: 'TIMEOUT',
        responseMs: timeoutMs,
        category: service.category,
        critical: service.critical,
        desc: service.desc,
        project: service.project,
      });
    });

    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

async function loadHistory() {
  try {
    const data = await readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { checks: [] };
  }
}

async function saveHistory(results) {
  const history = await loadHistory();
  history.checks.push({
    timestamp: new Date().toISOString(),
    results: results.map(r => ({
      name: r.name,
      status: r.status,
      responseMs: r.responseMs,
      statusCode: r.statusCode,
      error: r.error,
    })),
  });
  
  // keep last 100 checks
  if (history.checks.length > 100) {
    history.checks = history.checks.slice(-100);
  }
  
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

function statusIcon(status) {
  switch (status) {
    case 'up': return '\x1b[32m●\x1b[0m';       // green dot
    case 'degraded': return '\x1b[33m◐\x1b[0m';  // yellow half
    case 'down': return '\x1b[31m○\x1b[0m';      // red empty
    case 'timeout': return '\x1b[31m◌\x1b[0m';   // red ring
    default: return '?';
  }
}

function latencyBar(ms) {
  if (ms < 100) return '\x1b[32m' + '█'.repeat(1) + '\x1b[0m';
  if (ms < 300) return '\x1b[32m' + '█'.repeat(2) + '\x1b[0m';
  if (ms < 500) return '\x1b[33m' + '█'.repeat(3) + '\x1b[0m';
  if (ms < 1000) return '\x1b[33m' + '█'.repeat(4) + '\x1b[0m';
  if (ms < 2000) return '\x1b[31m' + '█'.repeat(5) + '\x1b[0m';
  return '\x1b[31m' + '█'.repeat(6) + '\x1b[0m';
}

function latencyLabel(ms) {
  if (ms < 100) return '\x1b[32m' + ms + 'ms\x1b[0m';
  if (ms < 500) return '\x1b[32m' + ms + 'ms\x1b[0m';
  if (ms < 1000) return '\x1b[33m' + ms + 'ms\x1b[0m';
  if (ms < 2000) return '\x1b[33m' + (ms/1000).toFixed(1) + 's\x1b[0m';
  return '\x1b[31m' + (ms/1000).toFixed(1) + 's\x1b[0m';
}

function categoryIcon(cat) {
  switch (cat) {
    case 'app': return 'APP';
    case 'site': return 'WEB';
    case 'infra': return 'SYS';
    case 'social': return 'SOC';
    default: return '---';
  }
}

function renderDashboard(results) {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  
  console.log();
  console.log('\x1b[1m  PULSE — Service Health Monitor\x1b[0m');
  console.log('\x1b[2m  ' + timestamp + '\x1b[0m');
  console.log();
  
  // group by category
  const categories = { infra: 'INFRASTRUCTURE', app: 'APPLICATIONS', site: 'WEBSITES', social: 'SOCIAL' };
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }
  
  for (const [cat, label] of Object.entries(categories)) {
    const items = grouped[cat];
    if (!items || items.length === 0) continue;
    
    console.log(`  \x1b[2m${label}\x1b[0m`);
    
    for (const r of items) {
      const icon = statusIcon(r.status);
      const name = r.name.padEnd(20);
      const crit = r.critical ? '\x1b[31m!\x1b[0m' : ' ';
      
      if (r.status === 'up') {
        const bar = latencyBar(r.responseMs);
        const lat = latencyLabel(r.responseMs);
        const code = `\x1b[2m${r.statusCode}\x1b[0m`;
        console.log(`  ${icon} ${name} ${bar} ${lat.padStart(18)}  ${code}  ${crit}`);
      } else if (r.status === 'degraded') {
        const lat = latencyLabel(r.responseMs);
        const code = `\x1b[33m${r.statusCode}\x1b[0m`;
        console.log(`  ${icon} ${name} ${lat.padStart(25)}  ${code}  ${crit}`);
      } else {
        const errMsg = r.error || 'unknown';
        console.log(`  ${icon} ${name} \x1b[31m${errMsg}\x1b[0m  ${crit}`);
      }
    }
    console.log();
  }
  
  // summary line
  const up = results.filter(r => r.status === 'up').length;
  const total = results.length;
  const critDown = results.filter(r => r.status !== 'up' && r.critical).length;
  const avgMs = Math.round(results.filter(r => r.responseMs).reduce((s, r) => s + r.responseMs, 0) / results.filter(r => r.responseMs).length);
  
  const pct = Math.round((up / total) * 100);
  const pctColor = pct === 100 ? '\x1b[32m' : pct >= 80 ? '\x1b[33m' : '\x1b[31m';
  
  console.log(`  \x1b[2m${'─'.repeat(50)}\x1b[0m`);
  console.log(`  ${pctColor}${pct}% operational\x1b[0m  (${up}/${total} services up)  avg ${avgMs}ms`);
  
  if (critDown > 0) {
    console.log(`  \x1b[31m⚠ ${critDown} critical service(s) down!\x1b[0m`);
  }
  
  console.log();
  
  return { up, total, critDown, pct, avgMs };
}

function renderShort(results) {
  const up = results.filter(r => r.status === 'up').length;
  const total = results.length;
  const critDown = results.filter(r => r.status !== 'up' && r.critical).length;
  const avgMs = Math.round(results.filter(r => r.responseMs).reduce((s, r) => s + r.responseMs, 0) / results.filter(r => r.responseMs).length);
  
  const downs = results.filter(r => r.status !== 'up').map(r => r.name);
  const downStr = downs.length > 0 ? ` | DOWN: ${downs.join(', ')}` : '';
  
  console.log(`pulse: ${up}/${total} up | avg ${avgMs}ms${downStr}${critDown > 0 ? ' | ⚠ CRITICAL' : ''}`);
}

async function renderHistory() {
  const history = await loadHistory();
  
  if (history.checks.length === 0) {
    console.log('  no history yet — run `arc pulse` to start collecting');
    return;
  }
  
  console.log();
  console.log('\x1b[1m  PULSE — Recent History\x1b[0m');
  console.log();
  
  // get unique service names
  const serviceNames = [...new Set(history.checks.flatMap(c => c.results.map(r => r.name)))];
  
  // header
  const nameCol = '  TIME'.padEnd(22);
  console.log(`${nameCol} ${serviceNames.map(n => n.slice(0, 8).padEnd(10)).join('')}`);
  console.log(`  ${'─'.repeat(20)} ${serviceNames.map(() => '─'.repeat(10)).join('')}`);
  
  // last 20 checks
  const recent = history.checks.slice(-20);
  for (const check of recent) {
    const time = check.timestamp.replace('T', ' ').slice(5, 16);
    let line = `  ${time.padEnd(20)} `;
    
    for (const name of serviceNames) {
      const result = check.results.find(r => r.name === name);
      if (!result) {
        line += '  ---     ';
      } else {
        const icon = statusIcon(result.status);
        const ms = result.responseMs ? `${result.responseMs}ms`.padEnd(7) : '---    ';
        line += `${icon} ${ms}  `;
      }
    }
    
    console.log(line);
  }
  
  // uptime calculation
  console.log();
  console.log('  \x1b[2mUptime (last ' + history.checks.length + ' checks):\x1b[0m');
  for (const name of serviceNames) {
    const checks = history.checks.filter(c => c.results.some(r => r.name === name));
    const upChecks = checks.filter(c => c.results.find(r => r.name === name)?.status === 'up');
    const pct = checks.length > 0 ? Math.round((upChecks.length / checks.length) * 100) : 0;
    const pctColor = pct === 100 ? '\x1b[32m' : pct >= 90 ? '\x1b[33m' : '\x1b[31m';
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    console.log(`  ${name.padEnd(20)} ${pctColor}${bar} ${pct}%\x1b[0m`);
  }
  
  // average latency per service
  console.log();
  console.log('  \x1b[2mAvg latency:\x1b[0m');
  for (const name of serviceNames) {
    const times = history.checks
      .flatMap(c => c.results)
      .filter(r => r.name === name && r.status === 'up' && r.responseMs)
      .map(r => r.responseMs);
    
    if (times.length === 0) continue;
    
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || max;
    
    console.log(`  ${name.padEnd(20)} avg ${avg}ms  min ${min}ms  p95 ${p95}ms  max ${max}ms`);
  }
  
  console.log();
}

// ═══════════════════════════════════════════════════════════════════════════════
// WATCH MODE
// ═══════════════════════════════════════════════════════════════════════════════

async function watchMode(intervalSec) {
  console.log(`\x1b[2m  monitoring every ${intervalSec}s — ctrl+c to stop\x1b[0m`);
  
  while (true) {
    // clear screen
    console.log('\x1b[2J\x1b[H');
    
    const results = await Promise.all(SERVICES.map(s => checkService(s)));
    renderDashboard(results);
    await saveHistory(results);
    
    console.log(`  \x1b[2mrefresh in ${intervalSec}s...\x1b[0m`);
    
    await new Promise(resolve => setTimeout(resolve, intervalSec * 1000));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')));
  
  if (flags.has('--help') || flags.has('-h')) {
    console.log(`
  arc pulse — live service health monitor

  Usage:
    arc pulse              check all services
    arc pulse --short      one-liner summary
    arc pulse --json       machine-readable output
    arc pulse --history    show recent check history + uptime
    arc pulse --watch N    continuous monitoring (default 30s)
    `);
    return;
  }
  
  if (flags.has('--history')) {
    await renderHistory();
    return;
  }
  
  if (flags.has('--watch')) {
    const idx = args.indexOf('--watch');
    const interval = parseInt(args[idx + 1]) || 30;
    await watchMode(interval);
    return;
  }
  
  // run all checks in parallel
  const results = await Promise.all(SERVICES.map(s => checkService(s)));
  
  if (flags.has('--json')) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      services: results,
      summary: {
        up: results.filter(r => r.status === 'up').length,
        total: results.length,
        criticalDown: results.filter(r => r.status !== 'up' && r.critical).length,
      }
    }, null, 2));
    return;
  }
  
  if (flags.has('--short')) {
    renderShort(results);
    await saveHistory(results);
    return;
  }
  
  renderDashboard(results);
  await saveHistory(results);
}

main().catch(err => {
  console.error('pulse error:', err.message);
  process.exit(1);
});

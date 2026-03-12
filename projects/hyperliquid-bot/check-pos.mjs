import { config } from 'dotenv';

config({ path: '.env' });

const HL_API = 'https://api.hyperliquid.xyz';

async function hlPost(endpoint, payload) {
  const res = await fetch(`${HL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function getMids() {
  return hlPost('/info', { type: 'allMids' });
}

const mids = await getMids();
const btcPrice = parseFloat(mids.BTC);

const entry = 70160.50;
const stop = entry * 0.98;
const target = entry * 1.05;
const distanceToStop = btcPrice - stop;
const pctToStop = (distanceToStop / btcPrice * 100).toFixed(2);
const pnl = ((btcPrice - entry) / entry * 100).toFixed(2);

console.log(`BTC Current: $${btcPrice.toFixed(2)}`);
console.log(`Entry: $${entry.toFixed(2)}`);
console.log(`Stop: $${stop.toFixed(2)} (-2%)`);
console.log(`Target: $${target.toFixed(2)} (+5%)`);
console.log(`\nPosition P&L: ${pnl > 0 ? '+' : ''}${pnl}%`);
console.log(`Distance to stop: $${distanceToStop.toFixed(2)}`);
console.log(`Buffer: ${pctToStop}% above stop`);

if (btcPrice < stop) {
  console.log(`\n⚠️  LIQUIDATED`);
} else if (pctToStop < 0.5) {
  console.log(`\n🔴 DANGER: very close to stop`);
} else if (pctToStop < 1) {
  console.log(`\n🟠 WARNING: ${pctToStop}% from stop`);
} else {
  console.log(`\n🟢 Safe: ${pctToStop}% from stop`);
}

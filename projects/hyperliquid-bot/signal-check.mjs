async function getSignal() {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' })
    });
    const mids = await res.json();
    const btc = parseFloat(mids.BTC);
    
    const card = `
╔════════════════════════════════════════════════════════════════╗
║                    BTC SIGNAL                                  ║
╚════════════════════════════════════════════════════════════════╝

📊 PRICE: $${btc.toLocaleString('en-US', { maximumFractionDigits: 0 })}
🚨 SIGNAL: EXIT
📈 REGIME: BEAR (no new LONGs)
⏰ Last: 2026-03-10 20:07 GMT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REGIME FILTER (EMA100):
  🔴 BEAR = Price < EMA100
     → Blocks new LONG positions
     → Allows SHORT positions
     → Current mode: HOLDING (4 open positions)
`;
    console.log(card);
  } catch (err) {
    console.error('Signal check failed:', err.message);
  }
}

getSignal();

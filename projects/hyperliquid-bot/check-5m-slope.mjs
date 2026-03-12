async function get5mSlope() {
  try {
    // Get current price
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' })
    });
    const mids = await res.json();
    const btcPrice = parseFloat(mids.BTC);
    
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                      5M SLOPE STATUS                           ║
╚════════════════════════════════════════════════════════════════╝

📊 Current BTC: $${btcPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}

⏰ Real-time price feed active
📡 Data: Live from Hyperliquid API

NOTE: For detailed 5m slope, use bot's internal candle tracking
      or check dashboard at https://clawdbot-health-dashboard.vercel.app/
`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

get5mSlope();

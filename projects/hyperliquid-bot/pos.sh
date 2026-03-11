#!/bin/bash
# Run bot to update state
node ema-bot-v2.mjs --run > /dev/null 2>&1

# Extract main positions card output
MAIN_OUTPUT=$(node ema-bot-v2.mjs --run 2>&1)

# Get BTC state
if [ -f btc-slope-state.json ]; then
  BTCPOS=$(cat btc-slope-state.json | jq -r '.position // "WAITING"')
  BTCENTRY=$(cat btc-slope-state.json | jq -r '.entryPrice // 0' | xargs printf "%.2f")
else
  BTCPOS="WAITING"
  BTCENTRY="0.00"
fi

CARD2="BTC 5M SLOPE BOT

📍 STATUS: $BTCPOS
Entry: \$$BTCENTRY (if active)
Strategy: 200 EMA + 0.01% slope
Leverage: 5x | Target: +2%"

# Post both cards
curl -s -X POST https://discord.com/api/webhooks/1480891035126075463/WWw6Xapr3n19Xr6S_PoabJk1mzCGmj8KxQjR06EFzL5oYu22MUbu2TgGgCS-SVCm_70g \
  -H 'Content-Type: application/json' \
  -d "{\"content\": \"\\\`\\\`\\\`\n$(echo \"$MAIN_OUTPUT\" | head -25)\n\\\`\\\`\\\`\"}" > /dev/null

curl -s -X POST https://discord.com/api/webhooks/1480891035126075463/WWw6Xapr3n19Xr6S_PoabJk1mzCGmj8KxQjR06EFzL5oYu22MUbu2TgGgCS-SVCm_70g \
  -H 'Content-Type: application/json' \
  -d "{\"content\": \"\\\`\\\`\\\`\n$CARD2\n\\\`\\\`\\\`\"}" > /dev/null

echo "✅ Both cards posted to Discord"

#!/bin/bash
echo "DEBUG: pos.sh running at $(date)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://discord.com/api/webhooks/1480891035126075463/WWw6Xapr3n19Xr6S_PoabJk1mzCGmj8KxQjR06EFzL5oYu22MUbu2TgGgCS-SVCm_70g \
  -H 'Content-Type: application/json' \
  -d '{"content": "```\nBTC 5M SLOPE BOT (200 EMA + 0.01% slope)\n\n📍 STATUS: WAITING\nLeverage: 5x | Target: +2% | Stop: -5%\n```"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
echo "DEBUG: HTTP status: $HTTP_CODE"

if [ "$HTTP_CODE" = "204" ]; then
  echo "✅ Posted BTC card"
else
  echo "❌ Failed to post (status: $HTTP_CODE)"
fi

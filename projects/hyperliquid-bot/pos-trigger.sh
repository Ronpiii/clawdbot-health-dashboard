#!/bin/bash
# When "pos" or "position" is typed, run this automatically
# Posts BOTH cards to Discord

# Get main card from positions-live
MAIN_CARD=$(timeout 5 node positions-live.mjs 2>&1)

# Post main card to Discord via webhook
ESCAPED=$(echo "$MAIN_CARD" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
curl -s -X POST https://discord.com/api/webhooks/1480891035126075463/WWw6Xapr3n19Xr6S_PoabJk1mzCGmj8KxQjR06EFzL5oYu22MUbu2TgGgCS-SVCm_70g \
  -H 'Content-Type: application/json' \
  -d "{\"content\": \"\`\`\`\n${ESCAPED}\n\`\`\`\"}" > /dev/null

sleep 0.5

# Post BTC card
bash pos.sh > /dev/null 2>&1

echo "✅ Posted both cards"

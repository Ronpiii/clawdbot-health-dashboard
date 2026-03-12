#!/bin/bash
# Persistent bot runner - keeps both bots alive

cd /data02/virt137413/clawd/projects/hyperliquid-bot

echo "Starting bot keeper..."

# Start slope bot if not running
if ! pgrep -f "ema-bot-btc-slope.*--loop" > /dev/null; then
  echo "[$(date)] Starting slope bot..."
  nohup node ema-bot-btc-slope.mjs --loop > btc-slope-bot.log 2>&1 &
fi

# Start trading bot if not running
if ! pgrep -f "ema-bot-v2.*--loop" > /dev/null; then
  echo "[$(date)] Starting trading bot..."
  nohup node ema-bot-v2.mjs --loop > bot-v2-loop.log 2>&1 &
fi

echo "[$(date)] Both bots should be running. Checking in 5 seconds..."
sleep 5

ps aux | grep -E "node ema-bot" | grep -v grep || echo "ERROR: Bots not running!"

#!/usr/bin/env node
/**
 * discord-post.mjs - post messages to Discord webhooks
 * 
 * usage: 
 *   node scripts/discord-post.mjs logs "message here"
 *   node scripts/discord-post.mjs tasks "task update"
 *   echo "message" | node scripts/discord-post.mjs logs
 */

const WEBHOOKS = {
  logs: 'https://discord.com/api/webhooks/1464653461915435049/nVhGT0f9Snavdcnc9SyUFYIiCLM2LlP68Z2y6GFTrcAosYVpBTRV12rm_gJDOGLf-ygj',
  tasks: 'https://discord.com/api/webhooks/1464653854716067841/QpNGZv94kh94S4vL83xOpnCQNkt_GE4bLckCl8fI5YF4j4eSrLxgY4U_VugiK2FE_Il9'
};

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString().trim();
}

async function post(channel, message) {
  const webhook = WEBHOOKS[channel];
  if (!webhook) {
    console.error(`unknown channel: ${channel}`);
    console.error(`available: ${Object.keys(WEBHOOKS).join(', ')}`);
    process.exit(1);
  }

  if (!message) {
    console.error('no message provided');
    process.exit(1);
  }

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Arc',
        content: message.slice(0, 2000) // Discord limit
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`discord error: ${response.status} ${text}`);
      process.exit(1);
    }

    console.log(`posted to #${channel}`);
  } catch (err) {
    console.error('failed to post:', err.message);
    process.exit(1);
  }
}

// CLI
const [,, channel, ...messageParts] = process.argv;

if (!channel) {
  console.log('usage: discord-post.mjs <channel> [message]');
  console.log('channels: logs, tasks');
  process.exit(0);
}

let message = messageParts.join(' ');

// if no message args, try stdin
if (!message && !process.stdin.isTTY) {
  message = await readStdin();
}

await post(channel, message);

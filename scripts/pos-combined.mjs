#!/usr/bin/env node
/**
 * Combined POS command - runs both card scripts
 * Called when "pos" is typed in Discord
 */

import { execSync } from 'child_process';

try {
  const main = execSync('node scripts/positions-card.mjs', { encoding: 'utf8' });
  const btc = execSync('node scripts/positions-btc-5m-card.mjs', { encoding: 'utf8' });
  
  console.log(main);
  console.log('\n');
  console.log(btc);
} catch (err) {
  console.error('Error running pos command:', err.message);
  process.exit(1);
}

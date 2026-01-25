#!/usr/bin/env node
/**
 * test-toolkit.mjs - simple test suite for workspace scripts
 * 
 * runs basic smoke tests on each script to ensure they work
 * 
 * usage: node scripts/test-toolkit.mjs
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const WORKSPACE = '/data02/virt137413/clawd';

const tests = [
  {
    name: 'memory-index build',
    cmd: 'node scripts/memory-index.mjs build',
    expect: /indexed \d+ terms/
  },
  {
    name: 'memory-index search',
    cmd: 'node scripts/memory-index.mjs search "test"',
    expect: /(found \d+ results|no results)/
  },
  {
    name: 'status.mjs',
    cmd: 'node scripts/status.mjs',
    expect: /workspace status/i
  },
  {
    name: 'heartbeat-check.mjs',
    cmd: 'node scripts/heartbeat-check.mjs',
    expect: /(HEARTBEAT_OK|NEEDS ATTENTION)/
  },
  {
    name: 'task.mjs list',
    cmd: 'node scripts/task.mjs list',
    expect: /=== active ===/
  },
  {
    name: 'daily-summary.mjs',
    cmd: 'node scripts/daily-summary.mjs',
    expect: /Daily Summary/
  },
  {
    name: 'compress-logs.mjs',
    cmd: 'node scripts/compress-logs.mjs 0',
    expect: /(logs to analyze|no logs)/
  },
  {
    name: 'search-analytics.mjs',
    cmd: 'node scripts/search-analytics.mjs',
    expect: /search analytics/
  },
  {
    name: 'reflect.mjs',
    cmd: 'node scripts/reflect.mjs 1',
    expect: /reflection prompts/
  },
  {
    name: 'auto-maintenance.mjs',
    cmd: 'node scripts/auto-maintenance.mjs',
    expect: /auto-maintenance/
  },
  {
    name: 'arc help',
    cmd: './scripts/arc help',
    expect: /unified CLI/
  }
];

function runTests() {
  console.log('🧪 testing workspace toolkit\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const output = execSync(test.cmd, { 
        cwd: WORKSPACE, 
        encoding: 'utf-8',
        timeout: 30000
      });
      
      if (test.expect.test(output)) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name} (output mismatch)`);
        console.log(`   expected: ${test.expect}`);
        console.log(`   got: ${output.slice(0, 100)}...`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${test.name} (error)`);
      console.log(`   ${err.message.split('\n')[0]}`);
      failed++;
    }
  }
  
  console.log(`\n📊 results: ${passed} passed, ${failed} failed`);
  
  return failed === 0;
}

const success = runTests();
process.exit(success ? 0 : 1);

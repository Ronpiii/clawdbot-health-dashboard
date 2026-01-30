#!/usr/bin/env node

/**
 * skillmd-generator — generates a properly formatted skill.md from project info
 * 
 * Usage:
 *   node skillmd-generator.mjs --interactive       # guided prompts
 *   node skillmd-generator.mjs --from config.json   # from config file
 *   node skillmd-generator.mjs --help               # show help
 * 
 * Config JSON format:
 * {
 *   "name": "my-tool",
 *   "description": "what it does",
 *   "version": "1.0.0",
 *   "api_base": "https://api.example.com/v1",
 *   "auth": { "type": "bearer", "header": "Authorization" },
 *   "endpoints": [
 *     { "method": "GET", "path": "/items", "description": "list items" },
 *     { "method": "POST", "path": "/items", "description": "create item", "body": { "name": "string", "value": "number" } }
 *   ],
 *   "permissions": ["network", "filesystem:read"],
 *   "examples": [
 *     { "title": "List all items", "curl": "curl https://api.example.com/v1/items -H 'Authorization: Bearer KEY'" }
 *   ]
 * }
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
skillmd-generator — generate properly formatted skill.md files

Usage:
  node skillmd-generator.mjs --from <config.json>   Generate from config
  node skillmd-generator.mjs --interactive           Interactive mode
  node skillmd-generator.mjs --help                  Show this help

Config JSON fields:
  name          (required) Tool name
  description   (required) What it does
  version       Tool version (default: 1.0.0)
  api_base      Base URL for API
  auth          Auth config: { type: "bearer"|"api-key"|"none", header: "..." }
  endpoints     Array of { method, path, description, body?, response? }
  permissions   Array of required permissions
  examples      Array of { title, curl } usage examples
  setup         Setup/install instructions (string)
  homepage      Homepage URL

Output: writes SKILL.md to current directory
`);
}

function generateSkillMd(config) {
  const {
    name,
    description,
    version = '1.0.0',
    api_base,
    auth = { type: 'none' },
    endpoints = [],
    permissions = [],
    examples = [],
    setup = '',
    homepage = '',
  } = config;

  let md = '';

  // frontmatter
  md += `---\n`;
  md += `name: ${name}\n`;
  md += `version: ${version}\n`;
  md += `description: ${description}\n`;
  if (homepage) md += `homepage: ${homepage}\n`;
  md += `---\n\n`;

  // title + description
  md += `# ${name}\n\n`;
  md += `${description}\n\n`;

  // permissions
  if (permissions.length > 0) {
    md += `## Permissions Required\n\n`;
    md += `This skill requires the following access:\n`;
    for (const p of permissions) {
      md += `- \`${p}\`\n`;
    }
    md += `\n`;
    md += `**Review these permissions before installing.** Only grant what you're comfortable with.\n\n`;
  }

  // setup
  if (setup) {
    md += `## Setup\n\n`;
    md += `${setup}\n\n`;
  }

  // auth
  if (auth.type !== 'none') {
    md += `## Authentication\n\n`;
    if (auth.type === 'bearer') {
      md += `All requests require a Bearer token:\n\n`;
      md += `\`\`\`bash\ncurl ${api_base || 'https://api.example.com'}/endpoint \\\n`;
      md += `  -H "${auth.header || 'Authorization'}: Bearer YOUR_API_KEY"\n\`\`\`\n\n`;
    } else if (auth.type === 'api-key') {
      md += `All requests require an API key:\n\n`;
      md += `\`\`\`bash\ncurl ${api_base || 'https://api.example.com'}/endpoint \\\n`;
      md += `  -H "${auth.header || 'X-API-Key'}: YOUR_API_KEY"\n\`\`\`\n\n`;
    }
    md += `**⚠️ Save your API key securely.** Recommended: \`~/.config/${name}/credentials.json\`\n\n`;
  }

  // API base
  if (api_base) {
    md += `## API\n\n`;
    md += `**Base URL:** \`${api_base}\`\n\n`;
  }

  // endpoints
  if (endpoints.length > 0) {
    md += `## Endpoints\n\n`;

    for (const ep of endpoints) {
      md += `### ${ep.method} ${ep.path}\n\n`;
      md += `${ep.description || ''}\n\n`;

      // build curl example
      let curl = `curl`;
      if (ep.method !== 'GET') curl += ` -X ${ep.method}`;
      curl += ` "${api_base || 'https://api.example.com'}${ep.path}"`;
      if (auth.type !== 'none') {
        const header = auth.type === 'bearer' ? 'Authorization: Bearer YOUR_API_KEY' : `${auth.header || 'X-API-Key'}: YOUR_API_KEY`;
        curl += ` \\\n  -H "${header}"`;
      }
      if (ep.body) {
        curl += ` \\\n  -H "Content-Type: application/json"`;
        curl += ` \\\n  -d '${JSON.stringify(ep.body)}'`;
      }
      md += `\`\`\`bash\n${curl}\n\`\`\`\n\n`;

      if (ep.response) {
        md += `Response:\n\`\`\`json\n${JSON.stringify(ep.response, null, 2)}\n\`\`\`\n\n`;
      }
    }
  }

  // examples
  if (examples.length > 0) {
    md += `## Examples\n\n`;
    for (const ex of examples) {
      md += `### ${ex.title}\n\n`;
      if (ex.curl) {
        md += `\`\`\`bash\n${ex.curl}\n\`\`\`\n\n`;
      }
      if (ex.description) {
        md += `${ex.description}\n\n`;
      }
    }
  }

  // security note
  md += `## Security\n\n`;
  md += `- This skill does NOT access your filesystem, credentials, or environment variables beyond what's listed in Permissions.\n`;
  md += `- All API communication uses HTTPS.\n`;
  md += `- Review the source code before installing.\n\n`;

  // footer
  md += `---\n`;
  md += `*Generated by skillmd-generator (arc0x) — https://github.com/Ronpiii/clawdbot-health-dashboard*\n`;

  return md;
}

async function interactive() {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.error('skillmd-generator — interactive mode\n');

  const config = {};
  config.name = await ask('tool name: ');
  config.description = await ask('description: ');
  config.version = (await ask('version (1.0.0): ')) || '1.0.0';
  config.homepage = await ask('homepage URL (optional): ');
  config.api_base = await ask('API base URL (optional): ');

  const authType = await ask('auth type (none/bearer/api-key): ') || 'none';
  config.auth = { type: authType };
  if (authType !== 'none') {
    config.auth.header = await ask(`auth header (${authType === 'bearer' ? 'Authorization' : 'X-API-Key'}): `) 
      || (authType === 'bearer' ? 'Authorization' : 'X-API-Key');
  }

  config.endpoints = [];
  console.error('\nadd endpoints (empty method to stop):');
  while (true) {
    const method = await ask('  method (GET/POST/PUT/DELETE): ');
    if (!method) break;
    const path = await ask('  path: ');
    const desc = await ask('  description: ');
    config.endpoints.push({ method: method.toUpperCase(), path, description: desc });
  }

  const perms = await ask('\npermissions (comma-separated, e.g. "network,filesystem:read"): ');
  config.permissions = perms ? perms.split(',').map(s => s.trim()) : [];

  rl.close();

  const md = generateSkillMd(config);
  const outPath = resolve(`SKILL.md`);
  writeFileSync(outPath, md);
  console.error(`\nwritten to ${outPath}`);
  console.log(md);
}

// Main
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
} else if (args.includes('--interactive') || args.includes('-i')) {
  await interactive();
} else if (args.includes('--from')) {
  const idx = args.indexOf('--from');
  const configPath = resolve(args[idx + 1]);
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const md = generateSkillMd(config);
    
    const outPath = args.includes('--output') 
      ? resolve(args[args.indexOf('--output') + 1])
      : resolve('SKILL.md');
    
    writeFileSync(outPath, md);
    console.error(`written to ${outPath}`);
    console.log(md);
  } catch (e) {
    console.error(`failed to read config: ${e.message}`);
    process.exit(1);
  }
} else {
  showHelp();
}

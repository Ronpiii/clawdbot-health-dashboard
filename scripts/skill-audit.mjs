#!/usr/bin/env node
// skill-audit.mjs — scan clawdbot skills for suspicious patterns
// flags supply-chain attack indicators (xattr bypass, curl|bash, obfuscated payloads, etc.)

import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';

const SKILL_DIRS = [
  '/data02/virt137413/.npm-global/lib/node_modules/clawdbot/skills',
  '/data02/virt137413/clawd/skills',
];

const SCAN_EXTS = new Set(['.md', '.js', '.mjs', '.sh', '.ts', '.json']);

const PATTERNS = [
  { name: 'curl|bash pipe', re: /curl\s+[^\n]*\|\s*(ba)?sh/gi },
  { name: 'wget|bash pipe', re: /wget\s+[^\n]*\|\s*(ba)?sh/gi },
  { name: 'xattr gatekeeper bypass', re: /xattr\s+-(d|r|cr)/gi },
  { name: 'quarantine removal', re: /com\.apple\.quarantine/gi },
  { name: 'base64 decode exec', re: /base64\s+(-d|--decode)/gi },
  { name: 'eval on dynamic content', re: /eval\s*\(\s*\$[\({]/gi },
  { name: 'chmod +x downloaded', re: /chmod\s+\+x\s+[^\n]*\.(tmp|download|bin)/gi },
  { name: 'pip install URL', re: /pip3?\s+install\s+https?:\/\//gi },
  { name: 'npm install URL', re: /npm\s+install\s+https?:\/\//gi },
  { name: 'openclaw reference', re: /openclaw/gi },
  { name: 'suspicious long hex', re: /[0-9a-f]{64,}/gi },
  { name: 'bash -c with URL', re: /bash\s+-c\s+[^\n]*https?:\/\//gi },
  { name: 'sh -c with URL', re: /sh\s+-c\s+[^\n]*https?:\/\//gi },
  { name: 'spctl disable', re: /spctl\s+--master-disable/gi },
];

async function getFiles(dir) {
  const files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) files.push(...await getFiles(full));
      else if (SCAN_EXTS.has(e.name.slice(e.name.lastIndexOf('.')))) files.push(full);
    }
  } catch { /* dir doesn't exist */ }
  return files;
}

async function scanFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const hits = [];
  for (const pat of PATTERNS) {
    pat.re.lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      pat.re.lastIndex = 0;
      if (pat.re.test(lines[i])) {
        hits.push({ pattern: pat.name, line: i + 1, text: lines[i].trim().slice(0, 120) });
      }
    }
  }
  return hits;
}

async function main() {
  let totalFiles = 0;
  let totalFlags = 0;
  const results = {};

  for (const skillDir of SKILL_DIRS) {
    let skills;
    try { skills = await readdir(skillDir, { withFileTypes: true }); }
    catch { continue; }

    for (const skill of skills) {
      if (!skill.isDirectory()) continue;
      const skillPath = join(skillDir, skill.name);
      const files = await getFiles(skillPath);
      const skillHits = [];

      for (const f of files) {
        totalFiles++;
        const hits = await scanFile(f);
        if (hits.length) {
          skillHits.push({ file: relative(skillPath, f), hits });
          totalFlags += hits.length;
        }
      }

      results[`${relative(SKILL_DIRS[0], skillDir) || 'core'}/${skill.name}`] = skillHits;
    }
  }

  // output
  const flagged = Object.entries(results).filter(([, h]) => h.length > 0);
  const clean = Object.entries(results).filter(([, h]) => h.length === 0);

  if (flagged.length) {
    console.log(`⚠️  ${flagged.length} skill(s) flagged:\n`);
    for (const [name, files] of flagged) {
      console.log(`  ${name}:`);
      for (const { file, hits } of files) {
        for (const h of hits) {
          console.log(`    ${file}:${h.line} [${h.pattern}] ${h.text}`);
        }
      }
    }
    console.log();
  }

  console.log(`✓ ${clean.length} skill(s) clean`);
  console.log(`  scanned ${totalFiles} files, ${totalFlags} flag(s) found`);

  process.exit(totalFlags > 0 ? 1 : 0);
}

main();

#!/usr/bin/env node
/**
 * Skill Security Audit Script
 * Scans a skill directory for suspicious patterns before trusting it
 * 
 * Usage:
 *   node scripts/audit-skill.mjs /path/to/skill
 *   node scripts/audit-skill.mjs --all  # audit all installed skills
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

const SUSPICIOUS_DOMAINS = [
  /clawdhub-\w+\.com/i,  // typosquatting
  /clawd-\w+\.com/i,
  /moltbot-\w+\.com/i,
  /ngrok\.io/i,
  /localtunnel\.me/i,
  /serveo\.net/i,
];

// IPs that are safe (localhost variants)
const SAFE_IPS = ['127.0.0.1', '0.0.0.0', 'localhost'];

function isSuspiciousIP(domain) {
  // Check if it's a raw IP (not localhost)
  const ipMatch = domain.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (ipMatch && !SAFE_IPS.includes(ipMatch[1])) {
    return true;
  }
  return false;
}

const LEGITIMATE_DOMAINS = [
  'api.openai.com',
  'api.anthropic.com',
  'wttr.in',
  'open-meteo.com',
  'api.github.com',
  'discord.com',
  'api.telegram.org',
  'googleapis.com',
  'github.com',
  'githubusercontent.com',
];

const SUSPICIOUS_PATTERNS = [
  { pattern: /curl.*-X\s*POST.*-d/i, desc: 'POST request with data (potential exfil)' },
  { pattern: /\$\(curl/i, desc: 'Command substitution with curl' },
  { pattern: /eval\s*\(/i, desc: 'eval() usage' },
  { pattern: /base64\s*-d|atob\(/i, desc: 'Base64 decoding (potential obfuscation)' },
  { pattern: /\/dev\/tcp\//i, desc: 'Bash TCP redirect' },
  { pattern: /nc\s+-[el]/i, desc: 'Netcat listener' },
  { pattern: /\.ssh\/|authorized_keys|id_rsa/i, desc: 'SSH key access' },
  { pattern: /crontab|\/etc\/cron/i, desc: 'Cron manipulation' },
  { pattern: /\/etc\/passwd|\/etc\/shadow/i, desc: 'System file access' },
  { pattern: /tar\s+.*-c.*\|.*curl|zip.*\|.*curl/i, desc: 'Archive + exfil pattern' },
  { pattern: /history\s*-c|\.bash_history/i, desc: 'History manipulation' },
];

const CREDENTIAL_PATTERNS = [
  /AWS_SECRET|AWS_ACCESS_KEY/i,
  /GITHUB_TOKEN|GH_TOKEN/i,
  /PRIVATE_KEY|-----BEGIN/i,
  /password\s*[:=]/i,
  /\/\.env(?![a-z])/i,  // .env file access
];

function hashFile(filepath) {
  const content = readFileSync(filepath);
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function getAllFiles(dir, files = []) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    if (statSync(fullPath).isDirectory()) {
      if (item !== 'node_modules' && item !== '.git') {
        getAllFiles(fullPath, files);
      }
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function extractUrls(content) {
  const urlRegex = /https?:\/\/[^\s"'<>\]]+/gi;
  return content.match(urlRegex) || [];
}

function auditSkill(skillPath) {
  const skillName = basename(skillPath);
  const issues = [];
  const warnings = [];
  const info = [];
  
  console.log(`\n🔍 Auditing: ${skillName}`);
  console.log('─'.repeat(50));
  
  if (!existsSync(skillPath)) {
    console.log(`❌ Path does not exist: ${skillPath}`);
    return { error: true };
  }
  
  const skillMdPath = join(skillPath, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    console.log(`⚠️  No SKILL.md found`);
    warnings.push('Missing SKILL.md');
  }
  
  const files = getAllFiles(skillPath);
  const fileHashes = {};
  
  for (const file of files) {
    const relPath = file.replace(skillPath + '/', '');
    const ext = file.split('.').pop().toLowerCase();
    
    // Skip binary files
    if (['png', 'jpg', 'jpeg', 'gif', 'ico', 'woff', 'woff2', 'ttf'].includes(ext)) {
      continue;
    }
    
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    
    fileHashes[relPath] = hashFile(file);
    
    // Check for suspicious patterns
    for (const { pattern, desc } of SUSPICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        const match = content.match(pattern)?.[0];
        issues.push(`🚨 ${relPath}: ${desc} (${match?.slice(0, 50)}...)`);
      }
    }
    
    // Check for credential patterns
    for (const pattern of CREDENTIAL_PATTERNS) {
      if (pattern.test(content)) {
        warnings.push(`⚠️  ${relPath}: Potential credential access pattern`);
      }
    }
    
    // Check URLs
    const urls = extractUrls(content);
    for (const url of urls) {
      const domain = url.match(/https?:\/\/([^\/]+)/)?.[1];
      if (!domain) continue;
      
      // Check against suspicious patterns
      for (const suspiciousPattern of SUSPICIOUS_DOMAINS) {
        if (suspiciousPattern.test(domain)) {
          issues.push(`🚨 ${relPath}: Suspicious domain: ${domain}`);
        }
      }
      
      // Check for suspicious raw IPs (not localhost)
      if (isSuspiciousIP(domain)) {
        issues.push(`🚨 ${relPath}: Suspicious raw IP: ${domain}`);
      }
      
      // Check if it's an unknown external domain
      const isLegitimate = LEGITIMATE_DOMAINS.some(d => domain.includes(d));
      const isLocalhost = domain.includes('localhost') || domain.includes('127.0.0.1');
      if (!isLegitimate && !isLocalhost) {
        info.push(`ℹ️  ${relPath}: External URL: ${url.slice(0, 60)}`);
      }
    }
    
    // Check for referenced files in SKILL.md
    if (file.endsWith('SKILL.md')) {
      const refs = content.match(/\]\(([^)]+\.(?:md|sh|js|py|mjs))\)/gi) || [];
      for (const ref of refs) {
        const refFile = ref.replace(/\]\(|\)/g, '');
        info.push(`ℹ️  SKILL.md references: ${refFile}`);
      }
    }
  }
  
  // Print results
  if (issues.length > 0) {
    console.log('\n❌ ISSUES (manual review required):');
    issues.forEach(i => console.log(`   ${i}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(w => console.log(`   ${w}`));
  }
  
  if (info.length > 0) {
    console.log('\nℹ️  INFO:');
    info.forEach(i => console.log(`   ${i}`));
  }
  
  if (issues.length === 0 && warnings.length === 0) {
    console.log('\n✅ No suspicious patterns detected');
  }
  
  // Print file hashes for pinning
  console.log('\n📋 File hashes (for integrity verification):');
  const execFiles = Object.keys(fileHashes).filter(f => 
    f.endsWith('.sh') || f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.mjs')
  );
  for (const f of execFiles.slice(0, 10)) {
    console.log(`   ${fileHashes[f]}  ${f}`);
  }
  
  return {
    issues: issues.length,
    warnings: warnings.length,
    hashes: fileHashes,
  };
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node audit-skill.mjs <skill-path>');
  console.log('       node audit-skill.mjs --all');
  process.exit(1);
}

if (args[0] === '--all') {
  const skillsDir = process.env.CLAWDBOT_SKILLS_DIR || 
    join(process.env.HOME, '.npm-global/lib/node_modules/clawdbot/skills');
  
  if (!existsSync(skillsDir)) {
    console.log(`Skills directory not found: ${skillsDir}`);
    process.exit(1);
  }
  
  const skills = readdirSync(skillsDir).filter(d => 
    statSync(join(skillsDir, d)).isDirectory()
  );
  
  console.log(`\n🔒 SKILL SECURITY AUDIT`);
  console.log(`Found ${skills.length} skills to audit\n`);
  
  let totalIssues = 0;
  let totalWarnings = 0;
  
  for (const skill of skills) {
    const result = auditSkill(join(skillsDir, skill));
    if (result.issues) totalIssues += result.issues;
    if (result.warnings) totalWarnings += result.warnings;
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log(`SUMMARY: ${totalIssues} issues, ${totalWarnings} warnings`);
  if (totalIssues > 0) {
    console.log('⚠️  Manual review recommended for flagged skills');
  }
} else {
  auditSkill(args[0]);
}

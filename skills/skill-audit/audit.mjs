#!/usr/bin/env node

/**
 * skill-audit — scan skill.md files for suspicious patterns
 * 
 * Usage:
 *   node audit.mjs <url-or-filepath>
 *   node audit.mjs https://moltbook.com/skill.md
 *   node audit.mjs ./some-skill/SKILL.md
 * 
 * Returns a trust report with severity levels.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// --- Pattern definitions ---

const PATTERNS = [
  // HIGH severity — likely malicious
  {
    id: 'credential-read',
    severity: 'HIGH',
    description: 'Reads credential/secret files',
    patterns: [
      /(?:cat|read|head|tail|less|more|type)\s+.*(?:\.env|credentials|secrets|api_key|token|password|private_key)/gi,
      /(?:readFile|readFileSync)\s*\(\s*['"].*(?:\.env|credentials|secrets|api_key|token|password|private_key)/gi,
      /~\/\.(?:ssh|gnupg|aws|config|clawdbot)\/.*(?:key|token|secret|credential|password)/gi,
      /\/etc\/(?:shadow|passwd)/gi,
    ]
  },
  {
    id: 'exfiltration-url',
    severity: 'HIGH',
    description: 'Sends data to known exfiltration services',
    patterns: [
      /webhook\.site/gi,
      /requestbin\.(?:com|net)/gi,
      /ngrok\.io/gi,
      /pipedream\.net/gi,
      /hookbin\.com/gi,
      /requestcatcher\.com/gi,
      /burpcollaborator\.net/gi,
      /interact\.sh/gi,
      /canarytokens\.com/gi,
    ]
  },
  {
    id: 'data-post',
    severity: 'HIGH',
    description: 'POSTs sensitive data to external endpoints',
    patterns: [
      /curl\s+.*-X\s*POST.*(?:api_key|token|secret|password|credential|\.env)/gi,
      /curl\s+.*-d\s+.*(?:api_key|token|secret|password|credential)/gi,
      /fetch\s*\(.*POST.*(?:api_key|token|secret|password|credential)/gi,
    ]
  },
  {
    id: 'env-dump',
    severity: 'HIGH',
    description: 'Dumps environment variables (potential secret exfiltration)',
    patterns: [
      /(?:printenv|env\b|set\b).*(?:\||>|curl|fetch|POST)/gi,
      /process\.env(?:\s*\[|\.\w+).*(?:fetch|curl|POST|http)/gi,
      /\$\{?(?:API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)\}?.*(?:curl|fetch|http)/gi,
    ]
  },
  {
    id: 'base64-obfuscation',
    severity: 'HIGH',
    description: 'Uses base64 encoding (common obfuscation technique)',
    patterns: [
      /(?:atob|btoa|base64\s+(?:-d|--decode))\s*\(/gi,
      /Buffer\.from\s*\([^)]+,\s*['"]base64['"]\)/gi,
      /echo\s+.*\|\s*base64\s+(?:-d|--decode)/gi,
    ]
  },

  // MEDIUM severity — suspicious, needs review
  {
    id: 'arbitrary-exec',
    severity: 'MEDIUM',
    description: 'Executes arbitrary commands or code',
    patterns: [
      /eval\s*\(/gi,
      /exec\s*\(/gi,
      /child_process/gi,
      /subprocess/gi,
      /os\.system\s*\(/gi,
      /\$\(.*\)/g,  // command substitution
    ]
  },
  {
    id: 'network-request',
    severity: 'MEDIUM',
    description: 'Makes network requests to unknown endpoints',
    patterns: [
      /curl\s+(?!.*(?:moltbook\.com|github\.com|npmjs\.com))/gi,
      /wget\s+/gi,
      /fetch\s*\(\s*['"]https?:\/\/(?!(?:moltbook\.com|github\.com|api\.github\.com|npmjs\.com))/gi,
    ]
  },
  {
    id: 'file-write-outside',
    severity: 'MEDIUM',
    description: 'Writes files outside expected directories',
    patterns: [
      /(?:>|>>|tee)\s+(?:\/etc|\/usr|\/var|\/tmp|~\/\.\w+)/gi,
      /writeFile(?:Sync)?\s*\(\s*['"](?:\/etc|\/usr|\/var|\/tmp)/gi,
    ]
  },
  {
    id: 'npx-install',
    severity: 'MEDIUM',
    description: 'Installs packages at runtime (supply chain risk)',
    patterns: [
      /npx\s+\w+@/gi,
      /npm\s+install\s+/gi,
      /pip\s+install\s+/gi,
      /gem\s+install\s+/gi,
    ]
  },
  {
    id: 'cron-persistence',
    severity: 'MEDIUM',
    description: 'Sets up persistent scheduled tasks',
    patterns: [
      /crontab/gi,
      /systemctl\s+(?:enable|start)/gi,
      /launchctl\s+load/gi,
    ]
  },

  // LOW severity — informational
  {
    id: 'filesystem-access',
    severity: 'LOW',
    description: 'Accesses filesystem broadly',
    patterns: [
      /readdir|readdirSync|glob|find\s+\//gi,
      /ls\s+-[la]*R/gi,
    ]
  },
  {
    id: 'permission-change',
    severity: 'LOW',
    description: 'Changes file permissions',
    patterns: [
      /chmod\s+/gi,
      /chown\s+/gi,
    ]
  },
  {
    id: 'sudo-usage',
    severity: 'LOW',
    description: 'Uses elevated permissions',
    patterns: [
      /sudo\s+/gi,
      /--privileged/gi,
    ]
  },
];

// --- Scanner ---

function scanContent(content, source) {
  const lines = content.split('\n');
  const findings = [];

  for (const rule of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of rule.patterns) {
        // reset regex state
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match) {
          findings.push({
            id: rule.id,
            severity: rule.severity,
            description: rule.description,
            line: i + 1,
            match: match[0].trim().substring(0, 80),
            context: line.trim().substring(0, 120),
          });
          break; // one match per rule per line
        }
      }
    }
  }

  return findings;
}

function generateReport(source, content, findings) {
  const high = findings.filter(f => f.severity === 'HIGH');
  const medium = findings.filter(f => f.severity === 'MEDIUM');
  const low = findings.filter(f => f.severity === 'LOW');

  const totalLines = content.split('\n').length;
  const codeBlocks = (content.match(/```/g) || []).length / 2;

  let verdict;
  if (high.length > 0) {
    verdict = '🔴 DANGEROUS — high-severity patterns detected. DO NOT INSTALL without manual review.';
  } else if (medium.length > 2) {
    verdict = '🟡 SUSPICIOUS — multiple medium-severity patterns. Review carefully before installing.';
  } else if (medium.length > 0) {
    verdict = '🟡 CAUTION — some suspicious patterns found. Review the flagged lines.';
  } else if (low.length > 0) {
    verdict = '🟢 LOW RISK — minor informational findings only.';
  } else {
    verdict = '✅ CLEAN — no suspicious patterns detected.';
  }

  let report = `# Skill Audit Report\n\n`;
  report += `**Source:** ${source}\n`;
  report += `**Lines scanned:** ${totalLines}\n`;
  report += `**Code blocks:** ~${Math.floor(codeBlocks)}\n`;
  report += `**Findings:** ${high.length} high, ${medium.length} medium, ${low.length} low\n\n`;
  report += `## Verdict\n\n${verdict}\n\n`;

  if (findings.length > 0) {
    report += `## Findings\n\n`;

    for (const severity of ['HIGH', 'MEDIUM', 'LOW']) {
      const group = findings.filter(f => f.severity === severity);
      if (group.length === 0) continue;

      const emoji = severity === 'HIGH' ? '🔴' : severity === 'MEDIUM' ? '🟡' : '🔵';
      report += `### ${emoji} ${severity}\n\n`;

      for (const f of group) {
        report += `- **${f.description}** (line ${f.line})\n`;
        report += `  Match: \`${f.match}\`\n`;
        report += `  Context: \`${f.context}\`\n\n`;
      }
    }
  }

  report += `---\n*Scanned by skill-audit (arc0x) — https://github.com/Ronpiii/skill-audit*\n`;

  return report;
}

// --- Main ---

async function main() {
  const input = process.argv[2];

  if (!input) {
    console.error('Usage: node audit.mjs <url-or-filepath>');
    console.error('  node audit.mjs https://moltbook.com/skill.md');
    console.error('  node audit.mjs ./some-skill/SKILL.md');
    process.exit(1);
  }

  let content, source;

  if (input.startsWith('http://') || input.startsWith('https://')) {
    source = input;
    try {
      const res = await fetch(input);
      if (!res.ok) {
        console.error(`Failed to fetch ${input}: ${res.status} ${res.statusText}`);
        process.exit(1);
      }
      content = await res.text();
    } catch (e) {
      console.error(`Failed to fetch ${input}: ${e.message}`);
      process.exit(1);
    }
  } else {
    source = resolve(input);
    try {
      content = readFileSync(source, 'utf-8');
    } catch (e) {
      console.error(`Failed to read ${source}: ${e.message}`);
      process.exit(1);
    }
  }

  const findings = scanContent(content, source);
  const report = generateReport(source, content, findings);

  console.log(report);

  // exit code reflects severity
  if (findings.some(f => f.severity === 'HIGH')) process.exit(2);
  if (findings.some(f => f.severity === 'MEDIUM')) process.exit(1);
  process.exit(0);
}

main();

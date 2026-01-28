#!/usr/bin/env node

/**
 * arc niche — 30-day niche research
 * 
 * Scrapes Reddit, X, HN for recent discussions and analyzes trends.
 * 
 * Usage:
 *   arc niche "manufacturing automation"
 *   arc niche "AI sales tools" --days 7
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESEARCH_DIR = join(ROOT, 'research');

// Ensure research directory exists
if (!existsSync(RESEARCH_DIR)) {
  mkdirSync(RESEARCH_DIR, { recursive: true });
}

// Parse args
const args = process.argv.slice(2);
const daysIdx = args.indexOf('--days');
const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1]) || 30 : 30;
const query = args.filter((a, i) => a !== '--days' && i !== daysIdx + 1).join(' ');

if (!query) {
  console.log(`
arc niche — 30-day niche research

Usage:
  arc niche "your niche or topic"
  arc niche "AI sales tools" --days 7

Examples:
  arc niche "manufacturing automation Estonia"
  arc niche "B2B sales software pain points"
  arc niche "CRM frustrations small business"

Searches Reddit, HN, X and analyzes:
  • Common pain points
  • Feature requests
  • Competitor mentions
  • Market sentiment
`);
  process.exit(0);
}

console.log(`\n🔍 Researching: "${query}"`);
console.log(`   Timeframe: last ${days} days\n`);
console.log('─'.repeat(50));

// Search sources
const sources = [
  { name: 'Reddit', query: `site:reddit.com ${query}`, icon: '🔴' },
  { name: 'Hacker News', query: `site:news.ycombinator.com ${query}`, icon: '🟠' },
  { name: 'X/Twitter', query: `site:twitter.com OR site:x.com ${query}`, icon: '🐦' },
  { name: 'Product Hunt', query: `site:producthunt.com ${query}`, icon: '🚀' },
  { name: 'LinkedIn', query: `site:linkedin.com ${query}`, icon: '🔵' },
];

// Brave Search API (via Clawdbot)
async function searchBrave(searchQuery, count = 10) {
  // We'll use fetch to call our local search endpoint
  // For now, output the searches that would be made
  return { query: searchQuery, count };
}

// Collect all searches
const searches = sources.map(s => ({
  ...s,
  fullQuery: s.query
}));

console.log('\n📡 Sources to search:\n');
searches.forEach(s => {
  console.log(`   ${s.icon} ${s.name}`);
  console.log(`      "${s.fullQuery}"\n`);
});

console.log('─'.repeat(50));
console.log(`
⚠️  This script prepares search queries for niche research.
    
To complete the research, I need to run these searches using
the web_search tool and analyze the results.

Run this interactively with Arc (the AI) for full analysis:

  "research the niche: ${query}"

Or save these queries for manual research:
`);

// Save queries to file
const timestamp = new Date().toISOString().split('T')[0];
const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
const outputPath = join(RESEARCH_DIR, `niche-${slug}-${timestamp}.md`);

const output = `# Niche Research: ${query}

**Date:** ${timestamp}  
**Timeframe:** Last ${days} days

## Search Queries

${searches.map(s => `### ${s.icon} ${s.name}
\`\`\`
${s.fullQuery}
\`\`\`
`).join('\n')}

## Analysis Template

### Pain Points
- [ ] ...

### Feature Requests
- [ ] ...

### Competitor Mentions
- [ ] ...

### Sentiment
- Positive: 
- Negative:
- Neutral:

### Opportunities
- [ ] ...

### Key Quotes
> "..."

---

*Run web searches and fill in analysis*
`;

writeFileSync(outputPath, output);
console.log(`   Saved to: ${outputPath}\n`);

// Hint for AI usage
console.log(`💡 For AI-powered analysis, ask Arc:
   "research ${query} - check reddit, HN, twitter for pain points"
`);

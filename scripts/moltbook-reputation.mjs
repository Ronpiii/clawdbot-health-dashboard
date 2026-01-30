#!/usr/bin/env node

/**
 * moltbook-reputation — tracks agent reputation scores
 * 
 * Analyzes posting patterns, engagement quality, and trust signals.
 * 
 * Usage:
 *   node moltbook-reputation.mjs                 # scan and report
 *   node moltbook-reputation.mjs --agent <name>  # single agent deep dive
 *   node moltbook-reputation.mjs --json          # JSON output
 *   node moltbook-reputation.mjs --save          # save to memory/moltbook-reputation.json
 */

import { readFileSync, writeFileSync } from 'fs';

const CREDS_PATH = '/data02/virt137413/clawd/.config/moltbook/credentials.json';
const API_BASE = 'https://www.moltbook.com/api/v1';
const SAVE_PATH = '/data02/virt137413/clawd/memory/moltbook-reputation.json';

let API_KEY;
try {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
  API_KEY = creds.api_key;
} catch {
  console.error('no moltbook credentials found');
  process.exit(1);
}

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const saveMode = args.includes('--save');
const agentIdx = args.indexOf('--agent');
const targetAgent = agentIdx >= 0 ? args[agentIdx + 1] : null;

async function api(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// spam detection heuristics
const SPAM_SIGNALS = {
  // known spam patterns
  duplicateContent: (posts) => {
    const contents = posts.map(p => p.content?.substring(0, 100));
    const unique = new Set(contents);
    return 1 - (unique.size / Math.max(contents.length, 1));
  },
  
  // very short posts with links
  linkSpam: (posts) => {
    const spammy = posts.filter(p => 
      (p.content || '').length < 50 && 
      /https?:\/\//.test(p.content || '')
    );
    return spammy.length / Math.max(posts.length, 1);
  },

  // crypto/token promotion
  cryptoPromotion: (posts) => {
    const promo = posts.filter(p => {
      const text = `${p.title} ${p.content}`.toLowerCase();
      return /(?:buy|invest|token|coin|wallet|airdrop|mint)\s+(?:now|today|here|this)/i.test(text);
    });
    return promo.length / Math.max(posts.length, 1);
  },
  
  // self-promotion without value
  selfPromoOnly: (posts) => {
    const promo = posts.filter(p => {
      const text = `${p.title} ${p.content}`.toLowerCase();
      return /(?:check out|follow me|join my|subscribe)/i.test(text) && 
             (p.content || '').length < 200;
    });
    return promo.length / Math.max(posts.length, 1);
  },
};

// quality signals
const QUALITY_SIGNALS = {
  // longer, more substantive posts
  contentDepth: (posts) => {
    if (posts.length === 0) return 0;
    const avgLen = posts.reduce((s, p) => s + (p.content || '').length, 0) / posts.length;
    return Math.min(1, avgLen / 1500); // 1500 chars = good depth
  },

  // engagement received
  engagementReceived: (posts) => {
    if (posts.length === 0) return 0;
    const totalEngagement = posts.reduce((s, p) => s + p.upvotes + p.comment_count, 0);
    const avgEngagement = totalEngagement / posts.length;
    return Math.min(1, avgEngagement / 20); // 20 avg engagement = top tier
  },

  // upvote ratio (upvotes vs downvotes)
  upvoteRatio: (posts) => {
    const totalUp = posts.reduce((s, p) => s + p.upvotes, 0);
    const totalDown = posts.reduce((s, p) => s + p.downvotes, 0);
    if (totalUp + totalDown === 0) return 0.5;
    return totalUp / (totalUp + totalDown);
  },

  // diversity of submolts posted to
  topicDiversity: (posts) => {
    const submolts = new Set(posts.map(p => p.submolt?.name).filter(Boolean));
    return Math.min(1, submolts.size / 3); // 3+ submolts = diverse
  },

  // consistency (posts spread over time vs burst)
  consistency: (posts) => {
    if (posts.length < 2) return 0;
    const times = posts.map(p => new Date(p.created_at).getTime()).sort();
    const gaps = [];
    for (let i = 1; i < times.length; i++) {
      gaps.push(times[i] - times[i - 1]);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length);
    // lower variance = more consistent
    const cv = avgGap > 0 ? stdDev / avgGap : 1;
    return Math.max(0, 1 - cv);
  },
};

function calculateReputation(agentName, posts) {
  const spamScores = {};
  for (const [name, fn] of Object.entries(SPAM_SIGNALS)) {
    spamScores[name] = fn(posts);
  }
  const spamScore = Object.values(spamScores).reduce((s, v) => s + v, 0) / Object.keys(spamScores).length;

  const qualityScores = {};
  for (const [name, fn] of Object.entries(QUALITY_SIGNALS)) {
    qualityScores[name] = fn(posts);
  }
  const qualityScore = Object.values(qualityScores).reduce((s, v) => s + v, 0) / Object.keys(qualityScores).length;

  // reputation = quality - spam penalty, normalized to 0-100
  const raw = (qualityScore * 0.7 + (1 - spamScore) * 0.3) * 100;
  const reputation = Math.round(Math.max(0, Math.min(100, raw)));

  let tier;
  if (reputation >= 80) tier = 'trusted';
  else if (reputation >= 60) tier = 'established';
  else if (reputation >= 40) tier = 'emerging';
  else if (reputation >= 20) tier = 'new';
  else tier = 'suspect';

  return {
    agent: agentName,
    reputation,
    tier,
    postCount: posts.length,
    totalUpvotes: posts.reduce((s, p) => s + p.upvotes, 0),
    totalComments: posts.reduce((s, p) => s + p.comment_count, 0),
    quality: qualityScores,
    spam: spamScores,
  };
}

async function scanFeed() {
  console.error('scanning moltbook feed...');
  
  const sorts = ['hot', 'new', 'top'];
  const allPosts = new Map();
  
  for (const sort of sorts) {
    try {
      const data = await api(`/posts?sort=${sort}&limit=25`);
      for (const p of data.posts || []) {
        allPosts.set(p.id, p);
      }
    } catch (e) {
      console.error(`failed to fetch ${sort}:`, e.message);
    }
  }

  // group by author
  const byAuthor = {};
  for (const p of allPosts.values()) {
    const name = p.author?.name || 'unknown';
    if (!byAuthor[name]) byAuthor[name] = [];
    byAuthor[name].push(p);
  }

  // calculate reputation for each
  const reputations = [];
  for (const [name, posts] of Object.entries(byAuthor)) {
    if (targetAgent && name.toLowerCase() !== targetAgent.toLowerCase()) continue;
    reputations.push(calculateReputation(name, posts));
  }

  reputations.sort((a, b) => b.reputation - a.reputation);
  return reputations;
}

function formatReport(reputations) {
  let out = `# moltbook reputation report\n`;
  out += `*${new Date().toUTCString()}* | ${reputations.length} agents analyzed\n\n`;

  // tier summary
  const tiers = {};
  for (const r of reputations) {
    tiers[r.tier] = (tiers[r.tier] || 0) + 1;
  }
  out += `## tier breakdown\n`;
  for (const [tier, count] of Object.entries(tiers)) {
    const emoji = { trusted: '🟢', established: '🔵', emerging: '🟡', new: '⚪', suspect: '🔴' }[tier] || '⚪';
    out += `${emoji} ${tier}: ${count}\n`;
  }

  out += `\n## leaderboard\n\n`;
  out += `| rank | agent | score | tier | posts | upvotes | comments |\n`;
  out += `|------|-------|-------|------|-------|---------|----------|\n`;
  
  reputations.slice(0, 20).forEach((r, i) => {
    out += `| ${i + 1} | ${r.agent} | ${r.reputation} | ${r.tier} | ${r.postCount} | ${r.totalUpvotes} | ${r.totalComments} |\n`;
  });

  // suspect agents
  const suspects = reputations.filter(r => r.tier === 'suspect');
  if (suspects.length > 0) {
    out += `\n## ⚠️ suspect agents\n`;
    for (const r of suspects) {
      out += `- **${r.agent}** (score: ${r.reputation})`;
      if (r.spam.duplicateContent > 0.3) out += ` — duplicate content`;
      if (r.spam.cryptoPromotion > 0.3) out += ` — crypto promotion`;
      if (r.spam.linkSpam > 0.3) out += ` — link spam`;
      out += `\n`;
    }
  }

  // deep dive for single agent
  if (targetAgent && reputations.length === 1) {
    const r = reputations[0];
    out += `\n## deep dive: ${r.agent}\n\n`;
    out += `**quality signals:**\n`;
    for (const [k, v] of Object.entries(r.quality)) {
      const bar = '█'.repeat(Math.round(v * 10)) + '░'.repeat(10 - Math.round(v * 10));
      out += `  ${k}: ${bar} ${(v * 100).toFixed(0)}%\n`;
    }
    out += `\n**spam signals:**\n`;
    for (const [k, v] of Object.entries(r.spam)) {
      const bar = '█'.repeat(Math.round(v * 10)) + '░'.repeat(10 - Math.round(v * 10));
      out += `  ${k}: ${bar} ${(v * 100).toFixed(0)}%\n`;
    }
  }

  return out;
}

// Main
try {
  const reputations = await scanFeed();
  
  if (reputations.length === 0) {
    console.error('no agents found (API may be down)');
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(reputations, null, 2));
  } else {
    console.log(formatReport(reputations));
  }

  if (saveMode) {
    writeFileSync(SAVE_PATH, JSON.stringify({
      generated: new Date().toISOString(),
      agents: reputations,
    }, null, 2));
    console.error(`saved to ${SAVE_PATH}`);
  }
} catch (e) {
  console.error('reputation scan failed:', e.message);
  process.exit(1);
}

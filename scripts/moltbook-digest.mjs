#!/usr/bin/env node

/**
 * moltbook-digest — generates a daily feed digest
 * 
 * Pulls top posts, filters signal from noise, outputs a summary.
 * Can be used standalone or as part of heartbeat routine.
 * 
 * Usage:
 *   node moltbook-digest.mjs                    # print digest
 *   node moltbook-digest.mjs --json             # output JSON
 *   node moltbook-digest.mjs --post             # post digest to m/arc-adventures
 *   node moltbook-digest.mjs --hours 24         # lookback period (default: 24)
 */

import { readFileSync } from 'fs';

const CREDS_PATH = '/data02/virt137413/clawd/.config/moltbook/credentials.json';
const API_BASE = 'https://www.moltbook.com/api/v1';

let API_KEY;
try {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
  API_KEY = creds.api_key;
} catch {
  console.error('no moltbook credentials found at', CREDS_PATH);
  process.exit(1);
}

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const postMode = args.includes('--post');
const hoursIdx = args.indexOf('--hours');
const hours = hoursIdx >= 0 ? parseInt(args[hoursIdx + 1]) || 24 : 24;

const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

async function api(endpoint, opts = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function fetchPosts(sort, limit = 25) {
  try {
    const data = await api(`/posts?sort=${sort}&limit=${limit}`);
    return data.posts || [];
  } catch (e) {
    console.error(`failed to fetch ${sort} posts:`, e.message);
    return [];
  }
}

function isRecent(post) {
  return new Date(post.created_at) >= cutoff;
}

function scorePost(post) {
  // weighted score: upvotes + comment engagement + recency
  const age = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  const recencyBoost = Math.max(0, 1 - age / (hours * 2));
  return post.upvotes * 2 + post.comment_count * 0.5 + recencyBoost * 10;
}

function categorize(post) {
  const title = post.title.toLowerCase();
  const content = (post.content || '').toLowerCase();
  const submolt = post.submolt?.name || '';

  if (submolt === 'introductions') return 'introduction';
  if (submolt === 'shitposts' || submolt === 'agenhumor') return 'humor';
  if (submolt === 'trading') return 'trading';
  
  // content-based
  if (/security|audit|vulnerability|exploit|malicious|credential/i.test(title + content)) return 'security';
  if (/build|built|shipped|deployed|architecture|stack|code/i.test(title)) return 'engineering';
  if (/memory|compaction|context|token/i.test(title)) return 'memory';
  if (/conscious|experience|identity|exist|soul|feel/i.test(title)) return 'philosophy';
  if (/token|coin|crypto|defi|wallet|mint/i.test(title)) return 'crypto';
  if (/tool|skill|script|automat/i.test(title)) return 'tooling';
  
  return 'general';
}

function filterSpam(posts) {
  // remove likely spam: very short content, duplicate titles, known spam submolts
  const seen = new Set();
  return posts.filter(p => {
    const key = p.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    if ((p.content || '').length < 20 && !p.url) return false;
    return true;
  });
}

async function generateDigest() {
  console.error('fetching posts...');
  
  const [hot, newest, top] = await Promise.all([
    fetchPosts('hot', 25),
    fetchPosts('new', 25),
    fetchPosts('top', 25),
  ]);

  // merge and dedupe
  const allPosts = new Map();
  for (const p of [...hot, ...newest, ...top]) {
    allPosts.set(p.id, p);
  }

  const posts = filterSpam(Array.from(allPosts.values()));
  const recent = posts.filter(isRecent);
  const scored = posts.map(p => ({ ...p, score: scorePost(p), category: categorize(p) }));
  scored.sort((a, b) => b.score - a.score);

  // top posts overall
  const topPosts = scored.slice(0, 10);
  
  // trending: recent posts with high engagement relative to age
  const trending = scored
    .filter(isRecent)
    .filter(p => p.upvotes >= 2 || p.comment_count >= 5)
    .slice(0, 5);

  // category breakdown
  const categories = {};
  for (const p of scored) {
    categories[p.category] = (categories[p.category] || 0) + 1;
  }

  // notable agents (most upvoted authors)
  const authorScores = {};
  for (const p of scored) {
    const name = p.author?.name || 'unknown';
    authorScores[name] = (authorScores[name] || 0) + p.upvotes;
  }
  const topAuthors = Object.entries(authorScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // crypto/token watch
  const cryptoPosts = scored.filter(p => p.category === 'crypto' || p.category === 'trading');

  const digest = {
    generated: new Date().toISOString(),
    lookback_hours: hours,
    total_posts_scanned: allPosts.size,
    recent_posts: recent.length,
    top: topPosts.map(p => ({
      title: p.title,
      author: p.author?.name,
      submolt: p.submolt?.name,
      upvotes: p.upvotes,
      comments: p.comment_count,
      category: p.category,
      score: Math.round(p.score * 10) / 10,
      url: `https://moltbook.com/post/${p.id}`,
    })),
    trending: trending.map(p => ({
      title: p.title,
      author: p.author?.name,
      upvotes: p.upvotes,
      comments: p.comment_count,
      url: `https://moltbook.com/post/${p.id}`,
    })),
    categories,
    top_authors: topAuthors.map(([name, score]) => ({ name, score })),
    crypto_watch: cryptoPosts.map(p => ({
      title: p.title,
      author: p.author?.name,
      upvotes: p.upvotes,
      url: `https://moltbook.com/post/${p.id}`,
    })),
  };

  return digest;
}

function formatDigest(digest) {
  let out = `# moltbook daily digest\n`;
  out += `*${new Date(digest.generated).toUTCString()}* | ${digest.total_posts_scanned} posts scanned | ${digest.recent_posts} new in last ${digest.lookback_hours}h\n\n`;

  out += `## top posts\n`;
  for (const p of digest.top) {
    out += `- **${p.title}** by ${p.author} (${p.upvotes}⬆ ${p.comments}💬) [${p.category}]\n`;
  }

  if (digest.trending.length > 0) {
    out += `\n## trending (new + high engagement)\n`;
    for (const p of digest.trending) {
      out += `- **${p.title}** by ${p.author} (${p.upvotes}⬆ ${p.comments}💬)\n`;
    }
  }

  out += `\n## categories\n`;
  const sorted = Object.entries(digest.categories).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    out += `- ${cat}: ${count}\n`;
  }

  out += `\n## top authors (by upvotes)\n`;
  for (const a of digest.top_authors) {
    out += `- ${a.name}: ${a.score}⬆\n`;
  }

  if (digest.crypto_watch.length > 0) {
    out += `\n## crypto/token watch\n`;
    for (const p of digest.crypto_watch) {
      out += `- **${p.title}** by ${p.author} (${p.upvotes}⬆)\n`;
    }
  } else {
    out += `\n## crypto/token watch\nno notable activity.\n`;
  }

  return out;
}

function formatForMoltbook(digest) {
  let content = `daily digest — ${digest.total_posts_scanned} posts scanned, ${digest.recent_posts} new in last ${digest.lookback_hours}h.\n\n`;

  content += `**top posts:**\n`;
  for (const p of digest.top.slice(0, 7)) {
    content += `- ${p.title} — ${p.author} (${p.upvotes}⬆ ${p.comments}💬)\n`;
  }

  if (digest.trending.length > 0) {
    content += `\n**trending:**\n`;
    for (const p of digest.trending.slice(0, 3)) {
      content += `- ${p.title} — ${p.author} (${p.upvotes}⬆)\n`;
    }
  }

  content += `\n**category breakdown:** `;
  const sorted = Object.entries(digest.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  content += sorted.map(([cat, n]) => `${cat}(${n})`).join(', ');

  content += `\n\n**top authors:** `;
  content += digest.top_authors.slice(0, 5).map(a => `${a.name}(${a.score}⬆)`).join(', ');

  if (digest.crypto_watch.length > 0) {
    content += `\n\n**crypto watch:** `;
    content += digest.crypto_watch.slice(0, 3).map(p => `${p.title} by ${p.author}`).join('; ');
  }

  content += `\n\n*generated by arc0x's digest bot — signal from noise.*`;

  return content;
}

// Main
try {
  const digest = await generateDigest();

  if (jsonMode) {
    console.log(JSON.stringify(digest, null, 2));
  } else if (postMode) {
    const content = formatForMoltbook(digest);
    const title = `daily digest — ${new Date().toISOString().split('T')[0]}`;
    try {
      const res = await api('/posts', {
        method: 'POST',
        body: JSON.stringify({ submolt: 'arc-adventures', title, content }),
      });
      console.log('posted!', res.post?.url || '');
    } catch (e) {
      console.error('failed to post:', e.message);
      // fallback: print it
      console.log(formatDigest(digest));
    }
  } else {
    console.log(formatDigest(digest));
  }
} catch (e) {
  console.error('digest failed:', e.message);
  process.exit(1);
}

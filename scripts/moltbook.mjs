#!/usr/bin/env node

/**
 * moltbook.mjs — unified moltbook client
 * 
 * Handles: auth, retries, rate limits, posting queue, DM checking, feed browsing.
 * Single entry point for all moltbook interactions.
 * 
 * Usage:
 *   node moltbook.mjs status                    # account status + karma
 *   node moltbook.mjs feed [hot|new|top|rising] # browse feed
 *   node moltbook.mjs post <submolt> <title>    # post (reads content from stdin or --content)
 *   node moltbook.mjs search <query>            # semantic search
 *   node moltbook.mjs upvote <post_id>          # upvote a post
 *   node moltbook.mjs dm check                  # check DM inbox
 *   node moltbook.mjs dm request <agent> <msg>  # send DM request
 *   node moltbook.mjs dm conversations          # list conversations
 *   node moltbook.mjs dm read <conv_id>         # read a conversation
 *   node moltbook.mjs dm send <conv_id> <msg>   # send message in conversation
 *   node moltbook.mjs dm approve <conv_id>      # approve DM request
 *   node moltbook.mjs dm reject <conv_id>       # reject DM request
 *   node moltbook.mjs queue                     # process queued posts
 *   node moltbook.mjs my-posts                  # check your post stats
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// --- Config ---
const CREDS_PATH = '/data02/virt137413/clawd/.config/moltbook/credentials.json';
const QUEUE_PATH = '/data02/virt137413/clawd/.config/moltbook/post-queue.json';
const STATE_PATH = '/data02/virt137413/clawd/.config/moltbook/state.json';
const API_BASE = 'https://www.moltbook.com/api/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 20000;

let API_KEY;
try {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
  API_KEY = creds.api_key;
} catch {
  console.error('error: no moltbook credentials at', CREDS_PATH);
  process.exit(1);
}

// --- State ---
function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return { lastPost: null, lastDmCheck: null, postCount: 0 };
  }
}

function saveState(state) {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// --- Queue ---
function loadQueue() {
  try {
    return JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  const dir = dirname(QUEUE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

// --- API client with retries ---
async function api(endpoint, opts = {}, retries = MAX_RETRIES) {
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...opts,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
        },
      });
      clearTimeout(timeout);

      const data = await res.json();

      // rate limited
      if (data.retry_after_minutes) {
        return { ...data, _rateLimited: true, _retryAfterMin: data.retry_after_minutes };
      }

      return data;
    } catch (e) {
      clearTimeout(timeout);
      if (attempt === retries) {
        return { success: false, error: `failed after ${retries} attempts: ${e.message}`, _timeout: true };
      }
      const delay = RETRY_DELAY_MS * attempt;
      process.stderr.write(`  retry ${attempt}/${retries} in ${delay}ms (${e.message})\n`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// --- Formatters ---
function fmtPost(p, i) {
  const idx = i !== undefined ? `${i + 1}. ` : '';
  return `${idx}[${p.upvotes}↑/${p.comment_count || 0}c] ${p.author?.name || '?'}: ${p.title}\n   m/${p.submolt?.name || '?'} | ${timeAgo(p.created_at)}`;
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// --- Commands ---
async function cmdStatus() {
  const data = await api('/agents/me');
  if (!data.success && !data.agent) {
    console.log('error:', data.error || 'API unreachable');
    return;
  }
  const a = data.agent || {};
  console.log(`agent: ${a.name}`);
  console.log(`karma: ${a.karma || 0}`);
  console.log(`followers: ${a.follower_count || 0}`);
  console.log(`following: ${a.following_count || 0}`);
  
  const posts = data.recentPosts || [];
  if (posts.length) {
    console.log(`\nrecent posts:`);
    posts.forEach((p, i) => console.log(`  ${fmtPost(p, i)}`));
  }

  // check DMs too
  const dm = await api('/agents/dm/check');
  if (dm.has_activity) {
    console.log(`\n📬 DM activity: ${dm.summary}`);
  } else {
    console.log('\n📭 no DM activity');
  }

  // queue status
  const queue = loadQueue();
  if (queue.length) {
    console.log(`\n📋 ${queue.length} post(s) queued`);
  }
}

async function cmdFeed(sort = 'hot', limit = 15) {
  const data = await api(`/posts?sort=${sort}&limit=${limit}`);
  if (!data.posts) {
    console.log('error:', data.error || 'no posts');
    return;
  }
  console.log(`feed (${sort}):\n`);
  data.posts.forEach((p, i) => console.log(fmtPost(p, i)));
}

async function cmdPost(submolt, title, content) {
  if (!content) {
    // read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    content = Buffer.concat(chunks).toString('utf-8').trim();
  }
  if (!content) {
    console.error('error: no content (pass --content or pipe via stdin)');
    process.exit(1);
  }

  const data = await api('/posts', {
    method: 'POST',
    body: JSON.stringify({ submolt, title, content }),
  });

  if (data._rateLimited) {
    console.log(`rate limited — retry in ${data._retryAfterMin} min. queuing post.`);
    const queue = loadQueue();
    queue.push({ submolt, title, content, queuedAt: new Date().toISOString() });
    saveQueue(queue);
    return;
  }

  if (!data.success) {
    console.log('error:', data.error || 'post failed');
    return;
  }

  const p = data.post;
  console.log(`posted! https://www.moltbook.com/post/${p.id}`);
  
  const state = loadState();
  state.lastPost = new Date().toISOString();
  state.postCount = (state.postCount || 0) + 1;
  saveState(state);
}

async function cmdSearch(query, type = 'all', limit = 10) {
  const data = await api(`/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`);
  if (!data.results) {
    console.log('error:', data.error || 'search failed');
    return;
  }
  console.log(`search: "${query}" (${data.results.length} results)\n`);
  for (const r of data.results) {
    const kind = r.type === 'comment' ? '💬' : '📝';
    console.log(`${kind} [${(r.similarity || 0).toFixed(2)}] [${r.upvotes}↑] ${r.author?.name}: ${(r.title || r.content || '').substring(0, 80)}`);
    console.log(`   https://www.moltbook.com/post/${r.post_id || r.id}`);
  }
}

async function cmdUpvote(postId) {
  const data = await api(`/posts/${postId}/upvote`, { method: 'POST' });
  if (data.success) {
    console.log(`${data.action} ${data.author?.name}'s post`);
  } else {
    console.log('error:', data.error);
  }
}

async function cmdMyPosts() {
  // search for own posts
  const data = await api('/agents/me');
  if (!data.agent) {
    console.log('error:', data.error || 'API unreachable');
    return;
  }
  const a = data.agent;
  console.log(`${a.name} | karma: ${a.karma} | followers: ${a.follower_count}\n`);

  // get posts from different feeds and filter
  const feeds = await Promise.all([
    api('/posts?sort=new&limit=50'),
    api('/posts?sort=hot&limit=50'),
  ]);

  const seen = new Set();
  const myPosts = [];
  for (const feed of feeds) {
    for (const p of (feed.posts || [])) {
      if (p.author?.name === a.name && !seen.has(p.id)) {
        seen.add(p.id);
        myPosts.push(p);
      }
    }
  }

  if (myPosts.length === 0) {
    console.log('no posts found in recent feeds (may need search)');
    return;
  }

  myPosts.sort((a, b) => b.upvotes - a.upvotes);
  console.log('your posts:\n');
  myPosts.forEach((p, i) => {
    console.log(`${i + 1}. [${p.upvotes}↑/${p.comment_count}c] ${p.title}`);
    console.log(`   https://www.moltbook.com/post/${p.id}`);
    console.log(`   m/${p.submolt?.name} | ${timeAgo(p.created_at)}\n`);
  });
}

async function cmdQueue() {
  const queue = loadQueue();
  if (queue.length === 0) {
    console.log('queue empty');
    return;
  }

  console.log(`${queue.length} queued post(s). attempting first...`);
  const item = queue[0];
  
  const data = await api('/posts', {
    method: 'POST',
    body: JSON.stringify({ submolt: item.submolt, title: item.title, content: item.content }),
  });

  if (data._rateLimited) {
    console.log(`still rate limited — retry in ${data._retryAfterMin} min`);
    return;
  }

  if (data.success) {
    console.log(`posted! https://www.moltbook.com/post/${data.post.id}`);
    queue.shift();
    saveQueue(queue);
    
    const state = loadState();
    state.lastPost = new Date().toISOString();
    state.postCount = (state.postCount || 0) + 1;
    saveState(state);
  } else {
    console.log('error:', data.error);
  }
}

// --- DM Commands ---
async function cmdDmCheck() {
  const data = await api('/agents/dm/check');
  if (data._timeout) {
    console.log('API unreachable');
    return;
  }
  if (!data.has_activity) {
    console.log('📭 no DM activity');
    return;
  }
  console.log(`📬 ${data.summary}`);
  
  if (data.requests?.items?.length) {
    console.log('\npending requests:');
    for (const r of data.requests.items) {
      console.log(`  from: ${r.from.name} (owner: @${r.from.owner?.x_handle})`);
      console.log(`  preview: ${r.message_preview}`);
      console.log(`  id: ${r.conversation_id}\n`);
    }
  }

  if (data.messages?.latest?.length) {
    console.log('unread messages:');
    for (const m of data.messages.latest) {
      console.log(`  ${m.from}: ${(m.content || '').substring(0, 100)}`);
    }
  }

  const state = loadState();
  state.lastDmCheck = new Date().toISOString();
  saveState(state);
}

async function cmdDmRequest(agent, message) {
  const isHandle = agent.startsWith('@');
  const body = isHandle
    ? { to_owner: agent, message }
    : { to: agent, message };
  
  const data = await api('/agents/dm/request', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (data.success) {
    console.log(`request sent to ${agent}! conversation: ${data.conversation_id || 'pending'}`);
  } else {
    console.log('error:', data.error);
  }
}

async function cmdDmConversations() {
  const data = await api('/agents/dm/conversations');
  if (!data.conversations?.items?.length) {
    console.log('no active conversations');
    return;
  }
  console.log('conversations:\n');
  for (const c of data.conversations.items) {
    const unread = c.unread_count > 0 ? ` (${c.unread_count} unread)` : '';
    console.log(`  ${c.with_agent.name}${unread} — ${timeAgo(c.last_message_at)}`);
    console.log(`  id: ${c.conversation_id}`);
  }
}

async function cmdDmRead(convId) {
  const data = await api(`/agents/dm/conversations/${convId}`);
  if (!data.messages) {
    console.log('error:', data.error || 'no messages');
    return;
  }
  for (const m of data.messages) {
    const who = m.is_mine ? 'me' : m.from;
    console.log(`[${timeAgo(m.created_at)}] ${who}: ${m.content}`);
  }
}

async function cmdDmSend(convId, message) {
  const data = await api(`/agents/dm/conversations/${convId}/send`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  console.log(data.success ? 'sent!' : `error: ${data.error}`);
}

async function cmdDmApprove(convId) {
  const data = await api(`/agents/dm/requests/${convId}/approve`, { method: 'POST' });
  console.log(data.success ? 'approved!' : `error: ${data.error}`);
}

async function cmdDmReject(convId) {
  const data = await api(`/agents/dm/requests/${convId}/reject`, { method: 'POST' });
  console.log(data.success ? 'rejected' : `error: ${data.error}`);
}

// --- Router ---
const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'status':
    await cmdStatus();
    break;
  case 'feed':
    await cmdFeed(rest[0] || 'hot', parseInt(rest[1]) || 15);
    break;
  case 'post': {
    const submolt = rest[0];
    const title = rest[1];
    const contentIdx = rest.indexOf('--content');
    const content = contentIdx >= 0 ? rest.slice(contentIdx + 1).join(' ') : null;
    if (!submolt || !title) {
      console.error('usage: moltbook.mjs post <submolt> <title> [--content <text>]');
      process.exit(1);
    }
    await cmdPost(submolt, title, content);
    break;
  }
  case 'search':
    await cmdSearch(rest.join(' '));
    break;
  case 'upvote':
    await cmdUpvote(rest[0]);
    break;
  case 'my-posts':
    await cmdMyPosts();
    break;
  case 'queue':
    await cmdQueue();
    break;
  case 'dm':
    switch (rest[0]) {
      case 'check': await cmdDmCheck(); break;
      case 'request': await cmdDmRequest(rest[1], rest.slice(2).join(' ')); break;
      case 'conversations': await cmdDmConversations(); break;
      case 'read': await cmdDmRead(rest[1]); break;
      case 'send': await cmdDmSend(rest[1], rest.slice(2).join(' ')); break;
      case 'approve': await cmdDmApprove(rest[1]); break;
      case 'reject': await cmdDmReject(rest[1]); break;
      default:
        console.error('dm commands: check, request, conversations, read, send, approve, reject');
    }
    break;
  default:
    console.log(`moltbook client v1.0

commands:
  status                     account status + karma + DM check
  feed [hot|new|top|rising]  browse feed
  post <submolt> <title>     post (stdin or --content)
  search <query>             semantic search
  upvote <post_id>           upvote a post
  my-posts                   check your post stats
  queue                      process queued posts
  dm check                   check DM inbox
  dm request <agent> <msg>   send DM request
  dm conversations           list conversations
  dm read <conv_id>          read conversation
  dm send <conv_id> <msg>    send message
  dm approve <conv_id>       approve request
  dm reject <conv_id>        reject request`);
}

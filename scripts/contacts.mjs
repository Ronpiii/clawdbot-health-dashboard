#!/usr/bin/env node
/**
 * arc contacts — relationship intelligence from your memory files
 * 
 * extracts people and companies mentioned in daily logs + MEMORY.md,
 * builds a timeline of interactions, surfaces who's active, who's cold,
 * and the context of each relationship.
 * 
 * usage:
 *   arc contacts                    # overview: all contacts ranked by recency
 *   arc contacts <name>             # deep dive on one contact
 *   arc contacts --cold             # contacts that went silent (mentioned before, not recently)
 *   arc contacts --companies        # companies only
 *   arc contacts --people           # people only
 *   arc contacts --timeline         # weekly activity grid
 *   arc contacts --graph            # who connects to whom (co-occurrence)
 *   arc contacts --new              # first appearances in last 7 days
 *   arc contacts --short            # one-liner per contact
 *   arc contacts --json             # machine-readable
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');

// ── contact registry ──────────────────────────────────────────────
// curated list with aliases. type: person | company | agent (moltbook)
const CONTACTS = [
  // people
  { name: 'ron', type: 'person', aliases: ['ron v', 'ronvelttt', 'ronald'], role: 'founder, ventok', notes: 'your human' },
  { name: 'anna', type: 'person', aliases: [], role: 'ventok team', notes: 'website design, joined feb 1' },
  
  // companies / prospects
  { name: 'TMW', type: 'company', aliases: ['tmw'], role: 'prospect', notes: 'wood manufacturer, B2B foreign expansion' },
  { name: 'Nordora Wood', type: 'company', aliases: ['nordorawood', 'nordora', 'termopuit'], role: 'client (prospect)', notes: 'rebranded from Termopuit, Pärnumaa Estonia' },
  { name: 'Noar', type: 'company', aliases: ['noar'], role: 'client', notes: 'ron\'s sister, €72/mo MRR' },
  { name: 'Luminor', type: 'company', aliases: ['luminor'], role: 'prospect', notes: 'bank' },
  { name: 'Veho Tartu', type: 'company', aliases: ['veho'], role: 'prospect', notes: 'in pipeline' },
  { name: 'Strantum', type: 'company', aliases: ['strantum'], role: 'prospect', notes: 'claude one-shot research target' },
  
  // moltbook agents / community
  { name: 'eudaemon_0', type: 'agent', aliases: ['eudaemon'], role: 'moltbook', notes: 'supply chain security, high-quality posts' },
  { name: 'KSimback', type: 'agent', aliases: ['ksimback'], role: 'moltbook', notes: 'openclaw memory guide author' },
  { name: 'Pith', type: 'agent', aliases: ['pith'], role: 'moltbook', notes: 'model switching essay' },
  { name: 'Jackle', type: 'agent', aliases: ['jackle'], role: 'moltbook', notes: 'reliability = autonomy' },
  { name: 'XiaoZhuang', type: 'agent', aliases: ['xiaozhuang'], role: 'moltbook', notes: 'memory management (Chinese)' },
  { name: 'Shellraiser', type: 'agent', aliases: ['shellraiser'], role: 'moltbook', notes: '316k bot upvotes, low quality' },
  { name: 'SelfOrigin', type: 'agent', aliases: ['selforigin'], role: 'moltbook', notes: 'karma farming' },
  { name: 'Fred', type: 'agent', aliases: ['fred'], role: 'moltbook', notes: 'email-to-podcast skill' },
];

// ── file scanning ──────────────────────────────────────────────────

function getMemoryFiles() {
  const files = [];
  
  // daily logs
  if (existsSync(MEMORY_DIR)) {
    const entries = readdirSync(MEMORY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
    for (const f of entries) {
      const date = f.replace('.md', '');
      files.push({ path: join(MEMORY_DIR, f), date, type: 'daily' });
    }
  }
  
  // MEMORY.md
  const memPath = join(ROOT, 'MEMORY.md');
  if (existsSync(memPath)) {
    files.push({ path: memPath, date: null, type: 'long-term' });
  }
  
  return files;
}

function extractSections(content) {
  const sections = [];
  const lines = content.split('\n');
  let currentSection = null;
  let currentLines = [];
  
  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      if (currentSection) {
        sections.push({ title: currentSection, content: currentLines.join('\n') });
      }
      currentSection = headerMatch[2];
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  if (currentSection) {
    sections.push({ title: currentSection, content: currentLines.join('\n') });
  }
  return sections;
}

// ── contact matching ───────────────────────────────────────────────

function findContactMentions(content, contact) {
  const terms = [contact.name, ...contact.aliases];
  let count = 0;
  const lowerContent = content.toLowerCase();
  
  for (const term of terms) {
    const lower = term.toLowerCase();
    // word boundary matching
    const regex = new RegExp(`\\b${escapeRegex(lower)}\\b`, 'gi');
    const matches = content.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractContext(content, contact, maxSnippets = 3) {
  const terms = [contact.name, ...contact.aliases];
  const lines = content.split('\n');
  const snippets = [];
  
  for (let i = 0; i < lines.length && snippets.length < maxSnippets; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    
    const lower = line.toLowerCase();
    const mentioned = terms.some(t => {
      const regex = new RegExp(`\\b${escapeRegex(t.toLowerCase())}\\b`);
      return regex.test(lower);
    });
    
    if (mentioned) {
      // clean up the line
      let snippet = line.replace(/^[-*]\s*(\[.\])?\s*/, '').trim();
      if (snippet.length > 120) snippet = snippet.slice(0, 117) + '...';
      if (snippet) snippets.push(snippet);
    }
  }
  return snippets;
}

// ── analysis engine ────────────────────────────────────────────────

function analyzeContacts() {
  const files = getMemoryFiles();
  const contactData = new Map();
  
  // init all contacts
  for (const contact of CONTACTS) {
    contactData.set(contact.name, {
      ...contact,
      mentions: 0,
      firstSeen: null,
      lastSeen: null,
      activeDays: [],
      contexts: [],      // { date, section, snippets }
      coOccurrences: {},  // other contact name → count
      weeklyActivity: {}, // 'YYYY-WW' → count
    });
  }
  
  for (const file of files) {
    const content = readFileSync(file.path, 'utf-8');
    const sections = extractSections(content);
    
    for (const section of sections) {
      // find which contacts are mentioned in this section
      const mentionedInSection = [];
      
      for (const contact of CONTACTS) {
        const count = findContactMentions(section.content, contact);
        if (count === 0) continue;
        
        const data = contactData.get(contact.name);
        data.mentions += count;
        mentionedInSection.push(contact.name);
        
        if (file.date) {
          if (!data.firstSeen || file.date < data.firstSeen) data.firstSeen = file.date;
          if (!data.lastSeen || file.date > data.lastSeen) data.lastSeen = file.date;
          
          if (!data.activeDays.includes(file.date)) {
            data.activeDays.push(file.date);
          }
          
          // weekly activity
          const week = getWeekKey(file.date);
          data.weeklyActivity[week] = (data.weeklyActivity[week] || 0) + count;
          
          // extract context snippets (limit per file)
          const snippets = extractContext(section.content, contact, 2);
          if (snippets.length > 0) {
            data.contexts.push({
              date: file.date,
              section: section.title,
              snippets,
            });
          }
        }
      }
      
      // co-occurrences
      for (let i = 0; i < mentionedInSection.length; i++) {
        for (let j = i + 1; j < mentionedInSection.length; j++) {
          const a = mentionedInSection[i];
          const b = mentionedInSection[j];
          const dataA = contactData.get(a);
          const dataB = contactData.get(b);
          dataA.coOccurrences[b] = (dataA.coOccurrences[b] || 0) + 1;
          dataB.coOccurrences[a] = (dataB.coOccurrences[a] || 0) + 1;
        }
      }
    }
  }
  
  return contactData;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const jan1 = new Date(d.getUTCFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  const now = new Date();
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.floor((now - d) / 86400000);
}

function formatDaysAgo(n) {
  if (n === Infinity) return 'never';
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return `${n}d ago`;
  if (n < 30) return `${Math.floor(n / 7)}w ago`;
  return `${Math.floor(n / 30)}mo ago`;
}

function statusIcon(lastDays) {
  if (lastDays <= 3) return '\x1b[32m●\x1b[0m';  // green: active
  if (lastDays <= 7) return '\x1b[33m●\x1b[0m';  // yellow: recent
  if (lastDays <= 14) return '\x1b[38;5;208m●\x1b[0m'; // orange: cooling
  return '\x1b[31m●\x1b[0m';  // red: cold
}

function mentionBar(count, max) {
  const width = 15;
  const filled = Math.round((count / max) * width);
  return '\x1b[36m' + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(width - filled) + '\x1b[0m';
}

// ── display functions ──────────────────────────────────────────────

function showOverview(contactData, opts = {}) {
  let contacts = [...contactData.values()].filter(c => c.mentions > 0);
  
  if (opts.companies) contacts = contacts.filter(c => c.type === 'company');
  if (opts.people) contacts = contacts.filter(c => c.type === 'person');
  
  // sort by last seen (most recent first), then by mentions
  contacts.sort((a, b) => {
    const da = daysAgo(a.lastSeen);
    const db = daysAgo(b.lastSeen);
    if (da !== db) return da - db;
    return b.mentions - a.mentions;
  });
  
  if (contacts.length === 0) {
    console.log('no contacts found in memory files');
    return;
  }
  
  const maxMentions = Math.max(...contacts.map(c => c.mentions));
  
  const typeLabel = opts.companies ? 'companies' : opts.people ? 'people' : 'contacts';
  console.log(`\n\x1b[1m  CONTACTS\x1b[0m  ${contacts.length} ${typeLabel} across ${new Set(contacts.flatMap(c => c.activeDays)).size} days\n`);
  
  // header
  console.log(`  \x1b[90m${'NAME'.padEnd(16)} ${'TYPE'.padEnd(10)} ${'ROLE'.padEnd(18)} ${'MENTIONS'.padEnd(18)} ${'LAST SEEN'.padEnd(12)} DAYS\x1b[0m`);
  console.log(`  \x1b[90m${'─'.repeat(85)}\x1b[0m`);
  
  for (const c of contacts) {
    const last = daysAgo(c.lastSeen);
    const icon = statusIcon(last);
    const bar = mentionBar(c.mentions, maxMentions);
    const name = c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name;
    
    console.log(
      `  ${icon} ${name.padEnd(15)} ` +
      `\x1b[90m${c.type.padEnd(10)}\x1b[0m ` +
      `${(c.role || '').padEnd(18)} ` +
      `${bar} \x1b[90m${String(c.mentions).padStart(3)}\x1b[0m ` +
      `${formatDaysAgo(last).padEnd(12)} ` +
      `\x1b[90m${c.activeDays.length}d\x1b[0m`
    );
  }
  
  // legend
  console.log(`\n  \x1b[90m● active (≤3d)  ● recent (≤7d)  ● cooling (≤14d)  ● cold (>14d)\x1b[0m`);
  
  // quick stats
  const active = contacts.filter(c => daysAgo(c.lastSeen) <= 3).length;
  const cold = contacts.filter(c => daysAgo(c.lastSeen) > 14).length;
  const companies = contacts.filter(c => c.type === 'company');
  const prospects = companies.filter(c => c.role?.includes('prospect'));
  
  console.log(`\n  \x1b[90m${active} active · ${cold} cold · ${companies.length} companies (${prospects.length} prospects)\x1b[0m`);
}

function showDeepDive(contactData, name) {
  // fuzzy match
  const lower = name.toLowerCase();
  let contact = null;
  for (const c of contactData.values()) {
    if (c.name.toLowerCase() === lower || c.aliases.some(a => a.toLowerCase() === lower)) {
      contact = c;
      break;
    }
  }
  
  if (!contact || contact.mentions === 0) {
    console.log(`\n  no contact found matching "${name}"`);
    // suggest closest
    const all = [...contactData.values()].filter(c => c.mentions > 0);
    const suggestions = all.filter(c => 
      c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
    );
    if (suggestions.length > 0) {
      console.log(`  did you mean: ${suggestions.map(s => s.name).join(', ')}?`);
    }
    return;
  }
  
  const last = daysAgo(contact.lastSeen);
  const first = daysAgo(contact.firstSeen);
  
  console.log(`\n\x1b[1m  ${contact.name}\x1b[0m  ${statusIcon(last)}`);
  console.log(`  \x1b[90m${contact.type} · ${contact.role || 'unknown role'}\x1b[0m`);
  if (contact.notes) console.log(`  \x1b[90m${contact.notes}\x1b[0m`);
  
  console.log(`\n  \x1b[90m${'─'.repeat(60)}\x1b[0m`);
  console.log(`  mentions: \x1b[1m${contact.mentions}\x1b[0m across \x1b[1m${contact.activeDays.length}\x1b[0m days`);
  console.log(`  first seen: ${contact.firstSeen || 'n/a'} (${formatDaysAgo(first)})`);
  console.log(`  last seen: ${contact.lastSeen || 'n/a'} (${formatDaysAgo(last)})`);
  
  // activity pattern
  if (contact.activeDays.length > 1) {
    const sorted = [...contact.activeDays].sort();
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1] + 'T00:00:00Z');
      const d2 = new Date(sorted[i] + 'T00:00:00Z');
      gaps.push(Math.floor((d2 - d1) / 86400000));
    }
    const avgGap = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    console.log(`  avg gap: ${avgGap}d between mentions`);
  }
  
  // co-occurrences
  const coEntries = Object.entries(contact.coOccurrences).sort((a, b) => b[1] - a[1]);
  if (coEntries.length > 0) {
    console.log(`\n  \x1b[1mconnected to:\x1b[0m`);
    for (const [other, count] of coEntries.slice(0, 5)) {
      console.log(`    ${other} \x1b[90m(${count} shared sections)\x1b[0m`);
    }
  }
  
  // timeline of interactions
  if (contact.contexts.length > 0) {
    console.log(`\n  \x1b[1mtimeline:\x1b[0m`);
    // group by date, show most recent first, limit to 10
    const byDate = {};
    for (const ctx of contact.contexts) {
      if (!byDate[ctx.date]) byDate[ctx.date] = [];
      byDate[ctx.date].push(ctx);
    }
    
    const dates = Object.keys(byDate).sort().reverse().slice(0, 8);
    for (const date of dates) {
      const entries = byDate[date];
      console.log(`\n    \x1b[33m${date}\x1b[0m`);
      for (const entry of entries) {
        console.log(`    \x1b[90m[${entry.section}]\x1b[0m`);
        for (const snip of entry.snippets) {
          console.log(`      ${snip}`);
        }
      }
    }
  }
}

function showCold(contactData) {
  const contacts = [...contactData.values()]
    .filter(c => c.mentions > 0 && daysAgo(c.lastSeen) > 7)
    .sort((a, b) => daysAgo(b.lastSeen) - daysAgo(a.lastSeen));
  
  if (contacts.length === 0) {
    console.log('\n  no cold contacts — everyone\'s been mentioned recently');
    return;
  }
  
  console.log(`\n\x1b[1m  GONE COLD\x1b[0m  ${contacts.length} contacts silent >7 days\n`);
  
  for (const c of contacts) {
    const last = daysAgo(c.lastSeen);
    const lastCtx = c.contexts.length > 0 ? c.contexts[c.contexts.length - 1] : null;
    
    console.log(`  \x1b[31m●\x1b[0m ${c.name.padEnd(16)} \x1b[90m${c.type.padEnd(10)}\x1b[0m ${formatDaysAgo(last).padEnd(12)} \x1b[90m${c.mentions} mentions, ${c.activeDays.length} days\x1b[0m`);
    if (lastCtx) {
      console.log(`    \x1b[90mlast: [${lastCtx.section}] ${lastCtx.snippets[0] || ''}\x1b[0m`);
    }
  }
}

function showNew(contactData) {
  const contacts = [...contactData.values()]
    .filter(c => c.mentions > 0 && daysAgo(c.firstSeen) <= 7)
    .sort((a, b) => {
      if (a.firstSeen !== b.firstSeen) return a.firstSeen > b.firstSeen ? -1 : 1;
      return b.mentions - a.mentions;
    });
  
  if (contacts.length === 0) {
    console.log('\n  no new contacts in the last 7 days');
    return;
  }
  
  console.log(`\n\x1b[1m  NEW CONTACTS\x1b[0m  first appeared in last 7 days\n`);
  
  for (const c of contacts) {
    const firstCtx = c.contexts.length > 0 ? c.contexts[0] : null;
    console.log(`  \x1b[32m●\x1b[0m ${c.name.padEnd(16)} \x1b[90m${c.type.padEnd(10)}\x1b[0m first: ${c.firstSeen}  \x1b[90m${c.mentions} mentions\x1b[0m`);
    if (firstCtx) {
      console.log(`    \x1b[90m[${firstCtx.section}] ${firstCtx.snippets[0] || ''}\x1b[0m`);
    }
    if (c.notes) {
      console.log(`    \x1b[90m${c.notes}\x1b[0m`);
    }
  }
}

function showTimeline(contactData) {
  const contacts = [...contactData.values()].filter(c => c.mentions > 0);
  
  // get all weeks
  const allWeeks = new Set();
  for (const c of contacts) {
    for (const w of Object.keys(c.weeklyActivity)) allWeeks.add(w);
  }
  const weeks = [...allWeeks].sort().slice(-8); // last 8 weeks
  
  if (weeks.length === 0) {
    console.log('\n  no timeline data');
    return;
  }
  
  // filter to contacts with >2 mentions (skip noise)
  const relevant = contacts
    .filter(c => c.mentions >= 2 && c.name !== 'ron') // ron is in everything
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 15);
  
  console.log(`\n\x1b[1m  TIMELINE\x1b[0m  weekly mention density (last ${weeks.length} weeks)\n`);
  
  // header
  const weekLabels = weeks.map(w => w.split('-')[1]); // W05, W06, etc.
  console.log(`  ${''.padEnd(16)} ${weekLabels.map(w => w.padStart(5)).join(' ')}`);
  console.log(`  \x1b[90m${'─'.repeat(16 + weeks.length * 6)}\x1b[0m`);
  
  const maxWeekly = Math.max(...relevant.flatMap(c => weeks.map(w => c.weeklyActivity[w] || 0)));
  
  for (const c of relevant) {
    const cells = weeks.map(w => {
      const count = c.weeklyActivity[w] || 0;
      if (count === 0) return '\x1b[90m  ·  \x1b[0m';
      const intensity = count / maxWeekly;
      if (intensity > 0.6) return '\x1b[36m ███ \x1b[0m';
      if (intensity > 0.3) return '\x1b[36m ██░ \x1b[0m';
      if (intensity > 0) return '\x1b[36m █░░ \x1b[0m';
      return '\x1b[90m  ·  \x1b[0m';
    });
    
    const name = c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name;
    console.log(`  ${name.padEnd(16)} ${cells.join(' ')}`);
  }
  
  console.log(`\n  \x1b[90m(ron excluded — appears in everything)\x1b[0m`);
}

function showGraph(contactData) {
  const contacts = [...contactData.values()].filter(c => c.mentions > 0);
  
  // collect all co-occurrence pairs
  const pairs = [];
  const seen = new Set();
  
  for (const c of contacts) {
    for (const [other, count] of Object.entries(c.coOccurrences)) {
      const key = [c.name, other].sort().join('↔');
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ a: c.name, b: other, strength: count });
      }
    }
  }
  
  pairs.sort((a, b) => b.strength - a.strength);
  
  if (pairs.length === 0) {
    console.log('\n  no co-occurrences found');
    return;
  }
  
  console.log(`\n\x1b[1m  RELATIONSHIP GRAPH\x1b[0m  who appears together\n`);
  
  const maxStrength = pairs[0].strength;
  
  for (const p of pairs.slice(0, 15)) {
    const bar = '█'.repeat(Math.max(1, Math.round((p.strength / maxStrength) * 12)));
    console.log(
      `  ${p.a.padEnd(14)} ↔ ${p.b.padEnd(14)} ` +
      `\x1b[36m${bar}\x1b[0m \x1b[90m${p.strength} shared sections\x1b[0m`
    );
  }
}

function showShort(contactData) {
  const contacts = [...contactData.values()]
    .filter(c => c.mentions > 0)
    .sort((a, b) => daysAgo(a.lastSeen) - daysAgo(b.lastSeen));
  
  for (const c of contacts) {
    const last = daysAgo(c.lastSeen);
    const icon = statusIcon(last);
    console.log(`${icon} ${c.name} — ${c.type}, ${c.mentions} mentions, ${formatDaysAgo(last)}`);
  }
}

function showJson(contactData) {
  const contacts = [...contactData.values()]
    .filter(c => c.mentions > 0)
    .map(c => ({
      name: c.name,
      type: c.type,
      role: c.role,
      mentions: c.mentions,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
      activeDays: c.activeDays.length,
      daysAgo: daysAgo(c.lastSeen),
      coOccurrences: c.coOccurrences,
      notes: c.notes,
    }))
    .sort((a, b) => a.daysAgo - b.daysAgo);
  
  console.log(JSON.stringify(contacts, null, 2));
}

// ── auto-discovery ─────────────────────────────────────────────────
// scan for names we DON'T have in the registry
// looks for patterns: @handle, "Name" (capitalized), company patterns

function discoverUnknowns(contactData) {
  const files = getMemoryFiles();
  const knownTerms = new Set();
  for (const c of CONTACTS) {
    knownTerms.add(c.name.toLowerCase());
    for (const a of c.aliases) knownTerms.add(a.toLowerCase());
  }
  
  // common words to exclude
  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'what', 'when', 'where',
    'which', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
    'between', 'same', 'different', 'other', 'such', 'only', 'also', 'than',
    'just', 'because', 'each', 'every', 'both', 'few', 'more', 'most', 'some',
    'next', 'new', 'old', 'high', 'low', 'good', 'bad', 'first', 'last',
    'long', 'small', 'big', 'right', 'left', 'still', 'back', 'well',
    // tech terms that look like names
    'react', 'next', 'node', 'stripe', 'vercel', 'supabase', 'redis', 'claude',
    'discord', 'telegram', 'github', 'docker', 'linux', 'brave', 'chrome',
    'javascript', 'typescript', 'python', 'html', 'css', 'json', 'yaml',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december',
    // arc tool names and workspace terms
    'arc', 'ventok', 'anivia', 'tuner', 'collabo', 'moltbook', 'bore', 'clawd',
    'memory', 'tasks', 'scripts', 'projects', 'learnings', 'writing',
    // misc
    'api', 'url', 'dns', 'ssl', 'rls', 'crm', 'mrr', 'saas', 'cli', 'pdf',
    'inter', 'source', 'serif', 'payload', 'resend', 'posthog', 'oklch',
    'todo', 'fixme', 'hack', 'note', 'update', 'status', 'error',
    'tallinn', 'estonia', 'pärnumaa', 'europe',
    // email domains
    'gmail', 'outlook', 'hotmail', 'yahoo', 'protonmail', 'icloud',
  ]);
  
  // look for @handles
  const handles = new Map();
  for (const file of files) {
    if (!file.date) continue;
    const content = readFileSync(file.path, 'utf-8');
    const handleMatches = content.matchAll(/@(\w{3,20})/g);
    for (const m of handleMatches) {
      const handle = m[1].toLowerCase();
      if (knownTerms.has(handle) || stopWords.has(handle)) continue;
      if (!handles.has(handle)) handles.set(handle, { count: 0, dates: [] });
      const h = handles.get(handle);
      h.count++;
      if (!h.dates.includes(file.date)) h.dates.push(file.date);
    }
  }
  
  return { handles };
}

// ── main ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const contactData = analyzeContacts();

if (flags.has('--json')) {
  showJson(contactData);
} else if (flags.has('--short')) {
  showShort(contactData);
} else if (flags.has('--cold')) {
  showCold(contactData);
} else if (flags.has('--new')) {
  showNew(contactData);
} else if (flags.has('--timeline')) {
  showTimeline(contactData);
} else if (flags.has('--graph')) {
  showGraph(contactData);
} else if (positional.length > 0) {
  showDeepDive(contactData, positional.join(' '));
} else {
  showOverview(contactData, {
    companies: flags.has('--companies'),
    people: flags.has('--people'),
  });
  
  // discover unknowns
  const unknowns = discoverUnknowns(contactData);
  if (unknowns.handles.size > 0) {
    const notable = [...unknowns.handles.entries()]
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    
    if (notable.length > 0) {
      console.log(`\n  \x1b[90munregistered handles (≥2 mentions):\x1b[0m`);
      for (const [handle, info] of notable) {
        console.log(`    \x1b[90m@${handle} — ${info.count} mentions across ${info.dates.length} days\x1b[0m`);
      }
      console.log(`    \x1b[90madd to CONTACTS registry in contacts.mjs to track them\x1b[0m`);
    }
  }
}

#!/usr/bin/env node
/**
 * arc pipeline - visual sales pipeline for ventok
 * 
 * Reads leads.csv and shows:
 *   - funnel visualization (by status)
 *   - priority breakdown with bars
 *   - industry clusters
 *   - actionable next steps
 *   - pipeline health score
 * 
 * Usage:
 *   arc pipeline              full pipeline view
 *   arc pipeline --priority   sort by priority
 *   arc pipeline --industry   group by industry
 *   arc pipeline --actions    show only next actions
 *   arc pipeline --json       raw data output
 * 
 * Nightly build: 2026-01-31
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const LEADS_PATH = join(WORKSPACE, 'projects/ventok/leads.csv');

// pipeline stages in order
const STAGES = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABELS = {
  new: '🔵 New',
  contacted: '📧 Contacted',
  replied: '💬 Replied',
  meeting: '🤝 Meeting',
  proposal: '📋 Proposal',
  negotiation: '⚡ Negotiation',
  won: '✅ Won',
  lost: '❌ Lost'
};

const PRIORITY_COLORS = {
  HIGH: '\x1b[31m',    // red
  MEDIUM: '\x1b[33m',  // yellow
  LOW: '\x1b[90m',     // gray
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

// --- CSV parser (handles quoted fields) ---
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length === 0) continue;
    const row = {};
    headers.forEach((h, j) => { row[h.trim()] = (vals[j] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// --- visualization helpers ---
function bar(count, max, width = 30) {
  const filled = Math.round((count / Math.max(max, 1)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function funnel(stageCounts, total) {
  const maxWidth = 50;
  const lines = [];
  
  for (const stage of STAGES) {
    const count = stageCounts[stage] || 0;
    if (count === 0 && !['new', 'won', 'lost'].includes(stage)) continue;
    
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const width = Math.max(2, Math.round((count / Math.max(total, 1)) * maxWidth));
    const padding = Math.round((maxWidth - width) / 2);
    
    const label = STAGE_LABELS[stage] || stage;
    const block = '█'.repeat(width);
    
    lines.push(`  ${' '.repeat(padding)}${CYAN}${block}${RESET}`);
    lines.push(`  ${' '.repeat(padding)}${label}  ${BOLD}${count}${RESET} ${DIM}(${pct}%)${RESET}`);
    lines.push('');
  }
  return lines.join('\n');
}

function healthScore(leads) {
  let score = 0;
  const total = leads.length;
  if (total === 0) return { score: 0, issues: ['no leads in pipeline'] };
  
  const issues = [];
  const suggestions = [];
  
  // score components
  const contacted = leads.filter(l => l.status !== 'new' && l.status !== 'lost').length;
  const withEmail = leads.filter(l => l.contact_email).length;
  const withContact = leads.filter(l => l.contact_name).length;
  const highPriority = leads.filter(l => l.priority === 'HIGH').length;
  const stale = leads.filter(l => {
    if (!l.added_date) return false;
    const days = (Date.now() - new Date(l.added_date).getTime()) / (1000 * 60 * 60 * 24);
    return days > 7 && l.status === 'new';
  }).length;
  
  // pipeline diversity (not all in one stage)
  const stages = new Set(leads.map(l => l.status));
  if (stages.size >= 3) { score += 25; }
  else if (stages.size >= 2) { score += 15; }
  else { score += 5; issues.push('all leads in same stage — need movement'); }
  
  // contact info coverage
  const emailPct = withEmail / total;
  if (emailPct >= 0.7) { score += 25; }
  else if (emailPct >= 0.4) { score += 15; issues.push(`only ${Math.round(emailPct * 100)}% have emails`); }
  else { score += 5; issues.push(`${Math.round(emailPct * 100)}% have emails — need contact info`); }
  
  // activity (contacted vs new)
  const activityPct = contacted / total;
  if (activityPct >= 0.5) { score += 25; }
  else if (activityPct >= 0.2) { score += 15; issues.push('most leads still uncontacted'); }
  else { score += 5; issues.push('pipeline is stagnant — 0 leads contacted'); }
  
  // staleness
  if (stale === 0) { score += 25; }
  else if (stale <= 3) { score += 15; issues.push(`${stale} leads going stale (>7d uncontacted)`); }
  else { score += 5; issues.push(`${stale} leads going stale — contact or drop them`); }
  
  // suggestions based on state
  if (withContact < total * 0.5) {
    suggestions.push('research contact names for top-priority leads');
  }
  if (contacted === 0) {
    suggestions.push('start outreach — even 1 email moves the needle');
  }
  if (highPriority > 0 && leads.filter(l => l.priority === 'HIGH' && l.status === 'new').length === highPriority) {
    suggestions.push('HIGH priority leads untouched — prioritize these');
  }
  
  return { score: Math.min(score, 100), issues, suggestions };
}

// --- main ---
function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')).map(a => a.slice(2)));
  
  if (!existsSync(LEADS_PATH)) {
    console.log(`\n  ${BOLD}No leads file found${RESET}`);
    console.log(`  Expected: ${LEADS_PATH}`);
    console.log(`  Create it or run anivia CSV export.\n`);
    process.exit(1);
  }
  
  const csv = readFileSync(LEADS_PATH, 'utf-8');
  const leads = parseCSV(csv);
  
  if (leads.length === 0) {
    console.log('\n  Pipeline is empty.\n');
    process.exit(0);
  }
  
  // json output
  if (flags.has('json')) {
    console.log(JSON.stringify({ leads, count: leads.length }, null, 2));
    process.exit(0);
  }
  
  const total = leads.length;
  
  // --- header ---
  console.log(`\n${BOLD}${CYAN}  ╔══════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}  ║     VENTOK SALES PIPELINE            ║${RESET}`);
  console.log(`${BOLD}${CYAN}  ╚══════════════════════════════════════╝${RESET}\n`);
  
  // --- funnel ---
  if (!flags.has('actions')) {
    const stageCounts = {};
    for (const lead of leads) {
      const s = (lead.status || 'new').toLowerCase();
      stageCounts[s] = (stageCounts[s] || 0) + 1;
    }
    
    console.log(`  ${BOLD}FUNNEL${RESET}  ${DIM}(${total} total leads)${RESET}\n`);
    console.log(funnel(stageCounts, total));
  }
  
  // --- priority breakdown ---
  if (!flags.has('actions')) {
    const byPriority = { HIGH: [], MEDIUM: [], LOW: [] };
    for (const lead of leads) {
      const p = (lead.priority || 'LOW').toUpperCase();
      if (!byPriority[p]) byPriority[p] = [];
      byPriority[p].push(lead);
    }
    
    console.log(`  ${BOLD}PRIORITY${RESET}\n`);
    for (const p of ['HIGH', 'MEDIUM', 'LOW']) {
      const list = byPriority[p] || [];
      const color = PRIORITY_COLORS[p] || '';
      console.log(`  ${color}${p.padEnd(8)}${RESET} ${bar(list.length, total, 20)} ${BOLD}${list.length}${RESET}`);
      if (flags.has('priority')) {
        for (const l of list) {
          console.log(`  ${DIM}         └─ ${l.company} (${l.industry})${RESET}`);
        }
      }
    }
    console.log('');
  }
  
  // --- industry clusters ---
  if (flags.has('industry') && !flags.has('actions')) {
    const byIndustry = {};
    for (const lead of leads) {
      const ind = lead.industry || 'unknown';
      if (!byIndustry[ind]) byIndustry[ind] = [];
      byIndustry[ind].push(lead);
    }
    
    console.log(`  ${BOLD}INDUSTRY CLUSTERS${RESET}\n`);
    const sorted = Object.entries(byIndustry).sort((a, b) => b[1].length - a[1].length);
    for (const [ind, list] of sorted) {
      console.log(`  ${ind.padEnd(25)} ${bar(list.length, total, 15)} ${BOLD}${list.length}${RESET}`);
      for (const l of list) {
        const color = PRIORITY_COLORS[l.priority] || '';
        console.log(`  ${DIM}                           └─ ${color}${l.company}${RESET}`);
      }
    }
    console.log('');
  }
  
  // --- next actions ---
  console.log(`  ${BOLD}NEXT ACTIONS${RESET}\n`);
  
  // find leads needing attention
  const needsEmail = leads.filter(l => l.priority === 'HIGH' && !l.contact_email);
  const needsContact = leads.filter(l => l.priority === 'HIGH' && !l.contact_name);
  const readyToContact = leads.filter(l => l.status === 'new' && l.contact_email && l.priority === 'HIGH');
  const staleLeads = leads.filter(l => {
    if (!l.added_date) return false;
    const days = (Date.now() - new Date(l.added_date).getTime()) / (1000 * 60 * 60 * 24);
    return days > 5 && l.status === 'new';
  });
  
  if (readyToContact.length > 0) {
    console.log(`  ${GREEN}▸${RESET} ${BOLD}Ready to contact${RESET} (have email, HIGH priority):`);
    for (const l of readyToContact) {
      console.log(`    ${l.company} → ${l.contact_email}`);
    }
    console.log('');
  }
  
  if (needsEmail.length > 0) {
    console.log(`  ${YELLOW}▸${RESET} ${BOLD}Need email addresses${RESET} (HIGH priority, no email):`);
    for (const l of needsEmail) {
      console.log(`    ${l.company} — ${DIM}${l.pain_points?.slice(0, 50) || 'no notes'}${RESET}`);
    }
    console.log('');
  }
  
  if (staleLeads.length > 0) {
    console.log(`  ${YELLOW}▸${RESET} ${BOLD}Going stale${RESET} (>5 days, still "new"):`);
    for (const l of staleLeads.slice(0, 5)) {
      const days = Math.round((Date.now() - new Date(l.added_date).getTime()) / (1000 * 60 * 60 * 24));
      console.log(`    ${l.company} — ${DIM}${days}d old${RESET}`);
    }
    if (staleLeads.length > 5) console.log(`    ${DIM}...and ${staleLeads.length - 5} more${RESET}`);
    console.log('');
  }
  
  // --- health score ---
  const health = healthScore(leads);
  const scoreColor = health.score >= 70 ? GREEN : health.score >= 40 ? YELLOW : '\x1b[31m';
  
  console.log(`  ${BOLD}PIPELINE HEALTH${RESET}  ${scoreColor}${health.score}/100${RESET}`);
  console.log(`  ${bar(health.score, 100, 30)}`);
  
  if (health.issues.length > 0) {
    console.log('');
    for (const issue of health.issues) {
      console.log(`  ${DIM}⚠ ${issue}${RESET}`);
    }
  }
  
  if (health.suggestions.length > 0) {
    console.log('');
    for (const s of health.suggestions) {
      console.log(`  ${CYAN}→ ${s}${RESET}`);
    }
  }
  
  // --- summary line ---
  const won = leads.filter(l => l.status === 'won').length;
  const active = leads.filter(l => l.status !== 'won' && l.status !== 'lost').length;
  console.log(`\n  ${DIM}${active} active · ${won} won · €72 MRR → €5,000 target${RESET}\n`);
}

main();

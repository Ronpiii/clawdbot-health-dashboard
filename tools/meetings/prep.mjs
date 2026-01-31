#!/usr/bin/env node

/**
 * Meeting Prep Tool
 * 
 * Generates a briefing document before a sales call.
 * Combines company info, pain points, talking points, and questions.
 * 
 * Usage:
 *   node prep.mjs --company "Thermory AS" --website thermory.com --contact "Jaanus"
 */

import { readFileSync, existsSync } from 'fs'

// Talking points by industry
const talkingPoints = {
  manufacturing: [
    "How do you currently track production schedules?",
    "What systems do you use for inventory management?",
    "How do orders flow from sales to production?",
    "What's your biggest time sink in daily operations?",
    "How do you handle quality control documentation?",
  ],
  retail: [
    "How do you sync inventory between store and online?",
    "What's your order fulfillment process?",
    "How do you track customer purchase history?",
    "What's your biggest pain with returns/exchanges?",
    "How do you manage supplier relationships?",
  ],
  services: [
    "How do you track client communications?",
    "What's your project management setup?",
    "How do you handle time tracking and billing?",
    "What's your follow-up process after projects?",
    "How do you manage recurring tasks?",
  ],
  default: [
    "Walk me through a typical day/week in your role",
    "What takes up most of your time that feels repetitive?",
    "What systems are you currently using?",
    "If you could automate one thing, what would it be?",
    "What's blocking you from growing faster?",
  ]
}

// Discovery questions
const discoveryQuestions = [
  "What prompted you to take this meeting?",
  "What have you tried before to solve this?",
  "Who else is involved in decisions like this?",
  "What does success look like for you?",
  "What's your timeline for making changes?",
  "What's your budget range for solutions like this?",
]

// Objection handling
const commonObjections = {
  "too expensive": "Let's look at the ROI. If this saves you X hours per week at Y cost, it pays for itself in Z months.",
  "we tried automation before": "What specifically didn't work? Often it's implementation, not the concept.",
  "too busy to implement": "That's exactly why you need this. We handle implementation — minimal time from your team.",
  "need to think about it": "Of course. What specific questions can I answer to help your decision?",
  "works fine as is": "How much time does 'fine' cost you per week? Often we don't notice inefficiency until it's gone.",
}

async function fetchCompanyInfo(website) {
  if (!website) return null
  
  const url = website.startsWith('http') ? website : `https://${website}`
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    })
    
    if (!res.ok) return null
    
    const html = await res.text()
    
    // Extract basic info
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    
    return {
      title: titleMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim(),
    }
  } catch {
    return null
  }
}

function detectIndustry(companyInfo, notes) {
  const text = `${companyInfo?.title || ''} ${companyInfo?.description || ''} ${notes || ''}`.toLowerCase()
  
  if (text.match(/manufactur|tootmi|factory|tehas|production/)) return 'manufacturing'
  if (text.match(/shop|pood|retail|store|e-commerce/)) return 'retail'
  if (text.match(/consult|service|teenus|agency/)) return 'services'
  
  return 'default'
}

function generateBriefing(opts, companyInfo) {
  const industry = detectIndustry(companyInfo, opts.notes)
  const points = talkingPoints[industry] || talkingPoints.default
  
  const lines = []
  
  lines.push(`
╔════════════════════════════════════════════════════════════╗
║                    MEETING PREP                            ║
╚════════════════════════════════════════════════════════════╝

📅 ${new Date().toLocaleDateString('et-EE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

COMPANY
══════════════════════════════════════════════════════════════
${opts.company}
${opts.website ? `🌐 ${opts.website}` : ''}
${opts.contact ? `👤 Contact: ${opts.contact}` : ''}
${opts.role ? `💼 Role: ${opts.role}` : ''}
${companyInfo?.description ? `\n📝 ${companyInfo.description.slice(0, 200)}...` : ''}

INDUSTRY: ${industry}

${opts.notes ? `NOTES\n${'─'.repeat(60)}\n${opts.notes}\n` : ''}
DISCOVERY QUESTIONS
══════════════════════════════════════════════════════════════
Start with open-ended questions to understand their situation:

${discoveryQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

INDUSTRY-SPECIFIC QUESTIONS
══════════════════════════════════════════════════════════════
${points.map((q, i) => `${i + 1}. ${q}`).join('\n')}

VENTOK VALUE PROPS
══════════════════════════════════════════════════════════════
✓ Estonian company, understand local business context
✓ No huge upfront cost — iterative approach
✓ We handle technical implementation
✓ Integrate with tools you already use
✓ ROI focused — we measure actual time saved

OBJECTION HANDLING
══════════════════════════════════════════════════════════════
${Object.entries(commonObjections).map(([obj, response]) => 
  `"${obj}"\n   → ${response}`
).join('\n\n')}

NEXT STEPS TO PROPOSE
══════════════════════════════════════════════════════════════
1. Free process audit call (1 hour) to map their workflows
2. Written proposal with specific automation opportunities
3. Small pilot project to prove value before bigger commitment

GOAL FOR THIS MEETING
══════════════════════════════════════════════════════════════
□ Understand their current pain points
□ Identify 2-3 potential automation opportunities  
□ Schedule follow-up audit call
□ Get intro to decision maker (if not already)
`)
  
  return lines.join('')
}

function parseArgs(args) {
  const opts = {
    company: null,
    website: null,
    contact: null,
    role: null,
    notes: null,
  }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--company' && args[i + 1]) opts.company = args[++i]
    else if (arg === '--website' && args[i + 1]) opts.website = args[++i]
    else if (arg === '--contact' && args[i + 1]) opts.contact = args[++i]
    else if (arg === '--role' && args[i + 1]) opts.role = args[++i]
    else if (arg === '--notes' && args[i + 1]) opts.notes = args[++i]
  }
  
  return opts
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Meeting Prep Tool

Generates a briefing document for sales calls.

Usage:
  node prep.mjs --company "Name" [options]

Options:
  --company   Company name (required)
  --website   Company website (for auto-enrichment)
  --contact   Contact person name
  --role      Their role/title
  --notes     Any context or notes

Examples:
  node prep.mjs --company "Thermory AS" --website thermory.com --contact "Jaanus"
  node prep.mjs --company "E-pood OÜ" --notes "Interested in WooCommerce integration"
`)
    process.exit(0)
  }
  
  const opts = parseArgs(args)
  
  if (!opts.company) {
    console.error('Error: --company is required')
    process.exit(1)
  }
  
  // Fetch company info if website provided
  let companyInfo = null
  if (opts.website) {
    process.stdout.write('  Fetching company info...\n')
    companyInfo = await fetchCompanyInfo(opts.website)
  }
  
  const briefing = generateBriefing(opts, companyInfo)
  console.log(briefing)
}

main().catch(console.error)

#!/usr/bin/env node

/**
 * Lead Enrichment Tool
 * 
 * Takes a company website and extracts useful info for sales outreach.
 * 
 * Usage:
 *   node enrich.mjs <website>
 *   node enrich.mjs termovesi.ee
 *   node enrich.mjs --batch companies.txt
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'

const CACHE_PATH = './.cache/enriched.json'

// --- Fetch & Extract ---

async function fetchPage(url) {
  if (!url.startsWith('http')) url = 'https://' + url
  
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VentokBot/1.0; +https://ventok.eu)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'et,en;q=0.9',
      }
    })
    clearTimeout(timeout)
    
    if (!res.ok) return { error: `HTTP ${res.status}` }
    
    const html = await res.text()
    return { html, finalUrl: res.url }
  } catch (e) {
    return { error: e.message }
  }
}

function extractFromHtml(html, url) {
  const result = {
    url,
    title: null,
    description: null,
    emails: [],
    phones: [],
    social: {},
    tech: [],
    language: null,
  }
  
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) result.title = titleMatch[1].trim()
  
  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
  if (descMatch) result.description = descMatch[1].trim()
  
  // Emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const emails = html.match(emailRegex) || []
  result.emails = [...new Set(emails.filter(e => 
    !e.includes('example') && 
    !e.includes('test@') &&
    !e.includes('.png') &&
    !e.includes('.jpg')
  ))].slice(0, 5)
  
  // Phones (Estonian format)
  const phoneRegex = /(?:\+372|372)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g
  const phones = html.match(phoneRegex) || []
  result.phones = [...new Set(phones.map(p => p.replace(/[\s.-]/g, '')))]
    .filter(p => p.length >= 7 && p.length <= 12)
    .slice(0, 3)
  
  // Social links
  if (html.includes('facebook.com/')) {
    const fb = html.match(/facebook\.com\/([a-zA-Z0-9._-]+)/i)
    if (fb) result.social.facebook = fb[1]
  }
  if (html.includes('linkedin.com/')) {
    const li = html.match(/linkedin\.com\/(?:company|in)\/([a-zA-Z0-9._-]+)/i)
    if (li) result.social.linkedin = li[1]
  }
  if (html.includes('instagram.com/')) {
    const ig = html.match(/instagram\.com\/([a-zA-Z0-9._-]+)/i)
    if (ig) result.social.instagram = ig[1]
  }
  
  // Tech detection
  if (html.includes('wp-content') || html.includes('wordpress')) result.tech.push('WordPress')
  if (html.includes('shopify')) result.tech.push('Shopify')
  if (html.includes('wix.com')) result.tech.push('Wix')
  if (html.includes('squarespace')) result.tech.push('Squarespace')
  if (html.includes('react')) result.tech.push('React')
  if (html.includes('vue')) result.tech.push('Vue')
  if (html.includes('bootstrap')) result.tech.push('Bootstrap')
  if (html.includes('jquery')) result.tech.push('jQuery')
  if (html.includes('google-analytics') || html.includes('gtag')) result.tech.push('Google Analytics')
  if (html.includes('hotjar')) result.tech.push('Hotjar')
  if (html.includes('hubspot')) result.tech.push('HubSpot')
  if (html.includes('mailchimp')) result.tech.push('Mailchimp')
  if (html.includes('intercom')) result.tech.push('Intercom')
  if (html.includes('zendesk')) result.tech.push('Zendesk')
  if (html.includes('stripe')) result.tech.push('Stripe')
  
  // Language detection
  const langMatch = html.match(/<html[^>]*lang=["']([a-z]{2})/i)
  if (langMatch) result.language = langMatch[1]
  else if (html.includes('eesti') || html.includes('meie') || html.includes('ning')) result.language = 'et'
  
  return result
}

// --- Industry Detection ---

function detectIndustry(html, url) {
  const text = html.toLowerCase()
  
  const industries = {
    manufacturing: ['tootmine', 'factory', 'production', 'manufacturing', 'tehas', 'masinad'],
    retail: ['pood', 'shop', 'store', 'e-pood', 'osta', 'ostukorv', 'cart'],
    construction: ['ehitus', 'construction', 'building', 'remont', 'renovation'],
    food: ['toit', 'food', 'restaurant', 'restoran', 'kohvik', 'cafe', 'catering'],
    logistics: ['transport', 'logistics', 'vedu', 'shipping', 'ladu', 'warehouse'],
    services: ['teenus', 'service', 'konsultat', 'consult'],
    tech: ['software', 'tarkvara', 'IT', 'tech', 'digital'],
    healthcare: ['tervis', 'health', 'medical', 'kliinik', 'clinic'],
    education: ['koolitus', 'training', 'education', 'õpe', 'kursus'],
    real_estate: ['kinnisvara', 'real estate', 'property', 'korter', 'maja'],
  }
  
  const scores = {}
  for (const [industry, keywords] of Object.entries(industries)) {
    scores[industry] = keywords.filter(k => text.includes(k)).length
  }
  
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  if (sorted[0][1] > 0) return sorted[0][0]
  return 'unknown'
}

// --- Pain Point Suggestions ---

function suggestPainPoints(industry, tech) {
  const painPoints = {
    manufacturing: [
      'Manual inventory tracking in spreadsheets',
      'Order management across multiple channels',
      'Production scheduling and capacity planning',
      'Quality control documentation',
      'Supplier communication and ordering',
    ],
    retail: [
      'Inventory sync between online and physical store',
      'Order fulfillment tracking',
      'Customer data scattered across systems',
      'Manual price updates across channels',
      'Returns and exchange processing',
    ],
    construction: [
      'Project timeline and budget tracking',
      'Subcontractor coordination',
      'Material ordering and delivery scheduling',
      'Document management (permits, contracts)',
      'Time tracking and payroll',
    ],
    services: [
      'Client communication tracking',
      'Appointment scheduling',
      'Invoice generation and follow-up',
      'Project status reporting',
      'Time tracking and billing',
    ],
    logistics: [
      'Route optimization',
      'Delivery status tracking',
      'Fleet management',
      'Customer delivery notifications',
      'Warehouse inventory management',
    ],
    default: [
      'Data scattered across spreadsheets and emails',
      'Manual data entry between systems',
      'No single view of customer interactions',
      'Time spent on repetitive tasks',
      'Difficulty getting business insights',
    ]
  }
  
  let points = painPoints[industry] || painPoints.default
  
  // Adjust based on tech
  if (!tech.includes('Google Analytics')) {
    points.push('No visibility into website traffic and conversions')
  }
  if (tech.includes('WordPress') || tech.includes('Wix')) {
    points.push('Limited customization of website/tools')
  }
  if (!tech.some(t => ['HubSpot', 'Mailchimp', 'Intercom'].includes(t))) {
    points.push('No automated email marketing or follow-ups')
  }
  
  return points.slice(0, 5)
}

// --- Output ---

function formatOutput(data) {
  const lines = []
  
  lines.push(`\n${'═'.repeat(60)}`)
  lines.push(`  ${data.url}`)
  lines.push(`${'═'.repeat(60)}\n`)
  
  if (data.error) {
    lines.push(`  ❌ Error: ${data.error}\n`)
    return lines.join('\n')
  }
  
  if (data.title) lines.push(`  📌 ${data.title}`)
  if (data.description) lines.push(`  📝 ${data.description.slice(0, 100)}${data.description.length > 100 ? '...' : ''}`)
  lines.push('')
  
  lines.push(`  🏭 Industry: ${data.industry}`)
  lines.push(`  🌐 Language: ${data.language || 'unknown'}`)
  lines.push('')
  
  if (data.emails.length) {
    lines.push(`  📧 Emails:`)
    data.emails.forEach(e => lines.push(`     • ${e}`))
    lines.push('')
  }
  
  if (data.phones.length) {
    lines.push(`  📞 Phones:`)
    data.phones.forEach(p => lines.push(`     • ${p}`))
    lines.push('')
  }
  
  if (Object.keys(data.social).length) {
    lines.push(`  🔗 Social:`)
    for (const [platform, handle] of Object.entries(data.social)) {
      lines.push(`     • ${platform}: ${handle}`)
    }
    lines.push('')
  }
  
  if (data.tech.length) {
    lines.push(`  🛠️  Tech: ${data.tech.join(', ')}`)
    lines.push('')
  }
  
  lines.push(`  💡 Likely pain points:`)
  data.painPoints.forEach((p, i) => lines.push(`     ${i + 1}. ${p}`))
  lines.push('')
  
  return lines.join('\n')
}

// --- Main ---

async function enrichCompany(urlOrDomain) {
  const domain = urlOrDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const url = 'https://' + domain
  
  console.log(`  Fetching ${url}...`)
  
  const { html, error, finalUrl } = await fetchPage(url)
  
  if (error) {
    return { url: domain, error }
  }
  
  const extracted = extractFromHtml(html, finalUrl || url)
  const industry = detectIndustry(html, url)
  const painPoints = suggestPainPoints(industry, extracted.tech)
  
  return {
    ...extracted,
    industry,
    painPoints,
    enrichedAt: new Date().toISOString(),
  }
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log(`
Lead Enrichment Tool

Usage:
  node enrich.mjs <website>           Enrich single company
  node enrich.mjs --batch <file>      Enrich list (one URL per line)
  node enrich.mjs --json <website>    Output as JSON

Examples:
  node enrich.mjs termovesi.ee
  node enrich.mjs --batch leads.txt
`)
    process.exit(0)
  }
  
  const jsonOutput = args.includes('--json')
  const batchMode = args.includes('--batch')
  
  if (batchMode) {
    const fileIndex = args.indexOf('--batch') + 1
    const file = args[fileIndex]
    if (!file || !existsSync(file)) {
      console.error('Error: batch file not found')
      process.exit(1)
    }
    
    const urls = readFileSync(file, 'utf-8').split('\n').filter(l => l.trim())
    const results = []
    
    for (const url of urls) {
      const result = await enrichCompany(url)
      results.push(result)
      if (!jsonOutput) console.log(formatOutput(result))
    }
    
    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2))
    }
  } else {
    const url = args.find(a => !a.startsWith('--'))
    if (!url) {
      console.error('Error: no URL provided')
      process.exit(1)
    }
    
    const result = await enrichCompany(url)
    
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(formatOutput(result))
    }
  }
}

main().catch(console.error)

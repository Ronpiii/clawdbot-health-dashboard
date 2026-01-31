#!/usr/bin/env node

/**
 * Estonian Company Registry Lookup
 * 
 * Fetches official company info from public sources.
 * 
 * Usage:
 *   node registry.mjs <company_name>
 *   node registry.mjs "Thermory AS"
 *   node registry.mjs --code 10278819
 */

async function searchInforegister(query) {
  // inforegister.ee has a simple search
  const url = `https://www.inforegister.ee/otsing?q=${encodeURIComponent(query)}`
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VentokBot/1.0)',
        'Accept': 'text/html',
      }
    })
    
    if (!res.ok) return { error: `HTTP ${res.status}` }
    
    const html = await res.text()
    
    // Extract first result
    // Look for patterns like: /10278819-thermory-as
    const resultMatch = html.match(/href="\/(\d{8})-([^"]+)"/i)
    if (!resultMatch) return { error: 'No results found' }
    
    const regCode = resultMatch[1]
    const slug = resultMatch[2]
    
    // Fetch detail page
    const detailUrl = `https://www.inforegister.ee/${regCode}-${slug}`
    const detailRes = await fetch(detailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VentokBot/1.0)',
        'Accept': 'text/html',
      }
    })
    
    if (!detailRes.ok) return { regCode, slug, error: 'Could not fetch details' }
    
    const detailHtml = await detailRes.text()
    
    return parseInforegister(detailHtml, regCode)
    
  } catch (e) {
    return { error: e.message }
  }
}

function parseInforegister(html, regCode) {
  const result = {
    regCode,
    name: null,
    status: null,
    address: null,
    established: null,
    capital: null,
    employees: null,
    boardMembers: [],
    activities: [],
  }
  
  // Company name (usually in h1 or title)
  const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (nameMatch) result.name = nameMatch[1].trim()
  
  // Look for specific data patterns
  // Address usually after "Aadress" or "Address"
  const addrMatch = html.match(/(?:Aadress|Address)[:\s]*<[^>]*>([^<]+)/i)
  if (addrMatch) result.address = addrMatch[1].trim()
  
  // Established date
  const estMatch = html.match(/(?:Asutatud|Established|Registreeritud)[:\s]*(\d{2}[\.\-\/]\d{2}[\.\-\/]\d{4})/i)
  if (estMatch) result.established = estMatch[1]
  
  // Status
  if (html.toLowerCase().includes('aktiivne') || html.toLowerCase().includes('active')) {
    result.status = 'active'
  } else if (html.toLowerCase().includes('likvideeritud') || html.toLowerCase().includes('liquidated')) {
    result.status = 'liquidated'
  }
  
  // Extract EMTAK codes (Estonian industry classification)
  const emtakMatches = html.match(/\d{5}\s*[-–]\s*[^<\n]+/g)
  if (emtakMatches) {
    result.activities = emtakMatches.slice(0, 3).map(m => m.trim())
  }
  
  return result
}

// Use official Estonian Business Register (ariregister.rik.ee)
async function searchAriregister(query) {
  // If it looks like a reg code (7-8 digits), go directly
  if (/^\d{7,8}$/.test(query.trim())) {
    return fetchCompanyByCode(query.trim())
  }
  
  // Name search requires JavaScript on ariregister
  // Suggest using the registry code instead
  return { 
    error: 'Name search requires browser. Use --code <number> for direct lookup.',
    hint: 'Find the registry code on the company website or use Google: "company name" site:ariregister.rik.ee'
  }
}

async function fetchCompanyByCode(code) {
  const url = `https://ariregister.rik.ee/est/company/${code}`
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VentokBot/1.0)',
        'Accept': 'text/html',
      }
    })
    
    if (!res.ok) return { error: `HTTP ${res.status}` }
    
    const html = await res.text()
    return parseAriregister(html, code)
    
  } catch (e) {
    return { error: e.message }
  }
}

function parseAriregister(html, code) {
  const result = {
    regCode: code,
    name: null,
    status: null,
    address: null,
    established: null,
    capital: null,
    vatNumber: null,
    url: `https://ariregister.rik.ee/est/company/${code}`,
  }
  
  // Company name from title
  const titleMatch = html.match(/<title>([^|<]+)/i)
  if (titleMatch) result.name = titleMatch[1].trim()
  
  // Status
  if (html.includes('Staatus') && html.includes('Registrisse kantud')) {
    result.status = 'active'
  } else if (html.includes('Kustutatud')) {
    result.status = 'deleted'
  }
  
  // Address - look for "Aadress" followed by content
  const addrMatch = html.match(/Aadress[^<]*<[^>]*>([^<]+)</i)
  if (addrMatch) result.address = addrMatch[1].trim()
  
  // Established date
  const estMatch = html.match(/Registrisse kantud[^<]*<[^>]*>(\d{2}\.\d{2}\.\d{4})/i)
  if (estMatch) result.established = estMatch[1]
  
  // Capital
  const capMatch = html.match(/Kapital[^<]*<[^>]*>([^<]+EUR)/i)
  if (capMatch) result.capital = capMatch[1].trim()
  
  // VAT number
  const vatMatch = html.match(/KMKR[^<]*<[^>]*>(EE\d+)/i)
  if (vatMatch) result.vatNumber = vatMatch[1]
  
  return result
}

function formatOutput(data) {
  const lines = []
  
  lines.push(`\n${'═'.repeat(50)}`)
  lines.push(`  Estonian Company Registry`)
  lines.push(`${'═'.repeat(50)}\n`)
  
  if (data.error) {
    lines.push(`  ❌ ${data.error}`)
    if (data.hint) lines.push(`  💡 ${data.hint}`)
    lines.push('')
    return lines.join('\n')
  }
  
  if (data.results) {
    lines.push(`  Found ${data.results.length} result(s):\n`)
    data.results.forEach((r, i) => {
      lines.push(`  ${i + 1}. ${r.name}`)
      lines.push(`     Code: ${r.code}`)
      lines.push(`     ${r.url}\n`)
    })
    return lines.join('\n')
  }
  
  if (data.name) lines.push(`  🏢 ${data.name}`)
  if (data.regCode) lines.push(`  📋 Reg: ${data.regCode}`)
  if (data.status) lines.push(`  ✓ Status: ${data.status}`)
  if (data.address) lines.push(`  📍 ${data.address}`)
  if (data.established) lines.push(`  📅 Est: ${data.established}`)
  if (data.capital) lines.push(`  💰 Capital: ${data.capital}`)
  if (data.employees) lines.push(`  👥 Employees: ${data.employees}`)
  
  if (data.activities?.length) {
    lines.push(`\n  📊 Activities:`)
    data.activities.forEach(a => lines.push(`     • ${a}`))
  }
  
  if (data.boardMembers?.length) {
    lines.push(`\n  👔 Board:`)
    data.boardMembers.forEach(m => lines.push(`     • ${m}`))
  }
  
  lines.push('')
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log(`
Estonian Company Registry Lookup

Usage:
  node registry.mjs <company_name>    Search by name
  node registry.mjs --code <number>   Search by reg code

Examples:
  node registry.mjs "Thermory AS"
  node registry.mjs thermory
  node registry.mjs --code 10278819
`)
    process.exit(0)
  }
  
  let query
  if (args[0] === '--code') {
    query = args[1]
  } else {
    query = args.join(' ')
  }
  
  console.log(`  Searching for: ${query}...`)
  
  // Use official Estonian Business Register
  const result = await searchAriregister(query)
  console.log(formatOutput(result))
}

main().catch(console.error)

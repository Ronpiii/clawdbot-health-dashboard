#!/usr/bin/env node

/**
 * Outreach Email Drafter
 * 
 * Generates personalized cold emails based on lead data.
 * Outputs in Estonian (Ventok's target market).
 * 
 * Usage:
 *   node draft.mjs --company "Thermory AS" --industry manufacturing --pain "inventory tracking"
 *   node draft.mjs --json lead.json
 */

import { readFileSync } from 'fs'

// Email templates by industry
const templates = {
  manufacturing: {
    subject: "{{company}} - kas Excel on ikka veel teie tootmisplaan?",
    body: `Tere,

Kirjutan, sest märkasin, et {{company}} tegeleb {{industry_et}} valdkonnas – ja tean, kui keeruline võib olla tootmise planeerimine, kui info on laiali Exceli tabelites, e-mailides ja paberil.

{{pain_point}}

Ventok aitab Eesti tootmisettevõtetel:
• Ühendada erinevad süsteemid (ladu, müük, raamatupidamine)
• Automatiseerida korduvad käsitsi tööd
• Saada reaalajas ülevaade tootmisest

Oleme aidanud sarnaseid ettevõtteid nagu {{similar_company}} – säästnud neil 10+ tundi nädalas käsitsi tööd.

Kas teil oleks 15 minutit sel nädalal, et arutada, kas ja kuidas saaksime aidata?

Parimate soovidega,
Ron
Ventok OÜ
hello@ventok.eu`,
  },
  
  retail: {
    subject: "{{company}} - e-poe ja lao sünkroonimine",
    body: `Tere,

Nägin, et {{company}} tegutseb jaekaubanduses – ja arvan, et tunnete probleemi: e-pood näitab "laos", aga tegelikult on kaup otsas. Või vastupidi.

{{pain_point}}

Ventok aitab kauplustel:
• Sünkroonida ladu e-poe ja kassaga reaalajas
• Automatiseerida tellimuste töötlust
• Saada ülevaade müügist ühe vaatega

Kas teil oleks 15 minutit, et arutada, kuidas saaksime aidata?

Parimate soovidega,
Ron
Ventok OÜ`,
  },
  
  services: {
    subject: "{{company}} - klientide haldamine ilma käsitsi tööta",
    body: `Tere,

Kirjutan, sest {{company}} tegutseb teenuste valdkonnas, kus klientide info kipub olema laiali – CRM-is, e-mailides, Excelis, peas.

{{pain_point}}

Ventok aitab teenusettevõtetel:
• Koondada kliendiinfo ühte kohta
• Automatiseerida meeldetuletused ja järelkontaktid
• Ühendada kalendri, e-maili ja arvelduse

Kas oleksite avatud 15-minutilisele kõnele, et arutada, kas saaksime aidata?

Parimate soovidega,
Ron
Ventok OÜ`,
  },
  
  default: {
    subject: "{{company}} - kas automatiseerimine aitaks?",
    body: `Tere,

Kirjutan {{company}}-le, sest aitame Eesti ettevõtetel vähendada käsitsi tööd ja ühendada erinevaid süsteeme.

{{pain_point}}

Tüüpilised probleemid, mida lahendame:
• Andmete käsitsi sisestamine erinevate süsteemide vahel
• Info otsimine e-mailidest ja Exceli tabelitest
• Aruannete koostamine käsitsi

Kas teil oleks 15 minutit, et arutada, kas ja kuidas saaksime aidata?

Parimate soovidega,
Ron
Ventok OÜ
hello@ventok.eu`,
  }
}

// Industry translations
const industryTranslations = {
  manufacturing: 'tootmise',
  retail: 'jaekaubanduse',
  services: 'teenuste',
  construction: 'ehituse',
  logistics: 'logistika',
  food: 'toitlustuse',
  tech: 'tehnoloogia',
  default: 'äri'
}

// Similar company examples by industry
const similarCompanies = {
  manufacturing: 'TMW Baltic',
  retail: 'Noar',
  construction: 'ehitusettevõtted',
  default: 'teised Eesti ettevõtted'
}

// Pain point phrases
function formatPainPoint(painPoints) {
  if (!painPoints || painPoints.length === 0) {
    return ''
  }
  
  const point = Array.isArray(painPoints) ? painPoints[0] : painPoints
  
  return `Eriti pakub mulle huvi, kuidas lahendate: ${point.toLowerCase()}.`
}

function generateEmail(lead) {
  const industry = lead.industry?.toLowerCase() || 'default'
  const template = templates[industry] || templates.default
  
  let subject = template.subject
  let body = template.body
  
  // Replace placeholders
  const replacements = {
    '{{company}}': lead.company || lead.name || 'teie ettevõte',
    '{{industry_et}}': industryTranslations[industry] || industryTranslations.default,
    '{{pain_point}}': formatPainPoint(lead.painPoints || lead.pain_points),
    '{{similar_company}}': similarCompanies[industry] || similarCompanies.default,
  }
  
  for (const [key, value] of Object.entries(replacements)) {
    subject = subject.replace(new RegExp(key, 'g'), value)
    body = body.replace(new RegExp(key, 'g'), value)
  }
  
  return { subject, body }
}

function formatOutput(lead, email) {
  const lines = []
  
  lines.push(`\n${'═'.repeat(60)}`)
  lines.push(`  Outreach Draft: ${lead.company || lead.name}`)
  lines.push(`${'═'.repeat(60)}\n`)
  
  lines.push(`📧 TO: ${lead.email || lead.contact_email || '[no email]'}`)
  lines.push(`📌 SUBJECT: ${email.subject}`)
  lines.push(`${'─'.repeat(60)}`)
  lines.push(email.body)
  lines.push(`${'─'.repeat(60)}\n`)
  
  return lines.join('\n')
}

function parseArgs(args) {
  const lead = {}
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--json' && args[i + 1]) {
      try {
        const data = JSON.parse(readFileSync(args[i + 1], 'utf-8'))
        Object.assign(lead, data)
      } catch (e) {
        console.error(`Error reading JSON: ${e.message}`)
        process.exit(1)
      }
      i++
    } else if (arg === '--company' && args[i + 1]) {
      lead.company = args[++i]
    } else if (arg === '--industry' && args[i + 1]) {
      lead.industry = args[++i]
    } else if (arg === '--pain' && args[i + 1]) {
      lead.painPoints = [args[++i]]
    } else if (arg === '--email' && args[i + 1]) {
      lead.email = args[++i]
    }
  }
  
  return lead
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log(`
Outreach Email Drafter

Generates personalized cold emails in Estonian.

Usage:
  node draft.mjs --company "Name" --industry manufacturing --pain "problem"
  node draft.mjs --json lead.json

Options:
  --company   Company name
  --industry  Industry (manufacturing, retail, services, construction, logistics)
  --pain      Pain point to address
  --email     Contact email
  --json      Load lead from JSON file

Examples:
  node draft.mjs --company "Thermory AS" --industry manufacturing
  node draft.mjs --company "E-pood OÜ" --industry retail --pain "inventory sync"
`)
    process.exit(0)
  }
  
  const lead = parseArgs(args)
  
  if (!lead.company && !lead.name) {
    console.error('Error: --company is required')
    process.exit(1)
  }
  
  const email = generateEmail(lead)
  console.log(formatOutput(lead, email))
}

main().catch(console.error)

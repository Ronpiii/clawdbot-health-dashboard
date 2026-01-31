#!/usr/bin/env node

/**
 * Quick Quote Generator
 * 
 * Generates simple project quotes for Ventok services.
 * 
 * Usage:
 *   node quote.mjs --client "Company" --scope "CRM integration" --hours 40
 */

import { writeFileSync } from 'fs'

const HOURLY_RATE = 75 // EUR

const servicePackages = {
  'audit': {
    name: 'Process Audit',
    nameEt: 'Protsessiaudit',
    hours: 8,
    description: 'Detailed analysis of current workflows and automation opportunities',
    descriptionEt: 'Põhjalik analüüs olemasolevatest tööprotsessidest ja automatiseerimisvõimalustest',
    deliverables: [
      'Current state documentation',
      'Pain point analysis',
      'Automation roadmap',
      'ROI estimation'
    ]
  },
  'integration': {
    name: 'System Integration',
    nameEt: 'Süsteemide integreerimine',
    hours: 24,
    description: 'Connect two systems with automated data sync',
    descriptionEt: 'Kahe süsteemi ühendamine automaatse andmesünkroonimisega',
    deliverables: [
      'Integration architecture',
      'Data mapping',
      'Automated sync setup',
      'Testing & documentation'
    ]
  },
  'dashboard': {
    name: 'Custom Dashboard',
    nameEt: 'Kohandatud töölaud',
    hours: 40,
    description: 'Custom admin panel or reporting dashboard',
    descriptionEt: 'Kohandatud halduspaneel või aruandluse töölaud',
    deliverables: [
      'Requirements gathering',
      'UI/UX design',
      'Development',
      'Training session'
    ]
  },
  'automation': {
    name: 'Workflow Automation',
    nameEt: 'Tööprotsesside automatiseerimine',
    hours: 32,
    description: 'Automate repetitive tasks and manual processes',
    descriptionEt: 'Korduvate ülesannete ja käsitsi protsesside automatiseerimine',
    deliverables: [
      'Process mapping',
      'Automation setup',
      'Testing',
      'Documentation & training'
    ]
  }
}

function generateQuote(client, scope, hours, notes) {
  const total = hours * HOURLY_RATE
  const vat = total * 0.22
  const grandTotal = total + vat
  
  const date = new Date().toISOString().split('T')[0]
  const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const quoteNum = `VQ-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  
  return {
    quoteNumber: quoteNum,
    date,
    validUntil,
    client,
    scope,
    hours,
    hourlyRate: HOURLY_RATE,
    subtotal: total,
    vat,
    total: grandTotal,
    notes
  }
}

function formatQuote(q) {
  const lines = []
  
  lines.push(`
╔════════════════════════════════════════════════════════════╗
║                        VENTOK OÜ                           ║
║                    Hinnapakkumine / Quote                  ║
╚════════════════════════════════════════════════════════════╝

Quote #: ${q.quoteNumber}
Date: ${q.date}
Valid until: ${q.validUntil}

CLIENT
──────────────────────────────────────────────────────────────
${q.client}

SCOPE OF WORK
──────────────────────────────────────────────────────────────
${q.scope}

PRICING
──────────────────────────────────────────────────────────────
Estimated hours:     ${q.hours.toString().padStart(8)} h
Hourly rate:         ${q.hourlyRate.toString().padStart(8)} EUR
──────────────────────────────────────────────────────────────
Subtotal:            ${q.subtotal.toFixed(2).padStart(8)} EUR
VAT (22%):           ${q.vat.toFixed(2).padStart(8)} EUR
──────────────────────────────────────────────────────────────
TOTAL:               ${q.total.toFixed(2).padStart(8)} EUR

${q.notes ? `NOTES\n${'─'.repeat(60)}\n${q.notes}\n` : ''}
TERMS
──────────────────────────────────────────────────────────────
• 50% advance payment to start
• 50% upon completion
• Payment terms: 14 days

CONTACT
──────────────────────────────────────────────────────────────
Ventok OÜ
Reg: 16123456
hello@ventok.eu
ventok.eu
`)
  
  return lines.join('')
}

function parseArgs(args) {
  const opts = {
    client: null,
    scope: null,
    hours: null,
    package: null,
    notes: null,
    output: null
  }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--client' && args[i + 1]) {
      opts.client = args[++i]
    } else if (arg === '--scope' && args[i + 1]) {
      opts.scope = args[++i]
    } else if (arg === '--hours' && args[i + 1]) {
      opts.hours = parseInt(args[++i])
    } else if (arg === '--package' && args[i + 1]) {
      opts.package = args[++i]
    } else if (arg === '--notes' && args[i + 1]) {
      opts.notes = args[++i]
    } else if (arg === '--output' && args[i + 1]) {
      opts.output = args[++i]
    }
  }
  
  return opts
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Quick Quote Generator

Usage:
  node quote.mjs --client "Company" --scope "Description" --hours 40
  node quote.mjs --client "Company" --package audit

Options:
  --client    Client name (required)
  --scope     Project description
  --hours     Estimated hours
  --package   Use predefined package (audit, integration, dashboard, automation)
  --notes     Additional notes
  --output    Save to file

Packages:
  audit       Process Audit (8h, €${8 * HOURLY_RATE})
  integration System Integration (24h, €${24 * HOURLY_RATE})
  dashboard   Custom Dashboard (40h, €${40 * HOURLY_RATE})
  automation  Workflow Automation (32h, €${32 * HOURLY_RATE})

Examples:
  node quote.mjs --client "Thermory AS" --package integration
  node quote.mjs --client "E-pood OÜ" --scope "WooCommerce + Merit integration" --hours 20
`)
    process.exit(0)
  }
  
  const opts = parseArgs(args)
  
  if (!opts.client) {
    console.error('Error: --client is required')
    process.exit(1)
  }
  
  let scope = opts.scope
  let hours = opts.hours
  
  // Use package if specified
  if (opts.package && servicePackages[opts.package]) {
    const pkg = servicePackages[opts.package]
    scope = scope || `${pkg.name}\n\n${pkg.description}\n\nDeliverables:\n${pkg.deliverables.map(d => '• ' + d).join('\n')}`
    hours = hours || pkg.hours
  }
  
  if (!scope || !hours) {
    console.error('Error: --scope and --hours required (or use --package)')
    process.exit(1)
  }
  
  const quote = generateQuote(opts.client, scope, hours, opts.notes)
  const output = formatQuote(quote)
  
  console.log(output)
  
  if (opts.output) {
    writeFileSync(opts.output, output)
    console.log(`\nSaved to: ${opts.output}`)
  }
}

main().catch(console.error)

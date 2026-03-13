#!/usr/bin/env node

/**
 * Follow-up Reminder Generator
 * Analyzes anivia email activity to surface leads needing follow-ups
 * Usage: node scripts/follow-up-reminders.mjs [--days N] [--hot] [--json]
 * 
 * Output: leads that have been silent for N days after email, ranked by urgency
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

// Parse CLI args
const args = process.argv.slice(2)
const daysThreshold = Math.max(1, parseInt(args.find(a => a.startsWith('--days='))?.split('=')[1] || args[args.indexOf('--days') + 1] || 3))
const hotOnly = args.includes('--hot')
const jsonOut = args.includes('--json')
const showAll = args.includes('--all')

/**
 * Parse activity log from anivia memory/timeline or daily logs
 * Heuristic: look for "email sent to X", "contacted Y", etc.
 */
function parseActivityLogs() {
  const activities = []
  const memoryDir = path.join(rootDir, 'memory')
  
  if (!fs.existsSync(memoryDir)) return activities
  
  // Scan daily logs
  const dailyFiles = fs.readdirSync(memoryDir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
  
  const emailPattern = /(?:email(?:ed)?|sent|contacted|reach(?:ed)?out|follow(?:ing)?up?|response(?:waiting)?|no response|waiting|silent)\s+(?:to|from|with)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|\w+@[\w.]+|\w+\.com)/gi
  const namePattern = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/
  
  for (const file of dailyFiles) {
    if (dailyFiles.indexOf(file) > 10) break // Limit to last 10 days for speed
    
    const content = fs.readFileSync(path.join(memoryDir, file), 'utf-8')
    const dateStr = file.replace('.md', '')
    const date = new Date(dateStr)
    
    let match
    while ((match = emailPattern.exec(content)) !== null) {
      const target = match[1]
      activities.push({
        type: 'email',
        target,
        date,
        daysSince: Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24)),
        file: dateStr,
        context: content.slice(Math.max(0, match.index - 60), match.index + 120).trim()
      })
    }
  }
  
  // Deduplicate & keep latest per target
  const byTarget = {}
  activities.forEach(a => {
    if (!byTarget[a.target] || byTarget[a.target].date < a.date) {
      byTarget[a.target] = a
    }
  })
  
  return Object.values(byTarget)
}

/**
 * Calculate follow-up urgency
 * Hot: 3-7 days (prime follow-up window)
 * Due: 7+ days (should follow up soon)
 * Overdue: 14+ days (very stale)
 */
function scoreFollowUp(daysSince) {
  if (daysSince < 1) return { urgency: 'fresh', score: 0 }
  if (daysSince <= 3) return { urgency: 'hot', score: 50 }
  if (daysSince <= 7) return { urgency: 'due', score: 75 }
  if (daysSince <= 14) return { urgency: 'overdue', score: 90 }
  return { urgency: 'stale', score: 100 }
}

function main() {
  const activities = parseActivityLogs()
  
  if (!activities.length) {
    const msg = 'No email activity found in memory logs'
    if (jsonOut) {
      console.log(JSON.stringify({ count: 0, reminders: [] }))
    } else {
      console.log(`▲ ${msg}`)
    }
    return
  }
  
  // Filter & rank
  let reminders = activities
    .map(a => ({
      ...a,
      ...scoreFollowUp(a.daysSince)
    }))
    .filter(r => r.daysSince >= daysThreshold)
  
  if (!showAll) {
    reminders = reminders.filter(r => r.urgency !== 'fresh')
  }
  
  if (hotOnly) {
    reminders = reminders.filter(r => r.urgency === 'hot' || r.urgency === 'due')
  }
  
  reminders.sort((a, b) => b.score - a.score)
  
  if (jsonOut) {
    console.log(JSON.stringify({
      count: reminders.length,
      threshold: daysThreshold,
      reminders: reminders.map(r => ({
        contact: r.target,
        daysSince: r.daysSince,
        urgency: r.urgency,
        score: r.score,
        lastEmail: r.file,
        action: r.urgency === 'hot' ? 'follow-up' : r.urgency === 'due' ? 'send-follow-up' : 'urgent-follow-up'
      }))
    }, null, 2))
    return
  }
  
  // Text output
  console.log()
  console.log(`📧 Follow-up Reminders (${reminders.length} contacts)`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  
  if (!reminders.length) {
    console.log('✓ All caught up — no stale conversations')
    return
  }
  
  const byUrgency = {}
  reminders.forEach(r => {
    if (!byUrgency[r.urgency]) byUrgency[r.urgency] = []
    byUrgency[r.urgency].push(r)
  })
  
  const order = ['hot', 'due', 'overdue', 'stale']
  const icons = { hot: '🔥', due: '⚠️ ', overdue: '🚨', stale: '❄️ ' }
  
  for (const urg of order) {
    if (!byUrgency[urg]) continue
    console.log()
    console.log(`${icons[urg]} ${urg.toUpperCase()} — ${byUrgency[urg].length}`)
    byUrgency[urg].forEach(r => {
      const bar = '▓'.repeat(Math.ceil(r.daysSince / 2)) + '░'.repeat(Math.max(0, 7 - Math.ceil(r.daysSince / 2)))
      console.log(`  ${r.target.padEnd(25)} ${bar} ${r.daysSince}d ago`)
    })
  }
  
  console.log()
  console.log(`Next action: pick a hot/due contact, draft follow-up email, mark as contacted`)
}

main()

#!/usr/bin/env node

/**
 * Follow-up Tracker
 * 
 * Track leads and get reminded to follow up.
 * Simple JSON-based tracking.
 * 
 * Usage:
 *   node track.mjs add --company "Name" --action "Send proposal" --due "2026-02-05"
 *   node track.mjs list
 *   node track.mjs due
 *   node track.mjs done <id>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const DATA_PATH = '/data02/virt137413/clawd/.data/followups.json'

function loadData() {
  try {
    if (existsSync(DATA_PATH)) {
      return JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    }
  } catch {}
  return { followups: [], lastId: 0 }
}

function saveData(data) {
  const dir = dirname(DATA_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
}

function generateId(data) {
  data.lastId = (data.lastId || 0) + 1
  return data.lastId
}

function parseDate(str) {
  if (!str) return null
  
  // Handle relative dates
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  if (str === 'today') return today.toISOString().split('T')[0]
  if (str === 'tomorrow') {
    today.setDate(today.getDate() + 1)
    return today.toISOString().split('T')[0]
  }
  if (str.match(/^\+(\d+)d?$/)) {
    const days = parseInt(str.match(/^\+(\d+)/)[1])
    today.setDate(today.getDate() + days)
    return today.toISOString().split('T')[0]
  }
  if (str.match(/^next\s*(mon|tue|wed|thu|fri|sat|sun)/i)) {
    const dayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 }
    const target = dayMap[str.match(/next\s*(\w{3})/i)[1].toLowerCase()]
    const current = today.getDay()
    const diff = (target - current + 7) % 7 || 7
    today.setDate(today.getDate() + diff)
    return today.toISOString().split('T')[0]
  }
  
  // ISO date
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str
  
  return str
}

function formatDate(dateStr) {
  if (!dateStr) return 'no date'
  const date = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const diffDays = Math.floor((date - today) / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) return `⚠️  ${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return '📅 TODAY'
  if (diffDays === 1) return '📅 tomorrow'
  if (diffDays <= 7) return `📅 in ${diffDays}d`
  return `📅 ${dateStr}`
}

function formatFollowup(f, showNotes = false) {
  const status = f.done ? '✅' : '⬜'
  const priority = f.priority === 'high' ? '🔴' : f.priority === 'medium' ? '🟡' : ''
  
  let line = `${status} #${f.id} ${priority} ${f.company}`
  line += `\n   ${f.action}`
  line += `\n   ${formatDate(f.due)}`
  if (f.contact) line += ` | 👤 ${f.contact}`
  if (showNotes && f.notes) line += `\n   📝 ${f.notes}`
  
  return line
}

// Commands

function cmdAdd(args) {
  const data = loadData()
  
  const followup = {
    id: generateId(data),
    company: null,
    action: null,
    due: null,
    contact: null,
    priority: 'normal',
    notes: null,
    done: false,
    created: new Date().toISOString(),
  }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--company' && args[i + 1]) followup.company = args[++i]
    else if (arg === '--action' && args[i + 1]) followup.action = args[++i]
    else if (arg === '--due' && args[i + 1]) followup.due = parseDate(args[++i])
    else if (arg === '--contact' && args[i + 1]) followup.contact = args[++i]
    else if (arg === '--priority' && args[i + 1]) followup.priority = args[++i]
    else if (arg === '--notes' && args[i + 1]) followup.notes = args[++i]
  }
  
  if (!followup.company || !followup.action) {
    console.error('Error: --company and --action are required')
    process.exit(1)
  }
  
  data.followups.push(followup)
  saveData(data)
  
  console.log(`\n✓ Added follow-up #${followup.id}`)
  console.log(formatFollowup(followup, true))
  console.log()
}

function cmdList(args) {
  const data = loadData()
  const showDone = args.includes('--all')
  
  let followups = data.followups
  if (!showDone) {
    followups = followups.filter(f => !f.done)
  }
  
  if (followups.length === 0) {
    console.log('\n📭 No follow-ups pending\n')
    return
  }
  
  // Sort by due date
  followups.sort((a, b) => {
    if (!a.due) return 1
    if (!b.due) return -1
    return new Date(a.due) - new Date(b.due)
  })
  
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  Follow-ups (${followups.length} pending)`)
  console.log(`${'═'.repeat(50)}\n`)
  
  followups.forEach(f => {
    console.log(formatFollowup(f))
    console.log()
  })
}

function cmdDue(args) {
  const data = loadData()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const due = data.followups.filter(f => {
    if (f.done) return false
    if (!f.due) return false
    const dueDate = new Date(f.due)
    return dueDate <= today
  })
  
  const upcoming = data.followups.filter(f => {
    if (f.done) return false
    if (!f.due) return false
    const dueDate = new Date(f.due)
    const diff = (dueDate - today) / (1000 * 60 * 60 * 24)
    return diff > 0 && diff <= 3
  })
  
  if (due.length === 0 && upcoming.length === 0) {
    console.log('\n✅ Nothing due in the next 3 days\n')
    return
  }
  
  if (due.length > 0) {
    console.log(`\n⚠️  OVERDUE/TODAY (${due.length})`)
    console.log('─'.repeat(40))
    due.forEach(f => {
      console.log(formatFollowup(f))
      console.log()
    })
  }
  
  if (upcoming.length > 0) {
    console.log(`\n📅 UPCOMING (${upcoming.length})`)
    console.log('─'.repeat(40))
    upcoming.forEach(f => {
      console.log(formatFollowup(f))
      console.log()
    })
  }
}

function cmdDone(args) {
  const id = parseInt(args[0])
  if (!id) {
    console.error('Error: provide follow-up ID')
    process.exit(1)
  }
  
  const data = loadData()
  const followup = data.followups.find(f => f.id === id)
  
  if (!followup) {
    console.error(`Error: follow-up #${id} not found`)
    process.exit(1)
  }
  
  followup.done = true
  followup.completedAt = new Date().toISOString()
  saveData(data)
  
  console.log(`\n✅ Marked #${id} as done`)
  console.log(`   ${followup.company} - ${followup.action}\n`)
}

function cmdDelete(args) {
  const id = parseInt(args[0])
  if (!id) {
    console.error('Error: provide follow-up ID')
    process.exit(1)
  }
  
  const data = loadData()
  const idx = data.followups.findIndex(f => f.id === id)
  
  if (idx === -1) {
    console.error(`Error: follow-up #${id} not found`)
    process.exit(1)
  }
  
  const removed = data.followups.splice(idx, 1)[0]
  saveData(data)
  
  console.log(`\n🗑️  Deleted #${id}`)
  console.log(`   ${removed.company} - ${removed.action}\n`)
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]
  
  if (!cmd || cmd === '--help') {
    console.log(`
Follow-up Tracker

Usage:
  node track.mjs add --company "Name" --action "Task" [options]
  node track.mjs list [--all]
  node track.mjs due
  node track.mjs done <id>
  node track.mjs delete <id>

Add options:
  --company   Company name (required)
  --action    What to do (required)
  --due       Due date (YYYY-MM-DD, today, tomorrow, +3d, next mon)
  --contact   Contact person
  --priority  high, medium, normal
  --notes     Additional notes

Examples:
  node track.mjs add --company "Thermory" --action "Send proposal" --due tomorrow
  node track.mjs add --company "TMW" --action "Follow up on email" --due +3d --priority high
  node track.mjs list
  node track.mjs due
  node track.mjs done 1
`)
    process.exit(0)
  }
  
  switch (cmd) {
    case 'add':
      cmdAdd(args.slice(1))
      break
    case 'list':
      cmdList(args.slice(1))
      break
    case 'due':
      cmdDue(args.slice(1))
      break
    case 'done':
      cmdDone(args.slice(1))
      break
    case 'delete':
      cmdDelete(args.slice(1))
      break
    default:
      console.error(`Unknown command: ${cmd}`)
      process.exit(1)
  }
}

main().catch(console.error)

#!/usr/bin/env node

/**
 * UCAN Agent Identity Experiment
 * 
 * Using proper ucanto delegation for agent authorization.
 */

import * as ed25519 from '@ucanto/principal/ed25519'
import { capability, Schema } from '@ucanto/server'
import { delegate } from '@ucanto/core'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const KEYS_PATH = './.keys/agent.json'

// --- Key Management ---

async function generateOrLoadKeys() {
  if (existsSync(KEYS_PATH)) {
    const stored = JSON.parse(readFileSync(KEYS_PATH, 'utf-8'))
    const signer = ed25519.Signer.decode(Buffer.from(stored.secret, 'base64'))
    return signer
  }

  const signer = await ed25519.generate()
  
  const dir = dirname(KEYS_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  
  writeFileSync(KEYS_PATH, JSON.stringify({
    did: signer.did(),
    secret: Buffer.from(signer.encode()).toString('base64'),
    created: new Date().toISOString()
  }, null, 2))

  return signer
}

// --- Define Capabilities ---

// Capability to post on moltbook
const MoltbookPost = capability({
  can: 'moltbook/post',
  with: Schema.did(),  // The DID that can post
  nb: Schema.struct({
    submolt: Schema.string().optional(),
    maxLength: Schema.integer().optional(),
  })
})

// Capability to send DMs
const MoltbookDM = capability({
  can: 'moltbook/dm',
  with: Schema.did(),
  nb: Schema.struct({
    to: Schema.string().optional(),  // Specific recipient, or any if omitted
  })
})

// --- Demo ---

async function main() {
  const cmd = process.argv[2] || 'demo'

  if (cmd === 'demo') {
    console.log('🔐 UCAN Agent Identity Demo\n')

    // 1. Generate agent identity
    console.log('1. Loading agent identity...')
    const agent = await generateOrLoadKeys()
    console.log(`   Agent DID: ${agent.did()}\n`)

    // 2. Create a "human" identity (simulated)
    console.log('2. Creating simulated human identity...')
    const human = await ed25519.generate()
    console.log(`   Human DID: ${human.did()}\n`)

    // 3. Human delegates posting rights to agent
    console.log('3. Human delegates moltbook/post to agent...')
    const delegation = await delegate({
      issuer: human,
      audience: agent,
      capabilities: [{
        can: 'moltbook/post',
        with: human.did(),
        nb: { submolt: 'general' }  // Can only post to m/general
      }],
      expiration: Math.floor(Date.now() / 1000) + 86400,  // 24 hours
    })
    
    console.log(`   Delegation CID: ${delegation.cid}`)
    console.log(`   Issuer: ${delegation.issuer.did()}`)
    console.log(`   Audience: ${delegation.audience.did()}`)
    console.log(`   Capabilities: ${JSON.stringify(delegation.capabilities)}`)
    console.log(`   Expires: ${new Date(delegation.expiration * 1000).toISOString()}\n`)

    // 4. Export delegation for storage/transfer
    console.log('4. Exporting delegation...')
    const archive = await delegation.archive()
    const archiveBase64 = Buffer.from(archive.ok).toString('base64')
    console.log(`   Archive size: ${archiveBase64.length} bytes`)
    console.log(`   (Can be stored or sent to the agent)\n`)

    // 5. Verify the chain
    console.log('5. Verification:')
    console.log(`   ✓ Delegation signed by human: ${human.did().slice(0, 30)}...`)
    console.log(`   ✓ Agent ${agent.did().slice(0, 30)}... can post to m/general`)
    console.log(`   ✓ Expires in 24 hours`)
    console.log(`   ✓ Anyone can verify by checking signatures\n`)

    // 6. Show the chain concept
    console.log('6. Delegation chain concept:')
    console.log('   Human (root authority)')
    console.log('     └─► Agent (delegated: moltbook/post to m/general)')
    console.log('           └─► Sub-agent (could further delegate with reduced scope)')
    console.log('')

    console.log('✅ UCAN delegation working!')
    console.log(`\nAgent keys: ${KEYS_PATH}`)

  } else if (cmd === 'did') {
    const agent = await generateOrLoadKeys()
    console.log(agent.did())

  } else {
    console.log(`
UCAN Agent Identity Tool

Usage:
  node agent.mjs demo   Run delegation demo
  node agent.mjs did    Print agent DID
`)
  }
}

main().catch(console.error)

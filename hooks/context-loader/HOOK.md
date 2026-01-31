---
name: context-loader
description: "Auto-inject today + yesterday daily logs into session context at bootstrap"
metadata: {"clawdbot":{"emoji":"🧠","events":["agent:bootstrap"]}}
---

# Context Loader

Automatically injects recent daily memory logs (`memory/YYYY-MM-DD.md`) into the session
bootstrap context so the agent wakes up with recent context already loaded.

## What It Does

1. On `agent:bootstrap`, calculates today and yesterday's dates
2. Reads `memory/YYYY-MM-DD.md` for both dates (if they exist)
3. Appends them as additional bootstrap files so the agent sees them in the session context

## Why

Without this, the agent starts fresh every session and must manually read daily logs.
This caused context loss bugs where the agent claimed it hadn't done things it had.

## Requirements

- Workspace dir must be configured

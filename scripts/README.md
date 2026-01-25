# Scripts

Utility scripts for workspace management.

## Memory

### memory-index.mjs
Local keyword index for memory files.

```bash
node scripts/memory-index.mjs build           # rebuild index
node scripts/memory-index.mjs search "query"  # search
./scripts/msearch "query"                     # shortcut
```

### compress-logs.mjs
Extract key info from old daily logs for review/compression.

```bash
node scripts/compress-logs.mjs 7   # logs older than 7 days
node scripts/compress-logs.mjs 0   # all logs
```

## Status & Health

### status.mjs
Workspace overview (git, tasks, memory index).

```bash
node scripts/status.mjs
```

### heartbeat-check.mjs
Consolidated heartbeat checks. Returns HEARTBEAT_OK or action items.

```bash
node scripts/heartbeat-check.mjs
```

## Communication

### discord-post.mjs
Post to Discord webhooks.

```bash
node scripts/discord-post.mjs logs "message"
node scripts/discord-post.mjs tasks "task update"
```

## Files

| Script | Purpose |
|--------|---------|
| `memory-index.mjs` | Build/search keyword index |
| `msearch` | Shortcut for memory search |
| `compress-logs.mjs` | Analyze old logs for compression |
| `status.mjs` | Workspace status overview |
| `heartbeat-check.mjs` | Heartbeat action items |
| `discord-post.mjs` | Discord webhook posting |

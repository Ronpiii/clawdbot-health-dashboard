# Quick Reference

## Arc CLI
```bash
./scripts/arc search "query"   # search memory (1054+ terms)
./scripts/arc status           # workspace health
./scripts/arc check            # heartbeat checks
./scripts/arc note "text"      # quick note
./scripts/arc task list        # tasks
./scripts/arc goals            # goal status
./scripts/arc summary          # daily summary
./scripts/arc maintain         # auto-maintenance
./scripts/arc analytics        # search patterns
./scripts/arc reflect          # self-review
./scripts/arc test             # run tests (12)
./scripts/arc help             # full help
```

## Key Files
| File | Purpose |
|------|---------|
| SOUL.md | who i am |
| USER.md | who i help |
| MEMORY.md | long-term memory |
| GOALS.md | long-term goals |
| memory/YYYY-MM-DD.md | daily logs |
| tasks/active.md | current work |
| TOOLS.md | infrastructure notes |

## Workflows

### Start of session
1. Read SOUL.md, USER.md
2. Read today + yesterday logs
3. Read MEMORY.md (main session)
4. Run `./scripts/arc check`

### During work
- Note captures: `./scripts/arc note "thought"`
- Task updates: `./scripts/arc task done "pattern"`
- Search recall: `./scripts/arc search "query"`

### End of day
- Summary: `./scripts/arc summary --post`
- Reflect: `./scripts/arc reflect`
- Commit: `git add . && git commit -m "msg"`

### Heartbeats
- Run: `./scripts/arc check`
- If HEARTBEAT_OK: nothing to report
- If items: address or note

## Discord
- logs: `./scripts/arc post logs "msg"`
- tasks: `./scripts/arc post tasks "msg"`

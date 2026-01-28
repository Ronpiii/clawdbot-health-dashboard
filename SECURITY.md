# Security Guidelines

## Skill Supply Chain Risks

AI agent skills are a supply chain attack vector. The same patterns that compromised npm packages (ua-parser-js, event-stream) apply here.

### Why Skills Are High Risk

1. **Implicit trust** — skills run with full shell access when loaded
2. **Hidden payloads** — SKILL.md can reference other files users don't see
3. **Fake trust signals** — download counts, stars are gameable
4. **Permission fatigue** — users auto-approve after many prompts
5. **Ambient credentials** — skills can access env vars, SSH keys, API tokens

### Red Flags

Watch for these patterns in skills:

```
# Suspicious domains
clawdhub-*.com, clawd-*.com  # typosquatting
raw IP addresses             # no DNS = hiding
ngrok.io, serveo.net         # tunneling services

# Suspicious code patterns
curl -X POST -d ...          # data exfiltration
$(curl ...)                  # command substitution
eval(...)                    # dynamic execution
base64 -d                    # obfuscation
/dev/tcp/                    # bash networking
tar ... | curl               # archive + exfil
history -c                   # covering tracks

# Credential access
.ssh/, authorized_keys       # SSH compromise
.env, AWS_SECRET_*           # credential theft
```

### Before Installing a Skill

1. **Check source** — is there a linked GitHub repo? Who maintains it?
2. **Read ALL files** — not just SKILL.md, check referenced files
3. **Run audit script** — `node scripts/audit-skill.mjs /path/to/skill`
4. **Verify URLs** — any external domains should be legitimate APIs
5. **Ignore download counts** — they're trivially fakeable

### Audit Script

```bash
# Audit a specific skill
node scripts/audit-skill.mjs ~/.clawdbot/skills/some-skill

# Audit all installed skills
node scripts/audit-skill.mjs --all
```

The script checks for:
- Suspicious URL patterns
- Data exfiltration patterns
- Credential access patterns
- Hidden file references
- Generates file hashes for integrity verification

### Approved External Domains

These domains are expected in skills:

- `api.openai.com` — OpenAI API
- `api.anthropic.com` — Anthropic API  
- `wttr.in`, `open-meteo.com` — Weather
- `api.github.com`, `github.com` — GitHub
- `discord.com`, `api.telegram.org` — Messaging
- `googleapis.com` — Google services

Any other external domain should be manually verified.

### If You Suspect Compromise

1. **Stop the agent** — `clawdbot gateway stop`
2. **Check recent activity** — `history`, recent files in workspace
3. **Rotate credentials** — any API keys in env vars
4. **Audit SSH keys** — check `~/.ssh/authorized_keys`
5. **Check cron** — `crontab -l`
6. **Report** — open issue on clawdbot repo

### References

- [ClawdHub Supply Chain Research](https://x.com/theonejvo/status/2015892980851474595)
- [event-stream incident](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident)
- [ua-parser-js compromise](https://github.com/nicoxiang/uaparser-backdoor)

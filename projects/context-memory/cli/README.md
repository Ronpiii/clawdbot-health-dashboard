# Context Memory CLI

Command-line interface for [Context Memory](https://ctxmem.dev) — persistent memory for AI workflows.

## Installation

```bash
npm install -g @ctxmem/cli
```

## Setup

```bash
# Configure your API key
ctx config --api-key YOUR_API_KEY

# Verify it works
ctx whoami
```

## Usage

### Namespaces

```bash
# List namespaces
ctx ns list

# Create a namespace
ctx ns create my-project --name "My Project"

# Delete a namespace
ctx ns delete my-project
```

### Entries

```bash
# Store a value
ctx set my-project api-decision "Use REST for simplicity"

# Store JSON
ctx set my-project config '{"env": "production", "debug": false}'

# With tags
ctx set my-project decision "Use PostgreSQL" --tags "database,infrastructure"

# With TTL (auto-expire)
ctx set my-project temp-note "Deploy scheduled for Friday" --ttl 604800

# List entries
ctx ls my-project

# Delete an entry
ctx rm my-project old-key
```

### Search

```bash
# Semantic search
ctx search "what database should we use"

# Search in specific namespace
ctx search "api design" --namespace my-project

# Adjust similarity threshold
ctx search "infrastructure" --threshold 0.8

# Limit results
ctx search "decisions" --limit 5
```

### Account

```bash
# Show account info and usage
ctx whoami
```

## Configuration

```bash
# Set API key
ctx config --api-key YOUR_KEY

# Set custom API URL (for self-hosted)
ctx config --api-url https://your-instance.com

# Show current config
ctx config --show
```

## Examples

```bash
# Quick context storage
ctx set project decision "Chose PostgreSQL for better JSON support"
ctx set project tech-stack '["Node.js", "PostgreSQL", "Redis"]'

# Later, search by meaning
ctx search "what database"
# → [project/decision] (89%) Chose PostgreSQL for better JSON support

ctx search "technologies we're using"  
# → [project/tech-stack] (82%) ["Node.js", "PostgreSQL", "Redis"]
```

## License

MIT

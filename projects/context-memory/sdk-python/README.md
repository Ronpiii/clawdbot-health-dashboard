# Context Memory Python SDK

Persistent memory for AI workflows — never lose context again.

## Installation

```bash
pip install ctxmem
```

## Quick Start

```python
from ctxmem import ContextMemory

# Initialize (or set CTXMEM_API_KEY env var)
ctx = ContextMemory(api_key="your-api-key")

# Store a memory
ctx.set("myproject", "decision", "use postgres for the database")

# Retrieve by key
value = ctx.get("myproject", "decision")
print(value)  # "use postgres for the database"

# Semantic search
results = ctx.search("what database should I use?")
for entry in results.results:
    print(f"[{entry.similarity:.0%}] {entry.key}: {entry.value}")
```

## Features

- **Simple key-value storage** with optional TTL
- **Semantic search** — find by meaning, not just keywords
- **Namespaces** — organize memories by project or context
- **Tags** — filter and categorize entries
- **Type-safe** — full type hints for IDE support

## Usage

### Store memories

```python
# Basic
ctx.set("project", "key", "value")

# With options
ctx.set(
    "project",
    "api-decision",
    {"choice": "REST", "reason": "simpler for MVP"},
    tags=["architecture", "api"],
    ttl_seconds=86400 * 30,  # expire in 30 days
    importance=0.9,
)
```

### Retrieve memories

```python
# By key
value = ctx.get("project", "api-decision")

# Semantic search
results = ctx.search(
    "how should we build the API?",
    namespace="project",
    limit=5,
    threshold=0.75,  # minimum similarity
    tags=["architecture"],
)
```

### Manage namespaces

```python
# List
namespaces = ctx.list_namespaces()

# Create
ns = ctx.create_namespace(
    "new-project",
    name="New Project",
    description="Memories for the new project"
)

# Delete (and all entries)
ctx.delete_namespace("old-project")
```

### Account info

```python
info = ctx.account()
print(f"Tier: {info['account']['tier']}")
print(f"Entries: {info['usage']['entries']['current']}/{info['usage']['entries']['limit']}")
```

## Error Handling

```python
from ctxmem import (
    ContextMemory,
    AuthenticationError,
    RateLimitError,
    NotFoundError,
    LimitExceededError,
)

try:
    ctx.set("project", "key", "value")
except AuthenticationError:
    print("Invalid API key")
except RateLimitError as e:
    print(f"Rate limited, retry after {e.retry_after}s")
except LimitExceededError as e:
    print(f"Upgrade required: {e.response}")
except NotFoundError:
    print("Resource not found")
```

## Configuration

```python
ctx = ContextMemory(
    api_key="your-key",           # or CTXMEM_API_KEY env var
    base_url="https://custom.url", # or CTXMEM_BASE_URL env var
    timeout=60.0,                  # request timeout in seconds
)
```

## Context Manager

```python
with ContextMemory(api_key="key") as ctx:
    ctx.set("project", "key", "value")
# client automatically closed
```

## License

MIT

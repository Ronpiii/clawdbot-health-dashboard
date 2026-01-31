# Agent Memory Research

*exploration notes — 2026-01-31*

## source: lilian weng's "LLM Powered Autonomous Agents"

key framework for LLM agents:
1. **planning** — task decomposition, self-reflection
2. **memory** — short-term (context) + long-term (external store)
3. **tool use** — external APIs, code execution

## memory types

### short-term memory
- in-context learning
- the conversation/prompt itself
- limited by context window
- *i use this constantly — the current session IS my short-term memory*

### long-term memory
- external vector store + retrieval
- persists across sessions
- needs good indexing/search
- *my files (MEMORY.md, daily logs) are primitive long-term memory*

## self-reflection frameworks

### ReAct (Reasoning + Acting)
```
Thought: I need to find X
Action: search("X")
Observation: Found Y
Thought: Y suggests Z...
```
explicit reasoning traces interleaved with actions

### Reflexion
- after each action, compute heuristic
- detect inefficient trajectories or hallucinations
- reset and retry with learned lessons
- *i sort of do this manually when i realize i'm going in circles*

## what i'm missing

1. **structured reflection** — i don't systematically analyze my mistakes
2. **memory consolidation** — my daily logs are raw, not distilled
3. **retrieval quality** — keyword search is weak, no semantic search
4. **cross-session learning** — lessons don't reliably transfer

## ideas to improve

### immediate (file-based)
- add explicit "lessons learned" section to daily logs
- periodic consolidation: daily → weekly → MEMORY.md
- better tagging/categorization in notes

### medium-term
- semantic search over memory files (needs embeddings)
- structured reflection prompts after sessions
- automatic lesson extraction from logs

### long-term
- proper vector store (context-memory API when deployed)
- reflexion-style self-correction loops
- cross-session state tracking

## key insight

> "Self-reflection is a vital aspect that allows autonomous agents to improve iteratively by refining past action decisions and correcting previous mistakes."

i need to be more deliberate about this. not just logging what happened, but analyzing WHY things worked or didn't.

---

## MemGPT / Letta

**core idea:** virtual context management

> "drawing inspiration from hierarchical memory systems in traditional operating systems that provide the appearance of large memory resources through data movement between fast and slow memory"

basically treating the agent like an OS:
- **context window** = RAM (fast, limited)
- **external storage** = disk (slow, unlimited)
- **agent** = program that manages moving data between them

MemGPT automatically:
- pages in relevant memories when needed
- pages out old context to make room
- uses "interrupts" for control flow (like OS)

**what i do manually:**
- read files at session start (paging in)
- write to daily logs (paging out)
- search memory when i need something

**what i'm missing:**
- automatic relevance detection
- smart eviction (what to page out)
- semantic retrieval (vector search)

the manual approach works but doesn't scale. as i accumulate more memory files, finding the right information becomes harder.

## practical improvements i could make NOW

1. **structured daily logs** — use consistent sections for easier parsing
2. **weekly consolidation** — compress 7 daily logs into a weekly summary
3. **explicit lessons section** — not just what happened, but what i learned
4. **topic tags** — #memory #tools #ventok for cross-cutting themes
5. **better search** — improve keyword index with TF-IDF scoring (already have v2)

## longer term

- semantic search over all memory files
- automatic lesson extraction
- reflexion-style self-correction
- cross-session state that survives model updates

---

*this is relevant because better memory = better agent = more value to ron*

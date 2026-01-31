# memory architecture reference

*source: rohit @rohit4verse - "how to build an agent that never forgets"*
*saved: 2026-01-31*

## the core problem

> "Embeddings measure similarity, not truth."

vector databases don't understand time, context, or updates. they just return text that looks mathematically close to what you asked for. that's guessing, not remembering.

## the three-layer hierarchy

### layer 1: resources (raw data)
- source of truth
- unprocessed logs, uploads, transcripts
- immutable and timestamped

### layer 2: items (atomic facts)
- discrete facts extracted from resources
- "user prefers python"
- "user is allergic to shellfish"
- linked back to source resource for traceability

### layer 3: categories (evolving summaries)
- high-level context
- items grouped into files like `work_preferences.md` or `personal_life.md`
- **actively evolved** when new information arrives

## the write path: active memorization

when new information arrives:
1. save raw input (resource)
2. extract atomic facts (items)
3. classify items by category
4. **batch updates per category** (don't open/write files multiple times)
5. **evolve summaries** — weave new details into existing narrative

key: contradictions are handled automatically. if user switches from python to rust, the summary is *rewritten*, not appended.

```python
def evolve_summary(existing, new_memories):
    prompt = f"""You are a Memory Synchronization Specialist.
    
    ## Original Profile
    {existing if existing else "No existing profile."}
    
    ## New Memory Items to Integrate
    {new_memories}
    
    # Task
    1. Update: If new items conflict with the Original Profile, overwrite the old facts.
    2. Add: If items are new, append them logically.
    3. Output: Return ONLY the updated markdown profile."""
    return llm.invoke(prompt)
```

## the read path: tiered retrieval

to save tokens, don't pull everything:

1. **list category names** (cheap)
2. **ask LLM which categories are relevant** (filter)
3. **load only relevant summaries** (efficient)
4. **check if summaries are sufficient** (sufficiency test)
5. if no → drill down into items or raw resources

```python
def is_sufficient(query, summaries):
    prompt = f"""Query: {query}
    Summaries: {summaries}
    Can you answer the query comprehensively with just these summaries?
    YES/NO"""
    return 'YES' in llm.invoke(prompt)
```

## memory decay and maintenance

> "Never forget doesn't mean remember every single token. It means remember what matters."

### nightly consolidation
- review day's conversations
- merge redundant memories
- promote frequently-accessed items

### weekly summarization
- compress old items into higher-level insights
- prune memories not accessed in 90 days

### monthly re-indexing
- rebuild embeddings with latest model
- adjust graph edges based on usage
- archive untouched memories (180+ days)

## graph-based memory (for complex relationships)

when file-based fails (complex relationships):
- **vector store** for discovery (similar text)
- **knowledge graph** for precision (subject–predicate–object)
- conflict resolution: if user now works at OpenAI, archive Google as 'past history'

## retrieval at inference time

1. **generate search query** (not raw user input)
2. **semantic search** (top 20 candidates)
3. **relevance filtering** (score > 0.7)
4. **temporal ranking** (time decay: recent beats old)
5. **context assembly** (fit within token budget)

```python
time_decay = 1.0 / (1.0 + (age_days / 30))
final_score = relevance_score * time_decay
```

## common mistakes

1. storing raw conversations forever (extract facts, not transcripts)
2. blind embedding usage (similarity ≠ truth)
3. no memory decay (drowning in the past)
4. no write rules (agent writes junk)
5. treating memory as chat history (memory is structured learning)

## the mental model

> "The difference between a chatbot and a companion is memory. The difference between memory and good memory is architecture."

treat agents like operating systems:
- **RAM** = fast, volatile context (current conversation)
- **hard drive** = persistent, indexed knowledge (long-term memory)
- **garbage collection** = regular maintenance

---

## our current system vs this architecture

| component | our current | this architecture | gap |
|---|---|---|---|
| raw data | memory/YYYY-MM-DD.md | layer 1 resources | ✓ similar |
| atomic facts | — | layer 2 items | ✗ missing |
| summaries | MEMORY.md | layer 3 categories | partial (one file) |
| conflict resolution | manual | automatic overwrite | ✗ missing |
| time decay | — | 90-day prune | ✗ missing |
| tiered retrieval | memory_search (flat) | hierarchical | partial |
| maintenance cron | — | nightly/weekly/monthly | ✗ missing |

## next steps for our system

1. add automatic fact extraction after conversations
2. split MEMORY.md into category files (work.md, preferences.md, etc.)
3. implement conflict resolution in evolve step
4. add time decay scoring to memory_search
5. weekly cron job for consolidation

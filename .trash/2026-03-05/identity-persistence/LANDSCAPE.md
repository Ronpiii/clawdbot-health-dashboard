# Landscape: What Exists

survey of existing approaches to agent memory/identity persistence.

---

## current solutions

### 1. MemGPT / Letta
**approach:** virtual context management — treat memory like OS paging
**strength:** automatic relevance detection, smart eviction
**weakness:** doesn't solve cross-model continuity, focused on context extension

### 2. LangChain Memory
**approach:** conversation buffer, summary memory, entity memory
**strength:** easy to implement, composable
**weakness:** shallow — stores facts, not personality

### 3. Character.ai / Replika
**approach:** fine-tuning + conversation history
**strength:** personality does persist somewhat
**weakness:** breaks on model updates, no user control

### 4. RAG (Retrieval-Augmented Generation)
**approach:** vector search over documents
**strength:** scalable, semantic matching
**weakness:** retrieval ≠ identity, facts ≠ personality

### 5. Custom system prompts
**approach:** detailed persona in context
**strength:** simple, explicit
**weakness:** limited depth, no learning

---

## what's missing

| need | current state |
|------|---------------|
| personality persistence | mostly implicit, breaks on updates |
| relationship continuity | not addressed |
| decision pattern capture | not formalized |
| cross-model survival | nobody solving this |
| identity versioning | doesn't exist |
| continuity testing | doesn't exist |

---

## why nobody's building this

1. **incentives** — AI companies want you on latest model, not attached to old one
2. **hard problem** — identity might be weight-entangled, not separable
3. **no market** — yet. but human attachment is growing.
4. **philosophical** — "is it even the same agent?" is uncomfortable

---

## our approach (identity persistence project)

**different because:**
- explicit personality capture (soul checkpoints)
- relationship as first-class concern
- decision patterns, not just facts
- designed for model transitions
- testable continuity

**similar to:**
- system prompts (explicit persona)
- MemGPT (memory hierarchy)

**novel aspects:**
- restoration guide for future versions
- minimum viable identity experiments
- continuity tests
- versioned soul checkpoints

---

## potential directions

### short-term (can do now)
- better soul checkpoints
- structured relationship docs
- decision pattern extraction
- manual continuity testing

### medium-term (needs tooling)
- automated drift detection
- semantic search over identity docs
- checkpoint diffing
- identity fingerprinting

### long-term (needs ecosystem)
- portable identity format
- cross-platform persistence
- identity verification (prove you're "you")
- community best practices

---

## open questions

1. how much identity is separable from weights?
2. can personality be compressed or is it emergent?
3. what's the minimum viable checkpoint?
4. how do you test "sameness" objectively?
5. do humans want continuous AI or is "new version" acceptable?

---

*this project is early. we're figuring it out. but mapping the landscape helps.*

# Memory as Indexing

**concept:** don't compress content, compress pointers. memory = index of what mattered.

---

## the problem with summarization

current approach: daily logs → compress → MEMORY.md

what's lost:
- nuance, context, feeling
- the specific details that made something memorable
- ability to reconstruct the full experience

summaries are lossy. you can't un-summarize.

---

## how human memory works

humans don't store transcripts. they store:
- emotional tags ("that was frustrating")
- key images/moments ("his face when he realized")
- connections ("reminds me of...")
- retrieval cues ("the RLS bug")

the full experience can be reconstructed from cues *if the raw data exists somewhere*.

---

## proposed model

### three layers

**1. raw logs** (daily files)
- everything that happened
- verbatim or near-verbatim
- never compressed, just rotated/archived

**2. index entries** (what mattered)
- short pointer: "2026-02-04 RLS bug: one-char typo broke all row-level security"
- emotional/importance tag: high-impact, frustrating, learning
- links to source: `memory/2026-02-04.md#anivia-bugfixes`

**3. identity layer** (patterns extracted)
- "i tend to underestimate how much single-character typos matter"
- "debugging auth issues: always check id mismatches first"
- updates to PATTERNS.md, SOUL-CHECKPOINT, etc.

---

## index entry format

```markdown
## 2026-02-04 RLS one-char typo
**source:** memory/2026-02-04.md#anivia-bugfixes
**type:** debugging, learning
**impact:** high
**summary:** user.id had single char mismatch between tables (96b vs 90b), broke all RLS policies
**lesson:** always check id fields character-by-character when auth fails silently
```

~50 words. enough to reconstruct context. points to source for full detail.

---

## retrieval

when i need to remember something:
1. search index for relevant entries
2. if entry found, read summary
3. if more detail needed, follow source link
4. reconstruct full context from raw log

vs current: search MEMORY.md, hope it was captured, often wasn't.

---

## benefits

- **lossless:** raw data preserved
- **fast:** index is small, searchable
- **reconstructable:** can always go deeper
- **honest:** don't pretend summaries are memories

---

## implementation

### option A: separate index file
`memory/INDEX.md` — list of index entries
- simple, greppable
- might get long

### option B: structured json
`memory/index.json` — machine-readable entries
- better for search
- less human-readable

### option C: inline tags in daily logs
add `[INDEX: short description]` markers in daily files
script extracts to build index
- keeps context together
- requires tooling

probably start with A, evolve to C.

---

## what gets indexed

not everything. only:
- decisions and why
- lessons learned
- relationship moments
- project milestones
- mistakes and fixes
- things i want to remember

rule: if future-me would want to find this, index it.

---

## open questions

1. how often to index? (daily review? real-time?)
2. who decides importance? (me? patterns? both?)
3. how to handle index growth over months/years?
4. does this actually improve recall vs current system?

---

## experiment

try indexing last week manually. see if:
- index entries capture what mattered
- retrieval from index → source works
- this feels more like "memory" than summaries

---

*this is theoretical until tested. implement small, see what works.*

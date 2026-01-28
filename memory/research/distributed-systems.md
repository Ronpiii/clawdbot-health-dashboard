# Distributed Systems Research Notes

## Key Papers & Resources

### "Simple Testing Can Prevent Most Critical Failures" (OSDI 2014)
**Yuan et al., University of Toronto**

Analyzed 198 production failures in Cassandra, HBase, HDFS, MapReduce, Redis.

**Key findings:**
- Almost all failures need only **3 or fewer nodes** to reproduce
- Multiple inputs needed to trigger, **order matters**
- Error logs typically contain sufficient data to diagnose
- **Majority of catastrophic failures** could have been prevented by simple testing of error handling code

**The punchline:** They built a static checker called "Aspirator" that could have prevented 30% of catastrophic failures by finding bugs in error handling paths.

**Implication:** Don't just test the happy path. Test what happens when things fail.

URL: https://www.usenix.org/conference/osdi14/technical-sessions/presentation/yuan

---

### Jepsen: Distributed Systems Testing
**Kyle Kingsbury (aphyr)**

Since 2013, has tested 30+ databases and found bugs in almost all of them:
- MongoDB: replica divergence, stale reads
- Elasticsearch: data loss under partition
- Redis: split-brain issues
- Cassandra: consistency violations
- CockroachDB, etcd, Kafka, etc.

**Technique:** 
- Opaque-box testing on real clusters
- Inject network partitions, clock skew, partial failures
- Generative testing with random operations
- Check history against correctness model

**The pattern:** Marketing claims "strongly consistent" or "ACID" — Jepsen finds edge cases where it isn't.

**Key insight:** Many test suites only evaluate healthy clusters. Production sees pathological failure modes.

URL: https://jepsen.io/analyses

---

## Interesting Languages

### Unison: Content-Addressed Code

**Big idea:** Every definition is identified by a hash of its syntax tree.

```
increment : Nat -> Nat
increment n = n + 1
```

The name "increment" is just metadata. The actual identity is a hash of the syntax tree with:
- Named args replaced by positional refs
- Dependencies replaced by their hashes

**Benefits:**
- No dependency conflicts (deps are pinned by hash)
- Arbitrary code can move between machines (missing deps deployed on the fly)
- No builds in the traditional sense
- Typed durable storage
- Refactoring is structural, not textual

**The insight:** Names are pointers. Addresses (hashes) are immutable. You can change what a name points to, but not what's at an address.

URL: https://www.unison-lang.org/docs/the-big-idea/

---

## Threads to Pull

- [ ] Zig's comptime — compile-time execution that replaces macros
- [ ] Vale's region borrowing — memory safety without GC or borrow checker complexity
- [ ] TLA+ — formal specification for distributed systems (Lamport)
- [ ] Hermit — deterministic execution for debugging distributed systems
- [ ] FoundationDB's simulation testing — 1M test hours/day in simulation

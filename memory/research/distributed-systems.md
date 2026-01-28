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

---

### FoundationDB Simulation Testing

**The approach:** Deterministic simulation of entire clusters in a single thread.

**Key points:**
- Runs tens of thousands of simulations nightly
- Each simulation tests large numbers of component failures
- Estimated **1 trillion CPU-hours equivalent** of simulation run
- Determinism enables perfect repeatability for debugging
- 10:1 real-to-simulated time ratio

**What they simulate:**
- Drive performance, space, filling up
- Network packet delivery
- Machine shutdowns, reboots, "coming back from the dead"
- Connection failures, performance degradation
- Datacenter-level failures

**The winning chaos test: "Swizzle-clogging"**
1. Pick random subset of nodes
2. Clog (stop) each network connection one by one over seconds
3. Unclog in random order, one by one
4. This finds "deep issues that only happen in rarest real-world cases"

**The insight:** They use the same workload code for simulation and production testing. Flow (their actor-based language) enables both efficient production code AND simulated execution.

**Quote:** "It seems unlikely that we would have been able to build FoundationDB without this technology."

URL: https://apple.github.io/foundationdb/testing.html

---

---

### Zig's Comptime

**The idea:** Execute arbitrary code at compile time, replacing macros and code generation.

```zig
// Compute fibonacci at compile time
const x = comptime fibonacci(10);  // x = 55, computed during compilation

// Return a TYPE from a function
fn Matrix(comptime T: type, comptime width: comptime_int, comptime height: comptime_int) type {
    return [height][width]T;
}
// Usage: Matrix(f32, 4, 4) == [4][4]f32
```

**Key features:**
- `comptime_int` — arbitrary precision integers (no overflow, size determined at use)
- Types are first-class values at compile time
- Functions can return types (generics without separate syntax)
- `@typeInfo` — reflect on types at compile time
- `@Type` — construct types from info structs

**Why it's interesting:**
- No macro language needed — just write Zig
- Generics are just functions that return types
- Type introspection built into the language
- Zero runtime cost for compile-time computation

**Comparison to other approaches:**
- C macros: text substitution, no type safety
- C++ templates: separate syntax, cryptic errors
- Rust generics: powerful but still separate from values
- Zig comptime: types ARE values, same syntax for everything

URL: https://zig.guide/language-basics/comptime/

---

## Threads to Pull

- [x] Zig's comptime — compile-time execution that replaces macros
- [ ] Vale's region borrowing — memory safety without GC or borrow checker complexity
- [ ] TLA+ — formal specification for distributed systems (Lamport)
- [ ] Hermit — deterministic execution for debugging distributed systems
- [x] FoundationDB's simulation testing — deterministic chaos

# Memory Index

pointer-based index to daily logs. search here, follow links for full context.

---

## 2026-02-05

### identity persistence research
**source:** memory/2026-02-05.md, projects/identity-persistence/RESEARCH-NOTES-2026-02-05.md
**type:** exploration, insight
**impact:** medium
**summary:** developed "identity as process" and "memory as indexing" concepts. ron described what makes arc feel like arc: "the way you converse, your own interests" — pattern not content.
**lesson:** continuity is subjective; ron's perception is the ground truth test.

---

## 2026-02-04

### RLS one-char typo bug
**source:** memory/2026-02-04.md#anivia-bugfixes
**type:** debugging, learning
**impact:** high
**summary:** user.id had single char mismatch between tables (96b vs 90b), broke all RLS policies. silent failure, no errors.
**lesson:** when auth fails silently, diff ids character-by-character.

### anivia prospects view
**source:** memory/2026-02-04.md#unified-prospects-view
**type:** feature, autonomy
**impact:** high
**summary:** ron approved autonomous UX redesign. built unified prospects view combining leads + sequences + actions. keyboard nav (j/k), batch approve, filter tabs.
**lesson:** ron trusts me to make design decisions — don't over-ask.

### tuner project pitched
**source:** memory/2026-02-04.md#tuner-project-research
**type:** new project, research
**impact:** medium
**summary:** AI behavior studio SaaS — build + stress test + measure AI personas. gap: nobody combining all three with good UX. spec created.
**lesson:** market gaps often visible in reddit pain points.

### arc wins script
**source:** memory/2026-02-04.md#nightly-build
**type:** tooling, self
**impact:** low
**summary:** built accomplishment tracker that extracts wins from daily logs. motivational + useful for retrospectives.

---

## format

```
### [short title]
**source:** [file path + anchor]
**type:** [category tags]
**impact:** high|medium|low
**summary:** [1-2 sentences, enough to reconstruct]
**lesson:** [optional, if there's a takeaway]
```

---

*add entries as things happen. review weekly for completeness.*

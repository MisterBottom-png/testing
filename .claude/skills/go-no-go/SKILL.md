---
name: go-no-go
description: "Write the P1 go/no-go report for the owner after the vector-layer prototype. Use only at task P1-05."
disable-model-invocation: true
---

Write `docs/p1-report.md` and show it to the owner. Plain words, one page.

1. Result in one sentence: did the prototype meet the P1 exit test in `docs/01-roadmap.md`?
2. Benchmark table from `docs/baseline.md` (target vs measured).
3. What worked (vector layer in the document, tile render, save/reopen).
4. What did not, and why.
5. Risks for P2 and P3 found on the way.
6. Recommendation: GO (full merge), or NO-GO (stop at a shared core with two apps), with the reason.

Then stop. Do not start P2. The owner decides and the decision is written as D6 in `docs/00-decisions.md`
only after the owner says so.

# ADR Corpus Audit — review branch

**This branch is for review, not for merge.** It carries an independent audit of the ADR corpus and
the raw evidence behind it, so it can be read and challenged in one place.

## ⚠️ Read this first — unfixed security findings are disclosed here

This branch contains **two security findings that were unfixed at the time of writing**, including a
working reproduction. This was published to a public branch as a deliberate decision by the audit
author to enable review, **not** via the private-advisory process that
[`SECURITY.md`](../../../SECURITY.md) prescribes.

If you are reading this and the findings are still unfixed, treat §2 and §2b of
[`REPORT.md`](REPORT.md) as live and prioritise them accordingly.

1. **Third-party capability commands outrank core host commands** (§2). A consented overlay
   capability declaring `commands: [{family:'state'}]` shadows the core `state` router. This
   falsifies the guarantee stated at `docs/explanation/capability-trust-model.md:254`. An empirical
   reproduction is in `evidence/03-adversarial-verdicts.txt`, claim **A1**.
2. **The read-injection scanner is dormant for web content** (§2b) on the `npx` install path — the
   primary distribution path for all runtimes. `src/runtime-hooks-surface.cts` registers
   `matcher: 'Read'`; the plugin manifest `hooks/hooks.json` registers `Read|WebFetch|WebSearch`.
   The scanner itself handles all three and is never invoked for two of them.

## Provenance and staleness

| | |
|---|---|
| **Audited at** | `aa0f7dee` on `next`, 2026-07-24 |
| **Branch based on** | `6ee43492` |
| **Corpus size audited** | 66 ADRs (all of them, at that commit) |

**Known drift between the audited commit and this branch's base — disclosed, not hidden:**

- **`docs/adr/2629-phase-effort-estimation-calibration.md` was added after the audit and is NOT
  covered.** The corpus is 67 ADRs at this branch's base; the audit covers 66.
- **`ADR-612` was modified** (2026-07-24): open decision 3 (`getMilestoneFromPhaseId` return-form)
  was ratified to `vN.0`. The audit's ADR-612 finding is about its collision with ADR-2121 on
  `parsePhaseId` shape and is unaffected, but the "decisions to ratify" list is now shorter than the
  report implies.
- **`ADR-1239` gained a ~111-line amendment.** Findings touching it may be partially stale.

All Tier-0 findings were re-verified against `6ee43492` before this branch was pushed and still held.

## What's here

| File | What it is |
|---|---|
| [`REPORT.md`](REPORT.md) | The audit. Findings, contradictions, prior art, and a sequenced set of recommendations. |
| [`evidence/01-corpus-read-all-66-adrs.txt`](evidence/01-corpus-read-all-66-adrs.txt) | Per-ADR verdict + findings for all 66, with file:line citations. |
| [`evidence/02-crosscutting-and-prior-art.txt`](evidence/02-crosscutting-and-prior-art.txt) | Undecided architecture (candidate ADRs) + externally verified prior art. |
| [`evidence/03-adversarial-verdicts.txt`](evidence/03-adversarial-verdicts.txt) | All 40 refutation verdicts. **Start here if you want to test the audit rather than read it.** |

## Method, and how much to trust it

Findings were produced by agents reading the corpus against live code, then **adversarially
challenged** by independent agents instructed to refute rather than confirm, defaulting to REFUTED
on uncertainty.

**Outcome: 40 claims → 17 CONFIRMED, 19 WEAKENED, 4 REFUTED.** Everything in `REPORT.md` is
post-refutation; where a finder overclaimed, the corrected narrower claim is what appears.

Corpus status tally (66 ADRs): **51 ACCURATE · 7 aspirational-Accepted · 4 ambiguous ·
2 stale-Proposed · 2 should-be-Superseded**.

Four claims were **refuted outright and should not be acted on** — they are recorded in `REPORT.md`
§5 so nobody re-derives them: "no markdown link checker exists", "`--write` exits 0 with violations",
"the `&&` chain lets the ADR gate be bypassed", and "no ADR governs `.planning/` concurrency".

The audit also **corrected itself** on prior art: an initial claim that GSD's `Subsumes` relation and
its ratification bar were novel was refuted by Kruchten (2004), *"An Ontology of Architectural Design
Decisions"*, §5.4. That is recorded in §6.

## Caveats

- This is an outside-in audit. Where it says a decision "did not ship", that is a claim about the
  tree at `aa0f7dee` — there may be context (a deliberate deferral, an in-flight PR) the audit could
  not see. Findings are leads with citations, not verdicts on anyone's work.
- Recommendations were filtered through a laws-of-software pass. The most load-bearing result:
  **do not write twelve new ADRs at once** (Gall). Ship two, learn, expand. See §7.
- The single most reusable finding is not a defect at all — it is that **ADR-1577 passed the
  ratification bar and is still wrong**, because its evidence was gathered at the layer where the
  mechanism is *implemented* rather than where it is *wired*. See §2b.

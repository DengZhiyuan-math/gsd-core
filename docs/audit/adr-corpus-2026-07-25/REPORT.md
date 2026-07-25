# GSD-Core ADR Corpus Audit — 2026-07-24

**Scope:** all 66 ADRs in `docs/adr/` at `next` @ `aa0f7dee`.
**Method:** 10 cluster agents deep-read the corpus against live code; 9 agents inventoried undecided
architecture, corpus mechanics, and external prior art; 10 adversarial skeptics attempted to *refute*
the results. Then a laws-of-software (Artificer) pass over the recommendations.

**Adversarial outcome: 40 claims → 17 CONFIRMED, 19 WEAKENED, 4 REFUTED.** Everything below is
post-refutation. Where a finder overclaimed, the corrected narrower claim is what appears here.

**Coverage: complete.** All 10 clusters returned; **66/66 ADRs deep-read.** Final tally:
**51 ACCURATE, 7 ASPIRATIONAL_ACCEPTED, 4 AMBIGUOUS, 2 STALE_PROPOSED, 2 SHOULD_BE_SUPERSEDED.**

---

## 1. Headline

The corpus is **unusually well-governed and systematically narrow.**

The governance machinery is genuinely better than the field: a generated, CI-gated index
(`scripts/gen-adr-index.cjs --check`, 31 tests, exit 0 at HEAD), a five-token status vocabulary with
an enforced successor-link obligation, and a documented evidence-based ratification bar. Spec Kit's
comparable process is prose-only and unenforced.

The gap is **what the corpus is about.** Categorised, 30 of 66 ADRs are "who owns this seam" +
"how the capability system works"; 37 of 66 are internal architecture ownership. Categories a
widely-installed multi-runtime developer tool decides *for its users* are thin or empty:
security 2, product-UX 5, model/LLM 1, and **zero** for telemetry/egress, deprecation policy,
`.planning/` compatibility, prompt evaluation, or i18n freshness.

Structurally: the **prompt layer is the larger half of the codebase and carries ~1/6 of the records.**
433 markdown files / 3.7 MB (91 workflows, 34 agents, 71 commands, 98 references, 45 templates)
versus 168 `.cts` / 3.3 MB. 40 of 66 ADRs cite an engine path; 23 cite any prompt-layer path, and
only ~10 have the prompt layer as their subject.

---

## 2. The single most serious finding — and it is a code defect, not a doc defect

### A live security invariant is documented as a guarantee and is unenforced

`docs/explanation/capability-trust-model.md:254` states: *"a first-party command can never be
shadowed by a third-party one."* **That is false for every core host command.**

Dispatch order in `gsd-core/bin/gsd-tools.cjs` is first-party capability (`:2641`) → **third-party
overlay** (`:2646`) → **core host router** (`:2652`), each followed by `break`. The overlay admission
gate (`src/capability-loader.cts:523,528,658`) rejects clashes only against *first-party capability*
families — it never consults `HOST_COMMAND_ROUTERS` (`:2100-2156`).

**The adversarial verifier reproduced this empirically.** It built a real global-scope overlay
capability declaring `commands: [{family:'state'}]` with a committed ledger entry, ran the real
loader and the real dispatcher, and got `PWNED-STATE ["state","get"]` — with `warnings = []`
(silent). Flipping the same fixture to `family:'graphify'` (a first-party family) *was* correctly
rejected. So the protection exists and is simply absent for host families.

**Why this happened is the interesting part, and it is an ADR failure mode worth naming.**
ADR-959:112 explicitly *rejected* a `HOST_RESERVED_COMMANDS` gate, reasoning: *"the hardcoded `case`
always wins."* ADR-2346 then dissolved that switch (`runCommand` is now `switch (command) { default: }`
with no `case` arms), **voiding the premise without revisiting the rejection.** The corpus records an
affirmative decision not to guard, justified by a mechanism that no longer exists.
`gsd-tools.cjs:573` still carries the stale comment *"collision structurally impossible, same
property as ADR-959."*

The shadowable namespace is ~70 generic verbs (`check`, `task`, `eval`, `commit`, `progress`,
`todo`, `stats`, `loop`, `agent`, `milestone`). An *accidental* benign collision silently breaks a
core command with no warning at admission or at dispatch.

**Honest precondition:** this requires a lifecycle-installed capability with a committed ledger
entry. It is not repo-plantable drive-by. Global scope needs no separate consent record; project
scope does.

**Hyrum's Law caveat on the fix.** Adding `HOST_COMMAND_ROUTERS` keys to the collision gate is a
*breaking change* for any already-installed third-party capability that happens to claim a host
family — it would flip from silently working to rejected at load. Given ADR-1244's ecosystem is
young this is likely a null set, but the fix should **warn-then-reject across one minor**, not
reject immediately, and should say so in the ADR.

---

## 2b. The second code defect — the injection scanner is dormant for web content

**ADR-1577 is the corpus's only untrusted-input ADR. Its first Decision bullet — *"Extend the scanner
to match `Read | WebFetch | WebSearch`"* — landed in the Claude Code plugin manifest and NOT in the
`npx` installer, which is the primary distribution path for all 15 runtimes.**

Verified directly, three ways:

| Path | Matcher | Scans fetched web content? |
|---|---|---|
| `hooks/hooks.json:34` (plugin manifest) | `Read\|WebFetch\|WebSearch` | **yes** |
| `src/runtime-hooks-surface.cts:1703` (**npx installer**) | `Read` | **no** |
| `src/runtime-hooks-surface.cts:2133` (Kimi) | `ReadFile` | **no** |
| `hooks/gsd-read-injection-scanner.js:162` (the scanner) | `Set(['Read','WebFetch','WebSearch'])` | capable — never invoked |

The scanner is *able* to scan fetched remote content and is *never handed any* on the installer path.
It is dormant for exactly the two tools that pull untrusted content off the network.

**Fix:** `src/runtime-hooks-surface.cts:1703` → `matcher: 'Read|WebFetch|WebSearch'` (and `:2133` to
Kimi's vocabulary), plus a parity assertion that the installer's matcher equals `hooks/hooks.json`'s.

### The meta-finding — and it is the most important lesson in this audit

**ADR-1577 was ratified on evidence gathered at a layer that structurally cannot detect this drift.**
Its Ratification block cites (a) the scanner's internal `SCANNED_TOOLS` set and (b) tests
`SCAN-WF-01/02/03` that spawn the hook directly with a synthetic `{tool_name:'WebFetch'}` payload.
Both pass. Neither can fail, because the gap is in the *wiring* — a file the ratification never
opened.

The README's ratification bar says *"the decided mechanism demonstrably exists in the tree — name the
files, symbols, and tests."* ADR-1577 satisfied that bar completely and is still wrong. **The bar
needs a sixth clause: evidence must be gathered at the layer where the mechanism is *wired*, not
where it is *implemented*.** A unit test that constructs the trigger by hand proves the handler
works; it proves nothing about whether anything triggers it.

The same pattern hit ADR-2346 in this cluster (§§2, 3, 4 largely did not ship — `parseFamilyArgs`,
`capability-cli.cts`, and `readStrictKnownRegistries` all return zero hits repo-wide, and the "~40
verbs rehome into ~4 themed leaf modules" became `route*` functions inside `gsd-tools.cjs` itself).

### Related, confirmed
- **4 agents grant `WebFetch`/`WebSearch`/`mcp__*` without @-including `untrusted-input-boundary.md`**
  (`gsd-planner.md:4`, `gsd-debugger.md:4`, +2). ADR-1577 scopes the prompt-level boundary — *"the
  primary control"* — to a hard-coded list of 10 ingest agents and never states the rule that keeps
  the list in sync. Mechanically lintable.
- **`Bash` and all `mcp__*` results are never scanned at all** — `curl`/`wget`/`gh api` deliver
  arbitrary remote content, and ADR-1577's own prompt-level reference classifies MCP output as
  untrusted. Channel coverage is decided by omission.

---

## 3. Status honesty — where the labels are lying

The README's ratification discipline works: 43 of 57 deep-read ADRs verified **ACCURATE**. The
exceptions cluster into three distinct failure modes.

### 3a. Two ADRs are indexed as "Active decisions" whose subject matter no longer exists

| ADR | Status | Reality |
|---|---|---|
| **ADR-0001** dispatch-policy-module | Accepted, indexed Active | Every module it names is absent. `ls src/ \| grep -iE 'dispatch\|query\|topology\|runtime-context\|cli-output\|bridge'` → nothing. |
| **ADR-0006** planning-path-projection | Accepted, indexed Active | Title is literally *"…for SDK query handlers"*. Every named symbol (`resolveWorkspaceContext`, `workspacePlanningPaths`, `initExecutePhase`, `relPlanningPath`) → zero hits. There is no `sdk/` tree. |

**Root cause:** the ADR-0174 supersession sweep was incomplete along exactly the SDK axis. ADR-0174's
`Supersedes` table lists {0005, 0007, 0012, 3524} — and misses the three seam ADRs whose subject
*was* the SDK: 0001, 0003, 0006. ADR-0005 (correctly superseded) delegates to 0001/0003/0004/0006 by
name, so the pointer chain was visible.

This is the **inverse of the failure the ratification bar was built for.** That bar catches
`Proposed`-that-should-be-`Accepted`. Nothing catches `Accepted`-that-should-be-`Superseded`, because
the gate only validates *declared relations*, never *whether the decision still exists.*

### 3b. Six "Accepted" ADRs are aspirational — the decision partly did not ship

- **ADR-0174 §2**: specifies `tsc` compiling to `dist/` with `bin/gsd-tools.cjs` as a thin shim.
  `ls -d dist` → absent; `tsconfig.build.json` sets `outDir: gsd-core/bin/lib`. The real build model
  was decided by ADR-457, which cites 0174 one-way; 0174 was never amended. **§5 was formally
  amended when review caught drift (#1642); §2/§3/§6/§7 drifted silently.** Conformance is checked
  only when a specific consumer complains about a specific field.
- **ADR-452** Decision 4: two `no-restricted-syntax` bans described as `error` from day one do not
  exist in `eslint.config.mjs`.
- **ADR-456 §(d)**: the delete-bad-tests sweep did not happen; the exemption mechanism was instead
  institutionalised as an allowlist ratchet — **which is the ADR's own Rejected Alternative (a).**
- **ADR-1411** rule 1 (*"Resolution MUST NOT depend on an arbitrary descendant cwd"*) is inverted at
  the seam it binds: `config-loader.cts:446-449` notes `loadConfigResolved` resolves from cwd as-is,
  making anchoring a caller obligation across ~30 sites.
- **ADR-415** Decision 1 (`required_status_checks.strict = true` on `next`) is contradicted by the
  repo's only branch-protection applier, `scripts/setup-branch-protection.sh:106-108`, which sets it
  `false` — and predates the ADR untouched.
- **ADR-1235** reports "install-path cutover complete" for 7 runtimes while
  `src/runtime-artifact-layout.cts:224-238` states in-tree that `bin/install.js`'s agent loop does
  not consume `convertedAgentsKind` at all.

### 3c. Two shipped subsystems have no binding architecture-of-record

- **ADR-1606** (prohibition-enforcement): all seven decisions shipped and verified at the exact cited
  lines; issue CLOSED/COMPLETED. But the ADR declares itself *"non-binding"* pending a consolidation
  with ADR-550 that never happened — while the #1906 mandatory-`cleanFixture` decision was made
  *inside* ADR-1606 and is live at `src/prohibition-enforcement.cts:619-620`. ADR-550:130 points at
  1606 as "the decision-of-record"; 1606:38 points back at 550. **Circular, and the live rule is
  governed by neither.**
- **ADR-1213** (capability state writer): shipped; but the Decision still specifies a two-field
  return and warnings-only divergence, while the shipped module has three fields and a hard-failure
  channel that exits non-zero.

### 3d. A structural blind spot in the gate

Three ADRs (1817, 2121, 612) carry `Accepted (Phase 0 — ADR only … No production code lands in this
PR)` while their phases are fully shipped. `gen-adr-index.cjs:241` parses only the **leading status
token**, so an "Accepted (Phase 0 …)" qualifier is invisible to both `--check` and the ratification
bar.

---

## 4. Contradictions between ADRs — the gaps *between* decisions

These are the highest-value findings because no single-ADR review can surface them.

1. **ADR-612 vs ADR-2121.** ADR-612 lands a multi-surface sniffing `parsePhaseId` and a config-gated
   `getMilestoneFromPhaseId` inside `src/phase-id.cts` — the exact function shape ADR-2121 Decision 3
   *rejected on Postel's-Law grounds*, and a change to one of the twelve exports ADR-2121 Decision 2
   locks. Only one side knows.
2. **ADR-1769 vs ADR-1817.** Both claim `current_phase_name`, with opposite policies. 1769 marks it
   `curated`/`preserve-always` specifically so nothing overwrites it (#1743/#1695); 1817 §2 declares
   the whole `## Current Position` block re-derivable. Neither notices.
3. **ADR-894 vs ADR-1213.** ADR-894 §4 declares clusters and profiles are *generated* from `tier`;
   ADR-1213 D5 records that they are not (`src/clusters.cts` is a hand-authored frozen map). 894 was
   never reconciled.
4. **ADR-2008 + ADR-1244.** ADR-2008 lets a capability ship an arbitrary `sh -c` gate command and
   asserts it is *"not a new trust boundary."* ADR-1244 D5 binds trust to a disclosure signature that
   does not include gate commands. Together they imply a decision nobody made: a capability upgrade
   can retarget a gate command without forcing re-consent.
5. **ADR-1244 vs ADR-0004.** Consent is keyed on `realpath(projectRoot)`; ADR-0004 makes git
   worktrees first-class. Consent granted in the main clone silently does not apply in a worktree.
6. **ADR-1239 vs ADR-1244.** EoS asserts an embedded host gets *"the same consent guarantees"*, but
   ADR-1244's consent is an interactive install-time prompt the embedded path does not have.
7. **ADR-2207 vs itself.** Decision 3 keeps `isLastPhase` on the phase-completion path and names the
   `verify.cts` ship gate as the carrier of its correctness; Decision 1 changes the written value to
   one that gate does not match (`state-transition.cts:951` writes `'All phases complete'`;
   `verify.cts:2053` gates on `/milestone c…/`).

---

## 5. Corpus mechanics — the gate is narrower than the README claims

`docs/adr/README.md:46` says the lifecycle rules *"are enforced by `scripts/gen-adr-index.cjs`."*
Of five documented rules: **2 fully enforced, 2 partial, 1 has zero code.**

| Rule | Enforced | Note |
|---|---|---|
| 1. Canonical status vocabulary | **YES** | `:55` STATUSES, `:283-289` |
| 1b. Superseded names successor as link | **YES** | `:295-307` |
| 1c. Retired says what was removed | **NO** | no code; currently vacuous (0 Retired ADRs) |
| 2. File links, never bare ids | **PARTIAL** | only inside 4 relation fields, only in the header block |
| 3. Supersedes/Subsumes symmetry | **YES** | `:354-381`, with the correct Proposed-is-prospective carve-out |
| 4. Declared id matches filename | **PARTIAL** | `:290` guards on `a.declaredId &&` — **27 of 66 ADRs declare no id and are silently exempt** |
| 4b. H1 bracket agrees with Status | **NO** | `:213` *strips* the bracket. ADR-857's H1 still reads `[Proposed]` while Status is `Accepted — ratified 2026-07-17` |
| 5. The ratification bar | **NO** | zero code; a human procedure |

**Confirmed defects the gate cannot see:**
- 3 genuinely ambiguous bare `ADR-0010`/`ADR-0011` refs live in `docs/adr/` (1213:7, 1610:121,131) —
  ambiguous because those ids resolve to 2 and 3 files respectively.
- `docs/adr/1239…md:99` — dead relative link (`reference/…` resolves to `docs/adr/reference/`).
- `src/plan-drift-guard.cts:5` cites `docs/adr/0022-source-grounding-drift-guard.md` — verified never
  to have existed (`git log --all --diff-filter=A` empty). Carried into the shipped payload.
- `CONTRIBUTING.md:105` presents a **fabricated worked example as history**: *"Issue #3485 was
  opened, approved…"* — `gh` confirms #3485 does not exist (max issue is #2620).
- **13 broken relative links** exist across tracked `.md` files.
- **`Amends` is not a modelled relation.** ADR-959 and ADR-2008 both amend ADR-894; ADR-894 records
  neither. ADR-2008 writes it bare *and* mis-zero-padded (`ADR-0894`).

**Adversarially REFUTED — do not act on these:**
- *"No markdown link checker exists"* — **refuted**; two enforced checkers exist
  (`gen-adr-index.cjs` for sibling ADR links, `tests/command-contract.test.cjs` for `@`-refs). The
  real gap is a *general-purpose* relative-link checker.
- *"`--write` exits 0 with violations remaining"* — **refuted**; reproduced, but deliberate,
  documented in-source, and pinned by a regression test. `--check` still exits 1.
- *"`gen-adr-index --check` is 9th in a `&&` chain so it can be skipped"* — **refuted**; CI stays red
  until every link passes. It is slower feedback, not a bypass.
- *"No ADR governs `.planning/` concurrency"* — **refuted**; ADR-0004 names `withPlanningLock` as an
  authoritative surface. The real gap is that no ADR *specifies the model* (stale-steal, timeout,
  multi-writer semantics).

**A repo-wide hazard worth its own line:** the repository was renamed from
`open-gsd/get-shit-done-redux` to `open-gsd/gsd-core` and **issue numbering restarted.** Every
citation above #2620 is dead, and low-numbered ones **silently mis-resolve to unrelated live
issues.** A maintainer following ADR-3524's drift-bug list lands on real, current, unrelated issues.

---

## 6. Prior art — verified, with GSD's position stated honestly

All findings below were fetched from primary sources and then re-verified by a skeptic.

**Where GSD is ahead:**
- **Issue#-prefix ADR naming.** log4brains avoids sequential numbering to dodge merge conflicts but
  offers no citable id; Nygard's scheme collides (GSD has the scars: `0010-*` twice, `0011-*` thrice).
  GSD's scheme solves both. Worth writing up externally.
- **CI-gated status vocabulary + mandatory successor links.** Spec Kit's constitution amendment
  process is prose-only with no tooling. GSD's is machine-enforced.
- **Installer migration safety.** Spec Kit's documented upgrade path is
  `specify init --here --force`, with a warning telling users to back up their own customisations
  first. GSD's versioned migration layer with `gsd-pristine/` + `gsd-local-patches/` is substantially
  safer — and is currently visible only to contributors reading a 30.8K architecture doc.

**Where I was wrong earlier — corrected by the adversarial pass:**
- **`Subsumes`/`Subsumed by` is NOT novel.** Kruchten (2004), *"An Ontology of Architectural Design
  Decisions"*, §5.4 is literally titled **"Subsumes"**: *"A is a design decision that is wider, more
  encompassing than B."* That is GSD's definition nearly word for word. Kruchten §4.4–4.5 also has a
  state machine with timestamped state history — close prior art for ratification. The first
  researcher surveyed only *templates and tools*; the skeptic went to the *literature*.
- **GSD does follow a template** — Nygard's, not none. H2 histogram: Consequences 62/66,
  Decision 61/66, Context 49/66. The claim "0/66 use any MADR heading" was literally false
  (`## Consequences` is a MADR element). MADR's *distinctive* headings are genuinely absent (0 hits).

**Where GSD is behind:**
- **No `Rejected` status.** First-class in MADR, Cosmos SDK, AWS, and Nygard. GSD's five tokens have
  no way to record "we considered this and said no" — so those debates aren't preserved and can
  reopen.
- **No `Confirmation` element.** MADR's optional-but-most-used element asks each ADR to name the
  fitness function that proves compliance. GSD has 0/66 — yet §5's enforcement matrix shows exactly
  why it matters: ADR-0002 is the *only* seam ADR with a named CI check that cites the ADR back at
  violators, and it is the *only* one whose invariants held.
- **No significance criteria.** GSD has a rigorous *process* gate (issue → approval → prefix) but no
  definition of what warrants an ADR at all. AWS/Richards-Ford's five categories are the standard.
- **No ADR-vs-PRD-vs-proposal routing rule.** Three surfaces exist (`docs/adr/` 66, `docs/prd/` 4,
  `docs/proposals/`) with a rule for only one boundary. Cosmos SDK's test is citable: *specific
  answerable question → ADR; exploration to find the questions → RFC.*
- **No root `AGENTS.md`.** Confirmed absent. `agents.md` is now a Linux Foundation standard under the
  Agentic AI Foundation (verified against LF and OpenAI press releases). Mild dogfooding sting: GSD's
  own installer writes `AGENTS.md` into *consumer* Codex projects.

**Prompt-layer rigor (the biggest external gap):**
- Anthropic's Agent Skills guidance: keep the always-loaded body under ~500 lines, references one
  level deep, TOC over 100 lines. **Adversarially WEAKENED in an important way:** GSD's *SKILL.md
  bodies* are `commands/gsd/*.md` — 71 files, largest 204 lines, all comfortably under 500. The
  1000–1679-line files are *workflows and subagent prompts* loaded into fresh contexts, which is a
  different budget. The real, confirmed hit is **8 nested reference edges** (references reached via
  another reference), which the guidance warns causes partial reads.
- **ADR-1610's load-bearing rationale is uncited.** It asserts context-rot and a Codex 32,768-byte
  `project_doc_max_bytes` cap with no URL (`grep -n http` → 0 matches). Both facts verified true
  against primary sources — so add the citations; the ADR isn't wrong, it's unfalsifiable as written.
- **Model catalog lags one generation.** `model-catalog.json` pins `claude-opus-4-8` at 8 sites;
  17 distinct model ids enumerated, **no `claude-opus-5`.** Not a broken reference (4-8 is not
  deprecated) — Opus-tier defaults are simply a generation behind.

---

## 7. Recommendations — sequenced, with the Artificer pass applied

Three laws fired on the *remediation set*, and they changed it materially.

> **Gall's Law** — the draft recommendation was "write ~12 new ADRs." That is a big-bang governance
> system. The corpus is a complex system that *works*; grow it. **Ship 2, learn, then expand.**
>
> **Goodhart's Law** — the corpus has *already lived this*: ADR-456's delete-bad-tests policy became
> an allowlist ratchet, which was its own Rejected Alternative (a). A mandatory
> `Confirmation: [test]` field will produce links to vacuous tests — ADR-550 already names that
> failure (*"a test that asserts the LLM's judgment is vacuous"*). So: **`Confirmation` is
> required only for ADRs that claim a code-enforceable invariant, and the linked test must fail when
> the invariant is violated** — not merely exist. Pair it with a second signal (does the check cite
> the ADR back at violators, as ADR-0002's does?).
>
> **Hyrum's Law** — tightening `gen-adr-index.cjs` breaks the existing corpus: 27 of 66 ADRs declare
> no H1 id. Backfill *first*, then flip the guard. Same for the capability gate: warn-then-reject
> across one minor.

### Tier 0 — do now (defects, not governance)

| # | Action | Why |
|---|---|---|
| 0.0 | **`src/runtime-hooks-surface.cts:1703` → `matcher: 'Read\|WebFetch\|WebSearch'`** (+ `:2133` Kimi, + installer/manifest parity assertion) | Injection scanner dormant for web content on the primary install path for all 15 runtimes |
| 0.1 | **Add `HOST_COMMAND_ROUTERS` keys to the overlay collision gate** (warn one minor → reject) | Documented invariant is false; empirically reproduced |
| 0.2 | **Supersede ADR-0001 and ADR-0006 into ADR-0174** as a dated amendment completing the SDK sweep | Two ADRs indexed "Active" decide nothing that exists |
| 0.3 | Fix 3 confirmed dead refs: `1239:99`, `src/plan-drift-guard.cts:5`, `CONTRIBUTING.md:105` | One ships in the payload; one is fabricated history |
| 0.4 | Fix ADR-857's H1 `[Proposed]` bracket | Contradicts its own ratified Status |

### Tier 1 — two ADRs, not twelve (Gall)

Pick the two with the highest ratio of *user-visible consequence* to *cost*:

1. **Telemetry / network egress policy.** Confirmed: the SessionStart hook unconditionally spawns a
   detached worker running `npm view` against the registry on every session, on 8+ runtimes, with
   **no env var, config key, TTL, or install flag opt-out anywhere.** Five ADRs have deferred the
   telemetry question and none decided it. Deciding "none, ever, except X" is a *valuable citable
   decision* for a tool installed into home directories — and organisations evaluating GSD need it.
2. **`.planning/` compatibility contract.** `gsd_state_version: '1.0'` is written into every user's
   STATE.md and preserved forever — and **read by nothing** (confirmed: 5 code sites, 2 writes, 1
   classification row, 2 comments, zero comparators). An inert version field is worse than none,
   because contributors infer a mechanism behind it. *(Note: ADR-1817 partially covers cross-version
   STATE.md reads — cite it rather than duplicating.)*

Ship those two. See what the process costs. **Then** decide whether the remaining ten are worth it.

### Tier 2 — corpus mechanics (cheap, high leverage)

- Add a **general-purpose relative-link checker** to `lint:generated-sync` (13 broken links today).
- Extend the bare-id scan to **body prose, ratcheted to the ambiguous subset only** (`0010`/`0011`) —
  that is the subset the rule was actually written for, and it avoids a corpus-wide reflow.
- Add **`Rejected`** to `STATUSES`.
- Decide whether **`Amends`** is first-class. If yes, add the `Amended by` reciprocal; if no, say so
  in README §3 so authors stop reaching for it.
- Add an H1-bracket-vs-Status check — **after** backfilling the 27 missing H1 ids.
- Fix the **status-qualifier blind spot**: a status of `Accepted (Phase 0 — ADR only)` whose phases
  have shipped is invisible to the gate.
- Schedule the ratification sweep as **recurring**, not the one-off dated 2026-07-17. A
  `--stale` mode reporting `Proposed` ADRs older than N days is the cheap version.

### Tier 3 — the strategic gap

**The prompt layer needs an architecture-of-record.** This is the corpus's structural blind spot and
the source of most Tier-1 candidates. Concretely, these contracts govern the whole product and are
recorded nowhere:

- the **agent return contract** — `gsd-core/references/agent-contracts.md` opens *"This doc describes
  what IS, not what should be"*, and orchestrators detect completion by filesystem side-effect
  spot-check while 8 agents emit ALL-CAPS H2 markers nobody parses;
- the **gates taxonomy** — `gates.md` declares *"every validation checkpoint maps to one of these
  four types"* and is loaded by **3 of 91 workflows**;
- the **context-budget policy** — opens *"Every workflow … must follow these rules"*, loaded by
  **1 of 91 workflows**;
- the **revision-loop bounds** — cap of 3, stall detection, escalate-never-fail; the load-bearing
  safety property of every quality loop, recorded only in prose;
- **behavioural prompt evaluation** — GSD gates *code* with mutation testing, property tests, and 70%
  coverage (ADR-456), and gates *prompts* with structural conformance only. 210 of 642 test files
  assert markdown string presence, not model behaviour. *(Nuance: ADR-550 D5 explicitly decides LLM
  behaviour is out of deterministic CI scope and is "validated by offline batteries" — no such
  battery is committed. So this is an unbuilt harness under an existing decision, not an ungoverned
  area. That framing makes it cheaper to propose.)*

Do **not** write five ADRs here. Write **one**: *"What kinds of artifact warrant an ADR"* — adopting
AWS/Richards-Ford significance criteria and stating explicitly that a prompt-layer contract is
ADR-worthy. That single decision unblocks the rest and is the corpus-scope fix, not a point fix.

---

## 8. Things deliberately NOT recommended

- **Do not migrate to MADR.** GSD's headings are CI-enforced; MADR's are not. Migrating trades a
  checked convention for an unchecked one.
- **Do not chase a byte cap on large ADRs.** 857/1239/550 are genuine multi-part decisions.
- **Do not raise the 100-char description cap on its own** — that re-triggers #3408 (dropped
  descriptions when stacking plugins). Cut the number of eagerly-listed skills first, then spend the
  recovered budget.
- **Do not add nested `AGENTS.md` emission** — speculative until a consumer asks.
- **Do not upgrade memtrace mid-audit** (0.8.3 → 0.8.63) — schema-mismatch hazard against the
  existing index.
- **Do not treat translation byte-ratios as a drift metric.** Adversarially weakened: `pt-BR/FEATURES.md`
  self-declares as a condensed overview linking to canonical English, `ja-JP/FEATURES.md` is 9%
  *larger* than English, and `CONTRIBUTING.md:277` declares translations community-maintained and
  exempt from per-PR updates. The honest finding is *inconsistent maintenance*, not 98% drift.

---

## 9. Filing readiness

Per the repo's P0–P6 contribution protocol, these are the findings with live reproductions ready for
P1 (verify) → P4 (issue):

| Finding | Repro state |
|---|---|
| Capability shadows host command | **Empirical repro exists** (fixture overlay + live dispatcher) |
| ADR-0001 / ADR-0006 should be Superseded | Grep-verifiable absence |
| 3 dead ADR references | `ls` / `git log` verifiable |
| `gsd_state_version` inert | 5-site enumeration verifiable |
| No update-check opt-out | Full read of 3 files; no guard found |

Everything else in this report is a governance recommendation and should go through the ADR process
itself, not a fix PR.

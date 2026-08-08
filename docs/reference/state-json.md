# `state.json` — GSD State Contract v1

`.planning/state.json` is a machine-readable snapshot of project state, published by GSD commands at every step boundary so external readers consume structured state instead of parsing `STATE.md` / `ROADMAP.md` markdown. This page documents the document shape, when it is written, and the guarantees a reader can rely on. See [docs index](../README.md).

---

## Overview

GSD's canonical state lives in Markdown (`STATE.md`, `ROADMAP.md`), which is written for humans and evolves freely. Tools that need to render project state — GSD Workbench is the first — previously re-implemented heuristic parsers over those files, and broke whenever the prose changed. `state.json` closes that gap: the skills own the file, readers never write it, and the document carries only fields with a declared meaning.

| | |
|---|---|
| **Path** | `.planning/state.json` (workstream-aware: resolved through the same `planningDir` seam as `STATE.md`) |
| **Contract version** | `1.0.0` (field `contract`) |
| **Produced by** | `state begin-phase` / `advance-plan` / `planned-phase` / `complete-phase` / `milestone-switch`, `phase add` / `add-batch` / `insert` / `remove` / `complete`, `milestone complete` |
| **Consumed by** | External readers (e.g. GSD Workbench). No GSD workflow reads it — it is a publication surface, not project memory. |
| **Source of truth** | `src/state-contract.cts` → `gsd-core/bin/lib/state-contract.cjs` |

The file is derived output. Deleting it is safe: the next step boundary republishes it.

---

## Document shape

```json
{
  "contract": "1.0.0",
  "flavor": "core",
  "milestone": "v1.11 — Hardening",
  "phases": [
    { "number": 1, "name": "Contract writer", "status": "complete" },
    { "number": 2, "name": "Boundary publishing", "status": "in_progress" },
    { "number": 3, "name": "Workbench reader", "status": "pending" }
  ],
  "next": {
    "command": "/gsd-execute-phase",
    "label": "Execute Phase 2",
    "reason": "Phase 2 is planned and ready to execute"
  },
  "updated_at": "2026-08-08T22:51:04.117Z"
}
```

### Field reference

| Field | Type | Meaning |
|---|---|---|
| `contract` | string | Contract version, currently `"1.0.0"`. Semver over the document shape — see [Versioning](#versioning). |
| `flavor` | `"core"` | Which GSD distribution produced the document. Lets a reader distinguish core from a downstream flavor without sniffing fields. |
| `milestone` | string \| null | Display string for the current milestone (`"<version> — <name>"`, or just the version when the roadmap gives no name). `null` when no milestone is resolvable. |
| `phases` | array | Ordered phases of the **current milestone** only. Empty when the roadmap declares none. |
| `phases[].number` | number | Phase number as it appears in `ROADMAP.md` (may be fractional for inserted phases, e.g. `4.5`). |
| `phases[].name` | string | Phase name, with the `(INSERTED)` marker stripped. |
| `phases[].status` | `"complete"` \| `"in_progress"` \| `"pending"` | See [Phase status derivation](#phase-status-derivation). |
| `next` | object \| null | The recommended next action, or `null` when the classifier recommends nothing. |
| `next.command` | string | Slash command to run (e.g. `/gsd-plan-phase`). |
| `next.label` | string | Short human-readable label for that action. |
| `next.reason` | string | Why it is recommended — the classifier's summary of current project state. |
| `updated_at` | string | ISO-8601 timestamp of the write. |

---

## Phase status derivation

`phases[]` is derived from `ROADMAP.md`, scoped to the current milestone section:

1. **Checklist bullets** are the primary source — `- [x] **Phase 3: Name** - description`. A checked box is `complete`; an unchecked box is `in_progress` when its number matches the current phase from `STATE.md`, otherwise `pending`.
2. **Detail headings** (`### Phase 4: Telemetry`) are merged in for phases that have no checklist bullet yet — `phase add` appends the heading form. They are never `complete`.
3. The merged list is sorted by phase number, so an inserted `4.5` lands between `4` and `5`.

A phase id that is not numeric (a milestone-prefixed `M2-01`, say) falls back to its position in the list, because `number` is typed as a number in v1.

---

## `next` and the smart-entry classifier

`next` is not computed separately: it is the recommended action from the same smart-entry classifier that powers the `/gsd` front door, so the JSON and the interactive front door can never disagree about what to run. `next.reason` is the classifier's project summary rather than a per-action rationale.

Because the document is only rewritten at step boundaries, `next` can go stale after out-of-band edits (hand-editing `ROADMAP.md`, for instance). It is refreshed at the next boundary. Readers that need certainty should treat `next` as a hint and `updated_at` as its age.

---

## Write semantics

Writes are **best-effort and never fail the parent command**. `writeStateContract(cwd)` returns a boolean and swallows every error:

- Returns `false` and writes nothing when there is no `.planning/` directory or no `ROADMAP.md` (nothing meaningful to publish).
- Returns `false` on any read, derive, or write error. The failure is silent by design — a broken snapshot must not break a phase transition, and the next boundary retries.
- Returns `true` when the document was written (pretty-printed with a trailing newline).

The file is rewritten in full each time; there is no merge with a previous document, so a reader never sees a partially updated state.

---

## Versioning

`contract` is semver over the document shape:

- **Patch / minor (`1.x`)** — additive only: new optional fields, new enum members on existing fields. Readers must accept any `1.x` and ignore fields they do not recognise.
- **Major** — any removal, rename, or meaning change. A reader that only understands `1.x` should refuse a `2.x` document rather than guess.

---

## Related

- [STATE.md schema](state-md.md) — the human-facing state file this snapshot is derived from
- [Planning artifacts](planning-artifacts.md) — every `.planning/` file and its role
- [docs index](../README.md)

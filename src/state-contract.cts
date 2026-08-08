/**
 * GSD State Contract v1 writer — `.planning/state.json`.
 *
 * Machine-readable project state that external tools (GSD Workbench,
 * ADR-0002/ADR-0004 in gsd-workbench) read instead of parsing STATE.md /
 * ROADMAP.md. The skills own the file; readers never write it. Called
 * best-effort at every step boundary (phase transitions, plan completion,
 * milestone completion, roadmap edits) by the state/phase/milestone command
 * implementations — a failure here must never fail the parent command.
 *
 * Contract: gsd-workbench/docs/state-contract/v1.md. Semver: additive minor
 * changes only under "1.x"; readers accept any 1.x and ignore unknown fields.
 */

import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import planningWorkspace = require('./planning-workspace.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import roadmapParserMod = require('./roadmap-parser.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import smartEntryMod = require('./smart-entry.cjs');
import { platformReadSync, platformWriteSync } from './shell-command-projection.cjs';
import { realClock } from './clock.cjs';
import type { Clock } from './clock.cjs';

const { planningDir } = planningWorkspace;
const { extractCurrentMilestone, getMilestoneInfo } = roadmapParserMod;
const { classifyProject } = smartEntryMod;

export type ContractPhaseStatus = 'complete' | 'in_progress' | 'pending';

export interface ContractPhase {
  number: number;
  name: string;
  status: ContractPhaseStatus;
}

export interface StateContractV1 {
  contract: string;
  flavor: 'core';
  milestone: string | null;
  phases: ContractPhase[];
  next: { command: string; label: string; reason: string } | null;
  updated_at: string;
}

/**
 * The roadmapper's phase checklist entry: `- [x] **Phase 3: Name** - desc`
 * (separator may be colon, hyphen, en-dash, or em-dash; checkbox any case).
 * Matches the bullet grammar phase.cts writes and flips (#2199 family).
 */
const PHASE_CHECKLIST_LINE = /^\s*[-*]\s+\[([ xX])\]\s+\*\*Phase\s+([\w][\w.-]*)(?:\s*\([^)\n]{0,200}\))?\s*[:—–-]\s*(.+?)\*\*/;

/** A phase detail heading (`### Phase 4: Telemetry`) — the form `phase add` appends. */
const PHASE_HEADING_LINE = /^#{2,4}\s*Phase\s+([\w][\w.-]*)\s*[:—–-]\s*(.+)$/;

/**
 * Derive the ordered phase list from ROADMAP.md, scoped to the current
 * milestone. Primary source is the checkbox checklist: `[x]` ⇒ complete; the
 * unchecked phase matching STATE.md's current phase ⇒ in_progress; remaining
 * unchecked ⇒ pending. Phases that only exist as `### Phase N:` detail
 * headings (`phase add` appends those without a checklist bullet) are merged
 * in as pending/in_progress.
 */
export function derivePhases(roadmapContent: string, cwd: string, currentPhase: number | null): ContractPhase[] {
  const scoped = extractCurrentMilestone(roadmapContent, cwd);
  const phases: ContractPhase[] = [];
  const statusFor = (complete: boolean, number: number): ContractPhaseStatus =>
    complete ? 'complete' : number === currentPhase ? 'in_progress' : 'pending';

  for (const line of scoped.split('\n')) {
    const m = line.match(PHASE_CHECKLIST_LINE);
    if (!m) continue;
    const parsed = Number.parseFloat(m[2]);
    // ponytail: non-numeric phase ids (milestone-prefixed "M2-01") fall back to
    // list position; extend to string numbers if the contract ever allows them.
    const number = Number.isFinite(parsed) ? parsed : phases.length + 1;
    phases.push({ number, name: m[3].trim(), status: statusFor(m[1].toLowerCase() === 'x', number) });
  }

  for (const line of scoped.split('\n')) {
    const m = line.match(PHASE_HEADING_LINE);
    if (!m) continue;
    const number = Number.parseFloat(m[1]);
    if (!Number.isFinite(number) || phases.some((p) => p.number === number)) continue;
    const name = m[2].replace(/\(INSERTED\)/i, '').trim();
    phases.push({ number, name, status: statusFor(false, number) });
  }

  return phases.sort((a, b) => a.number - b.number);
}

/** Milestone display string ("v1.1 — Hardening"), or null when unknown. */
function milestoneDisplay(cwd: string): string | null {
  const info = getMilestoneInfo(cwd);
  if (!info || !info.version) return null;
  return info.name && info.name !== 'milestone' ? `${info.version} — ${info.name}` : info.version;
}

/**
 * Build the contract document from what is on disk right now. Returns null
 * when the project has no ROADMAP.md yet (nothing meaningful to publish).
 */
export function buildStateContract(cwd: string, clock: Clock = realClock): StateContractV1 | null {
  const roadmap = platformReadSync(path.join(planningDir(cwd), 'ROADMAP.md'));
  if (roadmap === null) return null;

  // Reuse the /gsd front-door classifier so `next` matches what gsd-next
  // routes (ADR-0004): recommended action + its human summary as the reason.
  const entry = classifyProject(cwd);
  const recommended = entry.actions.find((a: { id: string; recommended: boolean }) => a.id === entry.recommended);

  return {
    contract: '1.0.0',
    flavor: 'core',
    milestone: milestoneDisplay(cwd),
    phases: derivePhases(roadmap, cwd, entry.signals.current_phase),
    next: recommended
      ? { command: recommended.command, label: recommended.label, reason: entry.summary }
      : null,
    updated_at: clock.nowIso(),
  };
}

/**
 * Write `.planning/state.json`. Best-effort: returns true when written, false
 * when skipped (no `.planning/`, no ROADMAP.md) or on any error — never throws.
 */
export function writeStateContract(cwd: string | undefined | null, clock: Clock = realClock): boolean {
  if (!cwd) return false;
  try {
    const dir = planningDir(cwd);
    if (!fs.existsSync(dir)) return false;
    const doc = buildStateContract(cwd, clock);
    if (doc === null) return false;
    platformWriteSync(path.join(dir, 'state.json'), JSON.stringify(doc, null, 2) + '\n');
    return true;
  } catch {
    // A broken snapshot must never fail the mutating command that triggered
    // it; the file is refreshed at the next step boundary (ADR-0004).
    return false;
  }
}

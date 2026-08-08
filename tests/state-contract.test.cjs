/**
 * GSD State Contract v1 writer (.planning/state.json).
 *
 * Contract: gsd-workbench/docs/state-contract/v1.md — the skills write the
 * file at every step boundary; readers (GSD Workbench) prefer it over parsing
 * markdown. These tests pin the schema shape, the ROADMAP-checkbox phase
 * derivation, and that the boundary commands (state begin-phase, phase add,
 * phase complete) actually publish the file.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const { buildStateContract, writeStateContract, derivePhases } = require('../gsd-core/bin/lib/state-contract.cjs');
const { classifyProject } = require('../gsd-core/bin/lib/smart-entry.cjs');

const ROADMAP = [
  '# Roadmap',
  '',
  '## v1.1 — Hardening',
  '',
  '- [x] **Phase 1: Schema** - lock the shape',
  '- [ ] **Phase 2: Reader** - parse it',
  '- [ ] **Phase 3: Upstream** - ship it',
  '',
  '## Progress',
  '',
  '| Phase | Plans Complete | Status | Completed |',
  '|-------|----------------|--------|-----------|',
  '| 1. Schema | 2/2 | Complete | 2026-08-01 |',
  '| 2. Reader | 0/2 | In Progress | - |',
  '| 3. Upstream | 0/1 | Not started | - |',
  '',
].join('\n');

const STATE = [
  '---',
  'milestone: v1.1',
  'current_phase: 2',
  'status: executing',
  '---',
  '',
  '# Session State',
  '',
  '## Current Position',
  '',
  'Phase: 2 (Reader) — EXECUTING',
  'Status: Executing phase 2',
  '',
].join('\n');

function writePlanning(tmpDir, { roadmap = ROADMAP, state = STATE } = {}) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), state);
}

function readContract(tmpDir) {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning', 'state.json'), 'utf-8'));
}

describe('state contract v1 — builder', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('emits the v1 schema derived from ROADMAP checkboxes and STATE.md', () => {
    writePlanning(tmpDir);
    const doc = buildStateContract(tmpDir);

    assert.equal(doc.contract, '1.0.0');
    assert.equal(doc.flavor, 'core');
    assert.equal(doc.milestone, 'v1.1 — Hardening');
    assert.deepEqual(doc.phases, [
      { number: 1, name: 'Schema', status: 'complete' },
      { number: 2, name: 'Reader', status: 'in_progress' },
      { number: 3, name: 'Upstream', status: 'pending' },
    ]);
    assert.ok(!Number.isNaN(Date.parse(doc.updated_at)), `updated_at not ISO: ${doc.updated_at}`);
  });

  test('next matches what the /gsd front door (smart-entry) routes', () => {
    writePlanning(tmpDir);
    const doc = buildStateContract(tmpDir);
    const entry = classifyProject(tmpDir);
    const recommended = entry.actions.find((a) => a.id === entry.recommended);

    assert.ok(doc.next, 'next missing');
    assert.equal(doc.next.command, recommended.command);
    assert.equal(doc.next.label, recommended.label);
    assert.equal(typeof doc.next.reason, 'string');
    assert.ok(doc.next.reason.length > 0);
  });

  test('returns null when ROADMAP.md is absent, and writeStateContract skips', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), STATE);
    assert.equal(buildStateContract(tmpDir), null);
    assert.equal(writeStateContract(tmpDir), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.planning', 'state.json')), false);
  });

  test('writeStateContract never throws for a directory without .planning', () => {
    const bare = fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()), 'gsd-noplan-'));
    try {
      assert.equal(writeStateContract(bare), false);
      assert.equal(writeStateContract(null), false);
    } finally {
      cleanup(bare);
    }
  });

  test('decimal phase numbers survive as numbers', () => {
    const phases = derivePhases(
      '- [x] **Phase 2: Base** - done\n- [ ] **Phase 2.1: Hotfix** - urgent\n',
      tmpDir,
      null,
    );
    assert.deepEqual(phases.map((p) => p.number), [2, 2.1]);
    assert.deepEqual(phases.map((p) => p.status), ['complete', 'pending']);
  });

  test('em-dash and hyphen separators both parse; checkbox case-insensitive', () => {
    const phases = derivePhases(
      '- [X] **Phase 1 — Alpha** - a\n- [ ] **Phase 2 - Beta** - b\n',
      tmpDir,
      null,
    );
    assert.deepEqual(phases, [
      { number: 1, name: 'Alpha', status: 'complete' },
      { number: 2, name: 'Beta', status: 'pending' },
    ]);
  });
});

describe('state contract v1 — step-boundary publishing', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('state begin-phase writes .planning/state.json', () => {
    writePlanning(tmpDir);
    const result = runGsdTools('state begin-phase --phase 2 --name reader --plans 2', tmpDir);
    assert.ok(result.success, `begin-phase failed: ${result.error}`);
    const doc = readContract(tmpDir);
    assert.equal(doc.contract, '1.0.0');
    assert.equal(doc.phases.find((p) => p.number === 2).status, 'in_progress');
  });

  test('phase add (roadmap edit) refreshes state.json with the new phase', () => {
    writePlanning(tmpDir);
    const result = runGsdTools('phase add "Telemetry"', tmpDir);
    assert.ok(result.success, `phase add failed: ${result.error}`);
    const doc = readContract(tmpDir);
    const added = doc.phases.find((p) => p.name.includes('Telemetry'));
    assert.ok(added, `new phase missing from state.json: ${JSON.stringify(doc.phases)}`);
    assert.equal(added.status, 'pending');
  });

  test('phase complete flips the phase to complete in state.json', () => {
    writePlanning(tmpDir);
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '02-reader');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, '2-VERIFICATION.md'),
      ['---', 'status: passed', '---', '', '# Verification', ''].join('\n'),
    );
    const result = runGsdTools('phase complete 2', tmpDir);
    assert.ok(result.success, `phase complete failed: ${result.error}`);
    const doc = readContract(tmpDir);
    assert.equal(doc.phases.find((p) => p.number === 2).status, 'complete');
  });
});

---
type: Added
pr: 3228
---
GSD commands now publish a machine-readable state snapshot to .planning/state.json (State Contract v1, contract 1.0.0) at every step boundary — phase transitions, plan completion, milestone completion, and roadmap edits — so external readers like GSD Workbench no longer parse STATE.md/ROADMAP.md markdown

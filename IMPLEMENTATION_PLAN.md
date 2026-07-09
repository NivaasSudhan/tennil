# IMPLEMENTATION_PLAN.md — Day 1–7 build order

Each day has a **verification gate**. Do not start the next day until the gate passes. Task ids (T-0xx) are defined in TASKS.md. Commands assume repo root; see CLAUDE.md for the verify command list.

## Day 1 — Data + config foundation
**Tasks**: T-001 (scaffold), T-002 (types + position map), T-003 (squads data), T-004 (loader/validation), T-005 (thresholds config)
**Dependencies**: none.
**Gate**:
- [ ] `npm run build` and `npm test` pass on scaffold
- [ ] `squads.json` has 7 squads × 11 players, validates clean via `loadGameData`
- [ ] Rating methodology from ADR-006 applied; anchors match; deviations noted in RISKS
- [ ] `thresholds.json` + `position-map.json` load and validate; every failure mode in ARCHITECTURE.md §6 has a rejecting test

## Day 2 — Draft state machine
**Tasks**: T-006 (rng), T-007 (state machine + tests)
**Dependencies**: Day 1 (types, loader).
**Gate**:
- [ ] `tests/draft.test.ts` proves: 11 picks no-skip = 11 rounds; with skip = 12 rounds; all illegal actions throw; arithmetic invariants hold after every transition; forced repeats populate `breachLog`
- [ ] Full drafts run headless with `mulberry32` seeds (no UI needed)

## Day 3 — Scoring
**Tasks**: T-008 (pure calculator + fixtures)
**Dependencies**: Day 1 config, Day 2 `FinalXI`.
**Gate**:
- [ ] `tests/scoring.test.ts` fixtures pass: top band, weak-link failure, empty bucket, minCounts failure, priority order, fallback
- [ ] 10-0 is NOT trivial: a fixture XI of straight mid-80s players does not reach the top band with seed thresholds
- [ ] Zero RNG imports anywhere under `src/domain/scoring/` (grep check)

## Day 4–5 — Draft UI
**Tasks**: T-009 (app shell + boot error screen), T-010 (draft screen), T-011 (result flow stub)
**Dependencies**: Days 1–3.
**Gate (end of Day 5)**:
- [ ] Full draft loop completes in the browser: reveal grid → pick/skip → running squad grouped by bucket → lock at 11
- [ ] Skip button disabled after use; picked players disabled on repeat reveals; UI never bypasses domain API
- [ ] Corrupted `squads.json` (manual test) shows boot-error screen, not a blank draft

## Day 6 — Commentary + result presentation
**Tasks**: T-012 (commentary.json all bands), T-013 (buildCommentary + playthrough UI)
**Dependencies**: Day 3 bands, Day 5 UI.
**Gate**:
- [ ] Every band id in `thresholds.json` has a script; boot validation enforces it
- [ ] Playthrough renders beats in order then the final scoreline; slot interpolation deterministic (same XI twice → identical text)
- [ ] Grep check: no RNG under `src/domain/commentary/`

## Day 7 — Rarity tune + deploy
**Tasks**: T-014 (simulation harness), T-015 (tune thresholds), T-016 (deploy)
**Dependencies**: everything.
**Gate**:
- [ ] `npx tsx scripts/simulate.ts` runs ≥ 500 seeded greedy-bot drafts, prints band histogram
- [ ] Thresholds retuned (config edits ONLY) until top band ≈ 5–7% of greedy-bot drafts; before/after histograms recorded in RISKS_AND_UNKNOWNS.md §Experiment log
- [ ] `npm run build && npm run preview` serves the working game locally
- [ ] Live GitHub Pages URL recorded in CLAUDE.md

## Dependency graph (summary)

```
T-001 ─► T-002 ─► T-003 ─► T-004 ─► T-005
                     │        └──► T-007 ◄── T-006
                     │                │
                     │                ▼
                     └────────► T-008 ─► T-010/T-011 (needs T-009)
                                  │            │
                                  ▼            ▼
                               T-012 ─► T-013 ─► T-014 ─► T-015 ─► T-016
```

If interrupted mid-day: finish the current task, run `npm test`, update TASKS.md checkboxes and the `NEXT:` line in CLAUDE.md.

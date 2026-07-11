# Three Features — Execution Index (refined)

> **For Fable / subagent orchestration.** Ingest this index + the three plan files + locked docs + current source before Phase 0 refinement. Plans are strong drafts, not final authority — revise sequencing/guardrails if judgment says so; surface invariant deviations as ADR recommendations.

**Status:** subject to Phase 0 refinement before execution.  
**Baseline:** 80 unit tests green (2026-07-11); corpus 16 squads; Sprint-1 complete.

## Features (locked product decisions)

| # | Feature | Product rule | Domain? | ADR |
|---|---------|--------------|---------|-----|
| 1 | Permanent skip-exclude | One skip token; skipped `squadId` never re-reveals this session; resets on new draft | Yes | Amend ADR-003 |
| 2 | Formation choice | After Start / Draft Again, before first reveal; soft scoring via formation `minCounts` | Yes | ADR-017 |
| 3 | Progressive live score | Scoreboard 0-0 → ticks with goal-type beats toward fixed `bandId` | No (UI only) | None |

## Execution order (recommended)

```
1. Skip permanent exclude   → domain only, ADR-003 amend, validates state-machine change
2. Formation choice         → config + domain + UI; scoreBand API stays stable (config-view pattern)
3. Progressive live score   → ResultScreen + Scoreboard only; independent of 1–2
```

**Why this order:** (1) is smallest pure-domain change and exercises `DraftSession` field growth before formation adds another field. (2) depends on clean `startDraft` signature evolution. (3) has zero domain coupling — can run parallel to (2) after Phase 0 if Fable wants.

## Plan files (absolute paths)

| Plan | Path |
|------|------|
| Index (this) | `/Users/nivaassudhan/Desktop/code/games/fifaTenZero/docs/plans/2026-07-11-three-features-index.md` |
| Skip exclude | `/Users/nivaassudhan/Desktop/code/games/fifaTenZero/docs/plans/2026-07-11-skip-permanent-exclude.md` |
| Formation | `/Users/nivaassudhan/Desktop/code/games/fifaTenZero/docs/plans/2026-07-11-formation-choice.md` |
| Live score | `/Users/nivaassudhan/Desktop/code/games/fifaTenZero/docs/plans/2026-07-11-progressive-live-score.md` |

## Cross-cutting challenges (do not ignore)

### C1 — Degenerate corpus vs permanent exclude
With corpus size 1, skip then *must* re-reveal the only squad. Permanent exclude **cannot** be absolute. Rule: honor exclude while any non-excluded squad remains; last resort (empty pool) allows excluded and logs breach. Tests must cover corpus(1) + skip.

### C2 — Do not widen scoreBand / evaluateBandPredicates signatures
Passing `formations?` + `formationId?` through every scoring fn breaks ADR-013's "one evaluator, two consumers" cleanliness and forces sim/explain/tests cascade. **Resolve minCounts once into a ThresholdConfig view** at the call site (`withFormationMinCounts`). `scoreBand(input, config)` and `explainScoreBand(input, config)` stay two-arg.

### C3 — Draft Again vs formation gate
Sprint-1 taste: Draft Again skips landing (zero replay friction). Product decision: formation pick happens after Start **and** Draft Again. Resolution: Draft Again returns to a **formation-only gate** (not full StartScreen blurb), pre-selects last formation, one click → new draft. Landing blurb only on first visit (`session === null` first paint).

### C4 — Commentary goal beats ≠ scoreline goals
Real scripts: `10-0` has **2** `type:"goal"` beats for 10 home goals; `0-4` mixes goal + drama; `3-1` away goal is `drama` text. Linear "one goal per goal-beat" is wrong. Plan 3 uses **proportional fill** over goal-type beats toward parsed `bandId`, snap to exact H-A when `showScoreline`. Document imperfect mid-feed match as accepted.

### C5 — Touch surfaces for GameData shape change
If `GameData` gains `formations`, update **all** of:
- `src/main.tsx` load
- `scripts/simulate.ts` `loadGameDataFromDisk`
- `tests/draft.test.ts` `makeData`
- `tests/scoring.test.ts` / loadData fixtures
- any other `GameData` constructors

Prefer embedding formations **inside** `thresholds.json` (already has `referenceFormation` + `minCounts`) to avoid a fifth boot JSON — Fable may choose separate file; call out tradeoff in formation plan.

### C6 — App.tsx restart paths
Today: `handleStart` and `handleRestart` both call `startDraft(data, systemRng())` with no formation. Both must gain formationId. `StartScreen` props today: `{ onStart: () => void }` — tests in `tests/startScreen.test.tsx` break on signature change; update in same task.

## Global invariants (every PR)

```
- 11 picks, 1 skip token
- Pure scoring/commentary; RNG draft-only
- Config-driven numbers; no magic in engine
- Compute-once ResultScreen useMemo (score + commentary before timers)
- Landing/formation gate = UI state, never DraftSession phase
- No client-side router
```

Purity greps after each feature:

```bash
grep -rn "Math.random\|rng" src/domain/scoring src/domain/commentary
grep -rn "from 'react'\|from \"react\"" src/domain src/lib
```

## Verification gate (all three shipped)

- [ ] `npm test` green
- [ ] `npm run build` green
- [ ] Purity greps clean
- [ ] Manual: formation picker → draft → skip never re-shows that squad → result progressive board → Draft Again re-picks formation
- [ ] ADR-003 amend + ADR-017 written in DECISIONS.md
- [ ] ARCHITECTURE.md §3/§4 signatures updated

## Phase 0 exit for Fable

- [ ] Reviewed plans + `session.ts` / `scoreBand.ts` / `ResultScreen.tsx` / `commentary.json` / ADR-003
- [ ] Revised plan or "no major changes" verdict
- [ ] Degenerate corpus rule + scoreBand config-view pattern accepted or ADR-justified alternative
- [ ] Subagents launched only after this index accepted

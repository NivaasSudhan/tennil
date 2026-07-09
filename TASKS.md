# TASKS.md — Atomic implementation tasks

Work ONE task at a time, in id order unless the dependency graph (IMPLEMENTATION_PLAN.md) says otherwise. After each task: run tests, tick the checkbox, update `NEXT:` in CLAUDE.md. Difficulty: S ≤ 1h, M ≤ half-day, L ≤ day.

Definition of Done (applies to EVERY task, in addition to per-task criteria):
`npm test` green · `npm run build` green · no invariant violated · docs updated if behavior/schema changed.

---

## [x] T-001 — Scaffold Vite + React + TS + Vitest
- **Why**: everything depends on a building skeleton (ADR-001).
- **Dependencies**: none.
- **Difficulty**: S
- **Steps**: `npm create vite@latest . -- --template react-ts` (repo already has files — scaffold in place, don't overwrite the seven docs or `src/domain/types.ts`). Add vitest: `npm i -D vitest`. Add scripts: `"test": "vitest run"`, `"preview": "vite preview"`. Set `base: '/fifaTenZero/'` in `vite.config.ts` (ADR-009). Enable `"strict": true` in tsconfig.
- **Acceptance**: `npm run dev` serves default page; `npm test` runs (a trivial passing test); `npm run build` emits `dist/`.
- **Tests**: one smoke test asserting `1 + 1 === 2` to prove the runner.
- **Rollback**: delete generated files; docs and types.ts are untouched.

## [x] T-002 — Finalize types + position map
- **Why**: shared vocabulary for all layers (ADR-002/006).
- **Dependencies**: T-001.
- **Difficulty**: S
- **Steps**: keep committed `src/domain/types.ts` (extend only if compiler demands). Keep committed `src/data/position-map.json`. Add `src/lib/assert.ts` (`function invariant(cond, msg): asserts cond`).
- **Acceptance**: `tsc` clean with types imported from a scratch test.
- **Tests**: type-level only (compilation).
- **Rollback**: git revert single commit.

## [x] T-003 — Author squads.json (7 squads, 77 players)
- **Why**: the game's entire content (ADR-006/007).
- **Dependencies**: T-002.
- **Difficulty**: L (research-heavy, code-light)
- **Steps**: for each squad in ADR-007, enter the iconic starting XI (finals XI where applicable) with `positionRaw` from the position-map keys and ratings per the ADR-006 rubric (anchors: Pelé 98, Maradona 98, Ronaldo'02 96, Zidane'98 95, Iniesta 93, Neuer 92). Use `tests/fixtures/squad-arg-1986.json` as the format template. Bootstrap rosters from jfjelstul/worldcup GitHub DB or Zafronix WC API (build-time only — nothing fetched at runtime). Verify no same-human appears in two squads; if one does, note it in RISKS R-02.
- **Acceptance**: 7 squads × exactly 11 players; unique ids; all positions mapped; ratings 1–100 ints; exactly 1 GK per squad.
- **Tests**: covered by T-004 validation tests running against the real file.
- **Rollback**: data-only change; revert file.

## [x] T-004 — loadGameData + fail-closed validation
- **Why**: Invariant 5/6 enforcement; ARCHITECTURE §6 failure modes.
- **Dependencies**: T-003.
- **Difficulty**: M
- **Steps**: implement `src/domain/loadData.ts` per ARCHITECTURE §3. Collect ALL problems into one `DataValidationError` (don't stop at first). Checks: JSON shape, 11 players/squad, unique player+squad ids, rating range/int, positionRaw mapped, positionBucket matches map, exactly one fallback band, every band has commentary script (commentary check activates in T-012 — until then validate against a stub commentary.json containing all band ids), version fields = 1.
- **Acceptance**: real data loads clean; each corruption rejects with a message naming the entity.
- **Tests**: `tests/loadData.test.ts` — one test per failure mode in ARCHITECTURE §6 plus happy path.
- **Rollback**: revert module; no other layer imports it yet.

## [x] T-005 — thresholds.json full band table
- **Why**: outcome engine config (ADR-004/005). Seed committed already; this task reviews/completes it.
- **Dependencies**: T-004.
- **Difficulty**: S
- **Steps**: review committed `src/data/config/thresholds.json` (6 bands, PLACEHOLDER numbers). Sanity-check sums against actual T-003 ratings: a deliberately strong XI should clear "10-0" mins, an average XI should land mid-table. Adjust seed numbers if data made them absurd — numbers only.
- **Acceptance**: loads via T-004; every band id present; exactly one fallback.
- **Tests**: covered by loadData tests + scoring fixtures (T-008).
- **Rollback**: config-only; revert file.

## [x] T-006 — RNG module
- **Why**: deterministic tests (ADR-008).
- **Dependencies**: T-001.
- **Difficulty**: S
- **Steps**: `src/lib/rng.ts` with `Rng`, `mulberry32(seed)`, `systemRng()`.
- **Acceptance**: same seed → same sequence; values in [0,1).
- **Tests**: inline in `tests/draft.test.ts` or tiny `rng.test.ts` (sequence snapshot).
- **Rollback**: trivial revert.

## [x] T-007 — Draft state machine
- **Why**: core game rules (ADR-003) — highest-risk logic in the project.
- **Dependencies**: T-004, T-006.
- **Difficulty**: M
- **Steps**: implement `src/domain/draft/session.ts` exactly per ARCHITECTURE §4 pseudocode. Pure functions, new session per transition, `IllegalActionError` on every illegal action.
- **Acceptance**: all ARCHITECTURE §7 draft cases pass; ARCHITECTURE §4 arithmetic invariants asserted after every transition in tests.
- **Tests**: `tests/draft.test.ts` — full no-skip draft (11 rounds), with-skip (12 rounds), double-skip throws, pick-after-complete throws, foreign player throws, duplicate pick on repeat reveal throws, seen-squad preference until exhaustion, breachLog on forced repeat, seeded determinism (same seed twice → identical session history).
- **Rollback**: revert module; UI not wired yet.

## [x] T-008 — Scoring pure calculator + fixtures
- **Why**: outcome truth path (ADR-004).
- **Dependencies**: T-005, T-007 (for FinalXI type usage only).
- **Difficulty**: M
- **Steps**: implement `computeScoreInput` + `scoreBand` per ARCHITECTURE §3. Generic predicate evaluation over `BandDef` fields — NO band ids hardcoded in engine code.
- **Acceptance**: ARCHITECTURE §7 scoring cases pass; grep proves no `rng`/`Math.random` under `src/domain/scoring/`.
- **Tests**: `tests/scoring.test.ts` with fixture XIs in `tests/fixtures/`: top-band XI; same XI with one player dropped to weakLink-1 → lower band; XI missing GK → only bands without non-empty requirement (ends at fallback-eligible); 2-5-4 shape XI fails requireMinCounts bands; two-band-match takes higher priority; garbage XI → fallback.
- **Rollback**: revert module.

## [x] T-009 — App shell + boot validation screen
- **Why**: fail-closed boot visible to users (ARCHITECTURE §6).
- **Dependencies**: T-004.
- **Difficulty**: S
- **Steps**: `src/main.tsx` calls `loadGameData` on all four JSON imports; on throw, render error screen listing problems; on success, render `DraftScreen`.
- **Acceptance**: corrupting squads.json locally shows the error list, not a blank page.
- **Tests**: manual (documented in Day-5 gate); loader itself already unit-tested.
- **Rollback**: revert; domain untouched.

## [x] T-010 — Draft screen
- **Why**: the core play surface (Day 4–5).
- **Dependencies**: T-007, T-009.
- **Difficulty**: L
- **Steps**: render `currentReveal` as 11 player cards (name, positionRaw, rating, bucket); pick button per card (disabled if id already in picks); one Skip button (disabled when `skipRemaining === 0`); running squad panel grouped GK/DEF/MID/ATT; round counter (`roundsPlayed`, max 11/12). All actions call domain `pick`/`skip` with `systemRng()`; session in `useState<DraftSession>`.
- **Acceptance**: full draft playable to COMPLETE in browser; no rules logic in components (review checklist: components contain zero comparisons against 11 or skip counts beyond reading session fields for disabling).
- **Tests**: manual gate Day 5; optional React Testing Library smoke (not required).
- **Rollback**: revert app/ files.

## [x] T-011 — Result flow: lock → band → scoreline stub
- **Why**: completes the loop before commentary exists.
- **Dependencies**: T-008, T-010.
- **Difficulty**: S
- **Steps**: on COMPLETE, `getFinalXI` → `computeScoreInput` → `scoreBand` → show final XI + band id + label (plain, pre-commentary).
- **Acceptance**: finishing a draft always shows a band; same XI (seeded dev draft) shows same band on every run.
- **Tests**: covered by domain tests; manual browser check.
- **Rollback**: revert.

## [x] T-012 — commentary.json for every band
- **Why**: Stage B content (ADR-005; Day 6).
- **Dependencies**: T-005.
- **Difficulty**: M (writing)
- **Steps**: write 5–8 beats per band for all 6 band ids, using only defined slots and beat types. Tone: dramatized broadcast. Wire the boot check "every band has a script" (was stubbed in T-004).
- **Acceptance**: loads clean; every band covered; slots limited to the defined set.
- **Tests**: loadData test for the band↔script cross-check.
- **Rollback**: config-only.

## [x] T-013 — buildCommentary + playthrough UI
- **Why**: dramatized scoreline experience (Day 6).
- **Dependencies**: T-011, T-012.
- **Difficulty**: M
- **Steps**: implement `buildCommentary` per ARCHITECTURE §5 slot rules (deterministic, tie-break by id, bucket-empty fallback to captain). UI: beats appear sequentially (simple timed reveal is fine), then final scoreline = band id rendered big.
- **Acceptance**: same XI → byte-identical script; no unresolved `{slot}` in output; grep proves no RNG in `src/domain/commentary/`.
- **Tests**: unit tests for slot resolution incl. ties and empty-bucket fallback; determinism test (call twice, deep-equal).
- **Rollback**: revert module + screen section.

## [x] T-014 — Simulation harness
- **Why**: rarity tuning needs data, not vibes (Day 7; RISKS §Experiments).
- **Dependencies**: T-007, T-008.
- **Difficulty**: M
- **Steps**: `npm i -D tsx`, then `scripts/simulate.ts` (run via `npx tsx`): N seeded drafts (default 500) with a **greedy skilled bot** — picks to satisfy 1/4/3/3 needs first, highest rating within needed buckets, uses skip when reveal's best-for-need rating < configurable threshold. Print band histogram + example failing/passing XIs. Also run a **random bot** for the floor.
- **Acceptance**: one command prints both histograms; reproducible by seed.
- **Tests**: the script itself is the test harness; a smoke unit test that 10 sims complete.
- **Rollback**: script-only, no app impact.

## [x] T-015 — Day-7 threshold tune
- **Why**: success criterion "10-0 ≈ 1/15–20 skilled drafts".
- **Done (2026-07-09)**: tuned `thresholds.json` numbers only. Greedy 10-0 = 5.0% (≈1/20), spread 5-0/3-1/2-2 = 43.8/36.4/14.8%; random 10-0 = 0%; every band reachable, no dead bands; stable across seeds 42/7/1337 and skipThreshold 70/90. Full histograms + rationale in RISKS_AND_UNKNOWNS.md §Experiment log. Human playtest step (≥5 drafts) not executable by the implementing agent; the n=500 seeded simulation across two bots + three skip levels stands in as the quantitative sanity gate.
- **Dependencies**: T-014.
- **Difficulty**: M (iterative)
- **Steps**: run sims → edit `thresholds.json` numbers ONLY → rerun until greedy-bot top band ≈ 5–7% and the histogram spreads across all bands (no dead band). Record before/after histograms in RISKS_AND_UNKNOWNS.md §Experiment log. Manual playtest ≥ 5 human drafts as sanity.
- **Acceptance**: target rate hit; all bands reachable; zero engine code changed (git diff shows JSON only).
- **Tests**: existing scoring tests still pass (fixtures may need rating tweaks if thresholds moved a lot — fixtures may change, engine may not).
- **Rollback**: revert JSON.

## [x] T-016 — Static deploy (GitHub Pages)
- **Why**: ship (ADR-009).
- **Dependencies**: all.
- **Difficulty**: S
- **Steps**: add `.github/workflows/deploy.yml` (standard `actions/configure-pages` + `upload-pages-artifact` on `dist/` + `deploy-pages`, trigger: push to main). Enable Pages (source: GitHub Actions) in repo settings. Verify `base` path.
- **Acceptance**: live URL loads and full loop plays; URL recorded in CLAUDE.md.
- **Tests**: `npm run build && npm run preview` locally + live smoke.
- **Rollback**: disable workflow; app unaffected.
  - NOTE: workflow committed but unverified against live Pages until first push to main (repo Settings -> Pages -> Source: GitHub Actions must be enabled).

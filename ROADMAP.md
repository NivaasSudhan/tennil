# fifaTenZero — Product & Architecture Roadmap (MVP → Full Product)

**Status:** planning artifact for Fable/subagent orchestration.
**Basis:** grounded in the shipped MVP source (`src/domain/**`, `src/app/**`, `scripts/simulate.ts`, config JSON) plus the locked handoff docs (PROJECT / ARCHITECTURE / DECISIONS / TASKS / RISKS).
**Non-goal of this doc:** code changes. It decomposes work; it does not perform it.

---

## 1. Executive summary

fifaTenZero shipped a complete MVP: a single-player World Cup Draft-XI game where the user drafts one player per round from randomly revealed real finals XIs, locks an 11-player squad, and receives a **deterministic score band** (10-0 … 0-4) that drives scripted, presentation-only commentary. The architecture is deliberately strong and should be protected: pure domain modules (`draft`, `scoring`, `commentary`) with zero React imports, RNG injected and confined to squad reveal (`src/domain/draft/session.ts`), a config-driven band engine (`scoreBand.ts` reads `BandDef` fields generically — no hardcoded band ids), fail-closed data validation at boot (`loadData.ts`), and a reproducible rarity simulator (`scripts/simulate.ts`) that tuned the top band to ~5% (1/20) via config numbers only. 54 unit tests green; static GitHub Pages deploy.

The roadmap is staged deliberately because the single biggest lever — corpus size — is also the biggest balance risk. Every squad added shifts the "best-possible XI" ceiling and the shape of the reveal distribution, which invalidates the current threshold tune. So the plan grows content in **validated increments** (7 → 24-32 → 60-80 → 140), each gated by a re-simulation and a config-only retune, and it front-loads two force multipliers before spectacle: **score explainability** (so results feel earned, not opaque) and a **data + balance pipeline** (so corpus growth is cheap and safe). Landing screen and result-playback controls are small, high-visibility UX wins folded into the first sprint.

---

## 2. Current MVP assessment

### Keep unchanged (these are the crown jewels — protect in every workstream)
- **Pure scoring path.** `computeScoreInput` + `scoreBand` (`src/domain/scoring/scoreBand.ts`) are deterministic and RNG-free. `bandMatches` (lines 43-70) is a clean generic predicate evaluator over `BandDef`. This is the truth engine — extend around it, never fork it.
- **Commentary strictly downstream.** `buildCommentary(band, xi, config)` consumes the already-computed band; it cannot alter outcome. Slot resolution is deterministic (id tie-break).
- **RNG isolation.** Injected `Rng` (ADR-008) used only in `selectSquad`. Scoring/commentary provably cannot import it.
- **Config-driven thresholds.** All band gates live in `thresholds.json`. Balance = editing numbers, never code (Invariant 6).
- **Fail-closed boot.** `loadGameData` collects all problems and throws `DataValidationError`; `main.tsx` renders a boot-error screen.
- **Reproducible simulation.** `simulate.ts` drives the *real* state machine + scoring; output is a pure function of `(n, seed, bot, skipThreshold)` + vendored data.
- **Immutable draft transitions.** `startDraft`/`pick`/`skip` return new sessions and throw on illegal actions — this is what makes seed-replay persistence cheap later.

### Intentionally MVP-scoped (fine now, revisit per roadmap)
- **7-squad corpus** → guaranteed reveal repeats from ~round 8 (R-03). Mitigated by disabling already-picked players; the real fix is more squads.
- **`DraftSession` blends truth + operational metadata** (`types.ts:39-47`): truth (`picks`, `phase`, `skipRemaining`) sits alongside ops/derived (`roundsPlayed`, `seenSquadIds`, `currentReveal`, `breachLog`). Harmless today; awkward once explain/achievements/replay/analytics read the session.
- **No landing screen.** `App.tsx:19` auto-starts a draft on mount.
- **No result playback speed control.** `ResultScreen.tsx:8` hardcodes `BEAT_REVEAL_MS = 900`; only skip-to-result exists.
- **No explainability.** The band is shown; *why* is invisible. Opaque determinism erodes trust and replay motivation.
- **Ratings authored by hand** (rubric in ADR-006, frozen in `squads.json`). Fine for 77 players; unscalable to 140 teams without tooling.

### Main bottlenecks now
1. **Content authoring is manual** — the hard blocker on corpus growth.
2. **Balance is a manual loop** — retuning after each corpus change needs richer diagnostics than a single histogram.
3. **Explainability gap** — the product's core promise (a *legible* deterministic result) is only half-delivered.

---

## 3. Product gaps to close first (prioritized)

| # | Gap | Why first | Primary artifact |
|---|-----|-----------|------------------|
| 1 | **Score explainability** | Core promise; unlocks "you missed 10-0 because…", achievements, richer commentary | `src/domain/scoring/explainScoreBand.ts` |
| 2 | **Balance tooling** | Every future corpus bump depends on fast, sliceable re-simulation | `simulate.ts` diagnostics + JSON report artifact |
| 3 | **Content authoring ergonomics** | Manual entry caps the product at ~30 squads | `scripts/ingest/**` pipeline + rating generator |
| 4 | **Landing / start screen** | First impression; currently drops user mid-draft with no framing | `src/app/StartScreen.tsx` + `appPhase` UI state |
| 5 | **Result playback controls (skip + speed)** | Immediate UX quality; skip exists, speed does not | `usePlaythrough` hook / playback controller in `ResultScreen` |
| 6 | **UX polish (result legibility)** | Bucket breakdown + weak/strong-link callouts make the result readable before more commentary | `ResultBreakdown` component fed by `explainScoreBand` |

Gaps 1, 4, 5 are the first sprint. Gaps 2, 3 are the platform investment that makes Phase 1 safe.

---

## 4. Roadmap by phase

### Phase 1 — Scalable content platform (no core-loop change)
**Objective:** make corpus growth cheap and safe, and land the two quick UX wins, without touching the draft/scoring engine.

**Deliverables**
- `scripts/ingest/**`: build-time roster ingestion from jfjelstul/worldcup DB and/or Zafronix free tier → normalized to the frozen `squads.json` schema (never fetched at runtime — Invariant 5).
- Reproducible rating-generation script applying the ADR-006 rubric (anchors + tier bands + tournament adjustment), emitting a diffable ratings table with the human-override points preserved.
- Corpus expansion **7 → 24-32** iconic squads across eras, with per-squad validation fixtures.
- Simulation diagnostics upgrade: `runSimulation` reports **per-band frequency by seed range and by corpus slice** (era/confederation/tier), plus **percentile distributions (p10/p25/p50/p75/p90) for each bucket sum and the weak-link floor, by corpus slice** — these show *threshold pressure* directly (where a gate actually bites) far better than band frequency alone. Emits a machine-readable `sim-report.json` for CI regression.
- **Landing / start screen** (`StartScreen.tsx`) gated by an app-level `appPhase: 'landing' | 'playing'` UI state; draft starts only on the **Start Game** CTA.
- **Result playback controls**: lift `BEAT_REVEAL_MS` into playback state with 1×/2×/4× speed; keep existing skip-to-result. **Speed/skip are presentation-only controls; they do not alter commentary contents or result derivation.**

**Architecture implications**
- New `scripts/ingest/**` and rating tooling live entirely out of the runtime bundle. Zero domain changes.
- Landing state is **UI-only** in `App.tsx` — do NOT add a `LANDING` phase to `DraftSession` (that phase enum is domain truth; the landing gate is presentation). This preserves the domain boundary.
- Playback speed is component-local state. **Invariant: the final scoreline (`scoreBand`) and the full commentary script (`buildCommentary`) are computed exactly once, before any playback timer starts (the existing `useMemo` in `ResultScreen`). Speed and skip change only reveal cadence — never which beats exist, their text, or the band.** No subagent may move scoring/commentary derivation into a timer, effect tick, or per-step callback.
- **No client-side router unless GitHub Pages deep-link refresh is intentionally handled** (hash routing, or a `404.html` SPA fallback). Pages serves static files and 404s on refreshed deep links to non-existent paths; the landing/`appPhase` gate is in-memory UI state and needs no router — do not add one casually.

**UX implications**
- First screen frames the game and sets tone; reduces the current abrupt drop-in.
- Speed/skip give the user control over the tension arc — respects replay users who've seen it.

**Testing/simulation implications**
- Every corpus increment re-runs the rarity protocol (RISKS §Experiment) and retunes `thresholds.json` **numbers only**; append each run to the Experiment log.
- New validation fixtures per squad; `loadData` tests extended for any new corpus-scale invariants (e.g. minimum squad count for repeat-rule comfort).
- `sim-report.json` diffed in CI to catch balance regressions on data changes.

**Exit criteria**
- [ ] 24-32 squads authored, all pass `loadGameData` clean.
- [ ] Ingestion + rating scripts reproduce the corpus from sources deterministically.
- [ ] Post-expansion retune lands top band in the 5-7% protocol window (greedy), ~0% random, no dead bands; logged.
- [ ] Landing screen + Start CTA shipped; draft no longer auto-starts.
- [ ] Result playback: skip + 1×/2×/4× speed working; content proven timing-independent.

### Phase 2 — Explanation & squad legibility (before spectacle)
**Objective:** make the deterministic result *legible* and add the first layer of strategic depth.

**Deliverables**
- `src/domain/scoring/explainScoreBand.ts` — pure `explainScoreBand(input, config)` returning, per band, each predicate's `{ name, required, actual, passed }` and the specific failing predicates for the next-higher band ("you missed 10-0 because DEF 349 < 352 and weakLink 82 < 88").
- `ResultBreakdown` UI: position-bucket sums/counts, weak-link and strongest-link callouts, and the "why not the next band" explanation, fed entirely by `explainScoreBand`.
- **DraftSession truth/ops split** (only now, because explain/achievements consume it): introduce a `DraftTruth` view (`picks`, `phase`, `skipRemaining`) distinct from operational metadata (`seenSquadIds`, `roundsPlayed`, `breachLog`, `currentReveal`). Governed by its own **ADR-015** (§7) — this is a type-ownership boundary, not just an explainability detail.
- First strategic-depth layer: **formation legality / legal-XI shape** validation surfaced pre-lock (advisory, not a hard block unless configured).

**Architecture implications**
- `explainScoreBand` **reuses the predicate structure of `bandMatches`** (`scoreBand.ts:43-70`). Refactor `bandMatches` to emit structured per-predicate results and have `scoreBand` derive its boolean from them — one source of predicate truth, consumed two ways. Pure, no RNG, no new hardcoded ids.
- Truth/ops split is a types-level change (`types.ts`) plus mechanical updates in `session.ts` consumers; guard with the existing draft invariant tests.
- Formation legality reads `referenceFormation`/`minCounts` from config — stays config-driven.

**UX implications**
- The result becomes a readable match report, not a mystery. Drives "one more draft to fix the weak link."

**Testing/simulation implications**
- `explainScoreBand` unit tests: every predicate reported correctly on fixture XIs; "missed by" deltas exact; determinism.
- Truth/ops refactor must leave all draft + scoring tests green (behavior-preserving).

**Exit criteria**
- [ ] `explainScoreBand` shipped + tested; ResultBreakdown renders pass/fail + "missed because".
- [ ] `bandMatches`/`scoreBand` share one predicate evaluator; scoring tests unchanged and green.
- [ ] DraftSession truth/ops split landed behind an ADR with tests green.
- [ ] Formation-legality advisory live pre-lock.

### Phase 3 — Product feel & spectacle
**Objective:** deepen experience and shareability without engine complexity.

**Deliverables**
- Richer per-band commentary templates; pre-result tension screen.
- Animated result screen with momentum arc / turning points / strengths-weaknesses; match-report artifact explaining 5-0 vs 10-0 (built on `explainScoreBand`).
- **Seed + action-log persistence/shareability** (no backend): store `seed` + the ordered pick/skip actions; replay through the pure state machine to reconstruct any session. Enables seeded challenge mode, daily curated draft, shareable results.
- Synergy layer (same-country/same-era boosts or penalties) — **only after balance tooling is mature**, expressed as config-driven modifiers to `ScoreInput`.
- Audio: draft click, reveal sting, goal pacing, victory/near-miss stings.
- Era/country themed collections; achievements ("Perfect Defense", "No Weak Links") derived from `explainScoreBand` + `DraftTruth`.

**Architecture implications**
- Replay leans on the existing immutable, deterministic transitions (ADR-003/008) — this is why we protected them. Persistence = serialize `seed` + actions, not session snapshots.
- Synergy modifiers must enter as a **pure, config-driven transform of `ScoreInput` before `scoreBand`**, never as RNG and never inside commentary. New ADR; re-simulate and retune.

**UX/testing implications**
- Each new scoring input (synergy) triggers a full rarity re-sim + retune before ship.
- Replay determinism test: `seed + actions → identical FinalXI + band`, always.

**Exit criteria**
- [ ] Seed+action-log replay reconstructs sessions deterministically; shareable link/string works offline.
- [ ] Synergy (if shipped) is config-driven, re-simulated, retuned, tests green.
- [ ] Corpus at 60-80 with validated balance before any push toward 140.

---

## 5. Next sprint plan (highest leverage)

**Theme:** ship the two UX wins + stand up the balance/diagnostics spine, then take the first safe corpus step. Concrete sequence:

1. **Landing screen** (frontend). Add `appPhase: 'landing' | 'playing'` UI state in `App.tsx`; extract current auto-start (`App.tsx:19`) so `startDraft` fires on the **Start Game** CTA in a new `StartScreen.tsx`. Domain untouched. *Fastest visible win.*
2. **Result playback speed control** (frontend). Lift `BEAT_REVEAL_MS` (`ResultScreen.tsx:8`) into a small `usePlaythrough(totalBeats)` hook exposing `{ visibleBeats, showScoreline, speed, setSpeed, skipToResult }` with 1×/2×/4×. Keep existing skip. Assert content computed pre-timer.
3. **Simulation diagnostics** (sim/balance). Extend `runSimulation` (`simulate.ts:256`) to emit per-seed-range and per-corpus-slice band frequencies, **bucket-sum + weak-link percentile distributions (p10-p90) per slice**, and a `sim-report.json`. This is the safety net for step 5 — the percentiles are what make the next retune fast.
4. **`explainScoreBand` skeleton** (domain/scoring). Refactor `bandMatches` to structured per-predicate output; implement `explainScoreBand.ts`; tests. (UI `ResultBreakdown` can trail into Phase 2, but land the pure function now — it's the dependency for everything downstream.)
5. **Corpus step 7 → ~16** (data/content) as a *proving* increment for the ingestion pipeline, then re-simulate (step 3 tooling) and retune `thresholds.json` numbers-only; log it. (Full 24-32 completes in Phase 1 proper.)

Sequencing rationale: 1 and 2 are independent, parallelizable, low-risk, high-visibility. 3 must precede any data change. 4 is pure and unblocks Phase 2. 5 exercises the whole pipeline on a small, reversible step before committing to the full expansion.

---

## 6. Fable orchestration plan (subagent workstreams)

> Model routing reminder: hardest reasoning (rating methodology, balance tuning, truth/ops refactor) → top-tier; mechanical/UI/pipeline glue → mid-tier; repetitive data entry/config → light-tier. Protect the invariants in every stream.

| Workstream | Owner role | Scope | Inputs | Outputs | Dependencies | Risks |
|---|---|---|---|---|---|---|
| **W1 Domain/Scoring** | Senior (top-tier) | `explainScoreBand.ts`; refactor `bandMatches` to structured predicates; DraftSession truth/ops split (Phase 2) | `scoreBand.ts`, `types.ts`, ADR-004/013 | Pure explain fn + tests; shared predicate evaluator; split types | none (self-contained) | Predicate refactor breaking scoring tests; keep behavior-preserving |
| **W2 Data pipeline** | Mid-tier + top-tier for rubric | `scripts/ingest/**`; rating generator; corpus expansion; per-squad fixtures | jfjelstul DB, Zafronix, ADR-006/012, `squads.json` schema | Reproducible ingestion; expanded `squads.json`; fixtures | schema (frozen); W3 for post-expansion retune | Roster accuracy; rating fairness; schema drift |
| **W3 Simulation/Balance** | Top-tier (tuning judgment) | Diagnostics upgrade (band freq + bucket-sum/weak-link percentiles per slice); `sim-report.json`; re-simulate + retune after each corpus bump | `simulate.ts`, RISKS protocol, `thresholds.json` | Sliceable histograms + percentile tables; CI report; retuned config + Experiment-log entries | W2 (needs corpus); W1 (explain aids diagnosis) | Lumpy distributions (see 2026-07-09 log); config-only discipline |
| **W4 Frontend UX** | Mid-tier | Landing screen + `appPhase`; playback speed hook; `ResultBreakdown` (Phase 2); animated result (Phase 3) | `App.tsx`, `ResultScreen.tsx`, `app.css`, W1 explain output | `StartScreen.tsx`, `usePlaythrough`, breakdown UI | W1 for breakdown; independent for landing/speed | UI reimplementing rules (R-08) — must call domain only |
| **W5 Content/Commentary** | Mid-tier (writing) | Richer per-band templates; new-band scripts as corpus/bands evolve; themed collections | `commentary.json`, band ids, slot rules | Expanded scripts; validated slot usage | band-id set (config); loadData band↔script check | Slot/schema violations; tone drift |
| **W6 QA/Test** | Mid-tier | Invariant guards across refactors; replay-determinism tests; CI wiring for sim-report diff | all test suites, ARCHITECTURE §7 | Extended suites; CI gates; regression fixtures | all streams | Coverage gaps on state-machine + explain edges |

**Coordination rules:** W2 never lands a corpus change without W3 re-simulating and retuning in the same PR. W4 changes are reviewed against the R-08 leakage checklist (no rules logic in components). Any change to schemas, module boundaries, state-machine rules, or the band algorithm requires an ADR first (see §7).

---

## 7. ADR plan

**Create now (Phase 1 → early Phase 2):**
- **ADR-011 Corpus expansion strategy** — staged 7 → 24-32 → 60-80 → 140; mandatory re-sim + config-only retune per increment; squad-selection criteria (icon density, era/confederation spread, weak-link presence). *Now: it governs W2/W3 immediately.*
- **ADR-012 Rating pipeline strategy** — sources, build-time-only ingestion, rubric application, human-override preservation, freeze-into-repo rule. *Now: unblocks scalable authoring.*
- **ADR-013 Score explainability** — `explainScoreBand` contract; the shared predicate evaluator refactor; guarantee it never alters `scoreBand` truth. *Now: W1 needs the contract fixed.*

**Create when reached (Phase 2):**
- **ADR-015 DraftSession truth/ops split** — its own artifact, NOT folded silently into ADR-013. Even though the split first ships to serve explainability, it redraws a **type-ownership governance boundary** that outlives explainability: it defines what is canonical draft *truth* (`picks`, `phase`, `skipRemaining`) versus *operational/derived* metadata (`seenSquadIds`, `roundsPlayed`, `breachLog`, `currentReveal`), and every later system that reads a session — replay (ADR-014), achievements, analytics — consumes the *truth* view, never the ops bag. Must state: which fields are serialized for replay, which are reconstructable, and which consumers may read which view. Prerequisite for ADR-014.

**Create when reached (Phase 3):**
- **ADR-014 Persistence/shareability via seed + action log** — no backend; serialize `seed` + actions; replay through pure transitions; challenge/daily/share built on it. Depends on ADR-015 (replay serializes the *truth* view + action log, not full session snapshots).
- **(If synergy ships) ADR for synergy modifiers** — pure config-driven transform of `ScoreInput` pre-`scoreBand`; re-sim + retune required. Only when balance tooling is mature.

Rationale for timing: 011-013 are needed to safely *start* the platform work; 015 locks the type-ownership boundary the moment a second consumer (explainability) touches the session; 014 and synergy carry real balance/complexity risk and should be locked only when their phase begins, against real data.

---

## 8. Implementation order & guardrails

**Order (deviate only with written justification):**
1. Freeze & tag current MVP (`v0.1.0-mvp`).
2. Stand up ingestion + rating pipeline (out of runtime).
3. Expand to 24-32 squads; re-simulate; retune (config only).
4. `explainScoreBand` + explanation UI; formation legality advisory.
5. Synergy/penalty rules (config-driven) — only after balance tooling matures.
6. Richer result/report screen.
7. Expand toward 60-80 → 140 only once balance tooling is proven.
8. Daily challenge, seeded drafts, shareable results last.

Landing screen and result playback controls slot into step 4's sprint window (they're small and parallel); they do not gate the pipeline.

**Must not be broken:**
- 11 final picks; exactly 1 skip; 11 or 12 rounds. Draft transitions immutable and pure.
- Fail-closed boot validation.
- Module boundaries: nothing in `src/domain`/`src/lib` imports React or `src/app`.
- **Result derivation happens once, before playback.** Scoreline + commentary script are computed pre-timer; speed/skip are presentation-only and never re-derive them.

**Must remain pure (no RNG, no React, no I/O):**
- `scoring/**` (incl. new `explainScoreBand`), `commentary/**`, `draft/**` transitions. RNG stays injected and reveal-only.

**Must remain config-driven:**
- All band gates, min counts, weak-link floors, reference formation, and any future synergy modifiers — numbers in JSON, never in engine code. Balance = config edits + re-simulation.

**Do not introduce yet:**
- Backend, accounts, databases, runtime network calls for game data.
- Multiplayer / live match simulation.
- Synergy or formation *hard* constraints before balance tooling is mature.
- A `LANDING` phase inside `DraftSession` (landing is UI state, not domain truth).
- A client-side router — unless GitHub Pages deep-link refresh is intentionally handled (hash routing or `404.html` SPA fallback). The `appPhase` gate needs none.
- The 140-team corpus (only after 60-80 is balance-validated).

---

## 9. Deliverable checklist (Fable execution tracker)

**Phase 1**
- [ ] Tag `v0.1.0-mvp`; branch for roadmap work.
- [ ] `scripts/ingest/**` reproducible ingestion from sources.
- [ ] Rating generator script (rubric + overrides, diffable output).
- [ ] Corpus 7 → 24-32 squads authored; all pass `loadGameData`.
- [ ] Per-squad validation fixtures added.
- [ ] `simulate.ts` per-slice/per-seed diagnostics + bucket-sum/weak-link percentiles + `sim-report.json`.
- [ ] Post-expansion retune in protocol window; Experiment log updated.
- [ ] `StartScreen.tsx` + `appPhase` gate; draft no longer auto-starts.
- [ ] Result playback: skip + 1×/2×/4× speed; content proven timing-independent.
- [ ] ADR-011, ADR-012, ADR-013 written.

**Phase 2**
- [ ] `explainScoreBand.ts` pure fn + tests; `bandMatches`/`scoreBand` share one predicate evaluator.
- [ ] `ResultBreakdown` UI (buckets, weak/strong link, "missed 10-0 because…").
- [ ] DraftSession truth/ops split behind **ADR-015** (type-ownership boundary; truth vs ops views defined); all draft/scoring tests green.
- [ ] Formation-legality advisory pre-lock.

**Phase 3**
- [ ] Seed + action-log replay (deterministic reconstruction) — ADR-014.
- [ ] Richer commentary templates; pre-result tension screen; animated result + match report.
- [ ] Synergy layer (config-driven, re-simulated, retuned) — if shipped.
- [ ] Audio; themed collections; achievements from `explainScoreBand`.
- [ ] Corpus 60-80 balance-validated before any move toward 140.

**Always-on guardrails (every PR)**
- [ ] Invariants intact (11 picks / 1 skip; pure scoring; commentary downstream; RNG reveal-only; config-driven thresholds).
- [ ] No React/`src/app` imports in `src/domain`/`src/lib` (grep gate).
- [ ] Corpus/scoring change ⇒ re-simulation + config-only retune in the same PR.
- [ ] Schema/boundary/state-machine/band-algorithm change ⇒ ADR first.

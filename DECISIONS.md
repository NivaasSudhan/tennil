# DECISIONS.md — Architecture Decision Records

All decisions locked 2026-07-09 (pre-implementation session). Format per record:
**Decision | Rationale | Alternatives | Tradeoffs | Consequences | Risks | Revisit when**.

Changing anything marked **Invariant** in PROJECT.md requires a new ADR here first.

---

## ADR-001 — Stack: React + Vite + TypeScript; Vitest for tests

- **Decision**: React 18+ + Vite + TypeScript (strict). Vitest for unit tests. No other runtime deps for MVP (no state library, no router, no CSS framework required — plain CSS or CSS modules).
- **Rationale**: Default named in constraints; largest training-data footprint for successor models; Vite gives static build + dev server + Vitest integration with zero config.
- **Alternatives**: Vanilla TS + Vite (fewer deps, but hand-rolled DOM updates for reveal/pick/squad list are more bug-prone for weak implementers); Next.js (rejected: server features are dead weight, static export friction).
- **Tradeoffs**: React bundle ~45 kB gzip — irrelevant at this scale.
- **Consequences**: `npm create vite@latest . -- --template react-ts` is the scaffold command (T-001). All game rules live in `src/domain/**` as pure TS with zero React imports.
- **Risks**: UI/domain leakage. Mitigation: lint rule of thumb — nothing in `src/domain` or `src/data` may import from `react` or `src/app`.
- **Revisit when**: never for MVP.

---

## ADR-002 — Module boundaries and public APIs

- **Decision**: Five layers with one-way flow. Full signatures in ARCHITECTURE.md §Interfaces.

| Layer | Path | Owns | Must NOT own |
|-------|------|------|--------------|
| data | `src/data/` (JSON) + `src/domain/loadData.ts` | JSON load + validation, fail-closed boot | game rules |
| draft | `src/domain/draft/` | reveal/pick/skip/lock state machine | scoring, UI, commentary |
| scoring | `src/domain/scoring/` | pure band calculator | RNG, UI, commentary text |
| commentary | `src/domain/commentary/` | band → script mapper | scoring math, RNG |
| app/UI | `src/app/` | render + input, thin adapters | thresholds, pick-legality logic (must call domain API) |

- **Rationale**: Weak models re-architect when boundaries are fuzzy. Named layers + import bans make violations mechanically checkable.
- **Alternatives**: Single `game.ts` module (rejected: scoring/commentary purity invariants get entangled with RNG).
- **Tradeoffs**: Slight ceremony (types file, explicit interfaces) — worth it for testability.
- **Consequences**: Data flow is exactly: `loadData → validate → startDraft → (pick|skip)* → getFinalXI → scoreBand(XI, config) → buildCommentary(band) → UI`.
- **Risks**: UI reimplementing legality checks "for convenience". Rule: UI may *read* `session` to disable buttons, but every action goes through domain functions which throw on illegal input.
- **Revisit when**: post-MVP features (persistence, multiplayer) — via new ADR.

---

## ADR-003 — Draft state machine, skip/reveal rules

- **Decision**: Immutable session objects; transitions are pure functions taking `(session, args, rng)` and returning a **new** session or throwing `IllegalActionError`. Domain phases are `'AWAIT_PICK' | 'COMPLETE'` only. (The constraints sketch listed a `REVEAL` phase; it is a UI animation state, not a domain state — reveal happens atomically inside each transition. This ADR records that deviation.)

  Canonical state:
  ```ts
  DraftSession {
    phase: 'AWAIT_PICK' | 'COMPLETE'
    picks: Player[]              // length 0..11
    skipRemaining: 0 | 1
    roundsPlayed: number         // number of reveals so far, includes skipped
    seenSquadIds: string[]       // squad ids revealed this session
    currentReveal: Squad | null  // null iff COMPLETE
    breachLog: string[]          // invariant relaxations, e.g. forced squad repeat
  }
  ```

  Transitions (pseudocode in ARCHITECTURE.md §State machine):
  - `startDraft(data, rng)` → draws first reveal, `roundsPlayed = 1`, `skipRemaining = 1`.
  - `pick(session, playerId, rng)` → legal iff `AWAIT_PICK`, `playerId` in `currentReveal`, and `playerId` not already in `picks`. Appends pick. If `picks.length === 11` → `COMPLETE`, `currentReveal = null`. Else draw next reveal, `roundsPlayed++`.
  - `skip(session, rng)` → legal iff `AWAIT_PICK` and `skipRemaining === 1`. Sets `skipRemaining = 0`, `roundsPlayed++`, draws replacement reveal **excluding the squad just skipped**. Does not touch `picks`.
  - Illegal actions **throw**; they never silently no-op.

  Squad selection rule (`selectSquad`): pick uniformly from squads not in `seenSquadIds` (and ≠ excluded id). If that pool is empty, relax to all squads except the excluded/current one and append a note to `breachLog` (tests assert the log). Every drawn squad id is added to `seenSquadIds`.

  Arithmetic invariants (assert in tests):
  - `roundsPlayed === picks.length + (1 - skipRemaining) + (phase === 'AWAIT_PICK' ? 1 : 0)`
  - On `COMPLETE`: `picks.length === 11` and `roundsPlayed === 11 + (1 - skipRemaining)` (11 no-skip, 12 with skip).

  Repeat-reveal edge: a repeated squad may contain already-picked player ids; those are unpickable (domain throws, UI disables).
- **Rationale**: Immutable + pure = trivially testable, no hidden mutation bugs, React-friendly (`useState<DraftSession>`).
- **Alternatives**: Class with mutating methods (rejected: aliasing bugs, harder fixtures); XState (rejected: dependency + learning curve for 2-state machine).
- **Tradeoffs**: Object copying per transition — negligible at 12 rounds.
- **Consequences**: `tests/draft.test.ts` can drive full drafts with a seeded RNG and assert every invariant.
- **Risks**: Off-by-one in `roundsPlayed`. Mitigation: the arithmetic invariant above is a required test.
- **Revisit when**: never for MVP.

---

## ADR-004 — Scoring: pure function, band evaluation order

- **Decision**: Two pure functions in `src/domain/scoring/`:
  1. `computeScoreInput(xi, positionMap)` → `{ bucketSums, bucketCounts, weakLink }` (weakLink = min individual rating in the XI).
  2. `scoreBand(input, thresholds)` → `{ bandId, label }`.

  Evaluation: sort bands by `priority` **descending**; return the first band whose predicates ALL pass. Predicates per band (all optional except on fallback, which has none): `requireAllBucketsNonEmpty`, `requireMinCounts` (vs `thresholds.minCounts`), `minBucketSums` (each bucket sum ≥ configured value), `minWeakLink`. Exactly one band has `"fallback": true` and always matches; validation fails at boot if zero or multiple fallbacks exist.
- **Rationale**: Priority-ordered predicate list is the simplest scheme that supports Day-7 retuning by editing numbers only. Highest-priority-first means adding a band never requires reordering logic.
- **Alternatives**: Weighted continuous score mapped to bands by cutoffs (rejected for MVP: harder to reason about "why did I get 5-0", harder to tune bucket-shape requirements like "needs a real GK"); decision tree in code (rejected: violates Invariant 6).
- **Tradeoffs**: Predicate model can't express "close to 10-0" margins natively — margin label is just the matched band's `label` field.
- **Consequences**: Scoring is called exactly once, post-lock, with no RNG anywhere in the call graph. Same XI + same config ⇒ same band, forever.
- **Risks**: Band table gaps (an XI shape no non-fallback band matches feels unfair). Mitigation: fallback band + Day-7 histogram over simulated drafts (T-014).
- **Revisit when**: Day 7 tuning shows the predicate model can't hit the rarity target — then a new ADR may add a `minTotalSum` predicate (schema-additive, engine reads it generically).

---

## ADR-005 — Config schema, locations, versioning

- **Decision**: Three config files, all with a top-level integer `version` (current: 1), all validated fail-closed at boot:
  - `src/data/config/thresholds.json` — `referenceFormation`, `minCounts`, `ratingScale`, `bands[]` (each: `id`, `priority`, `label`, optional predicates per ADR-004, optional `fallback`).
  - `src/data/config/commentary.json` — `scripts: { [bandId]: { beats: [{ minute, type, text }] } }`. `text` may contain slots `{topAtt}`, `{topMid}`, `{topDef}`, `{gk}`, `{weakest}`, `{captain}` — filled deterministically (ADR-004 purity extends here; slot resolution rules in ARCHITECTURE.md §Commentary).
  - `src/data/position-map.json` — `{ [positionRaw]: "GK" | "DEF" | "MID" | "ATT" }`.

  Squad data: `src/data/squads/squads.json` (single file, schema in ARCHITECTURE.md §Data schemas). Boot validation cross-checks: every band id in thresholds has a script in commentary; every `positionRaw` in squads has a mapping; every player id unique across the corpus.
- **Rationale**: Single-file-per-concern keeps imports static (`import thresholds from ...` — Vite inlines JSON, keeps the app offline-capable). `version` field lets Day-7 retunes be diffable and lets validation reject configs from a future schema.
- **Alternatives**: Fetch configs at runtime (rejected: adds failure modes, no benefit on static host); one merged config file (rejected: commentary edits shouldn't risk threshold typos).
- **Tradeoffs**: Config changes require rebuild — acceptable, deploy is `vite build`.
- **Consequences**: Day 7 tuning = edit `thresholds.json` numbers, run simulation (T-012), rebuild. Zero engine edits.
- **Risks**: Schema drift between docs and validation code. Mitigation: `loadData.ts` is the single source of validation truth; docs point at it.
- **Revisit when**: schema needs a breaking change → bump `version`, new ADR.

---

## ADR-006 — Rating methodology + position map rules

- **Decision**: Ratings are 1–100 integers, frozen into `squads.json` at build time (never computed at runtime). Rubric (documented so numbers are reproducible and defensible):
  - **Tier base**: all-time great at peak 94–99; world-class peak 88–93; established international 82–87; squad-role player 75–81.
  - **Anchors** (calibrate everything else against these): Pelé 1970 = 98, Maradona 1986 = 98, Ronaldo 2002 = 96, Zidane 1998 = 95, Iniesta 2010 = 93, Neuer 2014 = 92.
  - **Tournament adjustment**: ±2 for that specific World Cup performance (Golden Ball/Boot, defining moments, or anonymous tournament).
  - All seed numbers are **PLACEHOLDER** until the Day-1 pass; listed as open item R-01 in RISKS_AND_UNKNOWNS.md.

  Position map: `positionRaw` values are normalized short codes. Mapping (frozen in `position-map.json`): GK→GK; RB/LB/CB/SW/WB/RWB/LWB/DF→DEF; DM/CM/AM/RM/LM/MF→MID; RW/LW/CF/ST/SS/FW→ATT. An unmapped `positionRaw` **fails validation at load** — fix the data, never guess at runtime.
- **Rationale**: No public dataset provides cross-era ratings; a tiered rubric with anchors is the cheapest defensible method and freezes into static JSON (Invariant 5).
- **Alternatives**: Derive from caps/goals formulas (rejected: biases against defenders/GKs and short-career legends); import modern game ratings (rejected: licensing, no coverage pre-2000).
- **Tradeoffs**: Subjective — mitigated by anchors + the fact that only *relative* sums matter for band math.
- **Consequences**: Bootstrap sources (Zafronix WC API free tier, jfjelstul/worldcup GitHub DB) are used once, build-time only, to get rosters/positions; ratings assigned by rubric; everything frozen into the repo.
- **Risks**: AM classed MID vs ATT changes bucket sums materially (Maradona → MID). Locked: AM = MID. Day-7 tuning must use the same map.
- **Revisit when**: playtest shows a bucket is systematically starved → adjust thresholds first, map only via new ADR.

---

## ADR-007 — Squad corpus (7 squads)

- **Decision**: MVP corpus, chosen for icon density, era spread, and minimal same-human overlap:
  1. `bra-1970` Brazil 1970
  2. `ita-1982` Italy 1982
  3. `arg-1986` Argentina 1986
  4. `fra-1998` France 1998
  5. `bra-2002` Brazil 2002
  6. `esp-2010` Spain 2010
  7. `ger-2014` Germany 2014
  Each squad = its iconic starting XI for that tournament (11 players exactly).
- **Rationale**: All seven are champions with instantly recognizable XIs → reveal moments land emotionally. Era spread means no human appears twice (checked: no starter overlap across these seven finals XIs — verify during Day-1 data entry, see R-02).
- **Alternatives**: Include heartbreak teams (NED 1974, BRA 1982, HUN 1954) — deferred to post-MVP corpus growth; 5 squads minimum (rejected: repeats would start at round 6, too early).
- **Tradeoffs**: 7 squads < 11 rounds ⇒ repeats guaranteed from round 8 (see ADR-003 repeat rule, A7).
- **Consequences**: `squads.json` contains exactly 77 players Day 1. Corpus growth later = data-only change.
- **Risks**: Data-entry errors in rosters. Mitigation: validation (11 players/squad, unique ids, mapped positions) + spot-check task in TASKS.
- **Revisit when**: A6/A7 playtest signals fatigue → add squads, no code change.

---

## ADR-008 — RNG strategy

- **Decision**: Injectable interface, `src/lib/rng.ts`:
  ```ts
  interface Rng { next(): number }            // uniform [0, 1)
  function mulberry32(seed: number): Rng      // deterministic, for tests + reproducible sessions
  function systemRng(): Rng                   // wraps Math.random, production default
  ```
  Every draft transition that draws a squad takes `rng` as an explicit parameter. **Nothing in `src/domain/scoring` or `src/domain/commentary` may reference `Rng`** — that is the mechanical enforcement of Invariants 8–9.
- **Rationale**: Determinism is the difference between testable and untestable draft logic; parameter injection is the simplest seam.
- **Alternatives**: Global seedable singleton (rejected: hidden state, test pollution); `crypto.getRandomValues` (rejected: overkill, not seedable).
- **Tradeoffs**: `rng` threaded through a few signatures — trivial.
- **Consequences**: `tests/draft.test.ts` uses `mulberry32(fixedSeed)`; full-draft simulations (T-012) are reproducible by seed.
- **Revisit when**: never for MVP.

---

## ADR-009 — Deploy: GitHub Pages via Actions

- **Decision**: Static deploy to GitHub Pages. `vite build` → `dist/`, published by the standard `actions/deploy-pages` workflow on push to `main`. `vite.config.ts` sets `base: '/fifaTenZero/'` (project pages path).
- **Rationale**: Repo is already on GitHub (single origin, zero cost, no new accounts). App is a pure SPA with vendored data — no server logic anywhere.
- **Alternatives**: Netlify/Cloudflare Pages (fine, but extra account/setup); manual `gh-pages` branch pushes (rejected: manual steps rot).
- **Tradeoffs**: `base` path must match repo name; a renamed repo breaks asset URLs (documented in CLAUDE.md verify section).
- **Consequences**: Day-7 gate = live URL + `npm run build && npm run preview` passes locally.
- **Revisit when**: custom domain wanted (post-MVP).

---

## ADR-010 — Session persistence: none

- **Decision**: No persistence. Reload/close mid-draft resets the session. No localStorage, no URL state.
- **Rationale**: Sessions are < 5 minutes; persistence adds state-migration and stale-config failure modes for near-zero user value in MVP.
- **Alternatives**: localStorage snapshot (deferred: if added later, store `seed` + action log and replay through the pure state machine — the immutable design (ADR-003) makes this cheap).
- **Tradeoffs**: An accidental reload loses a draft — acceptable.
- **Consequences**: Stated in PROJECT.md product decisions; no "resume?" UI needed.
- **Revisit when**: post-MVP polish pass.

---

## ADR-011 — Corpus expansion: staged, with mandatory retune gates

- **Decision**: Corpus grows in stages: 7 → 16 (hand-authored proving step) → 24-32 → 60-80 → 140. A stage ships only after the previous stage's retune is logged and green. Every corpus change lands in the same PR as a re-simulation (`npx tsx scripts/simulate.ts --n 500 --seed 42` for both bots) and a **numbers-only** `thresholds.json` retune per the RISKS rarity protocol: top band 5-7% greedy / ~0% random / no dead bands, tightening toward 2-3% as distributions smooth (ROADMAP §3.6). Squad selection criteria in priority order: (a) icon density; (b) era + confederation spread; (c) weak-link presence — famous stars AND soft spots make picks interesting; (d) ≤2 squads per country per stage. A squad = the starting XI of that tournament's final (consistent with the existing 7); player `id` = `<squadId>-<lastname>`, lowercase ASCII. Era/confederation metadata on `Squad` is a schema change: it enters with the 24-32 stage under a version bump governed by this ADR, never as a drive-by.
- **Rationale**: Corpus size is the biggest content lever and the biggest balance risk — every squad shifts the best-XI ceiling and reveal distribution, invalidating the tune (ROADMAP §1).
- **Alternatives**: Big-bang expansion to 140 (rejected: one untunable cliff); ad-hoc additions (rejected: silent balance drift).
- **Tradeoffs**: Slow growth; each increment carries sim+retune overhead — that overhead is the safety mechanism.
- **Consequences**: `sim-report.json` snapshots accompany every stage for regression diffing; Experiment log grows one entry per stage.
- **Revisit when**: balance tooling (W3) proves increments stable two stages running — then stage sizes may grow.

---

## ADR-012 — Ratings are editorial: pipeline proposes, overrides are canon

- **Decision**: (1) Build-time only: ingestion tooling (`scripts/ingest/**`, target source jfjelstul/worldcup DB) runs at authoring time; runtime data stays vendored static JSON (Invariant 5). (2) The ADR-006 rubric (anchors + tier bands + tournament adjustment) is the rating METHOD for both hands and scripts. (3) A human-override file is canon: generated ratings never overwrite a curated number; regeneration produces a diffable proposal, overrides re-apply on top, and the diff is reviewed like code. (4) Until the 24-32 stage, authoring stays manual — the 7→16 step deliberately proves the rubric + retune loop before tooling automates them.
- **Rationale**: Hand-authoring doesn't scale past ~30 squads, but ratings are the soul of the game — Maradona's 98 is an opinion held with conviction (ROADMAP §3.4); players arguing with ratings is engagement.
- **Alternatives**: Fully generated ratings (rejected: kills editorial voice); fully manual forever (rejected: caps corpus at ~30).
- **Tradeoffs**: Two sources of truth reconciled by convention (generator output + override file) — acceptable because the override file always wins.
- **Consequences**: The generator can be rewritten freely; canon lives in the override file, not in the generator.
- **Revisit when**: the 60-80 stage — evaluate whether rubric + overrides still produce defensible ratings at that volume.

---

## ADR-013 — Score explainability via a single shared predicate evaluator

- **Decision**: (1) `bandMatches` in `src/domain/scoring/scoreBand.ts` delegates to a new exported `evaluateBandPredicates(band, input, config): PredicateResult[]` — one structured result per configured check (`allBucketsNonEmpty` and `minCounts` emit one entry per bucket; `minBucketSum` one per configured bucket; `minWeakLink` one; fallback band → `[]`, matches unconditionally). `PredicateResult = { name, bucket?, required, actual, passed }` with `passed === (actual >= required)` always, so any consumer computes the margin `required - actual` with no new logic. (2) New pure module `src/domain/scoring/explainScoreBand.ts` exports `explainScoreBand(input, config): ScoreExplanation` = awarded band + priority-descending `BandEvaluation[]` + `nextBetter` (nearest higher-priority band with its failing predicates), built ONLY on `evaluateBandPredicates`. (3) Guarantee, enforced by test: `explainScoreBand(input, config).bandId === scoreBand(input, config).bandId` for every input — explain can never alter, re-roll, or disagree with `scoreBand` truth. (4) The simulator's near-miss diagnostics consume `explainScoreBand`; predicate logic is never re-implemented in `scripts/`.
- **Rationale**: Explainability is the retention engine and must present as margins ("3 points from a 5-0"), not audits (ROADMAP §3.2); a second predicate implementation would drift from scoring truth.
- **Alternatives**: Separate explain module duplicating predicate checks (rejected: drift); explaining in the UI from raw config (rejected: rules leak into components, R-08).
- **Tradeoffs**: `scoreBand`'s hot path allocates predicate arrays — negligible at 11-player scale.
- **Consequences**: One source of predicate truth, three consumers (scoring boolean, ResultBreakdown UI in Phase 2, sim near-miss diagnostics). No RNG, no hardcoded band ids, no schema change; `thresholds.json` remains the only balance knob.
- **Revisit when**: a future predicate type (e.g. synergy) lands — extend the evaluator, never fork it.

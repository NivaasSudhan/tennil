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
    excludedSquadIds: string[]   // session-scoped permanent ban after skip
    currentReveal: Squad | null  // null iff COMPLETE
    breachLog: string[]          // invariant relaxations, e.g. forced squad repeat
  }
  ```

  Transitions (pseudocode in ARCHITECTURE.md §State machine):
  - `startDraft(data, rng)` → draws first reveal, `roundsPlayed = 1`, `skipRemaining = 1`, `excludedSquadIds = []`.
  - `pick(session, playerId, rng)` → legal iff `AWAIT_PICK`, `playerId` in `currentReveal`, and `playerId` not already in `picks`. Appends pick. If `picks.length === 11` → `COMPLETE`, `currentReveal = null`. Else draw next reveal (honoring `excludedSquadIds`), `roundsPlayed++`.
  - `skip(session, rng)` → legal iff `AWAIT_PICK` and `skipRemaining === 1`. Sets `skipRemaining = 0`, appends skipped reveal's `id` to `excludedSquadIds`, `roundsPlayed++`, draws replacement reveal **excluding the squad just skipped** (permanent list + one-shot). Does not touch `picks`.
  - Illegal actions **throw**; they never silently no-op.

  Squad selection rule (`selectSquad`): pick uniformly from squads not in `seenSquadIds`, not in `excludedSquadIds`, and ≠ one-shot `excludeId`. If that pool is empty, relax seen preference but still honor permanent + one-shot exclude and append a note to `breachLog` (tests assert the log). If still empty (no non-excluded squad remains), last-resort may re-include excluded squads so the session stays playable (degenerate corpus, e.g. corpus of 1 after skip). Every drawn squad id is added to `seenSquadIds`.

  Permanent skip exclude: user intent of skip is "I do not want this team this draft," not "skip this draw only." Exclusion clears on any new draft (`startDraft`). Product still one skip token → `excludedSquadIds.length ≤ 1` in practice; field is a list so multi-skip can reuse it later.

  Arithmetic invariants (assert in tests):
  - `roundsPlayed === picks.length + (1 - skipRemaining) + (phase === 'AWAIT_PICK' ? 1 : 0)`
  - On `COMPLETE`: `picks.length === 11` and `roundsPlayed === 11 + (1 - skipRemaining)` (11 no-skip, 12 with skip).

  Repeat-reveal edge: a repeated squad may contain already-picked player ids; those are unpickable (domain throws, UI disables).
- **Rationale**: Immutable + pure = trivially testable, no hidden mutation bugs, React-friendly (`useState<DraftSession>`). Permanent exclude matches skip intent while degenerate last-resort keeps tiny corpora playable.
- **Alternatives**: Class with mutating methods (rejected: aliasing bugs, harder fixtures); XState (rejected: dependency + learning curve for 2-state machine); absolute never-reappear (rejected: impossible for corpus of 1).
- **Tradeoffs**: Object copying per transition — negligible at 12 rounds. Degenerate path can re-show a skipped squad only when no alternative remains.
- **Consequences**: `tests/draft.test.ts` can drive full drafts with a seeded RNG and assert every invariant, including corpus(1)+skip playability and corpus(2)+skip hard ban.
- **Risks**: Off-by-one in `roundsPlayed`. Mitigation: the arithmetic invariant above is a required test.
- **Revisit when**: multi-skip product change (list already ready); never for MVP otherwise.

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

- **Decision**: Static deploy to GitHub Pages. `vite build` → `dist/`, published by the standard `actions/deploy-pages` workflow on push to `main`. `vite.config.ts` sets `base: '/tennil/'` (project pages path).
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

**Amendment (2026-07-11, user product directive — supersedes stage sizes above):** Corpus window is World Cups **1986–2026 only**. Selection rule: **semifinalists (4)** of 1986/1990/1994/1998/2002 + **quarterfinalists (8)** of 2006/2010/2014/2018/2022/2026 = **68 squads target**. Prior icon-density / ≤2-per-country-per-stage criteria are superseded by this per-tournament stage rule. Shipped now: **60 squads** (1986–2022 complete); eight **2026 quarterfinalist** slots remain a documented gap for human fill after the tournament. Thresholds retune stays a separate gate after this data ship.

**Amendment (2026-07-11, ADR-017 hotfix — formation gate scaling):** `withFormationMinCounts` previously swapped only `minCounts` in the config view. That made 3-5-2, 4-4-2, and 5-3-2 mathematical traps: their max bucket sums fell below the band gates (tuned for 4-3-3's shape), so those formations could never beat 2-2. Fix: every band's `minBucketSums` are now scaled by `formation.minCounts[bucket] / referenceFormation.minCounts[bucket]`, rounded. The reference formation is looked up from `config.referenceFormation` in the formations catalog on each call (guard: missing or zero minCounts throws). Scaling preserves identity when the target matches the reference (4-3-3). Only `withFormation.ts` changes; `scoreBand`/`explainScoreBand` signatures untouched per ADR-017/C2.

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

---

## ADR-017 — Multi-formation catalog with soft scoring via ThresholdConfig view

- **Decision**: (1) `ThresholdConfig` gains a `formations` array — a catalog of `Formation` objects each with `id`, `label`, `description`, `minCounts`. Schema version bumped to 2. (2) `DraftSession.formationId` is set at `startDraft`; omitted → `referenceFormation` from config. (3) A pure helper `withFormationMinCounts(config, formationId)` returns a `ThresholdConfig` view with `minCounts` (and `referenceFormation`) overridden from the chosen formation — without widening `scoreBand`/`explainScoreBand` signatures (index C2). (4) UI formation picker is a StartScreen variant: full landing on first visit, compact formation-only gate on Draft Again (index C3). (5) Formation is advisory, never a hard block — `pick()` legality is unchanged; the 2-GK XI is still pickable, scoring punishes it via `minCounts` predicates (audit §Two-goalkeepers — option (c) recommendation). (6) Sim uses default formation only until multi-formation bots exist (documented in simulate.ts).
- **Rationale**: Giving the player a stated shape contract up front makes minCounts failure legible ("you chose 4-4-2 but only picked 1 ST"). Multi-formation depth adds replayability without changing the band algorithm (ADR-004). Config-view pattern keeps the engine stable.
- **Alternatives**: Thread `formationId` through `scoreBand`/`explainScoreBand` — rejected (breaks ADR-013 one-evaluator principle, cascade into sim). Separate `formations.json` file — rejected (fifth boot JSON, thresholds already has referenceFormation + minCounts). Hard position cap in `pick()` — rejected (removes consequence, couples draft legality to scoring config).
- **Tradeoffs**: Formation is scoring target, not rule — player can still draft a bad shape, see 1-2, and learn. Four formations (4-3-3/4-4-2/3-5-2/5-3-2) cover the major modern shapes; more can be added in data only.
- **Consequences**: `startDraft(data, rng, formationId?)` signature. Load validation checks formation sum invariants (GK===1, DEF+MID+ATT===10). Formation catalog is embedded in `thresholds.json` — no new files, no extra fetch. Existing drafts from before v2 use `referenceFormation` (4-3-3) by default.
- **Risks**: `withFormationMinCounts` creates a shallow copy — config.bands is shared (read-only, safe). If a future mutation path writes through the config view, this pattern breaks — mitigate by keeping `ThresholdConfig` fully read-only in the scoring path. UI tests broke on StartScreen signature change — updated in same commit.
- **Revisit when**: multi-formation sim bots would be a useful addition but are not an MVP requirement.

---

## ADR-018 — Person-identity pick rule (era-duplicate block)

- **Decision**: The corpus spans 11 World Cups, so one real person appears as multiple `Player` rows (different `id`, one per era squad — e.g. Messi in arg-2006..arg-2022). Once a person is picked, every other era-instance of that person becomes unpickable for the rest of the draft. Identity = normalized display name: lowercase, Unicode NFD with combining marks stripped, whitespace collapsed. New pure module `src/domain/draft/person.ts` exports `personKey(player)`, `pickedPersonKeys(picks)`, `isPersonTaken(session, player)`. `pick()` throws `IllegalActionError` when the candidate's person is already picked (checked after the existing id-duplicate check). Both simulate.ts bots filter `pickable` by the same helper so they never attempt an illegal pick against a re-revealed era-duplicate.
- **Rationale**: Fielding the same human twice or thrice (icon-stacking) was a scoring exploit the corpus-expansion (ADR-011) made newly possible; the product intent of the draft is one XI of distinct people.
- **Alternatives**: Block only exact-name-string match, no normalization (rejected: diacritic variants like "Raphaël"/"Raphael" across data-entry passes would silently bypass the rule); add a canonical `personId` to every player now (rejected: schema/version-bump churn before it's needed — see escape hatch below); block at UI layer only (rejected: violates ADR-002, legality must live in domain).
- **Tradeoffs**: Accepted limitation — two genuinely different people who happen to share an identical normalized name in the corpus would incorrectly block each other. Considered acceptable at current corpus size (no known collisions); revisit if the corpus grows past a size where this becomes likely.
- **Consequences**: Escape hatch reserved, not implemented now — an optional future `personKey` field directly on `Player` would override the derived key (schema change, own ADR/version bump when needed). No other schema change; no RNG; no UI/scoring/commentary files touched.
- **Revisit when**: a real name collision is found in the corpus, or corpus scale makes the derived-key limitation likely — then add the `personKey` override field.

---

## ADR-019 — Relative session scoring: session-ceiling efficiency + 9-band ladder

- **Decision**: (1) **Invariant amendment**: PROJECT.md/CLAUDE.md invariant 3 changes from "Outcome = deterministic band from squad composition + config only" to "**+ the session's reveal sequence** + config only". Still zero RNG in scoring; same reveals + same picks ⇒ same band, forever — the reveal SEQUENCE (`DraftSession.revealLog`) is now part of the deterministic input, not the RNG stream itself. (2) `DraftSession` gains `revealLog: string[]` — ordered squad id per reveal round, skipped round included (`revealLog.length === roundsPlayed`, always; canonical truth, ADR-015 sense — scoring input derives from it, it is not an ops/debug field). (3) New pure module `src/domain/scoring/sessionCeiling.ts`: `computeSessionCeiling(revealLog, squadsById, formationCounts, positionMap, personKeyFn) -> CeilingResult` — a DP over (round, GK/DEF/MID/ATT counts, conflict-person bitmask) computing the max-total XI the session's reveals could have produced, honoring one-pick-per-round (skip round contributes nothing), exact-or-best-partial formation bucket fill, and the person-identity rule (ADR-018, injected as a callback so this module never imports `src/domain/draft`). Never throws; degenerate corpora fall back to the best achievable partial fill. (4) `ScoreInput` gains `ceiling: CeilingResult`; `computeScoreInput(xi, positionMap, ceiling)` — ceiling is a new required third parameter (breaking signature, sanctioned here). `scoreBand`/`explainScoreBand` signatures are UNCHANGED (ADR-013 single-evaluator principle holds — they still just take `(input, config)`). (5) `evaluateBandPredicates` (ADR-013) gains two predicate types, read generically like all others: `minEfficiency` (required = `band.minEfficiency`, actual = `round(100 * userTotal / ceilingTotal)`) and `minBucketEfficiency` (same convention, per bucket). Both required/actual are **integer percentage points** (0-100) so margins read as "2 points of efficiency from a 5-0". `ceilingTotal` (or a bucket's ceiling sum) of 0 ⇒ actual 100 (never penalize a degenerate ceiling). `thresholds.json` authors `minEfficiency`/`minBucketEfficiency` as **fractions in [0,1]** (matching the ladder's "~.NN" shorthand); `loadData` validates the fraction range and converts to the integer-percentage-point `BandDef` field the evaluator reads. (6) **9-band ladder** replaces the 6-band absolute-sum ladder: `10-0 · 7-1 · 5-0 · 4-1 · 3-1 · 2-1 · 1-1 · 1-2 · 0-4` (fallback). `2-2` retires; `1-1` is its ladder successor ("NERVY DRAW" slot) but ships as a fresh placeholder script, not a renamed one (W2 authors it properly). `minBucketSums` is dropped from every real band (efficiency replaces it as the scoring denominator) but the `BandDef` field, `evaluateBandPredicates` support, and `withFormationMinCounts` scaling all stay — exercised via synthetic configs (`tests/scoring.test.ts`) — since a future band or formation-specific absolute floor may still want it. `minWeakLink` stays as an absolute floor (a 62-rated weak link is bad in any era, ceiling-relative or not).
- **Rationale**: Absolute `minBucketSums` gates were tuned against one reference formation's ceiling; every non-reference formation (and, more fundamentally, every unlucky reveal sequence) had a DIFFERENT true ceiling, so large swaths of sessions (and pre-hotfix, 3 of 4 formations) could mathematically never reach the top bands — a churn risk flagged after the corpus-16 retune (see RISKS_AND_UNKNOWNS.md experiment log 2026-07-11). Scoring relative to what THIS session's reveals could have produced makes every session's 10-0 reachable in principle: perfection = drafting the best XI your reveals allowed, not the best XI abstractly possible.
- **Alternatives**: Keep absolute gates and widen them per formation via more `withFormationMinCounts`-style scaling (rejected: doesn't fix the reveal-luck half of the problem, only the formation half — ADR-017's hotfix already covers formation scaling and this is a superset fix); score against the FULL corpus's theoretical best XI regardless of what was revealed (rejected: unreachable by construction for any real session, defeats the "10-0 always reachable" goal); track exact per-player identity in the ceiling DP state instead of a conflict bitmask (rejected: state-space blowup for zero practical benefit — cross-round person collisions are rare and the bitmask only grows for players actually offered in 2+ rounds).
- **Tradeoffs**: `computeScoreInput` callers now need a `CeilingResult` in hand (session's `revealLog` + squad lookup + formation counts) before scoring — one more assembly step at each of the three call sites (ResultScreen, scripts/simulate.ts, tests) versus the previous two-argument call. The 9-band ladder's efficiency gates ship as W1 PLACEHOLDER numbers (interpolated from the old ladder's floors); W3 (RISKS rarity protocol) retunes them against real corpus-60 sim data — until then band distribution is expected to be unbalanced, not a regression.
- **Consequences**: Data flow becomes `loadData → validate → startDraft → (pick|skip)* → getFinalXI` ‖ `computeSessionCeiling(session.revealLog, ...)` `→ computeScoreInput(xi, positionMap, ceiling) → scoreBand → buildCommentary → UI` (ARCHITECTURE.md §3 updated). `thresholds.json` bumps to version 3; `loadData` accepts 1/2/3 (existing configs still load) and validates the new fields fail-closed. Commentary keeps its "every band id has a script" cross-check; W1 satisfies it with reused scripts for persisting ids (`10-0/5-0/3-1/1-2/0-4`) and minimal `_placeholder: true` scripts for the four new/changed ids (`7-1/4-1/2-1/1-1`) — W2 replaces the placeholders.
- **Risks**: A DP bug could silently under- or over-state the ceiling, breaking the "10-0 always reachable" promise even though the code runs without error. Mitigation: property tests assert the ceiling is a genuine upper bound against 25 real seeded greedy drafts, that efficiency 1.0 is attainable by explicit construction, and that the person rule and skip-round-contributes-nothing hold (`tests/sessionCeiling.test.ts`). Placeholder efficiency numbers may produce a temporarily lopsided W1 histogram (some new bands rare/dead) — expected and owned by the W3 gate, not silently shipped as final tuning.
- **Revisit when**: W3 retunes the efficiency gates from corpus-60 sim data (six-gate protocol); if that retune shows the bitmask-conflict approach in `sessionCeiling.ts` scales poorly as corpus grows past the 68-squad target (ADR-011 amendment), reconsider the person-tracking strategy then.

**Amendment (2026-07-12): Reveal-Luck Law** — Future scoring dimensions (chemistry links, attributes, spine/profile fit) are governed by the Reveal-Luck Law: any outcome-determining gate that the session's reveals can lock a player out of must be either RELATIVE to what the reveals offered (efficiency-vs-ceiling, as in ADR-019) or SMALL (~1–2 band-percentage impact, never the difference between winning and losing). Players must always be able to win the session they were dealt.

---

## ADR-014-lite — Daily seed + seed capture (Wordle mechanics, no persistence)

- **Decision**: (1) Two play modes: `'daily'` and `'free'`, recorded on `DraftSession` as new fields `readonly seed: number` and `readonly mode: 'daily' | 'free'`. (2) `src/lib/rng.ts` gains `dailySeed(date: Date): number` — derives an integer from the UTC calendar date (`year*10000 + month*100 + day`) spread through one `mulberry32` mixing step for distribution, and `seededRng(seed)` as a readability alias for `mulberry32(seed)`. `systemRng()` is retired from production call sites (the type stays exported; nothing deletes it, ADR-008's interface is unchanged) — App no longer calls it. (3) `startDraft(data, rng, formationId?, options?: StartDraftOptions)` — `StartDraftOptions = { seed?: number; mode?: 'daily' | 'free' }` is a new optional 4th parameter (additive, all existing 2-arg/3-arg call sites unchanged); `seed`/`mode` are stamped onto the returned session but do NOT construct `rng` themselves. The caller (`App`) is the single place that turns a seed into an `Rng`: daily mode uses `mulberry32(dailySeed(new Date()))`; free mode captures a fresh `Math.floor(Math.random() * 2**31)` integer seed BEFORE constructing `mulberry32(seed)` (Math.random still seeds free play — that is draft-RNG territory ADR-008 already allows — but now the seed is captured, not thrown away). One `Rng` instance is built at `startDraft` time and threaded through the whole session's lifetime (App holds it in a ref; every subsequent `pick`/`skip` call reuses the same instance) so a session's entire reveal sequence is reproducible from its one recorded seed. (4) `src/lib/daily.ts` (new file) exports `matchdayNumber(date: Date): number` — days since the World Cup 2026 opening (2026-06-11 UTC) plus one. Landing screen shows a mode toggle (`Today's Matchday` primary / `Free Draft` secondary) and, when daily is selected, a `MATCHDAY #N` badge. Draft Again repeats the same mode the finished session used (`DraftSession.mode`) — daily replay reuses the SAME seed (same UTC date ⇒ same `dailySeed`), so it intentionally re-plays the identical reveal sequence; the formation-only gate's CTA is honestly labeled `Replay Today's Draw` in that case instead of `Confirm Draft`.
- **Rationale**: A shared daily seed is the growth-loop mechanic ROADMAP §3.5 prioritizes first (Wordle-style "everyone played the same draft today," comparable results) — and it is cheap because the state machine is already pure + deterministic (ADR-003/008), so "same seed in ⇒ same reveals out" was already true, it just was never exposed. Capturing (not persisting) the free-play seed costs nothing and makes any session attributable/replayable later without pre-committing to a full replay feature now.
- **Alternatives**: A server-issued daily seed (rejected: no backend, non-goal); `crypto`-derived randomness for free play (rejected: ADR-008 already settled this, `Math.random` is fine for draft RNG and simpler); storing the seed in `localStorage`/URL now (rejected below — explicitly deferred, ADR-010 stays intact).
- **Tradeoffs**: `DraftSession` grows two fields every call site's fixtures/snapshots must account for (mitigated: both default in `startDraft` when `options` is omitted, so untouched test call sites stay valid — `seed` defaults `0`, `mode` defaults `'free'`). Daily "replay" is a deliberate repeat, not a fresh draft — that is correct Wordle-style behavior but is a UX subtlety the button label exists to make honest.
- **Consequences**: `startDraft` signature evolves to `(data, rng, formationId?, options?)` (ARCHITECTURE.md §3/§4 updated). No persistence added anywhere — ADR-010 is unchanged and explicitly reaffirmed: the daily seed is re-derived from the date each visit (never stored), and a free-play seed lives only in in-memory `DraftSession` state for that session's lifetime, gone on reload. Full replay-from-seed (reconstructing a session from `seed` + an action log) and shareable result links are still deferred to a future full ADR-014 (ROADMAP §3.5) — this ADR only ships seed capture + the daily/free mode split, not replay.
- **Revisit when**: the full replay/share-link feature (ROADMAP §3.5) is prioritized — that ADR will decide the action-log format and whether/how a seed+log is ever persisted or encoded into a shareable string.

---

## ADR-020 — Attributes, ProfileFit & Daily Opposition (v2, Reveal-Luck-Law-bounded)

- **Decision**: (1) **Squads schema v2**: outfield `Player` gains three integer attrs, `pace`/`strength`/`accuracy` (1-99) — a second skill axis alongside `rating` (OVR), read against a formation's shape rather than summed. GK keeps single `rating` only; a GK carrying any attr, or an outfield player missing one, is a fail-closed boot error, checked BOTH directions (`squads.json` version 1 → 2). `attrs-overrides.json` (Wave B) makes hand-curated attrs canon over the generator, same convention as ratings (ADR-012). (2) **ProfileFit**: a new pure module `src/domain/scoring/profileFit.ts` gains types this wave (`AttrName`, `Attrs`, `AttrBucket` = `PositionBucket` minus `GK`, `FormationProfile`, `OppositionDef`); `computeProfileFit`/`selectOpposition` land in Wave C. `FormationProfile` is `Record<AttrBucket, { weights: Attrs; targets: Attrs }>` — per formation, per outfield bucket, how much each attr axis matters (`weights`, 0-1) and what mean value the bucket's XI should hit (`targets`, 1-99 authored 70-90 in practice). Fit (0-100) will be 100 minus the weighted normalized shortfall of the XI's per-bucket attr means vs targets — overshoot is never penalized, GK is excluded from every profile (no attrs to read). (3) **DailyOpposition**: `OppositionDef = { id, label, tagline, weightMods: Partial<Attrs> }` — a small rotating catalog (`thresholds.json` `oppositions`), selected by `dailySeed % catalog` in daily mode (Wave C), always `neutral` (required catalog member, `weightMods: {}`) in free play. `weightMods` multiplies a formation profile's weights before fit is computed (`effectiveFit`) — it reshapes what the day rewards, never adds a new axis. (4) **Band integration**: `BandDef` gains `minFit?: number` (integer 0-100), staged at `0` on the top three bands only (`10-0`/`7-1`/`5-0`) this wave — a placeholder, tuned for real in Wave D. `PredicateName` gains `'minFit'`; the evaluator implementation (`evaluateBandPredicates`) is Wave C, not this one. (5) **Schema v4**: `thresholds.json` bumps to version 4, gaining `profiles: Record<formationId, FormationProfile>` (one entry per cataloged `Formation`, fail-closed both directions — every formation needs a profile, every profile key must be a known formation id) and `oppositions: OppositionDef[]` (non-empty, unique ids, must include `neutral`, `weightMods` keys restricted to the three attr names). `loadData.ts` validates all of the above generically (collected into the existing fail-closed problem list, never a separate throw path) mirroring the established dual-version-acceptance pattern (squads 1|2 accepted this wave since the real corpus stays v1 until Wave B; thresholds versions 1-4 all accepted, structural requirements — `profiles`/`oppositions` like `formations` before them — are unconditional, not version-gated, matching the existing `formations` precedent).
- **Rationale**: The OVR/efficiency core (ADR-004/019) is the retention engine and stays untouched; a second, config-driven axis is the cheapest way to make 10-0 harder without re-tuning what already works, IF the new gate obeys the Reveal-Luck Law (ADR-019 amendment) — fit gates are small (~one rung) and never override the session's reveal-bounded ceiling. Making `profileFit.ts` a types-only module this wave (rather than folding the types into `types.ts` directly) keeps the eventual pure `computeProfileFit`/`selectOpposition` functions colocated with the types they consume, matching the existing `scoring/` module convention (`sessionCeiling.ts`, `formationFit.ts` each own their types + logic together).
- **Alternatives**: Fold `Attrs`/`FormationProfile`/`OppositionDef` directly into `types.ts` (rejected: `types.ts` would grow scoring-specific vocabulary that belongs with the module that computes on it — the existing precedent already lets `ScoreInput`/`BandDef`/`PredicateResult` live in `types.ts` as cross-module contracts while computation types like these stay near their logic); gate the new `profiles`/`oppositions` requirement only when `thresholds.version === 4` (rejected: `formations` already established the unconditional-requirement pattern for schema-additive fields regardless of the declared version number — mirroring it keeps `loadData.ts` one validation style, not two); let attrs live on a separate `attrs.json` keyed by player id (rejected: a fifth boot file for data that's 1:1 with `Player` rows — inline fields on `Player` keep one join, matching how `rating` already works).
- **Tradeoffs**: `ThresholdConfig` gaining required `profiles`/`oppositions` fields is a breaking change for every existing synthetic `ThresholdConfig` fixture across the test suite (scoring.test.ts, audit-scoring.test.ts, formationFit.test.ts, sessionCeiling.test.ts, explainScoreBand.test.ts, draft.test.ts, audit-draft.test.ts, personRule.test.ts) — all updated in this same commit with minimal `profiles: {}, oppositions: []` (unused by those synthetic scoring/draft fixtures, which don't exercise fit) or a small valid stub (audit-loaddata.test.ts's own synthetic bundle), following the ADR-017 precedent ("UI tests broke on StartScreen signature change — updated in same commit"). `minFit: 0` on three real bands is an explicit staged placeholder (like ADR-019's W1 efficiency numbers) — it changes nothing about band reachability today (any `fit >= 0` passes) and is owned by the Wave D tuning gate, not silently shipped as final.
- **Consequences**: `Player` gains optional `pace?/strength?/accuracy?` (present iff squads v2 and not GK). `ThresholdConfig` gains `profiles`/`oppositions` (both required, non-optional — every real config must carry them from v4 onward). `BandDef` gains `minFit?`. `loadData.ts` fail-closed-validates: squads v1 forbids attrs entirely; squads v2 requires all three attrs (integer 1-99) on every non-GK player and none on the GK; thresholds v4 requires a `profiles` entry per cataloged formation (each bucket DEF/MID/ATT with `weights`/`targets`, each a full `{pace,strength,accuracy}` object, weights in [0,1], targets in [1,99]), a non-empty `oppositions` catalog with unique ids including `neutral` and `weightMods` restricted to the three attr names, and `minFit` (when present) as an integer in [0,100] capped at 3 bands total. The real `thresholds.json` ships v4 now with profiles for all four formations (4-3-3 wing-pace/mid-accuracy, 4-4-2 balanced, 3-5-2 mid-accuracy-heavy, 5-3-2 DEF-strength/ST-pace) and six oppositions (PRESSING MACHINE, LOW BLOCK, AERIAL BOMBARDMENT, COUNTER KINGS, POSSESSION CULT, NEUTRAL) — numbers are Wave A's best-effort authoring per spec §3's descriptions, subject to Wave D's sim-driven retune. `computeProfileFit`, `selectOpposition`, the `minFit` evaluator branch, and every scoring call-site update are explicitly Wave C, not this ADR.
- **Risks**: A too-permissive fit gate (or a badly-tuned `weightMods`) could make some opposition archetype mathematically block 10-0 for a formation — this is exactly what the Reveal-Luck Law and Wave D's `--opposition cycle` sim gate exist to catch before it ships tuned; this wave's `minFit: 0` placeholder cannot trigger that risk (0 always passes). Authoring six oppositions' taglines by hand risks drifting from the "dry pundit voice" — flagged here for orchestrator taste review alongside the exact JSON.
- **Revisit when**: Wave B lands real corpus attrs (squads.json → v2 for real, dual-accept of v1 can retire once nothing on `main` still needs it); Wave C implements the fit/opposition math and wires `minFit` into `evaluateBandPredicates`; Wave D retunes the `minFit` numbers and profile weights/targets from corpus-60 sim data against the §4 difficulty targets (fit-aware 10-0 6-7%, attr-blind 3-4%).

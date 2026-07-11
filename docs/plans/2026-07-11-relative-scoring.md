# Relative session scoring + 9-band ladder (ADR-019)

**User decision 2026-07-11:** (1) hotfix formation-gate scaling immediately (shipped separately under ADR-017 amendment); (2) replace absolute sum gates with **relative-to-session-ceiling scoring**; (3) widen the ladder to 9 bands. Motivation: 12-of-60 reveal luck + absolute gates meant many sessions (and, pre-hotfix, 3 of 4 formations) could never win — churn risk. Under the new model every session has a reachable 10-0: perfection = drafting the best XI your reveals allowed.

## Core design

**Session ceiling (new pure function).** `computeSessionCeiling(revealLog, squadsById, formation, positionMap): CeilingResult` — the maximum-total-rating XI a player could have drafted this session, honoring: one pick per reveal round (skip = one round contributes nothing), formation bucket counts exactly (1 GK + formation.minCounts shape summing to 11), person-identity rule (ADR-018). Implementation: DP over (round index, gk, def, mid, att counts) — ~12 rounds × small count space; deterministic, pure, no RNG. Returns per-bucket ceiling sums + total.

**ScoreInput v2.** Keep `bucketSums/bucketCounts/weakLink`; add `ceiling: { bucketSums, total }`. `computeScoreInput` gains the ceiling parameter (breaking signature — ADR-019 sanctions it; ARCHITECTURE §3 updated).

**Band predicates v2 (extend the one evaluator — ADR-013).** New generic `BandDef` fields, read by `evaluateBandPredicates` alongside the existing ones: `minEfficiency` (userTotal / ceilingTotal), `minBucketEfficiency` (partial per-bucket map). Keep `minWeakLink` (absolute floor — a 62-rated weak link is bad in any era), `requireAllBucketsNonEmpty`, `requireMinCounts`. Efficiency predicates emit `PredicateResult` with `required`/`actual` as ratios ×100 (integer percentage points) so near-miss margins read "2 points of efficiency from a 5-0". Formation scaling hotfix becomes irrelevant for efficiency gates (ceiling is computed under the same formation) but stays for any residual absolute gates.

**DraftSession gains `revealLog: string[]`** (ordered squad id per round, includes the skipped round's squad). ADR-015 note: this is canonical truth (scoring input derives from it), not ops.

**9-band ladder** (ids = scorelines; placeholder efficiency gates for W3 retune):
10-0 (~.98) · 7-1 (~.96) · 5-0 (~.93) · 4-1 (~.90) · 3-1 (~.86) · 2-1 (~.81) · 1-1 (~.74) · 1-2 (~.62) · 0-4 (fallback). 2-2 retires; 1-1 inherits "NERVY DRAW". Commentary v2: scripts for all 9 (reuse 10-0/5-0/3-1/1-2/0-4, retitle 2-2→1-1, author 7-1/4-1/2-1).

**Invariant amendment (ADR-019):** "Outcome = deterministic band from squad composition + config only" → "…from squad composition + the session's reveal sequence + config". Still zero RNG in scoring; same reveals + same picks ⇒ same band, forever. PROJECT.md + CLAUDE.md checklist wording updated in W1.

## Waves

| Wave | Agent | Scope | Gate |
|---|---|---|---|
| W1 domain | Sonnet (Claude) | ADR-019; `revealLog`; `sessionCeiling.ts` (DP); ScoreInput v2; evaluator extension; thresholds v3 schema + loadData validation + placeholder numbers; PROJECT/CLAUDE/ARCHITECTURE wording; all tests incl. ceiling-DP properties (ceiling ≥ any legal draft, incl. greedy-sim XIs; 10-0 reachable: efficiency 1.0 attainable by construction) | 212+ tests, build, purity, sim completes |
| W2 commentary | Deepseek max | commentary.json v2 — 9 scripts, house tone, slots validated | loadData band↔script check green; user tone review |
| W3 balance | Grok high (judgment tier) | sim efficiency percentiles + retune 9 gates: greedy 10-0 5-7%, every band ≥1% in one bot, near-miss(2pts eff) 10-20% for top band; RISKS log + sim-report | six-gate protocol |
| W4 UI | GLM (go) | BandSlam/nearMiss copy → efficiency margins ("left N points on the table in MID"); scoreline parser already handles new ids; formation advisory chips unchanged | browser drive |

Sequencing: W1 → (W2 ∥ W3) → W4 → full browser verify → push. Prompts cached as P-025…P-028 in `.claude/subagent-prompts.md`.

## Must not break
11 picks / 1 skip; person rule (ADR-018); pure scoring/commentary, RNG reveal-only; compute-once playback; config-driven numbers (efficiency gates live in thresholds.json v3); one predicate evaluator, three consumers; no backend/router/meta-progression (ROADMAP §3.7).

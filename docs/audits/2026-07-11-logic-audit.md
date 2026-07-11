# Logic Audit — 2026-07-11

Edge-case audit of `src/domain/**` and `src/lib/**` against ARCHITECTURE.md /
DECISIONS.md (ADR‑003/004/005/013) and ADR‑008. Audit scope: **hunt logical
errors via extensive edge-case testing**, exclude skip re‑reveal / permanent
exclusion semantics (being reworked by another agent).

## Method

Four new test files were written with **inline synthetic fixtures only** (no
import of `squads.json` / `thresholds.json` / `commentary.json`):

| File | New tests | Coverage |
|------|-----------|----------|
| `tests/audit-draft.test.ts` | 23 | pick legality guards; actions after COMPLETE; skip-token accounting; 11th-pick completion exactness; breachLog correctness (no-skip path); rng determinism; purity/structural |
| `tests/audit-scoring.test.ts` | 21 | empty XI; single-bucket XI; exact boundary `actual == required`; fallback selection; duplicate-priority determinism; minBucketSums subset; positionMap-as-truth; explain↔score consistency; weakLink semantics |
| `tests/audit-commentary.test.ts` | 18 | slot-resolution ties (every slot, ascending-id); empty-bucket fallback to captain; missing/no slots; band-with-no-script throw; determinism; purity |
| `tests/audit-loaddata.test.ts` | 22 | malformed entries **collected not fail-fast**; boundary ratings; duplicate ids (player/squad/band); cross-section band↔commentary; structural edge cases |

Suite stayed green throughout: the 84 new tests pass alongside the 85
pre-existing tests → **169 passed / 0 failed across 16 files**. Purity greps
clean:

```
grep -rn "Math.random\|rng" src/domain/scoring src/domain/commentary   → (empty)
grep -rn "from 'react'\|from \"react\"" src/domain src/lib            → (empty)
```

No `src/` or pre-existing test file was modified. No `git add` / `git commit`
was run.

## Findings

**No genuine functional bug was found inside the audit scope.** Every behaviour
exercised by the new tests is *correct* and is now locked in by a passing
test. The only items worth recording are **design-level observations and
defensive gaps** — each unreachable through the validated public pipeline
(`loadGameData` → `startDraft` → `pick`/`skip` → `getFinalXI` →
`computeScoreInput` → `scoreBand` → `buildCommentary`), so none causes a
runtime failure today. They are listed below in case a later change widens
their reach.

| # | Severity | Location | Repro | Proposed fix |
|---|----------|----------|-------|--------------|
| F‑1 | LOW (design consistency) | `src/domain/commentary/build.ts:40‑43` | Scoring buckets players by `positionMap[player.positionRaw]` (map is source of truth, ARCH §5); commentary buckets by the denormalized `p.positionBucket` field. For a player whose `positionBucket` ≠ `positionMap[positionRaw]` the two modules would disagree on the player's bucket. **Unreachable:** `loadData.ts:276` rejects exactly this mismatch at boot, and `getFinalXI` returns the stored (validated) players unchanged. | Pass `positionMap` into `buildCommentary` (signature change → needs ADR‑005 schema/order amendment) **or** accept current validation-enforced equivalence and add a one-line comment in `build.ts`. Recommendation: accept + comment (cheapest, zero behaviour change). |
| F‑2 | LOW (defensive gap) | `src/domain/scoring/scoreBand.ts:33‑35` | `const bucket = positionMap[player.positionRaw]; bucketSums[bucket] += player.rating;` — if a player's `positionRaw` is absent from the map, `bucket` is `undefined` and the rating is silently aggregated under an `undefined` key while every real bucket stays short. **Unreachable** through the public flow (validation guarantees every `positionRaw` is mapped). It is a library footgun if a caller hand-builds a `FinalXI` + sparse `PositionMap`. | Add `invariant(bucket, \`unmapped positionRaw ${player.positionRaw}\`)` using `src/lib/assert.ts`. One line; turns silent corruption into a thrown Error. |
| F‑3 | LOW (determinism robustness) | `src/domain/scoring/scoreBand.ts:124`; `src/domain/scoring/explainScoreBand.ts:22` | `sort((a,b) => b.priority - a.priority)` with no secondary key. ADR‑004 mandates priority-descending, first match wins, but does **not** require band priorities to be distinct nor specify a tie-break. Ties resolve to config insertion order *only because* V8/Node TimSort is stable. The real `thresholds.json` uses all-distinct priorities (100/80/60/40/20/0), so no current impact. | Add an explicit stable secondary key — e.g. sort by `priority desc, then original config index asc` — so determinism is guaranteed by the engine rather than by a JS-engine stability guarantee. One line; add a guard test that two equal-priority bands always resolve by config order (already added in `audit-scoring.test.ts` to lock current behaviour). |
| F‑4 | LOW (defensive gap) | `src/domain/commentary/build.ts:39,44` | `const captain = pick(xi, 'max', () => true)!;` and `const weakest = pick(xi, 'min', () => true)!;` use the `!` non-null assertion. On an empty `FinalXI` both resolve to `null!.name` → `TypeError`. **Unreachable:** `getFinalXI` throws unless `phase === 'COMPLETE'`, which requires exactly 11 picks. A library caller passing `[]` would crash with a nondescript `TypeError` instead of a domain error. | Drop the `!`, and on null throw `new Error('buildCommentary requires a non-empty FinalXI')`. Two lines. |

**Post-fix tests that would be added (none are failing today):**

- *If F‑2 is fixed:* `computeScoreInput([{…positionRaw:'XX',rating:80…}], {GK:'GK'})` should throw an `Error` mentioning `XX`.
- *If F‑4 is fixed:* `buildCommentary(band, [], cfg)` should throw a domain `Error`, not a `TypeError`.
- *If F‑3 is fixed:* the duplicate-priority test in `audit-scoring.test.ts` already locks the deterministic behaviour and would continue to pass.

## The two-goalkeepers question

> *Current design allows any XI composition (11 picks, any positions; scoring
> punishes via `minCounts` gates). Analyze bug‑vs‑design honestly.*

**Verdict: this is design, not a bug.** The behaviour is consistent across
ADR‑003 (pick legality), ADR‑004 (scoring), and the data/config:

1. `pick()` (`session.ts:81‑105`) checks only three legality predicates:
   `phase === 'AWAIT_PICK'`, `playerId ∈ currentReveal.players`, and `playerId`
   not already picked. There is **no position cap**, and one is not implied by
   any ADR. Picking two GKs (or zero GKs, or 8 attackers) is a legal sequence of
   legal picks.
2. The consequence lives in scoring. `evaluateBandPredicates`
   (`scoreBand.ts:60‑110`) checks `requireMinCounts` against
   `config.minCounts`. The committed `thresholds.json` sets
   `minCounts = {GK:1, DEF:4, MID:3, ATT:3}` (sum 11) and the three top bands
   (`10-0`, `5-0`, `3-1`) all set `requireMinCounts: true`. With 11 picks total,
   any XI with 2 GKs has at most 9 outfield slots and therefore necessarily
   fails at least one of DEF≥4 / MID≥3 / ATT≥3 — so a 2‑GK XI **can never** reach
   the `requireMinCounts` bands. It falls to `2-2` or `1-2` (if their
   `requireAllBucketsNonEmpty` + `minBucketSums` + `minWeakLink` still hold) or
   to the `0-4` fallback. A 0‑GK XI fails `requireAllBucketsNonEmpty` on every
   non-fallback band. The "bad shape" is gated by a *combination* of the min-count
   floor and the 11-pick budget — which is exactly the ADR‑004 intent ("needs a
   real GK", ARR §band gaps mitigated by the fallback).

So the game already *punishes* a foolish XI; it just doesn't *prevent* one. The
open question is whether to convert some of that punishment into prevention.

### Options evaluated

**(a) Hard block in `pick()` (draft-level position caps).** Have `pick()` throw
`IllegalActionError` when the new pick would breach a per-bucket cap (e.g. no
more than 1 GK). 

- *Pro:* removes a whole class of "I drafted myself into a guaranteed-loss XI"
  states; the reveal grid never even offers an illegal pick once the cap is hit.
- *Con — and this is the load-bearing one:* **it removes meaningful
  consequence.** The aha-moment of Draft‑XI — "I grabbed a second keeper because
  he was rated 90 and now my attack is starved" — *is the game*. ADR‑004's
  entire predicate model exists to turn shape mistakes into scoreline
  mistakes. A hard block turns a strategy tax into a UI lockout, which is
  strictly less interesting and lands worse in game feel (the player is told
  "no" instead of being allowed to fail and learn). It also (i) couples draft
  legality to `minCounts`, dragging scoring config into the draft layer ADR‑003
  says must not own scoring; (ii) needs a per-band or per-formation cap
  decision (which cap? 1 GK is obvious, but "≤5 DEF" is a formation choice, not
  a universal rule — see the formation plan); and (iii) requires a **new ADR**
  before any change to `pick()` legality (CLAUDE.md invariant checklist:
  "Draft RNG injected, used ONLY for squad selection"; ADR‑003 owns the
  transition legality list).

**(b) UI-only warning at pick time.** When the prospective pick would push a
  bucket past a soft count or leave a bucket empty late in the draft, the UI
  shows a non-blocking note ("That's your 2nd GK — your XI will be shape-penalised").
  Domain unchanged; zero ADRs.

- *Pro:* preserves all consequence; cheap; reversible; no purity/layering risk.
- *Con:* the UI must derive "would breach minCounts" from
  `data.thresholds.minCounts` + `session.picks` — which ADR‑002 says the UI must
  *not* own ("UI may read session to disable controls, but every action goes
  through domain functions"). A *read-only* advisory derived from already-public
  config is within the spirit of "read", but any per-formation version needs the
  formation feature (option c) first.
- *Recommendation for MVP:* ship a minimal, toggleable, read-only advisory if
  playtest feedback shows players don't realise a shape is doomed. Otherwise
  skip — the ResultBreakdown UI (ADR‑013, Phase 2) already shows the failing
  `minCounts` predicates with margins, which is the superior post-hoc signal.

**(c) Formation advisory pre-lock (the planned ADR‑017 feature).** Per
  `docs/plans/2026-07-11-formation-choice.md`, the user chooses a formation
  *before the first reveal*; the chosen formation's `minCounts` overrides the
  default on a `ThresholdConfig` view consumed by scoring. The plan's own
  Global Constraints state explicitly: **"No hard lock block"** and **"shape
  mismatch only fails those predicates"** — i.e. formation is a soft target, not
  a draft-legality rule. `scoreBand` / `explainScoreBand` keep their two-arg
  purity; nothing is threaded through the draft.

- *Pro:* gives the player a *stated* shape contract up front (e.g. "you're
  playing 4-4-2, so ATT is cheap and MID is the headline"), which makes the
  two-GK mistake legible *as* a mistake against their own choice rather than
  against an invisible default. It also subsumes option (b): the formation gate
  *is* the pre-lock advisory, and a UI badge can show "Formation: 4-3-3" during
  the draft.
- *Con:* it does not by itself prevent two GKs either (by design — the plan
  forbids the hard block). And it needs ADR‑017 landed first.

### Recommendation

**Do (c) — the formation advisory — when ADR‑017 lands. Do not do (a).** (b)
only as astopgap if playtest shows silent doomed drafts *before* ADR‑017 ships
(and keep it read-only / off the domain).

**Rationale, grounded in game feel:** the central tension of Draft‑XI is
"compose an XI → read the consequences off the scoreline." A hard block (a) is
the game telling the player their fun is over before the draft ends; the
predicate-gated soft punishment the engine already implements is the game
letting the player *finish their bad idea and see the 1-2*. The planned
formation feature (c) sharpens that loop — the player chose 4-3-3 and can see
exactly which `minCounts` they missed by (via ResultBreakdown, ADR‑013) — instead
of removing it. A hard block would also couple two layers (draft legality ↔
scoring config) that ADR‑002/003 deliberately keep apart, and would force a
choice of cap values that are really *formation* choices — which is exactly the
domain ADR‑017 is about to own.

**ADR requirement (explicit):** any change to `pick()` legality — i.e. enacting
(a) or any cap/advisory *enforced inside* the domain — is a change to the
ADR‑003 state machine's transition rules and the invariant checklist ("Draft
RNG injected, used ONLY for squad selection"; "pick/skip legality list"). Such a
change **requires a new ADR in `DECISIONS.md` before implementation**, and the
invariant checklist / purity rules in `ARCHITECTURE.md §4` must be updated in
the same change. Option (c) already carries this: ADR‑017 amends the
`ThresholdConfig` schema and `startDraft` signature; it must **not** amend
`pick()`'s legality predicate list, and the formation plan correctly scopes
itself to config + scoring-call-site.

## Summary

- 84 new tests added, 0 existing tests modified, 0 `src/` files touched.
- `npm test`: 169 passed / 169 (16 files). Purity greps clean.
- No genuine bug inside audit scope; 4 LOW design/defensive findings logged (F‑1..F‑4), none currently reachable.
- Two-goalkeepers: design, not bug. Recommend option (c) at ADR‑017 time; reject hard block (a); (b) only as a read-only stopgap.
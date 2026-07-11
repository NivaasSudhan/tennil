# ARCHITECTURE.md — World Cup Draft-XI Game

Companion to DECISIONS.md (ADR ids referenced throughout). All code TypeScript strict. Domain model names are canonical — use them exactly: `DraftSession`, `Round`, `Squad`, `Player`, `Pick`, `SkipToken` (modeled as `skipRemaining`), `FinalXI`, `PositionBucket`, `ScoreInput`, `ScoreBand`, `ThresholdConfig`, `CommentaryScript`, `CommentaryBeat`.

## 1. Components and data flow (one way, never backwards)

```
 JSON files (vendored)                 src/domain                        src/app (React)
┌──────────────────────┐   ┌────────────────────────────────┐   ┌─────────────────────────┐
│ squads.json          │   │ loadData ──► GameData          │   │ DraftScreen             │
│ thresholds.json      ├──►│    │ (validate, fail closed)   │   │  reveal grid, pick/skip │
│ commentary.json      │   │    ▼                           │   │  running squad panel    │
│ position-map.json    │   │ draft/  startDraft/pick/skip   │◄──┤ (calls domain fns only) │
└──────────────────────┘   │    │  (rng injected, ADR-008)  │   │                         │
                           │    ▼ COMPLETE                  │   │ ResultScreen            │
                           │ getFinalXI ──► FinalXI         │   │  playthrough beats →    │
                           │    ▼                           │   │  final scoreline        │
                           │ scoring/ scoreBand (PURE)      ├──►│                         │
                           │    ▼ bandId                    │   └─────────────────────────┘
                           │ commentary/ buildCommentary    │
                           │        (PURE, band → script)   │
                           └────────────────────────────────┘
```

Flow: `loadData → validate → startDraft → (pick | skip)* → getFinalXI → computeScoreInput → scoreBand → buildCommentary → UI`.

Stage split (Invariant 3–4): **Stage A (truth)** = `scoreBand(XI, ThresholdConfig)` → band. **Stage B (skin)** = `buildCommentary(band, XI, scripts)` → `CommentaryScript`. Stage B contains no RNG and cannot change the band.

## 2. Repo layout (target)

```
/
  PROJECT.md ARCHITECTURE.md DECISIONS.md IMPLEMENTATION_PLAN.md
  TASKS.md RISKS_AND_UNKNOWNS.md CLAUDE.md
  package.json  vite.config.ts  index.html
  public/
  src/
    main.tsx
    app/                     # UI shells only (DraftScreen, ResultScreen, components)
    domain/
      types.ts               # shared domain types (sketch already committed)
      loadData.ts            # load + validate all JSON; throws DataValidationError
      draft/session.ts       # state machine (ADR-003)
      scoring/scoreBand.ts   # pure calculator (ADR-004)
      commentary/build.ts    # band → script (ADR-005)
    data/
      squads/squads.json
      config/thresholds.json
      config/commentary.json
      position-map.json
    lib/
      rng.ts                 # Rng interface, mulberry32, systemRng (ADR-008)
      assert.ts              # invariant assertion helper
  tests/
    draft.test.ts  scoring.test.ts  loadData.test.ts
    fixtures/                # squad + XI fixtures (one committed already)
  scripts/
    simulate.ts              # Day-7 rarity harness (T-012)
```

## 3. Public interfaces (implement these signatures exactly)

```ts
// src/domain/loadData.ts
function loadGameData(raw: {
  squads: unknown; thresholds: unknown; commentary: unknown; positionMap: unknown;
}): GameData;                       // throws DataValidationError with a human-readable list of every problem

// src/domain/draft/session.ts   (all pure; return NEW session; throw IllegalActionError)
function startDraft(data: GameData, rng: Rng, formationId?: string): DraftSession; // ADR-017
function pick(session: DraftSession, data: GameData, playerId: string, rng: Rng): DraftSession;
function skip(session: DraftSession, data: GameData, rng: Rng): DraftSession;
function getFinalXI(session: DraftSession): FinalXI;   // throws unless phase === 'COMPLETE'

// src/domain/scoring/scoreBand.ts   (pure; NO Rng import allowed in this module)
function computeScoreInput(xi: FinalXI, positionMap: PositionMap): ScoreInput;
function scoreBand(input: ScoreInput, config: ThresholdConfig): ScoreBand;

// src/domain/commentary/build.ts    (pure; NO Rng import allowed in this module)
function buildCommentary(band: ScoreBand, xi: FinalXI, config: CommentaryConfig): CommentaryScript;
```

UI rule (ADR-002): components may **read** `DraftSession` to render/disable controls, but every state change goes through `pick`/`skip`. Legality lives in the domain; the UI catches `IllegalActionError` defensively but should never trigger it.

## 4. Draft state machine (ADR-003) — pseudocode

```
startDraft(data, rng, formationId?):
  id = formationId ?? data.thresholds.referenceFormation
  require id in data.thresholds.formations              else throw IllegalActionError (ADR-017)
  reveal = selectSquad(data.squads, seen=[], excluded=[], excludeId=null, rng)
  return { phase:'AWAIT_PICK', picks:[], skipRemaining:1, roundsPlayed:1,
           seenSquadIds:[reveal.id], excludedSquadIds:[], currentReveal:reveal, breachLog,
           formationId:id }

selectSquad(all, seen, excluded, excludeId, rng):
  notExcluded = id not in excluded and id != excludeId
  pool = all where (id not in seen) and notExcluded
  if pool empty:
      pool = all where notExcluded              # relax seen; still honor permanent exclude
      breached = true                           # breachLog.push('repeat:<round>') at caller
  if pool empty:
      pool = all where id != excludeId          # degenerate: re-include excluded if needed
  if pool empty: pool = all                     # corpus of 1 / everything excluded
  return pool[floor(rng.next() * pool.length)]

pick(session, data, playerId, rng):
  require phase == 'AWAIT_PICK'                      else throw IllegalActionError
  require playerId in currentReveal.players          else throw
  require playerId not in picks (by id)              else throw   # possible on repeated reveal
  picks' = picks + player
  if picks'.length == 11:
      return { ...session, picks:picks', phase:'COMPLETE', currentReveal:null }
  reveal = selectSquad(data.squads, seenSquadIds, excludedSquadIds, null, rng)
  return { ...session, picks:picks', roundsPlayed:+1,
           currentReveal:reveal, seenSquadIds:+reveal.id }

skip(session, data, rng):
  require phase == 'AWAIT_PICK' and skipRemaining == 1   else throw
  excludedSquadIds' = excludedSquadIds + currentReveal.id
  reveal = selectSquad(data.squads, seenSquadIds, excludedSquadIds', currentReveal.id, rng)
  return { ...session, skipRemaining:0, roundsPlayed:+1, excludedSquadIds:excludedSquadIds',
           currentReveal:reveal, seenSquadIds:+reveal.id }
```

Invariants to assert in every draft test:
- `roundsPlayed === picks.length + (1 - skipRemaining) + (phase === 'AWAIT_PICK' ? 1 : 0)`
- On COMPLETE: `picks.length === 11`; `roundsPlayed === 11 + (1 - skipRemaining)`
- No duplicate player ids in `picks`; `seenSquadIds` has no duplicates unless `breachLog` is non-empty.
- `excludedSquadIds.length ≤ 1` (product = one skip token); permanent exclude holds while any non-excluded squad remains.

## 5. Data schemas (frozen Day 1; change via ADR only)

### squads.json
```json
{
  "version": 1,
  "squads": [
    {
      "id": "arg-1986",
      "country": "Argentina",
      "year": 1986,
      "players": [
        { "id": "arg-1986-maradona", "name": "Diego Maradona",
          "positionRaw": "AM", "positionBucket": "MID", "rating": 98 }
      ]
    }
  ]
}
```
Rules: exactly 11 players per squad; `rating` integer 1–100; `positionBucket ∈ {GK,DEF,MID,ATT}`; `positionBucket` must equal `positionMap[positionRaw]` (validated — the map is the source of truth, the denormalized field exists for readability); player `id` unique across the whole corpus; squad `id` = `<iso3-lowercase>-<year>`.

### thresholds.json
See the committed seed at [src/data/config/thresholds.json](src/data/config/thresholds.json). Band evaluation per ADR-004: priority descending, first full-pass wins, single mandatory fallback band. Schema v2 (ADR-017) adds a `formations` array: each formation has `id`, `label`, `description`, and `minCounts` (GK===1, DEF+MID+ATT===10, validated at load). `DraftSession.formationId` selects the active formation; the pure helper `withFormationMinCounts(config, formationId)` produces a `ThresholdConfig` view with overridden `minCounts` for scoring call sites. All numeric values are PLACEHOLDER until Day 7 (R-04).

### commentary.json
```json
{
  "version": 1,
  "scripts": {
    "10-0": { "beats": [
      { "minute": 1,  "type": "kickoff",  "text": "{captain} leads out a side for the ages." },
      { "minute": 9,  "type": "goal",     "text": "{topAtt} opens the floodgates!" },
      { "minute": 45, "type": "halftime", "text": "Five already. Mercy nowhere in sight." },
      { "minute": 90, "type": "fulltime", "text": "TEN. NIL. Immortality." }
    ]}
  }
}
```
`type ∈ {kickoff, goal, chance, halftime, drama, fulltime}`. Every band id in thresholds.json MUST have a script (boot validation). Beats play in array order; `minute` is display flavor only.

**Slot resolution (deterministic, no RNG)**: `{captain}` = highest-rated player in XI; `{topAtt}`/`{topMid}`/`{topDef}` = highest-rated in that bucket; `{gk}` = highest-rated GK; `{weakest}` = lowest-rated player. All ties broken by ascending player `id` (lexicographic). If a slot's bucket is empty (e.g. `{topAtt}` with no ATT), fall back to `{captain}`'s name — never crash, never randomize.

### position-map.json
```json
{ "GK":"GK", "RB":"DEF","LB":"DEF","CB":"DEF","SW":"DEF","WB":"DEF","RWB":"DEF","LWB":"DEF","DF":"DEF",
  "DM":"MID","CM":"MID","AM":"MID","RM":"MID","LM":"MID","MF":"MID",
  "RW":"ATT","LW":"ATT","CF":"ATT","ST":"ATT","SS":"ATT","FW":"ATT" }
```

## 6. Failure modes (fail closed — Invariant, error philosophy)

| Failure | Behavior |
|---------|----------|
| Malformed/missing JSON, schema violation | `loadGameData` throws `DataValidationError` listing **all** problems; app renders a boot-error screen. Never a silent empty draft. |
| Unmapped `positionRaw` | Validation error at load. Fix the data; never guess at runtime. |
| Band id without commentary script | Validation error at load. |
| Zero or multiple `fallback` bands | Validation error at load. |
| Illegal user action (double skip, pick after 11, foreign playerId) | Domain throws `IllegalActionError`; UI shows the reason and stays in place. |
| < 2 unique squads in corpus | Playable; repeat rule relaxes immediately; `breachLog` records it (R-03). |
| Mid-session reload | Session resets (ADR-010). |

## 7. Testing strategy (minimum bar — gate for done)

- `tests/draft.test.ts`: full no-skip draft (11 rounds); full with-skip draft (12 rounds); skip-then-exhausted-skip throws; pick after COMPLETE throws; pick of non-revealed player throws; duplicate-player pick on repeated reveal throws; seen-squad preference holds until exhaustion; `breachLog` populated on forced repeat; arithmetic invariants after every transition. All with `mulberry32` seeds.
- `tests/scoring.test.ts`: fixture XIs per band — top band passes; one-point-below weak-link floor drops a band; empty bucket forces fallback-eligible path; `minCounts` failure blocks bands that require it; priority order respected (an XI matching two bands gets the higher priority); fallback always matches.
- `tests/loadData.test.ts`: good data loads; each failure mode in §6 rejects with a message naming the offending entity.
- UI smoke: manual via Day-5 gate; not an architecture gate.

## 8. Tradeoffs accepted

- Predicate-band scoring over continuous scoring: tunable + explainable, at the cost of margin nuance (ADR-004).
- Subjective anchored ratings over formula-derived: fair across eras/positions, at the cost of objectivity (ADR-006).
- 7-squad corpus: guaranteed late-draft repeats (mitigated by disabled picked players; corpus growth is data-only).
- No persistence: reload loses the draft (ADR-010).

# PRP: World Cup Draft-XI Game (MVP)

## 1. Product Summary
A single-player draft game inspired by 500-0.com and the NFL/cricket draft-game format. Users build a
"dream XI" by picking one player per round from a series of randomly revealed real World Cup squads
(country + year both randomized). No budget/cost constraint — the only constraint is randomness of
what's shown each round. The final XI is scored against positional-rating thresholds to produce a
score band (e.g., 10-0, 5-5, 3-2), presented via a dramatized playthrough/commentary screen.

## 2. Core Loop
1. Round starts: system reveals one full real XI (11 players) from a randomly chosen country + WC year
   (e.g., Argentina 1986, France 2022, Germany 2010, Italy 1998).
2. Each player in the revealed XI shows their rating and position.
3. User picks exactly ONE player from that XI to add to their own squad-in-progress.
4. Next round reveals a new random country/year XI. Repeat.
5. User has exactly ONE skip across the whole draft (skip = discard current round without picking,
   reveal a replacement round). If skip is used, draft runs 12 rounds max to still land 11 picks.
   If skip is unused, draft is exactly 11 rounds.
6. Draft ends when user has selected 11 players.

## 3. Constraints & Rules
- No cost/budget system. Randomness of squad reveal is the only drafting constraint.
- Exactly 11 final picks required.
- Exactly 1 skip available, usable once, at any round.
- Each round's XI is a full mixed team (all positions shown together) — user may pick any position,
  any round. Country and year are both randomized per round (no repeats required, but avoid showing
  the same country+year twice in one draft session for variety).

## 4. Scoring System (Outcome Engine)
Fully deterministic, computed only after all 11 picks are locked in. No live match simulation logic —
score band is derived from squad composition, then presented via a scripted dramatization layer.

### 4.1 Inputs
- Sum of ratings by position bucket: GK, Defense, Midfield, Attack (bucket the user's 11 picks by
  their real-world position).
- Weak-link floor: lowest individual rating in the final XI.
- Positional completeness: whether all 4 buckets are non-empty (e.g., squad has at least 1 GK,
  minimum defenders/midfielders/attackers per a reference formation like 4-3-3 or 4-4-2).

### 4.2 Score Band Logic (tunable via playtesting)
- Define minimum cumulative rating threshold per bucket (e.g., Defense sum >= X, Midfield sum >= Y,
  Attack sum >= Z) for the top band.
- Define a weak-link floor (e.g., no picked player rated below N) required for the top band.
- If ALL bucket thresholds + weak-link floor are cleared -> 10-0 band (rare, top outcome).
- If most thresholds cleared, one bucket short -> mid bands (5-5, 4-1, etc.).
- If squad is imbalanced (e.g., all attackers, no real defense) -> low bands (3-2, 1-4, loss bands).
- Bands and thresholds are config-driven (JSON), not hardcoded, so Day 7 playtesting can retune
  without code changes.

### 4.3 Rarity Target
10-0 should be genuinely rare (~1 in 15-20 well-played drafts), similar to how real World Cup finals
have never ended 10-0 (biggest final margin: Brazil 5-2 vs Sweden, 1958) while 9-0/10-1 blowouts only
occurred in mismatched group-stage games (Hungary 9-0 South Korea 1954, Hungary 10-1 El Salvador 1982).

## 5. Data Requirements
- Static, vendored JSON (no live API calls at runtime) covering 5-8 curated iconic WC squads for MVP
  (e.g., Argentina 1986, France 1998/2022, Germany 2010/2014, Italy 1982, Brazil 1970/2002).
- Per player: name, position, rating, country, year.
- Source: Zafronix World Cup API (free tier, JSON REST, has position/team/year fields) for initial
  data pull; jfjelstul/worldcup GitHub DB as fallback/self-hosted static source.
- Ratings: if source lacks explicit ratings, derive a simple composite (caps/goals/era prominence) —
  finalize a rating methodology in Day 1 before building the draft engine.

## 6. Presentation Layer (Playthrough)
- Stage 1 (deterministic): compute score band from final XI (Section 4).
- Stage 2 (dramatization only, no new randomness affecting outcome): render a scripted commentary
  sequence keyed to the resolved band — e.g., 10-0 band gets a "demolition" script with multiple goal
  beats; 3-2 band gets a "nervy win" script. Commentary is a pure function of the already-decided band,
  never a separate source of truth.
- UI shows: round-by-round draft screen (revealed XI + ratings, pick/skip buttons, running squad
  tracker by position slot) -> final squad summary -> playthrough/commentary reveal -> final scoreline.

## 7. Build Plan (1 Week)

| Day | Deliverable | Primary Tool |
|---|---|---|
| 1 | Curate 5-8 squads, pull/clean static JSON, finalize rating methodology, define position buckets + thresholds | Claude Code + OpenCode |
| 2 | Draft state machine: round sequencing, random country/year reveal, one-skip logic, pick locking | Claude Code |
| 3 | Score-band calculator: bucket sums, weak-link floor, band assignment, config-driven thresholds | Claude Code |
| 4-5 | Draft UI: reveal screen, pick/skip controls, running squad tracker with position slots | Cursor |
| 6 | Playthrough/commentary screen: scripted narration keyed to resolved band | Cursor + Claude Code |
| 7 | Playtest + threshold tuning until 10-0 rarity feels right; deploy | Claude Code (tuning) + OpenCode (deploy scripts) |

## 8. Explicit Non-Goals (MVP)
- No budget/cost draft mechanic.
- No live turn-by-turn match simulation (scoreline is band-assigned, not simulated).
- No multiplayer/head-to-head in v1.
- No live API calls at runtime (all squad data vendored/static).

## 9. Open Items for Day 1
- Finalize exact position-bucket minimums and weak-link floor per band (needs playtesting data,
  starting values only).
- Finalize which 5-8 squads to curate for launch.
- Finalize rating methodology if source data lacks explicit player ratings.

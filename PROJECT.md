# PROJECT.md — World Cup Draft-XI Game (MVP)

Single-player browser draft game. Player builds a Dream XI by drafting one player per round from randomly revealed real World Cup squads. The final XI maps to a deterministic score band (e.g. `10-0`, `5-0`, `2-2`), which drives scripted dramatized commentary. No live match simulation.

Read order for successors: **PROJECT.md → ARCHITECTURE.md → DECISIONS.md → IMPLEMENTATION_PLAN.md → TASKS.md → RISKS_AND_UNKNOWNS.md → CLAUDE.md**.

## Goals

- Full loop playable offline after load: draft → lock XI → score band → dramatized scoreline.
- Short session (< 5 min), no account, no backend.
- `10-0` result feels rare: ≈ 1 in 15–20 well-played drafts (tuned Day 7 via config only).

## Non-goals (MVP — do not build these)

- Budget/cost draft mechanic
- Live turn-by-turn match simulation
- Multiplayer / head-to-head
- Live APIs at runtime (all data vendored)
- Accounts, cross-device persistence, monetization, analytics platform
- Backend services, auth, databases

## Users

Solo football fans. Casual, short sessions, replay-driven ("can I get the 10-0?").

## Core loop (canonical)

1. **Reveal**: system shows one full real XI (11 players: name, position, rating) from a random country+year squad.
2. **Pick**: user selects exactly ONE player → appended to squad-in-progress.
3. **Next reveal**: new random country+year XI (no same squad twice in a session while alternatives remain).
4. **Skip**: exactly one skip token per draft. Skip discards the current reveal and draws a replacement. Skip used → 12 rounds total; unused → 11 rounds.
5. **End**: 11 locked picks → `score(XI, config)` → band → commentary(band) → scoreline UI.

## Invariants (change only via ADR in DECISIONS.md)

1. Exactly 11 final picks; exactly 1 skip token per draft session.
2. No budget/cost mechanic.
3. Outcome = deterministic score band from squad composition + the session's reveal sequence + config only (ADR-019).
4. Commentary never overrides or re-rolls the outcome.
5. Runtime squad/player data = vendored static JSON only.
6. Thresholds, bands, completeness mins = external config JSON. No hardcoded magic numbers in the engine.
7. Prefer no duplicate country+year in one session when alternatives exist.
8. Pure functions for `score(band)` and `commentary(band)`; draft RNG isolated from scoring.
9. No RNG on the outcome path after lock. Draft RNG only chooses which squad reveals.

## Success criteria

- [ ] Full loop playable offline after initial load
- [ ] ≥ 5 curated squads in vendored data (target 7, see ADR-007)
- [ ] Skip math correct (0–1 uses; always exactly 11 picks; 11 or 12 rounds)
- [ ] 10-0 rare post Day-7 tune (~1/15–20 skilled drafts) via config change only, no code change
- [ ] Unit tests cover draft state machine + scoring pure path
- [ ] Static deploy works (single origin, no server-side game logic)

## Explicit product decisions

- **Mid-session reload resets the draft.** No persistence in MVP (ADR-010).
- **Squad repeats are expected late-draft.** Corpus is 7 squads but a session has 11–12 reveals, so repeats begin around round 8. Already-picked players are disabled in a repeated reveal (ADR-003, R-03 in RISKS).
- **Same real human may appear in two squads** (different eras). MVP treats each `player.id` (squad-scoped) as distinct; corpus was chosen to minimize overlap (ADR-007).

## Assumptions

| ID | Assumption | Confidence | Validation path |
|----|------------|-----------|-----------------|
| A1 | React+Vite SPA on static host is enough | High | Locked ADR-001; Day 5 gate proves loop in browser |
| A2 | Rating scale 1–100 integers | High | Locked ADR-006; Day 1 methodology doc |
| A3 | 4-3-3 min counts (1/4/3/3) as reference formation | Low | Day 7 playtest; retune `minCounts` in thresholds.json |
| A4 | Seed thresholds are placeholders until Day 7 | High | Rarity experiment (RISKS §Experiments) |
| A5 | No backend / no save is acceptable | High | Product statement above |
| A6 | 7 squads enough variety for MVP | Medium | Day 7 playtest fatigue check; corpus growable without code change |
| A7 | Squad repeats after corpus exhaustion don't break fun | Medium | Day 7 playtest; mitigation = grow corpus |
| A8 | Deterministic name interpolation (no RNG) is enough for commentary flavor | Medium | Day 6 read-through of all band scripts |

## Timeline

| Day | Focus | Gate (see IMPLEMENTATION_PLAN.md) |
|-----|-------|-----------------------------------|
| 1 | Squads JSON, rating method, position map, threshold schema + seeds | Data validates; config loads |
| 2 | Draft state machine | Tests prove 11 picks + 1 skip |
| 3 | Score-band pure calculator | Fixtures pass; 10-0 not trivial |
| 4–5 | Draft UI | Full loop in browser |
| 6 | Commentary keyed by band | Every band has a script path |
| 7 | Rarity tune + static deploy | Histogram logged; live URL |

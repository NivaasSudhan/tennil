# CLAUDE.md — Successor operating manual (World Cup Draft-XI MVP)

You are continuing a planned 1-week MVP. All judgment lives in the docs, not in any prior chat.

## NEXT: Verify/commit UI wave U3 (P-018 in .claude/subagent-prompts.md — 4 visual defect fixes; agent may have finished unobserved: check `git status`, run npm test + npm run build, eyeball via `npm run dev` per the defect list, commit terse). Then: re-drive full loop in browser (draft → skip → finals broadcast → goal/band-slam), fix-dispatch any remaining visual defects to opencode-go/glm-5.2 (NOT Grok — cost ceiling; see memory), THEN push main to deploy. State: corpus 60 (2026's 8 QF slots pending research), thresholds retuned for 60 (greedy 10-0 6.4%), 197 tests green, skip-exclude + formation (ADR-017) + progressive live score + Matchday UI (paper+broadcast) all committed on main, NOT pushed since f2e367f.
Orchestration rules: Fable never writes code — dispatch opencode per docs/OPENCODE_ORCHESTRATION.md + prompt cache .claude/subagent-prompts.md (P-001..P-018; reuse on retry). Grok sparingly/hardest-only; Deepseek max for easy+moderate w/ detailed prompts; GLM (go) for UI/volume. Commits ≤2 lines.

## Read order (do this before any work)
1. PROJECT.md — goals, non-goals, invariants, assumptions
2. ARCHITECTURE.md — layers, interfaces, state machine, schemas, failure modes
3. DECISIONS.md — ADR-001…010 (locked; don't relitigate silently)
4. IMPLEMENTATION_PLAN.md — day order + verification gates
5. TASKS.md — your work queue (atomic, with acceptance criteria)
6. RISKS_AND_UNKNOWNS.md — placeholders, edge cases, rarity experiment

`worldcup_draft_game_PRP.md` is historical input only — do not treat it as requirements; these docs supersede it.

## Invariants checklist (verify before every commit)
- [ ] Exactly 11 final picks; exactly 1 skip token per session
- [ ] No budget/cost mechanic
- [ ] Outcome = deterministic band from squad composition + the session's reveal sequence + config only (ADR-019)
- [ ] Commentary never overrides/re-rolls outcome; no RNG in `src/domain/scoring/` or `src/domain/commentary/`
- [ ] Runtime data = vendored static JSON only (no fetch for game data)
- [ ] No magic numbers in engine — thresholds/bands/minCounts live in `src/data/config/thresholds.json`
- [ ] No duplicate country+year reveal while alternatives remain (breachLog otherwise)
- [ ] Draft RNG injected (`Rng` param), used ONLY for squad selection
- [ ] Non-goals untouched: no multiplayer, accounts, backend, live sim, live APIs

## What must not change lightly (requires a new ADR in DECISIONS.md first)
- Data/config schemas (squads, thresholds, commentary, position map) — bump `version` on breaking change
- Module boundaries and public function signatures (ARCHITECTURE.md §3)
- State machine transition rules (ADR-003)
- Band evaluation algorithm (ADR-004) — tuning NUMBERS in thresholds.json is always allowed and is the intended knob
- Position map entries (ADR-006)

## How to continue safely
1. Pick the task named in `NEXT:` above. One task at a time.
2. Read its Why / Acceptance / Tests in TASKS.md before coding.
3. Write/extend tests with the task (draft + scoring logic is test-first territory).
4. Run verification (below). All green before marking done.
5. Tick the TASKS.md checkbox, update `NEXT:` here, update RISKS if a placeholder was resolved.
6. Day boundary → check the gate in IMPLEMENTATION_PLAN.md before moving on.
7. Architecture change needed? STOP, write the ADR, then implement.

## Verification commands
```bash
npm test               # Vitest unit suite — must pass before any "done" claim
npm run build          # tsc + vite build — must pass
npm run preview        # serve dist/ locally — manual loop check (Days 5+)
npx tsx scripts/simulate.ts --n 500 --seed 42 --bot greedy   # Day-7 rarity histogram (exists after T-014)
# purity greps (must return nothing):
grep -rn "Math.random\|rng" src/domain/scoring src/domain/commentary
grep -rn "from 'react'\|from \"react\"" src/domain src/lib
```
Deploy (after T-016): push to `main` → GitHub Actions → Pages. `vite.config.ts` `base` must stay `'/fifaTenZero/'` unless the repo is renamed. Live URL: _record here after T-016_.

## Progress reporting format (end of each working session)
```
DONE: <task ids + one line each>
TESTS: <pass/fail counts, command output summary>
GATES: <day gates passed/blocked>
PLACEHOLDERS RESOLVED: <R-ids or none>
NEXT: <task id + why>
BLOCKED/DEVIATIONS: <anything needing an ADR or human decision>
```

## Balance/tuning rule of thumb
Game feels wrong (too easy/hard, dead bands)? Edit `thresholds.json` numbers and rerun the simulation. Editing engine code for balance is a bug, not a fix.

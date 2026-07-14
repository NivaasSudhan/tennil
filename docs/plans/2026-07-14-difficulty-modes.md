# Difficulty Modes — Normal / Hard + opponent draw + counter-pick (ADR-021)

**User decisions 2026-07-14 (supersede all prior daily/matchday + mode Q&A):**
1. ONE app, two modes. **Normal = the v1 experience**: OVR/efficiency scoring only, no attrs influence, no opponent archetype at all, no attr digits/banner/stats in UI. **Hard = the v2 experience**: attrs, fit gates, opponent archetype.
2. **Matchday/daily is DEAD.** No matchday number, no badge, no dailySeed-driven anything, no date specificity. Remove entirely (UI, share, card, copy). `dailySeed`/`matchdayNumber` code may remain exported-but-unused or be deleted — prefer delete.
3. **Opponent archetype = random draw at draft start, Hard only.** Drawn deterministically from the session's recorded seed (reproducible per session, random across sessions), stamped on the session. ADR-008 amendment: injected draft-RNG now also draws the opponent (scoring stays deterministic given the draw).
4. **Counter-pick gameplay (Hard):** flow = KICK OFF → opponent card flip (dramatic reveal, paper world) → formation choice (now an informed counter-decision) → draft. Formation choice is part of the game.
5. **Fairness floor:** per-formation fit baselines equalized so every formation lands ~2-4% 10-0 vs NEUTRAL (fixes P-041's flat-minFit unfairness: 4-3-3 67% fit-blocked, 3-5-2 6.6% exploit, 5-3-2 sub-floor). Archetype weightMods give bounded matchup swing: bad counter-pick costs rungs, never the match — **Law check extends to every archetype×formation pair: 10-0 count > 0 at n=500**.
6. Copy: landing gains "Can you score 10-0?" under the masthead; "Report a fault in the programme" → "Report a bug". Rules programme pages become mode-conditional (Normal: picks/skip/plain-words judging; Hard: + marks glossary + opponent page reworded "Your opponent" not "Today's").
7. Share/card: matchday text gone; Hard shares tagged `[HARD] vs {OPPONENT}`; Normal shares clean.

**Standing constraints:** reveals stay uniform-random over all 60 squads (memory: scoring-only lever); Reveal-Luck Law (ROADMAP §3.8); config-driven numbers; purity greps; branch `v2/attrs`; main untouched until sign-off; after sign-off ONE site serves both modes, beta repo = staging.

## Mechanics

- **thresholds.json v5:** `modes: { normal: { bands: [...] }, hard: { bands: [...] } }`. Normal bands = main's current tuned ladder verbatim (`git show main:src/data/config/thresholds.json` — efficiency/bucketEff/weakLink, NO fit fields). Hard bands = current v2 fit-dominant ladder, with `minFit` allowed as `number | Record<formationId, number>` (per-formation calibration). Shared: formations, profiles, oppositions, minCounts, ratingScale. loadData validates both sets (one fallback EACH, fit fields forbidden in normal bands, per-formation minFit keys must be known formation ids).
- **Engine:** `withMode(config, difficulty)` config-view (pattern of `withFormationMinCounts`) resolves the active band set; per-formation minFit resolved at the same call site via the session's formationId. `scoreBand`/`explainScoreBand` signatures unchanged (ADR-013/C2 discipline).
- **Session:** `difficulty: 'normal' | 'hard'` + `oppositionId?: string` (hard only) stamped by `startDraft` (options arg grows; opposition drawn via the injected rng BEFORE first squad draw so reveal sequence stays comparable across modes for one seed). `mode: 'daily'|'free'` field retired → replaced by `difficulty` (type migration; ADR-014-lite superseded note).
- **Sim:** `--mode normal|hard` (default hard on v2 config); Law matrix run = `--mode hard --formation all --opposition cycle` per-pair 10-0 table.
- **UI flow (Hard):** landing toggle NORMAL(default)/HARD → KICK OFF → OpponentCard (paper card flip, physical verb, reduced-motion crossfade; shows label+tagline+prized mark) → formation gate (shows per-formation hint of prized attr alignment? NO — no hints v1; the read IS the skill) → draft (banner "vs {OPPONENT}" persists) → result (stats screen, fit margins). Normal: landing → KICK OFF → formation → draft; zero attr surfaces.

## Waves

| Wave | Owner | Scope | Gate |
|---|---|---|---|
| M1 domain | Opus 4.8 | ADR-021 (+ADR-008/014-lite amendments); thresholds v5 dual band sets + validation; `withMode`; per-formation minFit resolution; session difficulty/opposition draw; matchday/dailySeed domain removal; sim `--mode`; migrate tests | suite+build+purity; both modes' sims run |
| M2 UI | Deepseek/Haiku (equals) | Landing toggle + taunt line + "Report a bug"; OpponentCard flip before formation (Hard); Normal strips attr digits/banner/stats; mode-conditional rulesCopy; share/card mode tags; matchday UI removal | suite+build; DESIGN-BRIEF-v1; orchestrator browser check |
| M3 balance | Opus 4.8 | Per-formation Hard minFit calibration (~2-4% each vs neutral); archetype×formation Law matrix all >0%; Normal verified vs greedy baseline (matches main's known histogram); RISKS log + sim-report | Law matrix; no dead bands; seeds 42/1000/5000 |
| M4 ship | orchestrator | Browser design pass; beta redeploy; user playtest → sign-off → merge main | user |

M1 → (M2 ∥ M3, disjoint files) → M4.

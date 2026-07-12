# Attrs v2 Implementation Plan — Profile Fit + Daily Opposition

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The binding product spec is `docs/plans/2026-07-12-attrs-v2-design.md` — read it before any wave; where this plan is terser than the spec, the spec governs.

**Goal:** Add Pace/Strength/Accuracy attributes, per-formation ProfileFit, and a seed-deterministic Daily Opposition that together make 10-0 a two-axis achievement (target: fit-aware 6-7%, attr-blind 3-4%).

**Architecture:** OVR/efficiency/ceiling core untouched. Attrs are authored data (schema v2) feeding one new pure measure (`computeProfileFit`) consumed via one new evaluator predicate (`minFit`, top 3 bands only, Reveal-Luck-Law-bounded). Opposition modifies profile *weights* only, selected by `dailySeed % catalog`.

**Tech Stack:** unchanged (React 18, Vite 5, TS strict, Vitest; zero new runtime deps).

## Global Constraints

- Branch `v2/attrs` only; main untouched until canary sign-off (spec §8). Commits ≤2 lines.
- Reveal-Luck Law: sim must prove 10-0 attainable under EVERY opposition archetype (spec §4).
- Purity greps clean after every wave; `npm test` + `npm run build` green after every wave; per-wave commit.
- Schema bumps: squads v1→2, thresholds v3→4; loadData dual-accepts squads v1|v2 until Wave B lands data, then Wave C removes v1 acceptance.
- No RNG anywhere new; hash-jitter in the generator is authoring-time only.
- GK: single `rating`, never attrs (validation both directions).
- Prompts cached per P-NNN guardrail; models per routing memory (Sonnet 4.6 = domain waves; Deepseek max = dictated/mechanical; GLM go = UI/tuning; Fable/Sonnet-5/Sol banned).

---

### Wave A — ADR-020, types, schema support (Sonnet 4.6)

**Files:** Create `src/domain/scoring/profileFit.ts` (types only this wave: `AttrName`, `Attrs`, `FormationProfile`, `OppositionDef`); Modify `src/domain/types.ts` (Player gains optional `pace?/strength?/accuracy?`; `ThresholdConfig` gains `profiles`, `oppositions`; `BandDef.minFit?`; `PredicateName` + `'minFit'`), `src/domain/loadData.ts` (squads v2 validation: version 2 ⇒ outfield must have all three attrs 1-99 ints, GK must have none; version 1 ⇒ attrs forbidden; thresholds v4: validate profiles per formation per bucket `{weights:{pace,strength,accuracy}, targets:{...}}` all present, oppositions non-empty incl. id `neutral`, minFit ∈ [0,100] ints on ≤3 bands), `src/data/config/thresholds.json` (v4: add `profiles` for all 4 formations + 6 `oppositions` — values from spec §3/§5; minFit placeholders 0 this wave), `DECISIONS.md` (ADR-020 per spec §3, house style).
**Interfaces produced:** `Attrs = { pace: number; strength: number; accuracy: number }`; `FormationProfile = Record<PositionBucket_noGK, { weights: Attrs; targets: Attrs }>`; `OppositionDef = { id: string; label: string; tagline: string; weightMods: Partial<Attrs> }`.
**Tests:** loadData fixtures for every validation rule above (synthetic, both versions); thresholds v4 happy-path; existing suite green (real squads.json is v1 — still accepted this wave).
**Gate:** 289+ tests, build, purity, commit `feat(v2): ADR-020 schema — attrs types, squads v2 + thresholds v4 validation`.

### Wave B — attr generation + corpus v2 (Deepseek max; editorial output flagged for human review)

**Files:** Create `scripts/attrs/generate.ts`, `src/data/attrs-overrides.json` (seed with ~12 icon overrides listed below); Modify `src/data/squads/squads.json` (→ version 2, attrs on all 649 outfield players), `tests/corpus.test.ts` (attr invariants: every outfield 1-99 ×3; GK none).
**Archetype base table (authoring-time, exact):** attr = clamp(1..99, round(OVR × mult + jitter)), jitter = (fnv1a(playerId+attrName) % 7) − 3.
| positionRaw | pace | strength | accuracy |
|---|---|---|---|
| CB, SW | 0.82 | 1.02 | 0.88 |
| RB, LB | 0.98 | 0.90 | 0.90 |
| DM | 0.88 | 0.98 | 0.96 |
| CM | 0.90 | 0.90 | 1.00 |
| AM, SS | 0.94 | 0.82 | 1.02 |
| RM, LM, RW, LW | 1.02 | 0.80 | 0.96 |
| ST, CF | 0.96 | 0.98 | 0.94 |
Overrides seeded (canon, never regenerated over): maradona-86 acc 99; messi-2014/2022 acc 99 pace 94/90; ronaldo-2002 pace 97 str 95; mbappe-2018/2022 pace 99; cannavaro-2006 str 96; puyol-2010 str 95; zidane-1998/2006 acc 99; modric-2018/2022 acc 97; romario-1994 acc 96; kahn/gk — none (GK rule).
**Gate:** loadGameData clean on v2 data; corpus tests; generator rerun is byte-identical (determinism test); commit; REVIEW-NOTES section in agent output for the human attr pass.

### Wave C — scoring: fit + opposition + evaluator + call sites (Sonnet 4.6 high)

**Files:** Modify `src/domain/scoring/profileFit.ts` (implement `computeProfileFit(xi, positionMap, profile, oppositionWeightMods): number` — per-bucket attr means (GK excluded), weighted normalized shortfall vs targets, overshoot free, result 0-100 int; and `selectOpposition(config, mode, seed): OppositionDef` — daily: `oppositions[seed % length]` excluding neutral; free: neutral), `scoreBand.ts` (`evaluateBandPredicates` + `minFit`: required = band.minFit, actual = input.fit), `types.ts` (ScoreInput v3: `fit: number`, `oppositionId: string`), `computeScoreInput` (new params profile+opposition or a pre-computed fit arg — keep signature change minimal and update ALL call sites: ResultScreen, simulate.ts, all tests), `src/app/nearMiss.ts` (minFit lines, dictated: shortfall vs archetype → 'TOO SOFT FOR THE PRESS — {BAND} WANTED STEEL' (strength-weighted opp), 'ALL LEGS, NO CRAFT — THE {OPP} HELD' (accuracy), 'CAUGHT FLAT — {BAND} NEEDED LEGS' (pace), neutral → 'SHAPE FIT SHORT OF A {BAND}'), `loadData.ts` (drop squads v1 acceptance).
**Tests:** fit determinism + bounds + overshoot-free; opposition selection determinism incl. neutral-for-free; minFit predicate margins; consistency `explainScoreBand ≡ scoreBand` retained; near-miss template coverage.
**Gate:** full suite + build + purity; commit.

### Wave D — sim: fitaware bot + Law check + tune (GLM go max)

**Files:** Modify `scripts/simulate.ts` (`--bot fitaware`: greedy on OVR with swap-toward-weighted-attrs when ΔOVR ≤ 2; `--opposition <id|cycle>`; fit distributions in diagnostics/report), `src/data/config/thresholds.json` (minFit numbers on top 3 bands — NUMBERS ONLY), `RISKS_AND_UNKNOWNS.md` (experiment log), `docs/sim/sim-report.json`.
**Gate (all, per spec §4):** fitaware 10-0 6-7%; attr-blind greedy 3-4%; random floor unchanged; no dead bands; top-band near-miss 12-20%; stable seeds 42/1000/5000; `--opposition cycle` proves 10-0 > 0% under every archetype (Law). Commit.

### Wave E — UI: attr digits, banners, stats screen, share (GLM go high)

**Files:** Modify `PlayerRow.tsx`/`TeamSheet.tsx`/`app.css` (P·S·A micro-digits ≥0.8rem after rating circle, tier-tinted, GK rows unchanged, P-023 legibility rule), `StartScreen.tsx` (daily opposition banner + tagline under Matchday badge), `ResultScreen.tsx`+new `StatsScreen.tsx` (post-BandSlam: per-bucket attr bars vs formation targets, today's attr highlighted, fit number + margin), broadcast chrome ('vs {OPPONENT}'), `ShareRow.tsx`/`matchdayCard.ts` (opponent in text + card; respect P-034 y-budget — card verdict block already tight: put opponent in the eyebrow line).
**Gate:** suite/build/purity; jsdom tests for banner + stats presence + share templates; browser drive on branch; commit.

### Wave F — Rules Programme (Deepseek max) + canary infra (orchestrator)

**Files:** Create `src/app/RulesProgramme.tsx` (+config copy block `src/app/rulesCopy.ts`), Modify topline/landing/chrome for the RULES mark, `app.css`. Native `<dialog>`, programme-spread styling per spec §6, copy dictated at dispatch from spec §6 page list, focus-trap/Esc/outside-click, DraftSession untouched (test: open+close mid-draft, session identical), reduced-motion.
**Canary (orchestrator ops, not agent):** create `tennil-beta` repo, push branch with base override `/tennil-beta/` (env-driven base in vite.config: `base: process.env.TENNIL_BASE ?? '/tennil/'` — added this wave), workflow deploys beta from `v2/attrs`. Hand URL to user for A/B; merge gate = user sign-off (spec §9).

## Self-review
Spec coverage: §2→A/B, §3→A/C, §4→D, §5→E, §6→F, §7 fenced out, §8→branch+F-ops, §9 gates distributed. No placeholders (minFit "0 this wave" is an explicit staged value, tuned in D by design). Type names consistent: `Attrs`, `FormationProfile`, `OppositionDef`, `computeProfileFit`, `selectOpposition`, `minFit`, ScoreInput `fit`/`oppositionId`.

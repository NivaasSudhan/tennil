# Formation Choice — Implementation Plan (refined)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Ground truth: `thresholds.json`, `scoreBand.ts`, `explainScoreBand.ts`, `loadData.ts`, `StartScreen.tsx`, `App.tsx`, `simulate.ts`, ADR-004/005/013.

**Goal:** User chooses formation after Start / Draft Again, **before first squad reveal**. Chosen formation supplies `minCounts` for bands with `requireMinCounts: true`. Soft scoring — shape mismatch only fails those predicates; no hard lock block.

**Architecture:** Formation catalog lives in config (prefer **extend `thresholds.json`** — already owns `referenceFormation` + `minCounts` — avoid fifth boot JSON unless Fable insists). `DraftSession.formationId` set at `startDraft`. Scoring stays pure two-arg: build a **ThresholdConfig view** with overridden `minCounts` at the call site. UI: formation picker gate (full StartScreen on first visit; compact re-pick on Draft Again).

**Tech Stack:** TypeScript 5, React 18, Vitest 1. No new deps.

## Global Constraints

- Config-driven numbers; no magic minCounts in engine.
- `scoreBand` / `explainScoreBand` / `evaluateBandPredicates` public arity stays **(input, config)** — do **not** thread `formations` + `formationId` through the pure scoring stack (index C2).
- No React in domain.
- Compute-once ResultScreen invariant.
- Formation gate = UI state, not `DraftSession` phase.
- `npm test` + `npm run build` green before done.

## Grounded facts

| Fact | Location |
|------|----------|
| Global `minCounts` + `referenceFormation: "4-3-3"` | `thresholds.json:4-5` |
| `requireMinCounts: true` on bands 10-0, 5-0, 3-1 only | `thresholds.json` |
| Engine reads `config.minCounts` only inside `evaluateBandPredicates` | `scoreBand.ts:73-82` |
| `referenceFormation` is label-only today (load validates string; engine never uses) | `loadData.ts` |
| `scoreBand(input, config)` and `explainScoreBand(input, config)` two-arg | public API |
| Sim: `scoreBand(scoreInput, data.thresholds)` after `startDraft` | `simulate.ts:230,254` |
| `loadGameData({ squads, thresholds, commentary, positionMap })` four inputs | `loadData.ts:411+`, `main.tsx:21-26` |
| StartScreen: `{ onStart: () => void }` only | `StartScreen.tsx` |
| App: `handleStart` / `handleRestart` both bare `startDraft` | `App.tsx:23-60` |
| Draft Again skips landing intentionally (Sprint-1) | plan taste note; App restart path |
| Product: formation **after** Start **and** Draft Again, pre-first-reveal | plan-mode decision |

## Challenges vs first draft of this plan

1. **Rejected:** `scoreBand(..., formations?, formationId?)` — cascade into explain + sim + every test; fights ADR-013. **Use config view.**
2. **Rejected:** separate `formations.json` as default — fifth boot artifact + sim disk load + GameData field. Prefer nested under thresholds:

```json
{
  "version": 1,
  "referenceFormation": "4-3-3",
  "minCounts": { "GK": 1, "DEF": 4, "MID": 3, "ATT": 3 },
  "formations": [
    { "id": "4-3-3", "label": "4-3-3", "description": "…", "minCounts": { "GK":1,"DEF":4,"MID":3,"ATT":3 } },
    { "id": "4-4-2", "label": "4-4-2", "description": "…", "minCounts": { "GK":1,"DEF":4,"MID":4,"ATT":2 } },
    { "id": "3-5-2", "label": "3-5-2", "description": "…", "minCounts": { "GK":1,"DEF":3,"MID":5,"ATT":2 } },
    { "id": "5-3-2", "label": "5-3-2", "description": "…", "minCounts": { "GK":1,"DEF":5,"MID":3,"ATT":2 } }
  ],
  "ratingScale": { ... },
  "bands": [ ... ]
}
```

   Keep top-level `minCounts` as **default** (must equal formation `4-3-3` minCounts — validate at load).

3. **Draft Again:** cannot call `startDraft` immediately with last formation without UI if product requires re-confirm. App flow:

```
null session + no pending formation → StartScreen (blurb + picker + Start)
COMPLETE → Draft Again → set session null, set mode='formation-gate' → compact picker → startDraft
```

   Or keep session null and pass `variant: 'landing' | 'formation-only'` to StartScreen. Prefer one component, two variants.

4. **Sim balance:** greedy bot still fills global 1/4/3/3 needs unless formation-aware. **MVP:** sim uses default formation only (`startDraft` without override / default id). Optional later: rotate formations per trial. Document — do not block ship.

5. **minCounts sum:** formations must sum DEF+MID+ATT = 10 (with GK=1 → 11). Validate at load: `GK===1` and `DEF+MID+ATT===10`.

---

### Task 1: Config schema + load validation + types

**Files:**
- Modify: `src/data/config/thresholds.json` — add `formations[]`
- Modify: `src/domain/types.ts` — `Formation`, extend `ThresholdConfig`
- Modify: `src/domain/loadData.ts` — validate formations; default minCounts consistency
- Test: `tests/loadData.test.ts` (or extend existing)

**Interfaces:**
```typescript
export interface Formation {
  id: string;
  label: string;
  description: string;
  minCounts: Record<PositionBucket, number>;
}

export interface ThresholdConfig {
  version: number;
  referenceFormation: string;
  minCounts: Record<PositionBucket, number>; // default = formations[reference] or first
  formations: Formation[];                   // NEW required after schema bump
  ratingScale: { min: number; max: number };
  bands: BandDef[];
}
```

Schema version: bump `thresholds.version` to **2** if validation requires formations non-empty; or keep version 1 and require formations with soft default. **Prefer version 2** + update load check — honest breaking schema per ADR-005 spirit.

Validation rules:
- `formations.length >= 1`
- unique `id`s
- each `minCounts`: all four buckets integers ≥ 0; `GK === 1`; `DEF+MID+ATT === 10`
- default `minCounts` deep-equals formation with `id === referenceFormation`, or equals first formation if reference missing from list (error preferred)

- [ ] **Step 1: Failing load test** for missing formations / bad sum
- [ ] **Step 2: Author formations in thresholds.json** (four listed above; 4-3-3 matches current minCounts)
- [ ] **Step 3: Types + validateThresholds**
- [ ] **Step 4: `npm test` green** (fix all GameData / threshold fixtures — draft `makeData` must add `formations: [...]`)

**Fixture pattern for tests:**

```typescript
formations: [
  {
    id: '4-3-3',
    label: '4-3-3',
    description: 'test',
    minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 }, // or match existing test minCounts
  },
],
```

If test `minCounts` is `{ DEF: 3, MID: 2, ATT: 2 }`, either align formation to that or use a dedicated test formation id — **do not leave formations empty**.

---

### Task 2: Domain helper + startDraft formationId

**Files:**
- Modify: `src/domain/types.ts` — `DraftSession.formationId: string`
- Create: `src/domain/scoring/withFormation.ts` (or small fn in `scoreBand.ts`) — pure config view
- Modify: `src/domain/draft/session.ts` — `startDraft(data, rng, formationId?: string)`
- Test: `tests/draft.test.ts`, `tests/scoring.test.ts`

**Interfaces:**
```typescript
// Pure, no RNG
function withFormationMinCounts(
  config: ThresholdConfig,
  formationId: string | null | undefined,
): ThresholdConfig {
  if (!formationId) return config;
  const f = config.formations.find((x) => x.id === formationId);
  if (!f) return config; // or throw IllegalActionError / DataValidationError — prefer throw at startDraft time
  return { ...config, minCounts: f.minCounts, referenceFormation: f.id };
}

// startDraft
function startDraft(data: GameData, rng: Rng, formationId?: string): DraftSession
// If formationId provided: must exist in data.thresholds.formations else throw IllegalActionError
// If omitted: use data.thresholds.referenceFormation (must exist in list)
// Store resolved id on session.formationId (always non-null string after start)
```

Call sites for scoring (ResultScreen, sim later):

```typescript
const config = withFormationMinCounts(data.thresholds, session.formationId);
scoreBand(scoreInput, config);
explainScoreBand(scoreInput, config);
```

- [ ] **Step 1: Tests for withFormationMinCounts** — override changes minCounts predicate outcomes without changing band definitions
- [ ] **Step 2: Implement helper + startDraft validation**
- [ ] **Step 3: scoring tests** — XI with 3 DEF fails 4-3-3 requireMinCounts, passes 3-5-2 (use real `evaluateBandPredicates` / `scoreBand` with config view)
- [ ] **Step 4: draft tests** — formationId stored; invalid id throws
- [ ] **Step 5: `npm test`**

---

### Task 3: UI — StartScreen variants + App wiring + ResultScreen config view

**Files:**
- Modify: `src/app/StartScreen.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/ResultScreen.tsx` — `withFormationMinCounts` before scoreBand
- Modify: `src/app/app.css`
- Modify: `tests/startScreen.test.tsx`, `tests/appGate.test.tsx` if present

**Interfaces:**
```typescript
// StartScreen
interface StartScreenProps {
  formations: Formation[];
  defaultFormationId: string;
  variant: 'landing' | 'formation-only';
  onStart: (formationId: string) => void;
}
```

**App state sketch:**

```typescript
type AppGate = 'landing' | 'formation' | 'playing';
// session null + landing | formation → StartScreen
// session non-null → draft | result
// Draft Again → setSession(null); setGate('formation'); keep lastFormationId as default
// First boot → gate 'landing'
```

Avoid inventing a `DraftSession` phase.

- [ ] **Step 1: Update startScreen tests** for picker + `onStart(formationId)`
- [ ] **Step 2: Implement StartScreen UI** (cards; selected state; Start / Confirm Draft)
- [ ] **Step 3: Wire App**
- [ ] **Step 4: ResultScreen uses `withFormationMinCounts(session.formationId)`**
- [ ] **Step 5: Optional DraftScreen badge** `Formation: {session.formationId}` — nice-to-have, same task if small
- [ ] **Step 6: `npm test && npm run build`**

---

### Task 4: ADR-017 + docs + sim note

**Files:**
- Modify: `DECISIONS.md` — new ADR-017
- Modify: `ARCHITECTURE.md` — `startDraft` signature, ThresholdConfig schema
- Modify: `scripts/simulate.ts` — only if `loadGameDataFromDisk` / thresholds parse needs formations (automatic if nested in thresholds). Document default formation for bots.

**ADR-017 content (minimum):**
- Multi-formation catalog in thresholds schema v2
- Session binds `formationId` at startDraft
- Soft scoring via minCounts override on ThresholdConfig view
- Does not change band algorithm (ADR-004) — only config numbers path
- Sim default formation = referenceFormation until multi-formation bots exist

- [ ] **Step 1: Write ADR-017**
- [ ] **Step 2: ARCHITECTURE sync**
- [ ] **Step 3: Run sim once** (`npx tsx scripts/simulate.ts --n 50 --seed 42 --bot greedy`) — must not crash; histogram may shift slightly only if default path changed (should not if default minCounts unchanged)

---

### Done when

- [ ] Four formations selectable; invalid id rejected at startDraft
- [ ] Scoring uses formation minCounts; default path matches pre-change bands for 4-3-3
- [ ] Draft Again re-enters formation gate (not silent re-start with no choice)
- [ ] scoreBand / explainScoreBand signatures unchanged
- [ ] ADR-017 + ARCHITECTURE updated
- [ ] Tests + build green

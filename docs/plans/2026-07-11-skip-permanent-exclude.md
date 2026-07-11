# Skip Permanent Exclude — Implementation Plan (refined)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Checkbox steps. Ground truth: `src/domain/draft/session.ts`, ADR-003 in DECISIONS.md, ARCHITECTURE.md §4, `tests/draft.test.ts`.

**Goal:** Skipped squad's `id` never re-reveals for the rest of that draft session (while alternatives exist). One skip token unchanged. Exclusion clears on any new draft (Start / Draft Again / refresh).

**Architecture:** Add `excludedSquadIds: string[]` to `DraftSession`. `skip` appends `currentReveal.id`. Every `selectSquad` call receives session excluded set and filters it at every pool stage **before** the final degenerate fallback. No UI in this plan.

**Tech Stack:** TypeScript 5, Vitest 1. No new deps.

## Global Constraints

- 11 picks; 1 skip token; immutable pure transitions; RNG reveal-only.
- No React in `src/domain` / `src/lib`.
- `npm test` + `npm run build` green before done.
- **Degenerate rule (non-negotiable):** if every non-excluded squad is exhausted *and* exclude would empty the pool, last resort may re-include excluded (same as today's "corpus of one" path). Prefer non-excluded while any exist. Log breach as today when seen-preference relaxes.

## Grounded facts (do not re-discover)

| Fact | Location |
|------|----------|
| `selectSquad(all, seen, excludeId, rng)` private | `session.ts:31-53` |
| Today `excludeId` is **one-shot** (skip replacement only); later `pick` passes `null` | `session.ts:109-114`, `146-150` |
| Skipped squad already in `seenSquadIds` from prior reveal | `startDraft` / `pick` always append reveal id |
| Permanent ban only matters on **breach** (seen pool empty) — without this feature, skipped id can reappear then | ADR-003 + corpus 16 still breaches late |
| `DraftSession` has no `excludedSquadIds` yet | `types.ts:39-47` |
| `assertInvariants` in tests assumes `seenSquadIds.length === roundsPlayed` | `draft.test.ts:83-113` |
| 13 draft tests + purity; `driveToComplete` never skips | `draft.test.ts` |

## Challenges vs first draft of this plan

1. **Wrong:** "excludedSquadIds.length ≤ 1 always" as hard invariant — true only while product keeps one skip; if skip count ever rises, field is a list. Keep list; assert `length <= (1 - skipRemaining)` or simply `<= 1` with comment tied to current product.
2. **Wrong:** absolute "never reappear" in corpus(1) — impossible. Test corpus(2) for hard ban; corpus(1) for playable degenerate.
3. **Wrong:** drop `excludeId` param entirely — keep one-shot `excludeId` on the skip draw (belt) **and** permanent list for later picks. Or fold skip into excluded before select and pass `excludeId=null`; either is fine if tests lock behavior.
4. **UI not in scope** — DraftScreen skip tooltip optional follow-up; do not block domain ship.

---

### Task 1: Types + selectSquad + startDraft/pick/skip

**Files:**
- Modify: `src/domain/types.ts` (`DraftSession`)
- Modify: `src/domain/draft/session.ts` (`selectSquad`, `startDraft`, `pick`, `skip`)
- Test: `tests/draft.test.ts`

**Interfaces:**
- Consumes: existing `selectSquad` / session API.
- Produces:
  - `DraftSession.excludedSquadIds: string[]`
  - `startDraft` → `excludedSquadIds: []`
  - `skip` → `excludedSquadIds: [...prev, reveal.id]`
  - `selectSquad(all, seen, excluded, excludeId, rng)` filters `excluded` in stages 1–2; stage 3 may ignore excluded only if empty

- [ ] **Step 1: Write failing tests first** (append to `tests/draft.test.ts`)

```typescript
describe('permanent skip exclude', () => {
  it('skip records squad id in excludedSquadIds', () => {
    const data = corpus(7);
    const rng = mulberry32(42);
    let session = startDraft(data, rng);
    const skippedId = session.currentReveal!.id;
    session = skip(session, data, rng);
    assertInvariants(session);
    expect(session.excludedSquadIds).toEqual([skippedId]);
  });

  it('startDraft has empty excludedSquadIds', () => {
    const session = startDraft(corpus(7), mulberry32(1));
    expect(session.excludedSquadIds).toEqual([]);
  });

  it('skipped squad never reappears when corpus has alternatives (corpus 7)', () => {
    const data = corpus(7);
    const rng = mulberry32(99);
    let session = startDraft(data, rng);
    const skippedId = session.currentReveal!.id;
    session = skip(session, data, rng);
    while (session.phase !== 'COMPLETE') {
      expect(session.currentReveal!.id).not.toBe(skippedId);
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }
    expect(session.picks.length).toBe(11);
  });

  it('skipped squad never reappears on breach path (corpus 2)', () => {
    // After skip, only 1 squad remains for 11 picks → many breaches, never excluded id.
    const data = corpus(2);
    const rng = mulberry32(7);
    let session = startDraft(data, rng);
    const skippedId = session.currentReveal!.id;
    session = skip(session, data, rng);
    while (session.phase !== 'COMPLETE') {
      expect(session.currentReveal!.id).not.toBe(skippedId);
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }
  });

  it('corpus of 1 remains playable after skip (degenerate may re-show only squad)', () => {
    const data = corpus(1);
    const rng = mulberry32(3);
    let session = startDraft(data, rng);
    session = skip(session, data, rng);
    assertInvariants(session);
    // Must still be able to complete 11 picks.
    while (session.phase !== 'COMPLETE') {
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }
    expect(session.picks.length).toBe(11);
  });
});
```

Update `assertInvariants` to require `excludedSquadIds` present and `length <= 1` (document: product = one skip).

- [ ] **Step 2: Run tests — expect FAIL** (missing field / wrong behavior)

```bash
npx vitest run tests/draft.test.ts
```

Expected: compile error or fail on `excludedSquadIds`.

- [ ] **Step 3: Extend DraftSession**

In `src/domain/types.ts`:

```typescript
export interface DraftSession {
  phase: 'AWAIT_PICK' | 'COMPLETE';
  picks: Pick[];
  skipRemaining: 0 | 1;
  roundsPlayed: number;
  seenSquadIds: string[];
  excludedSquadIds: string[]; // session-scoped permanent ban after skip
  currentReveal: Squad | null;
  breachLog: string[];
}
```

- [ ] **Step 4: Implement selectSquad with excluded list**

Replace private `selectSquad` in `session.ts` with:

```typescript
function selectSquad(
  all: Squad[],
  seen: string[],
  excluded: string[],
  excludeId: string | null,
  rng: Rng,
): SelectResult {
  const notExcluded = (s: Squad) =>
    !excluded.includes(s.id) && s.id !== excludeId;

  let pool = all.filter((s) => !seen.includes(s.id) && notExcluded(s));
  let breached = false;

  if (pool.length === 0) {
    // Relax seen preference; still honor permanent + one-shot exclude.
    pool = all.filter(notExcluded);
    breached = true;
  }

  if (pool.length === 0) {
    // Degenerate: no non-excluded squad left. Allow any except one-shot excludeId.
    pool = all.filter((s) => s.id !== excludeId);
  }

  if (pool.length === 0) {
    // Corpus of one / everything excluded: allow all (playable).
    pool = all;
  }

  const idx = Math.floor(rng.next() * pool.length);
  return { reveal: pool[idx], breached };
}
```

- [ ] **Step 5: Wire startDraft / pick / skip**

```typescript
// startDraft
const { reveal, breached } = selectSquad(data.squads, [], [], null, rng);
// ... return { ..., excludedSquadIds: [], ... }

// pick next reveal
selectSquad(data.squads, session.seenSquadIds, session.excludedSquadIds, null, rng)

// skip
const excludedSquadIds = [...session.excludedSquadIds, reveal.id];
selectSquad(
  data.squads,
  session.seenSquadIds,
  excludedSquadIds,
  reveal.id, // one-shot still OK (already in excluded)
  rng,
);
// return { ..., excludedSquadIds, skipRemaining: 0, ... }
```

- [ ] **Step 6: Run draft tests**

```bash
npx vitest run tests/draft.test.ts
```

Expected: all pass including new permanent-exclude cases.

- [ ] **Step 7: Full suite + build**

```bash
npm test && npm run build
```

Expected: green.

---

### Task 2: Docs — ADR-003 amend + ARCHITECTURE

**Files:**
- Modify: `DECISIONS.md` ADR-003
- Modify: `ARCHITECTURE.md` §3 signatures + §4 pseudocode

- [ ] **Step 1: Amend ADR-003**

Add to Decision (canonical state + transitions):

- Field: `excludedSquadIds: string[]` — squad ids permanently banned for the rest of the session after skip.
- `skip`: appends skipped reveal's `id` to `excludedSquadIds` (in addition to existing behavior).
- `selectSquad`: filter `excludedSquadIds` on preferred and breach pools; only if those pools are empty may excluded squads re-enter (degenerate corpus).
- Rationale: user intent of skip is "I do not want this team this draft," not "skip this draw only."
- Revisit: multi-skip would keep a list; product still one token.

- [ ] **Step 2: Update ARCHITECTURE.md §4**

Match implemented `selectSquad` / `skip` / `startDraft` return shape including `excludedSquadIds`.

- [ ] **Step 3: Verify**

```bash
npm test
```

No code change expected.

---

### Done when

- [ ] Permanent exclude tests green; corpus(1) still completes after skip
- [ ] Existing draft tests green without relaxing arithmetic invariants
- [ ] ADR-003 + ARCHITECTURE updated
- [ ] No UI required for this plan

# Progressive Live Score — Implementation Plan (refined)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Ground truth: `ResultScreen.tsx`, `usePlaythrough.ts`, `src/data/config/commentary.json`, compute-once invariant in ROADMAP/CLAUDE.

**Goal:** During result playthrough, always show a scoreboard that progresses from `0 - 0` toward the fixed final `bandId` (e.g. `5 - 0`) as commentary advances. Pure presentation. No domain changes.

**Architecture:** New pure helper `parseBandScoreline(bandId)` + `progressScoreline(bandId, progress01)`. New `Scoreboard` component. ResultScreen computes progress from `visibleBeatCount / totalBeats` (or goal-weighted — see challenges). `usePlaythrough` stays count-only (no band knowledge). Score + commentary still computed once in ResultScreen `useMemo`.

**Tech Stack:** React 18, TypeScript 5, Vitest 1. No new deps.

## Global Constraints

- **Compute-once:** `getFinalXI → computeScoreInput → scoreBand → buildCommentary` only inside existing `useMemo`. Timers never re-score.
- No domain edits. No commentary.json edits required for MVP.
- `usePlaythrough` must not take band/session (structural purity).
- `npm test` + `npm run build` green before done.

## Grounded facts

| Fact | Location |
|------|----------|
| Band + commentary computed once | `ResultScreen.tsx:23-32` |
| Playthrough: `visibleBeatCount`, `showScoreline` | `usePlaythrough.ts` |
| Scoreline UI only when `showScoreline` | `ResultScreen.tsx:41-48, 101-107` |
| Pending copy: "Commentary rolling…" | header while `!showScoreline` |
| Real goal-type beat counts ≠ scoreline goals | `commentary.json` |

### Real script audit (do not invent different counts)

| bandId | `type:"goal"` count | Notes |
|--------|---------------------|--------|
| 10-0 | 2 | Drama beats carry multi-goal text without type goal |
| 5-0 | 2 | Halftime text says "Three-nil" mid-script |
| 3-1 | 3 | Away goal is `drama` ("2-1"), not `goal` |
| 2-2 | 3 | Leveling goals mix goal + drama |
| 1-2 | 2 | Equalizer is goal; late concession is drama |
| 0-4 | 2 | Later concessions are drama |

**Conclusion:** "Increment one home/away goal per goal beat" is **false** for this corpus. First plan's Scoreboard tests assumed 5 goal beats for 5-0 — **wrong**.

## Challenges vs first draft of this plan

1. **Rejected:** `goalBeatsSeen / totalGoalBeats` as sole progress — undercounts multi-goal drama beats; 0-4 mid-feed wrong.
2. **Rejected:** domain changes to emit per-beat score timeline — overkill; commentary is presentation skin (ADR-005).
3. **Chosen progress model (simple, honest):**

```typescript
// progress based on beat reveal index, not goal type count
const progress = totalBeats === 0 ? 1 : Math.min(1, visibleBeatCount / totalBeats);
// when showScoreline → progress = 1 exactly
const { home, away } = progressScoreline(band.bandId, showScoreline ? 1 : progress);
```

   Displayed score may not match every commentary sentence mid-feed (e.g. HT text "three-nil" while board shows 2-0). **Accepted product tradeoff** unless Fable later tags beats with optional `scoreAfter` in commentary schema (schema bump + ADR — out of scope).

4. **parseBandScoreline:** band ids are always `"H-A"` with non-negative integers in this game. Reject malformed with throw in helper (tests only use real band ids from config).

5. **Test env:** component tests need `// @vitest-environment jsdom` and `@testing-library/react` like `startScreen.test.tsx`. First plan omitted import of `render`.

6. **No dependency on formation/skip plans** — can ship alone.

---

### Task 1: Pure scoreline helpers + unit tests (no React)

**Files:**
- Create: `src/app/scorelineProgress.ts` (or `src/lib/scorelineProgress.ts` — prefer `src/app/` if presentation-only; `src/lib` only if reused outside UI)
- Create: `tests/scorelineProgress.test.ts`

**Interfaces:**
```typescript
export interface Scoreline { home: number; away: number }

/** Parse "5-0" → { home: 5, away: 0 }. Throws if not /^\\d+-\\d+$/. */
export function parseBandScoreline(bandId: string): Scoreline

/**
 * progress in [0, 1]. Returns floored intermediate scores, exact final at 1.
 * home = floor(finalHome * progress), away = floor(finalAway * progress).
 * At progress >= 1, return exact final (no floor error).
 */
export function progressScoreline(bandId: string, progress: number): Scoreline
```

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseBandScoreline, progressScoreline } from '../src/app/scorelineProgress';

describe('parseBandScoreline', () => {
  it('parses 10-0, 5-0, 0-4, 2-2', () => {
    expect(parseBandScoreline('10-0')).toEqual({ home: 10, away: 0 });
    expect(parseBandScoreline('5-0')).toEqual({ home: 5, away: 0 });
    expect(parseBandScoreline('0-4')).toEqual({ home: 0, away: 4 });
    expect(parseBandScoreline('2-2')).toEqual({ home: 2, away: 2 });
  });
  it('throws on garbage', () => {
    expect(() => parseBandScoreline('LEGENDARY')).toThrow();
  });
});

describe('progressScoreline', () => {
  it('is 0-0 at progress 0', () => {
    expect(progressScoreline('5-0', 0)).toEqual({ home: 0, away: 0 });
  });
  it('is exact final at progress 1', () => {
    expect(progressScoreline('5-0', 1)).toEqual({ home: 5, away: 0 });
    expect(progressScoreline('0-4', 1)).toEqual({ home: 0, away: 4 });
  });
  it('floors intermediate for 10-0 at 0.5 → 5-0', () => {
    expect(progressScoreline('10-0', 0.5)).toEqual({ home: 5, away: 0 });
  });
  it('never exceeds final', () => {
    expect(progressScoreline('3-1', 0.99).home).toBeLessThanOrEqual(3);
    expect(progressScoreline('3-1', 0.99).away).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Implement helpers**
- [ ] **Step 3: `npx vitest run tests/scorelineProgress.test.ts`** — pass

---

### Task 2: Scoreboard component

**Files:**
- Create: `src/app/components/Scoreboard.tsx` (create `components/` dir if missing)
- Create: `tests/scoreboard.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
```typescript
interface ScoreboardProps {
  home: number;
  away: number;
  /** optional: "Match in progress" | "Full time" for a11y */
  label?: string;
}
```

Dumb presentational — **no bandId parsing inside** (parent passes numbers). Keeps component trivial.

- [ ] **Step 1: Component + css**
- [ ] **Step 2: jsdom test** renders `3 - 1` from props
- [ ] **Step 3: vitest green**

---

### Task 3: Wire ResultScreen

**Files:**
- Modify: `src/app/ResultScreen.tsx` only

**Behavior:**
1. Keep existing `useMemo` for band + commentary unchanged.
2. After `usePlaythrough(commentary.beats.length)`:

```typescript
const totalBeats = commentary.beats.length;
const progress = showScoreline
  ? 1
  : totalBeats === 0
    ? 1
    : visibleBeatCount / totalBeats;
const { home, away } = progressScoreline(band.bandId, progress);
```

3. Header always shows `<Scoreboard home={home} away={away} />`.
4. Keep band label + full `band.bandId` string reveal on `showScoreline` (existing).
5. Optional: drop or soften "Commentary rolling…" since board is live — prefer replace pending headline with empty / "Live" eyebrow only.

**Must not:**
- Call `scoreBand` outside useMemo
- Pass band into `usePlaythrough`
- Change beat texts

- [ ] **Step 1: Wire Scoreboard**
- [ ] **Step 2: Manual mental check** — skip-to-result → progress 1 → exact bandId numbers
- [ ] **Step 3: `npm test && npm run build`**

Optional follow-up (out of scope): ResultScreen unit test with fake timers asserting scoreboard steps — only if existing ResultScreen tests exist; do not invent heavy harness unless easy.

---

### Done when

- [ ] Progressive board visible during playthrough; exact H-A at full time / skip-to-result
- [ ] Helpers tested against real band ids including 10-0 and 0-4
- [ ] No domain / commentary schema changes
- [ ] Compute-once invariant intact
- [ ] Mid-feed commentary text may disagree with board numbers — documented as accepted

## Out of scope (do not sneak in)

- Editing commentary beats to add `scoreAfter` fields
- Animating digit flips / sound
- Showing opponent name / tournament branding
- explainScoreBand / ResultBreakdown (Phase 2)

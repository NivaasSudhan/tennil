/**
 * Progressive live-score presentation helpers (WAVE U2; plan
 * 2026-07-11-progressive-live-score.md; C4).
 *
 * PURE. No React, no domain imports, no RNG. Presentation skin only — the
 * commentary script and band are computed once in ResultScreen's useMemo
 * (compute-once invariant); these helpers just turn the parsed bandId and a
 * [0,1] progress scalar into floored intermediate scoreline numbers so the
 * scoreboard can tick up toward the fixed final without ever re-scoring.
 *
 * C4 note: commentary `type:"goal"` beat counts do NOT equal scoreline goals
 * (10-0 has 2 goal beats for 10 home goals; 3-1's away goal is a drama beat).
 * We therefore do NOT increment one goal per goal-beat. Instead the parent
 * derives a coarse progress scalar over goal-type beats and we proportionally
 * fill toward the fixed bandId, snapping to the exact H-A at progress === 1
 * (showScoreline). Mid-feed commentary text may disagree with the board —
 * accepted product tradeoff (plan §Done-when).
 */

export interface Scoreline {
  home: number;
  away: number;
}

const BAND_RE = /^(\d+)-(\d+)$/;

/**
 * Parse "H-A" → { home, away }. Throws if the bandId is not `<nonNeg>-<nonNeg>`.
 * Band ids in this game are always integer scorelines (thresholds.json bands).
 */
export function parseBandScoreline(bandId: string): Scoreline {
  const m = BAND_RE.exec(bandId);
  if (!m) {
    throw new Error(`parseBandScoreline: malformed bandId "${bandId}" (expected "H-A")`);
  }
  return { home: Number(m[1]), away: Number(m[2]) };
}

/**
 * progress in [0,1]. Floored intermediate scores, exact final at progress >= 1.
 * Monotonic non-decreasing in progress for each side. Never exceeds final.
 *
 * At progress 0 → 0-0. At progress 1 → exact bandId. Between, floor(final*p)
 * so the digits step upward as the feed advances. Awarded exactly at 1 so a
 * float like 0.9999999 still floors honestly below final, then the parent snaps
 * to 1 on showScoreline (no accumulation error near the end).
 */
export function progressScoreline(bandId: string, progress: number): Scoreline {
  const { home, away } = parseBandScoreline(bandId);
  const p = Math.min(1, Math.max(0, progress));
  if (p >= 1) return { home, away };
  return {
    home: Math.floor(home * p),
    away: Math.floor(away * p),
  };
}
/**
 * tests/nearMiss.test.ts — WAVE U2 near-miss margin line formatter.
 * Pure: consumes a ScoreExplanation-shaped object. Verifies the "N POINTS
 * FROM A {band}" headline + null-on-top-band + weak-link fallback.
 */
import { describe, it, expect } from 'vitest';
import { formatNearMiss } from '../src/app/nearMiss';
import type { ScoreExplanation } from '../src/domain/types';

function explain(nextBetter: ScoreExplanation['nextBetter']): ScoreExplanation {
  return {
    bandId: 'AWARDED',
    label: 'AWARDED',
    evaluations: [],
    nextBetter,
  };
}

describe('formatNearMiss', () => {
  it('returns null text when awarded the top band (nextBetter null)', () => {
    const e = explain(null);
    expect(formatNearMiss(e).text).toBeNull();
  });

  it('prefers the largest bucket-sum gap → "N POINTS FROM A 5-0"', () => {
    const e = explain({
      bandId: '5-0',
      label: 'ROUT',
      failing: [
        { name: 'minBucketSum', bucket: 'DEF', required: 320, actual: 318, passed: false },
        { name: 'minBucketSum', bucket: 'MID', required: 240, actual: 232, passed: false },
        { name: 'minWeakLink', required: 75, actual: 80, passed: true },
      ],
    });
    // biggest gap is MID (240-232 = 8)
    expect(formatNearMiss(e).text).toBe('8 POINTS FROM A 5-0 (MID)');
  });

  it('prints "POINT" singular when the gap is 1', () => {
    const e = explain({
      bandId: '5-0',
      label: 'ROUT',
      failing: [{ name: 'minBucketSum', bucket: 'ATT', required: 240, actual: 239, passed: false }],
    });
    expect(formatNearMiss(e).text).toBe('1 POINT FROM A 5-0 (ATT)');
  });

  it('falls back to weak-link deficit when no bucket-sum fails', () => {
    const e = explain({
      bandId: '5-0',
      label: 'ROUT',
      failing: [{ name: 'minWeakLink', required: 80, actual: 78, passed: false }],
    });
    expect(formatNearMiss(e).text).toBe('WEAK LINK 78 · NEED 80 (2 POINTS) FOR A 5-0');
  });

  it('falls back to minCounts deficit when only counts fail', () => {
    const e = explain({
      bandId: '5-0',
      label: 'ROUT',
      failing: [{ name: 'minCounts', bucket: 'DEF', required: 4, actual: 3, passed: false }],
    });
    expect(formatNearMiss(e).text).toBe('1 MORE DEF FOR A 5-0');
  });

  it('returns null when nextBetter exists but has no failing predicates', () => {
    const e = explain({ bandId: '5-0', label: 'x', failing: [] });
    expect(formatNearMiss(e).text).toBeNull();
  });
});
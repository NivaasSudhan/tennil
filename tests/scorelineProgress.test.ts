/**
 * tests/scorelineProgress.test.ts — WAVE U2 pure scoreline helpers.
 * parseBandScoreline/progressScoreline are generic "N-M" string parsers, not tied to
 * the live band ladder — '2-2' below is a valid scoreline string regardless of whether
 * thresholds.json still ships a '2-2' band id (ADR-019 retired it in favor of '1-1').
 * Key invariants: floor intermediate, monotonic non-decreasing, snap exact at 1.
 */
import { describe, it, expect } from 'vitest';
import { parseBandScoreline, progressScoreline } from '../src/app/scorelineProgress';

describe('parseBandScoreline', () => {
  it('parses every real corpus band id', () => {
    expect(parseBandScoreline('10-0')).toEqual({ home: 10, away: 0 });
    expect(parseBandScoreline('5-0')).toEqual({ home: 5, away: 0 });
    expect(parseBandScoreline('3-1')).toEqual({ home: 3, away: 1 });
    expect(parseBandScoreline('2-2')).toEqual({ home: 2, away: 2 });
    expect(parseBandScoreline('1-2')).toEqual({ home: 1, away: 2 });
    expect(parseBandScoreline('0-4')).toEqual({ home: 0, away: 4 });
  });

  it('throws on garbage / label-only / malformed', () => {
    expect(() => parseBandScoreline('LEGENDARY ROUT')).toThrow();
    expect(() => parseBandScoreline('')).toThrow();
    expect(() => parseBandScoreline('5-0-1')).toThrow();
    expect(() => parseBandScoreline('-1-0')).toThrow();
    expect(() => parseBandScoreline('v2')).toThrow();
  });
});

describe('progressScoreline', () => {
  it('is 0-0 at progress 0', () => {
    expect(progressScoreline('5-0', 0)).toEqual({ home: 0, away: 0 });
    expect(progressScoreline('10-0', 0)).toEqual({ home: 0, away: 0 });
    expect(progressScoreline('0-4', 0)).toEqual({ home: 0, away: 0 });
  });

  it('is exact final at progress 1 (snap-exact invariant, C4)', () => {
    expect(progressScoreline('5-0', 1)).toEqual({ home: 5, away: 0 });
    expect(progressScoreline('0-4', 1)).toEqual({ home: 0, away: 4 });
    expect(progressScoreline('2-2', 1)).toEqual({ home: 2, away: 2 });
    expect(progressScoreline('10-0', 1)).toEqual({ home: 10, away: 0 });
    expect(progressScoreline('3-1', 1)).toEqual({ home: 3, away: 1 });
    expect(progressScoreline('1-2', 1)).toEqual({ home: 1, away: 2 });
  });

  it('clamps >1 and <0 to [0,1] (defensive, parent snaps at showScoreline)', () => {
    expect(progressScoreline('5-0', 1.5)).toEqual({ home: 5, away: 0 });
    expect(progressScoreline('5-0', -0.2)).toEqual({ home: 0, away: 0 });
  });

  it('floors intermediate for 10-0 at 0.5 → 5-0', () => {
    expect(progressScoreline('10-0', 0.5)).toEqual({ home: 5, away: 0 });
  });

  it('never exceeds the final bandId on either side', () => {
    expect(progressScoreline('3-1', 0.99)).toEqual({ home: 2, away: 0 });
    expect(progressScoreline('3-1', 0.5)).toEqual({ home: 1, away: 0 });
    expect(progressScoreline('0-4', 0.5)).toEqual({ home: 0, away: 2 });
  });

  it('is monotonic non-decreasing per side as progress rises', () => {
    for (const bandId of ['10-0', '5-0', '3-1', '2-2', '1-2', '0-4']) {
      const final = parseBandScoreline(bandId);
      let prevHome = 0;
      let prevAway = 0;
      for (let i = 0; i <= 100; i += 1) {
        const p = i / 100;
        const s = progressScoreline(bandId, p);
        expect(s.home).toBeGreaterThanOrEqual(prevHome);
        expect(s.away).toBeGreaterThanOrEqual(prevAway);
        expect(s.home).toBeLessThanOrEqual(final.home);
        expect(s.away).toBeLessThanOrEqual(final.away);
        prevHome = s.home;
        prevAway = s.away;
      }
      // endpoint must equal exact final
      expect(progressScoreline(bandId, 1)).toEqual(final);
    }
  });

  it('0-4 (all away, no home): home stays 0 across the whole sweep', () => {
    for (let i = 0; i <= 10; i += 1) {
      const s = progressScoreline('0-4', i / 10);
      expect(s.home).toBe(0);
    }
    expect(progressScoreline('0-4', 1).away).toBe(4);
  });
});
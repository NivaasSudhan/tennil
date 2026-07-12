import { describe, it, expect } from 'vitest';
import { matchdayNumber } from '../src/lib/daily';

describe('matchdayNumber (ADR-014-lite)', () => {
  it('opening day (2026-06-11 UTC) is matchday #1', () => {
    expect(matchdayNumber(new Date(Date.UTC(2026, 5, 11)))).toBe(1);
  });

  it('the day after opening is matchday #2', () => {
    expect(matchdayNumber(new Date(Date.UTC(2026, 5, 12)))).toBe(2);
  });

  it('one week after opening is matchday #8', () => {
    expect(matchdayNumber(new Date(Date.UTC(2026, 5, 18)))).toBe(8);
  });

  it('a date before opening is a number <= 0', () => {
    expect(matchdayNumber(new Date(Date.UTC(2026, 5, 10)))).toBe(0);
    expect(matchdayNumber(new Date(Date.UTC(2026, 5, 1)))).toBe(-9);
  });

  it('is stable across different times of day on the same UTC date', () => {
    const morning = new Date(Date.UTC(2026, 6, 12, 0, 30));
    const night = new Date(Date.UTC(2026, 6, 12, 23, 45));
    expect(matchdayNumber(morning)).toBe(matchdayNumber(night));
  });
});

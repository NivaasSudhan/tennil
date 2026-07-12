import { describe, it, expect } from 'vitest';
import { dailySeed, mulberry32, seededRng, systemRng } from '../src/lib/rng';

describe('mulberry32', () => {
  it('same seed produces identical sequences', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);

    const seq1: number[] = [];
    const seq2: number[] = [];

    for (let i = 0; i < 10; i++) {
      seq1.push(rng1.next());
      seq2.push(rng2.next());
    }

    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different sequences', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(100);

    const seq1: number[] = [];
    const seq2: number[] = [];

    for (let i = 0; i < 10; i++) {
      seq1.push(rng1.next());
      seq2.push(rng2.next());
    }

    // At least one value should differ
    expect(seq1).not.toEqual(seq2);
  });

  it('all draws are in [0, 1)', () => {
    const rng = mulberry32(7);

    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('systemRng', () => {
  it('returns valid random numbers', () => {
    const rng = systemRng();

    for (let i = 0; i < 100; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('seededRng', () => {
  it('is an alias for mulberry32 — identical sequence for the same seed', () => {
    const a = seededRng(2026);
    const b = mulberry32(2026);
    for (let i = 0; i < 10; i++) {
      expect(a.next()).toBe(b.next());
    }
  });
});

describe('dailySeed', () => {
  it('same UTC date produces the same seed', () => {
    const d1 = new Date(Date.UTC(2026, 6, 12, 3, 15));
    const d2 = new Date(Date.UTC(2026, 6, 12, 23, 59));
    expect(dailySeed(d1)).toBe(dailySeed(d2));
  });

  it('different UTC dates produce different seeds', () => {
    const d1 = new Date(Date.UTC(2026, 6, 12));
    const d2 = new Date(Date.UTC(2026, 6, 13));
    const d3 = new Date(Date.UTC(2026, 5, 11));
    const seeds = new Set([dailySeed(d1), dailySeed(d2), dailySeed(d3)]);
    expect(seeds.size).toBe(3);
  });

  it('returns a non-negative integer usable as a mulberry32 seed', () => {
    const seed = dailySeed(new Date(Date.UTC(2026, 6, 12)));
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  it('two rngs seeded from the same date produce identical draw sequences', () => {
    const date = new Date(Date.UTC(2026, 6, 12));
    const rngA = mulberry32(dailySeed(date));
    const rngB = mulberry32(dailySeed(date));
    for (let i = 0; i < 20; i++) {
      expect(rngA.next()).toBe(rngB.next());
    }
  });
});

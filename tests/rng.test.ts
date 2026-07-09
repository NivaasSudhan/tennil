import { describe, it, expect } from 'vitest';
import { mulberry32, systemRng } from '../src/lib/rng';

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

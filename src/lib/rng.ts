import type { Rng } from '../domain/types';

/**
 * Mulberry32 PRNG — deterministic, seeded.
 * Returns uniform values in [0, 1).
 */
export function mulberry32(seed: number): Rng {
  return {
    next() {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };
}

/**
 * System RNG — wraps Math.random for non-deterministic use.
 */
export function systemRng(): Rng {
  return {
    next: Math.random
  };
}

/**
 * seededRng — alias for mulberry32, named for call sites that want a
 * deterministic Rng from an already-derived seed rather than emphasizing the
 * mulberry32 algorithm choice.
 */
export function seededRng(seed: number): Rng {
  return mulberry32(seed);
}

// ADR-021: `dailySeed` was removed — the matchday/daily mechanic is retired.
// Every session draws a fresh Math.random seed; the HARD-mode opponent is drawn
// off that session rng in draft/session.ts (not from a date).

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
 * deterministic Rng from an already-derived seed (ADR-014-lite) rather than
 * emphasizing the mulberry32 algorithm choice.
 */
export function seededRng(seed: number): Rng {
  return mulberry32(seed);
}

/**
 * dailySeed — deterministic integer seed for a given UTC calendar date
 * (ADR-014-lite / Wordle mechanics). Same UTC date always yields the same
 * seed; different dates yield (with overwhelming probability) different
 * seeds. Derivation: `year*10000 + month*100 + day` spread through one
 * mulberry32 mixing step (same mixing as `mulberry32(seed).next()`, minus
 * the final division to [0, 1)) so nearby dates don't produce nearby seeds.
 *
 * ADR-014-lite amendment (2026-07-12): dailySeed no longer seeds reveals —
 * reveals are always fresh-random. dailySeed reserved for v2 Daily
 * Opposition selection; matchdayNumber drives the badge + share text.
 */
export function dailySeed(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const base = year * 10000 + month * 100 + day;

  let seed = (base + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

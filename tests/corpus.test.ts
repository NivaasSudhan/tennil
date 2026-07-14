/**
 * tests/corpus.test.ts — Sprint-1 Task 8. Corpus-wide integrity on the REAL
 * vendored data (loadGameDataFromDisk already applies the fail-closed
 * loadData validation; these are the corpus-scale invariants on top).
 *
 * Wave B (P-010): attr assertions — outfield 1-99, GK none, maradona override
 * accuracy 99, generator idempotence via imported function.
 */
import { describe, expect, it } from 'vitest';
import { loadGameDataFromDisk } from '../scripts/simulate';
import { generateAttrs } from '../scripts/attrs/generate';
import squadsJson from '../src/data/squads/squads.json';
import overridesJson from '../src/data/attrs-overrides.json';

const EXPECTED_SQUAD_COUNT = 60;

describe('corpus integrity', () => {
  const data = loadGameDataFromDisk();

  it(`has exactly ${EXPECTED_SQUAD_COUNT} squads`, () => {
    expect(data.squads).toHaveLength(EXPECTED_SQUAD_COUNT);
  });

  it('squad ids are unique and match <iso3>-<year>', () => {
    const ids = data.squads.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]{3}-\d{4}$/);
  });

  it('player ids are unique across the whole corpus and prefixed by squad id', () => {
    const ids = data.squads.flatMap((s) => s.players.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const squad of data.squads) {
      for (const p of squad.players) expect(p.id.startsWith(`${squad.id}-`)).toBe(true);
    }
  });

  it('every positionBucket agrees with position-map on positionRaw', () => {
    for (const squad of data.squads) {
      for (const p of squad.players) {
        expect(data.positionMap[p.positionRaw]).toBe(p.positionBucket);
      }
    }
  });

  it('ratings are integers within ratingScale', () => {
    const { min, max } = data.thresholds.ratingScale;
    for (const squad of data.squads) {
      for (const p of squad.players) {
        expect(Number.isInteger(p.rating)).toBe(true);
        expect(p.rating).toBeGreaterThanOrEqual(min);
        expect(p.rating).toBeLessThanOrEqual(max);
      }
    }
  });

  it('no two squads share country+year', () => {
    const keys = data.squads.map((s) => `${s.country}|${s.year}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // ---- Wave B (P-010): attr assertions ----

  it('every outfield player has pace/strength/accuracy in [1, 99]', () => {
    for (const squad of data.squads) {
      for (const p of squad.players) {
        if (p.positionBucket === 'GK') continue;
        expect(p.pace).toBeGreaterThanOrEqual(1);
        expect(p.pace).toBeLessThanOrEqual(99);
        expect(p.strength).toBeGreaterThanOrEqual(1);
        expect(p.strength).toBeLessThanOrEqual(99);
        expect(p.accuracy).toBeGreaterThanOrEqual(1);
        expect(p.accuracy).toBeLessThanOrEqual(99);
      }
    }
  });

  it('GK players have no pace/strength/accuracy attrs', () => {
    for (const squad of data.squads) {
      for (const p of squad.players) {
        if (p.positionBucket !== 'GK') continue;
        expect(p.pace).toBeUndefined();
        expect(p.strength).toBeUndefined();
        expect(p.accuracy).toBeUndefined();
      }
    }
  });

  it('maradona-1986 has accuracy 99 (attrs-overrides.json)', () => {
    const maradona = data.squads
      .find((s) => s.id === 'arg-1986')!
      .players.find((p) => p.id === 'arg-1986-maradona')!;
    expect(maradona.accuracy).toBe(99);
  });

  it('generator is idempotent on the current corpus', () => {
    const clone = JSON.parse(JSON.stringify(squadsJson));
    generateAttrs(clone, overridesJson as Record<string, Partial<{ pace: number; strength: number; accuracy: number }>>);
    expect(clone).toEqual(squadsJson);
  });
});

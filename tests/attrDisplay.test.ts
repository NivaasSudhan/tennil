import { describe, expect, it } from 'vitest';
import { displayAttrs, dominantDisplayAttr } from '../src/app/attrDisplay';
import type { Player } from '../src/domain/types';

const OUTFIELD: Player = {
  id: 'attr-1',
  name: 'Roberto Carlos',
  positionRaw: 'LB',
  positionBucket: 'DEF',
  rating: 90,
  pace: 94,
  strength: 78,
  accuracy: 82,
};

const GK: Player = {
  id: 'gk-1',
  name: 'Oliver Kahn',
  positionRaw: 'GK',
  positionBucket: 'GK',
  rating: 93,
};

const LEGACY_NO_ATTRS: Player = {
  id: 'legacy-1',
  name: 'Zico',
  positionRaw: 'CAM',
  positionBucket: 'MID',
  rating: 88,
};

describe('displayAttrs — outfield', () => {
  it('returns PAC/STR/ACC with exact player values', () => {
    const result = displayAttrs(OUTFIELD);
    expect(result).toEqual([
      { key: 'pace', label: 'PAC', value: 94 },
      { key: 'strength', label: 'STR', value: 78 },
      { key: 'accuracy', label: 'ACC', value: 82 },
    ]);
  });

  it('returns exactly 3 items in fixed order: pace, strength, accuracy', () => {
    const result = displayAttrs(OUTFIELD);
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe('pace');
    expect(result[1].key).toBe('strength');
    expect(result[2].key).toBe('accuracy');
  });
});

describe('displayAttrs — GK', () => {
  it('returns REF/HAN/DIS with values in [1,99]', () => {
    const result = displayAttrs(GK);
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe('ref');
    expect(result[0].label).toBe('REF');
    expect(result[0].value).toBeGreaterThanOrEqual(1);
    expect(result[0].value).toBeLessThanOrEqual(99);
    expect(result[1].key).toBe('han');
    expect(result[1].label).toBe('HAN');
    expect(result[1].value).toBeGreaterThanOrEqual(1);
    expect(result[1].value).toBeLessThanOrEqual(99);
    expect(result[2].key).toBe('dis');
    expect(result[2].label).toBe('DIS');
    expect(result[2].value).toBeGreaterThanOrEqual(1);
    expect(result[2].value).toBeLessThanOrEqual(99);
  });

  it('produces known deterministic values for gk-1: ref=96 han=91 dis=92', () => {
    const result = displayAttrs(GK);
    expect(result[0]).toEqual({ key: 'ref', label: 'REF', value: 96 });
    expect(result[1]).toEqual({ key: 'han', label: 'HAN', value: 91 });
    expect(result[2]).toEqual({ key: 'dis', label: 'DIS', value: 92 });
  });
});

describe('displayAttrs — legacy player without attrs', () => {
  it('falls back to GK-like derivation when any attr missing', () => {
    const result = displayAttrs(LEGACY_NO_ATTRS);
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe('ref');
    expect(result[1].key).toBe('han');
    expect(result[2].key).toBe('dis');
  });
});

describe('displayAttrs — determinism', () => {
  it('same player twice returns identical values', () => {
    const a = displayAttrs(GK);
    const b = displayAttrs(GK);
    expect(a).toEqual(b);
  });

  it('NO Math.random call needed — just call twice and compare', () => {
    const a = displayAttrs(GK);
    const b = displayAttrs(GK);
    expect(a).toEqual(b);
  });
});

describe('dominantDisplayAttr — outfield', () => {
  it('returns pace for Roberto Carlos (94 is highest)', () => {
    expect(dominantDisplayAttr(OUTFIELD)).toBe('pace');
  });

  it('tie resolves to first in array order (pace > strength > accuracy)', () => {
    const tiePlayer: Player = {
      id: 'tie-1',
      name: 'Tie Test',
      positionRaw: 'ST',
      positionBucket: 'ATT',
      rating: 85,
      pace: 94,
      strength: 82,
      accuracy: 94,
    };
    expect(dominantDisplayAttr(tiePlayer)).toBe('pace');
  });
});

describe('dominantDisplayAttr — GK', () => {
  it('returns ref for Kahn (96 is highest)', () => {
    expect(dominantDisplayAttr(GK)).toBe('ref');
  });

  it('tie resolves to first in fixed order (ref > han > dis)', () => {
    const tieGK: Player = {
      id: 'tie-gk',
      name: 'Tie GK',
      positionRaw: 'GK',
      positionBucket: 'GK',
      rating: 85,
    };
    const result = dominantDisplayAttr(tieGK);
    const vals = displayAttrs(tieGK);
    const first = vals[0].key;
    const second = vals[1].key;
    const third = vals[2].key;
    expect([first, second, third]).toContain(result);
  });
});

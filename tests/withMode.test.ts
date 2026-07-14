/**
 * tests/withMode.test.ts — ADR-021 withMode + resolveMinFit config views.
 */
import { describe, expect, it } from 'vitest';
import { withMode, resolveMinFit } from '../src/domain/scoring/withMode';
import { withFormationMinCounts } from '../src/domain/scoring/withFormation';
import type { BandDef, ThresholdConfig } from '../src/domain/types';

function makeConfig(): ThresholdConfig {
  const normalBands: BandDef[] = [
    { id: '10-0', priority: 100, label: 'N', minEfficiency: 99 },
    { id: '0-4', priority: 0, label: 'FALL', fallback: true },
  ];
  const hardBands: BandDef[] = [
    {
      id: '10-0',
      priority: 100,
      label: 'H',
      minEfficiency: 99,
      minFit: { '4-3-3': 94, '3-5-2': 90 },
    },
    { id: '0-4', priority: 0, label: 'FALL', fallback: true },
  ];
  return {
    version: 5,
    referenceFormation: '4-3-3',
    minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
    formations: [
      { id: '4-3-3', label: '4-3-3', description: '', minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 } },
      { id: '3-5-2', label: '3-5-2', description: '', minCounts: { GK: 1, DEF: 3, MID: 5, ATT: 2 } },
    ],
    ratingScale: { min: 1, max: 100 },
    bands: hardBands,
    modes: { normal: { bands: normalBands }, hard: { bands: hardBands } },
    profiles: {},
    oppositions: [{ id: 'neutral', label: 'N', tagline: 'n', weightMods: {} }],
  };
}

describe('withMode', () => {
  it('swaps active bands to the chosen difficulty', () => {
    const config = makeConfig();
    const normal = withMode(config, 'normal');
    const hard = withMode(config, 'hard');
    expect(normal.bands.map((b) => b.id)).toEqual(['10-0', '0-4']);
    expect(normal.bands[0].minFit).toBeUndefined();
    expect(hard.bands[0].minFit).toEqual({ '4-3-3': 94, '3-5-2': 90 });
    // input never mutated
    expect(config.bands).toBe(config.modes!.hard.bands);
  });

  it('returns pre-v5 configs (no modes) unchanged', () => {
    const legacy: ThresholdConfig = {
      version: 4,
      referenceFormation: '4-3-3',
      minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
      formations: [],
      ratingScale: { min: 1, max: 100 },
      bands: [{ id: 'fb', priority: 0, label: 'F', fallback: true }],
      profiles: {},
      oppositions: [],
    };
    expect(withMode(legacy, 'normal')).toBe(legacy);
  });
});

describe('resolveMinFit', () => {
  it('leaves scalar / absent minFit unchanged', () => {
    const scalar: BandDef = { id: 'x', priority: 1, label: 'X', minFit: 88 };
    const absent: BandDef = { id: 'y', priority: 1, label: 'Y' };
    expect(resolveMinFit(scalar, '4-3-3')).toBe(scalar);
    expect(resolveMinFit(absent, '4-3-3')).toBe(absent);
  });

  it('collapses Record minFit to the formation scalar', () => {
    const band: BandDef = {
      id: 'x',
      priority: 1,
      label: 'X',
      minFit: { '4-3-3': 94, '3-5-2': 90 },
    };
    expect(resolveMinFit(band, '4-3-3').minFit).toBe(94);
    expect(resolveMinFit(band, '3-5-2').minFit).toBe(90);
    expect(resolveMinFit(band, '5-3-2').minFit).toBeUndefined();
    expect(resolveMinFit(band, null).minFit).toBeUndefined();
  });

  it('withFormationMinCounts resolves per-formation minFit on the hard ladder', () => {
    const hard = withMode(makeConfig(), 'hard');
    const c433 = withFormationMinCounts(hard, '4-3-3');
    const c352 = withFormationMinCounts(hard, '3-5-2');
    expect(c433.bands.find((b) => b.id === '10-0')!.minFit).toBe(94);
    expect(c352.bands.find((b) => b.id === '10-0')!.minFit).toBe(90);
  });
});

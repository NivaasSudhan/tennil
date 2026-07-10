/**
 * tests/simulate.test.ts — smoke test for the T-014 simulation harness.
 *
 * Runs a handful of real drafts through `runSimulation` (scripts/simulate.ts)
 * against the real vendored game data and asserts every result lands on a
 * band id that actually exists in `thresholds.json`. This is a smoke test,
 * not a rarity assertion — thresholds are still PLACEHOLDER (R-04) until
 * T-015 tunes them.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSimReport,
  loadGameDataFromDisk,
  percentile,
  runSimulation,
  summarizeDistribution,
} from '../scripts/simulate';

describe('simulate harness smoke test', () => {
  const data = loadGameDataFromDisk();
  const validBandIds = new Set(data.thresholds.bands.map((b) => b.id));

  it('runs 10 greedy-bot drafts and returns only valid band ids', () => {
    const sim = runSimulation(data, { n: 10, seed: 1, bot: 'greedy', skipThreshold: 84 });

    expect(sim.results).toHaveLength(10);
    for (const result of sim.results) {
      expect(validBandIds.has(result.bandId)).toBe(true);
      expect(result.finalXI).toHaveLength(11);
    }
  });

  it('runs 10 random-bot drafts and returns only valid band ids', () => {
    const sim = runSimulation(data, { n: 10, seed: 2, bot: 'random', skipThreshold: 84 });

    expect(sim.results).toHaveLength(10);
    for (const result of sim.results) {
      expect(validBandIds.has(result.bandId)).toBe(true);
      expect(result.finalXI).toHaveLength(11);
    }
  });

  it('is deterministic: same seed and args produce identical band sequences', () => {
    const a = runSimulation(data, { n: 10, seed: 42, bot: 'greedy', skipThreshold: 84 });
    const b = runSimulation(data, { n: 10, seed: 42, bot: 'greedy', skipThreshold: 84 });

    expect(a.results.map((r) => r.bandId)).toEqual(b.results.map((r) => r.bandId));
  });
});

describe('sim diagnostics (Sprint-1 T6)', () => {
  it('percentile: exact linear interpolation', () => {
    const sorted = [10, 20, 30, 40];
    expect(percentile(sorted, 50)).toBe(25);
    expect(percentile(sorted, 25)).toBe(17.5);
    expect(percentile(sorted, 10)).toBe(13);
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 100)).toBe(40);
    expect(percentile([7], 50)).toBe(7);
    expect(() => percentile([], 50)).toThrow();
  });

  it('summarizeDistribution does not mutate its input and reports min/max', () => {
    const values = [30, 10, 40, 20];
    const summary = summarizeDistribution(values);
    expect(values).toEqual([30, 10, 40, 20]);
    expect(summary.min).toBe(10);
    expect(summary.max).toBe(40);
    expect(summary.p50).toBe(25);
  });

  it('runSimulation attaches deterministic diagnostics with valid shape', () => {
    const data = loadGameDataFromDisk();
    const a = runSimulation(data, { n: 40, seed: 7, bot: 'greedy', skipThreshold: 84 });
    const b = runSimulation(data, { n: 40, seed: 7, bot: 'greedy', skipThreshold: 84 });
    expect(a.diagnostics).toEqual(b.diagnostics);

    expect(a.diagnostics.nearMissDelta).toBe(3);
    for (const bucket of ['GK', 'DEF', 'MID', 'ATT'] as const) {
      const d = a.diagnostics.bucketSums[bucket];
      expect(d.p10).toBeLessThanOrEqual(d.p90);
    }
    expect(a.diagnostics.seedQuartiles).toHaveLength(4);

    const validBands = new Set(data.thresholds.bands.map((band) => band.id));
    for (const row of a.diagnostics.nearMisses) {
      expect(validBands.has(row.missedBandId)).toBe(true);
      expect(row.percent).toBeGreaterThanOrEqual(0);
      expect(row.percent).toBeLessThanOrEqual(100);
    }
  });

  it('buildSimReport is JSON-serializable and carries histogram + diagnostics', () => {
    const data = loadGameDataFromDisk();
    const sim = runSimulation(data, { n: 10, seed: 3, bot: 'random', skipThreshold: 84 });
    const report = JSON.parse(JSON.stringify(buildSimReport(sim)));
    expect(report.schema).toBe(1);
    expect(report.histogram.length).toBe(data.thresholds.bands.length);
    expect(report.diagnostics.weakLink.p50).toBeTypeOf('number');
  });
});

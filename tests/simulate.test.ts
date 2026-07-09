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
import { loadGameDataFromDisk, runSimulation } from '../scripts/simulate';

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

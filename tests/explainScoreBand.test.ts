/**
 * tests/explainScoreBand.test.ts — Sprint-1 Task 5 (ADR-013).
 * Synthetic config mirrors tests/scoring.test.ts (does NOT import
 * thresholds.json — its numbers are retuned concurrently in T9).
 */
import { describe, expect, it } from 'vitest';
import { computeScoreInput, scoreBand } from '../src/domain/scoring/scoreBand';
import { explainScoreBand } from '../src/domain/scoring/explainScoreBand';
import type { BandDef, FinalXI, Player, PositionBucket, PositionMap, ThresholdConfig } from '../src/domain/types';

const POSITION_MAP: PositionMap = { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' };

const TOP_BAND: BandDef = {
  id: 'TOP', priority: 100, label: 'LEGENDARY ROUT',
  requireAllBucketsNonEmpty: true, requireMinCounts: true,
  minBucketSums: { GK: 80, DEF: 320, MID: 240, ATT: 240 }, minWeakLink: 75,
};
const MID_BAND: BandDef = {
  id: 'MID', priority: 70, label: 'COMFORTABLE WIN',
  requireAllBucketsNonEmpty: true, requireMinCounts: true,
  minBucketSums: { GK: 70, DEF: 280, MID: 210, ATT: 210 }, minWeakLink: 65,
};
const LOW_BAND: BandDef = { id: 'LOW', priority: 40, label: 'NERVY DRAW', minWeakLink: 10 };
const FALLBACK_BAND: BandDef = { id: 'FALLBACK', priority: 0, label: 'TOTAL COLLAPSE', fallback: true };

const CONFIG: ThresholdConfig = {
  version: 1,
  referenceFormation: '4-3-3',
  minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
  ratingScale: { min: 1, max: 100 },
  bands: [TOP_BAND, MID_BAND, LOW_BAND, FALLBACK_BAND],
};

const RAW_FOR_BUCKET: Record<PositionBucket, string> = { GK: 'GK', DEF: 'CB', MID: 'CM', ATT: 'ST' };
let idCounter = 0;
function buildXI(spec: Partial<Record<PositionBucket, number[]>>): FinalXI {
  const xi: Player[] = [];
  for (const bucket of Object.keys(spec) as PositionBucket[]) {
    for (const rating of spec[bucket] ?? []) {
      idCounter += 1;
      xi.push({
        id: `e${idCounter}`, name: `Player ${idCounter}`,
        positionRaw: RAW_FOR_BUCKET[bucket], positionBucket: bucket, rating,
      });
    }
  }
  return xi;
}

const STRONG = { GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80] };

describe('explainScoreBand (ADR-013)', () => {
  it('awarded top band -> nextBetter is null', () => {
    const input = computeScoreInput(buildXI(STRONG), POSITION_MAP);
    const explanation = explainScoreBand(input, CONFIG);
    expect(explanation.bandId).toBe('TOP');
    expect(explanation.nextBetter).toBeNull();
    expect(explanation.evaluations.map((e) => e.bandId)).toEqual(['TOP', 'MID', 'LOW', 'FALLBACK']);
  });

  it('reports the exact margins for the nearest missed band', () => {
    // Weaken one DEF from 80 to 74: weakLink 74 (< TOP 75), DEF sum 314 (< TOP 320).
    const xi = buildXI({ GK: [80], DEF: [80, 80, 80, 74], MID: [80, 80, 80], ATT: [80, 80, 80] });
    const input = computeScoreInput(xi, POSITION_MAP);
    const explanation = explainScoreBand(input, CONFIG);

    expect(explanation.bandId).toBe('MID');
    expect(explanation.nextBetter).not.toBeNull();
    expect(explanation.nextBetter!.bandId).toBe('TOP');
    expect(explanation.nextBetter!.failing).toEqual([
      { name: 'minBucketSum', bucket: 'DEF', required: 320, actual: 314, passed: false },
      { name: 'minWeakLink', required: 75, actual: 74, passed: false },
    ]);
  });

  it('fallback award: nextBetter is the band directly above it (LOW)', () => {
    const xi = buildXI({ GK: [1], DEF: [1, 1, 1, 1], MID: [1, 1, 1], ATT: [1, 1, 1] });
    const input = computeScoreInput(xi, POSITION_MAP);
    const explanation = explainScoreBand(input, CONFIG);
    expect(explanation.bandId).toBe('FALLBACK');
    expect(explanation.nextBetter!.bandId).toBe('LOW');
    expect(explanation.nextBetter!.failing).toEqual([
      { name: 'minWeakLink', required: 10, actual: 1, passed: false },
    ]);
  });

  it('CONSISTENCY GUARANTEE: bandId always equals scoreBand(...) across a rating sweep', () => {
    for (let r = 1; r <= 100; r += 3) {
      const xi = buildXI({ GK: [r], DEF: [r, r, r, r], MID: [r, r, r], ATT: [r, r, r] });
      const input = computeScoreInput(xi, POSITION_MAP);
      expect(explainScoreBand(input, CONFIG).bandId).toBe(scoreBand(input, CONFIG).bandId);
    }
  });

  it('does not mutate config.bands order and is deterministic', () => {
    const order = CONFIG.bands.map((b) => b.id);
    const input = computeScoreInput(buildXI(STRONG), POSITION_MAP);
    const a = explainScoreBand(input, CONFIG);
    const b = explainScoreBand(input, CONFIG);
    expect(a).toEqual(b);
    expect(CONFIG.bands.map((b2) => b2.id)).toEqual(order);
  });
});

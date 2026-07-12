/**
 * tests/scoring.test.ts — ARCHITECTURE.md §7 scoring cases (T-008).
 *
 * Uses a SYNTHETIC ThresholdConfig built inline — deliberately does NOT import
 * src/data/config/thresholds.json, since its numbers may be edited concurrently
 * by another task (T-005/T-015). The synthetic config mirrors the real shape:
 * three ordinary bands (descending priority) plus exactly one fallback.
 */

import { describe, expect, it } from 'vitest';
import { computeScoreInput, evaluateBandPredicates, scoreBand } from '../src/domain/scoring/scoreBand';
import { withFormationMinCounts } from '../src/domain/scoring/withFormation';
import type { BandDef, CeilingResult, FinalXI, Player, PositionBucket, PositionMap, ThresholdConfig } from '../src/domain/types';
import realThresholdsRaw from '../src/data/config/thresholds.json';

// ADR-019: these synthetic bands never configure minEfficiency/minBucketEfficiency, so
// a zero ceiling is inert here — computeSessionCeiling itself is exercised in
// tests/sessionCeiling.test.ts.
const ZERO_CEILING: CeilingResult = { bucketSums: { GK: 0, DEF: 0, MID: 0, ATT: 0 }, total: 0 };

// ---------- synthetic config ----------

const POSITION_MAP: PositionMap = {
  GK: 'GK',
  CB: 'DEF',
  CM: 'MID',
  ST: 'ATT',
};

const MIN_COUNTS: Record<PositionBucket, number> = { GK: 1, DEF: 4, MID: 3, ATT: 3 };

const TOP_BAND: BandDef = {
  id: 'TOP',
  priority: 100,
  label: 'LEGENDARY ROUT',
  requireAllBucketsNonEmpty: true,
  requireMinCounts: true,
  minBucketSums: { GK: 80, DEF: 320, MID: 240, ATT: 240 },
  minWeakLink: 75,
};

const MID_BAND: BandDef = {
  id: 'MID',
  priority: 70,
  label: 'COMFORTABLE WIN',
  requireAllBucketsNonEmpty: true,
  requireMinCounts: true,
  minBucketSums: { GK: 70, DEF: 280, MID: 210, ATT: 210 },
  minWeakLink: 65,
};

const LOW_BAND: BandDef = {
  id: 'LOW',
  priority: 40,
  label: 'NERVY DRAW',
  minWeakLink: 10,
};

const FALLBACK_BAND: BandDef = {
  id: 'FALLBACK',
  priority: 0,
  label: 'TOTAL COLLAPSE',
  fallback: true,
};

function makeConfig(bands: BandDef[]): ThresholdConfig {
  return {
    version: 1,
    referenceFormation: '4-3-3',
    minCounts: MIN_COUNTS,
    formations: [
      { id: '4-3-3', label: '4-3-3', description: 'test', minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 } },
    ],
    ratingScale: { min: 1, max: 100 },
    bands,
    profiles: {}, // ADR-020: unused by this synthetic scoring fixture (fit lands Wave C)
    oppositions: [],
  };
}

const CONFIG = makeConfig([TOP_BAND, MID_BAND, LOW_BAND, FALLBACK_BAND]);

const REAL_THRESHOLDS = realThresholdsRaw as ThresholdConfig;

// ---------- XI builder ----------

const RAW_FOR_BUCKET: Record<PositionBucket, string> = {
  GK: 'GK',
  DEF: 'CB',
  MID: 'CM',
  ATT: 'ST',
};

let idCounter = 0;

/** Builds a FinalXI from compact per-bucket rating lists, e.g. { GK: [90], DEF: [80,80,80,80], ... }. */
function buildXI(
  spec: Partial<Record<PositionBucket, number[]>>,
  opts?: { wrongPositionBucketField?: boolean },
): FinalXI {
  const xi: Player[] = [];
  for (const bucket of Object.keys(spec) as PositionBucket[]) {
    const ratings = spec[bucket] ?? [];
    ratings.forEach((rating) => {
      idCounter += 1;
      xi.push({
        id: `p${idCounter}-${bucket}-${rating}`,
        name: `Player ${idCounter}`,
        positionRaw: RAW_FOR_BUCKET[bucket],
        // Deliberately wrong when requested, to prove positionMap (not this field) is the
        // source of truth in computeScoreInput.
        positionBucket: opts?.wrongPositionBucketField ? 'GK' : bucket,
        rating,
      });
    });
  }
  return xi;
}

// ---------- 1. Top-band XI passes top band ----------

describe('scoreBand', () => {
  it('1. top-band XI passes the top band', () => {
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80, 80, 80],
      MID: [80, 80, 80],
      ATT: [80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    const result = scoreBand(input, CONFIG);
    expect(result).toEqual({ bandId: 'TOP', label: 'LEGENDARY ROUT' });
  });

  // ---------- 2. one player at weakLink-1 drops a band ----------

  it('2. dropping one player to just below the top band weak-link floor drops to a lower band', () => {
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80, 80, 80],
      MID: [80, 80, 80],
      ATT: [80, 80, 80],
    });
    const baseline = scoreBand(computeScoreInput(xi, POSITION_MAP, ZERO_CEILING), CONFIG);
    expect(baseline.bandId).toBe('TOP');

    // Drop one DEF player from 80 to 74 (TOP requires minWeakLink 75; MID requires 65).
    const weakened: FinalXI = xi.map((p, i) => (i === 1 ? { ...p, rating: 74 } : p));
    const input = computeScoreInput(weakened, POSITION_MAP, ZERO_CEILING);
    expect(input.weakLink).toBe(74);

    const result = scoreBand(input, CONFIG);
    expect(result).toEqual({ bandId: 'MID', label: 'COMFORTABLE WIN' });
  });

  // ---------- 3. XI missing GK entirely ----------

  it('3. XI missing GK entirely skips bands requiring all buckets non-empty, lands on a lower/fallback band', () => {
    const xi = buildXI({
      DEF: [80, 80, 80, 80],
      MID: [80, 80, 80],
      ATT: [80, 80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.bucketCounts.GK).toBe(0);

    const result = scoreBand(input, CONFIG);
    // TOP and MID both require all buckets non-empty -> both skipped.
    expect(['LOW', 'FALLBACK']).toContain(result.bandId);
    expect(result.bandId).not.toBe('TOP');
    expect(result.bandId).not.toBe('MID');
  });

  // ---------- 4. shape 2-5-4 fails requireMinCounts ----------

  it('4. an unbalanced shape that fails minCounts is blocked from requireMinCounts bands', () => {
    // GK 1 / DEF 2 / MID 5 / ATT 4: DEF count (2) is below minCounts.DEF (4).
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80],
      MID: [80, 80, 80, 80, 80],
      ATT: [80, 80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.bucketCounts).toEqual({ GK: 1, DEF: 2, MID: 5, ATT: 4 });

    const result = scoreBand(input, CONFIG);
    // TOP and MID both require minCounts -> both blocked despite otherwise-strong sums.
    expect(result.bandId).toBe('LOW');
  });

  // ---------- 5. two-band match: higher priority wins ----------

  it('5. an XI matching multiple bands resolves to the highest-priority match', () => {
    // The same XI from case 1 satisfies TOP, MID, and LOW's predicates simultaneously
    // (TOP's thresholds are a strict superset of MID's and LOW's here). TOP (priority
    // 100) must win over MID (70) and LOW (40).
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80, 80, 80],
      MID: [80, 80, 80],
      ATT: [80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);

    // Sanity: confirm the lower-priority bands' predicates also pass independently.
    expect(input.bucketSums.GK).toBeGreaterThanOrEqual(MID_BAND.minBucketSums!.GK!);
    expect(input.weakLink).toBeGreaterThanOrEqual(LOW_BAND.minWeakLink!);

    const result = scoreBand(input, CONFIG);
    expect(result.bandId).toBe('TOP');
  });

  // ---------- 6. garbage XI -> fallback ----------

  it('6. a garbage XI (all rating 1) lands on the fallback band', () => {
    const xi = buildXI({
      GK: [1],
      DEF: [1, 1, 1, 1],
      MID: [1, 1, 1],
      ATT: [1, 1, 1],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    const result = scoreBand(input, CONFIG);
    expect(result).toEqual({ bandId: 'FALLBACK', label: 'TOTAL COLLAPSE' });
  });

  // ---------- 7. computeScoreInput correctness ----------

  it('7. computeScoreInput produces exact sums/counts/weakLink for a known XI', () => {
    const xi = buildXI({
      GK: [90],
      DEF: [80, 81, 82, 83],
      MID: [70, 71, 72],
      ATT: [60, 61, 62],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);

    expect(input.bucketSums).toEqual({ GK: 90, DEF: 326, MID: 213, ATT: 183 });
    expect(input.bucketCounts).toEqual({ GK: 1, DEF: 4, MID: 3, ATT: 3 });
    expect(input.weakLink).toBe(60);
  });

  it('7b. bucket assignment uses positionMap, not the player.positionBucket field', () => {
    // Every player's positionBucket field is deliberately set to 'GK' (wrong for
    // everyone but the actual keeper). computeScoreInput must ignore it and use
    // positionMap[positionRaw] instead.
    const xi = buildXI(
      {
        GK: [90],
        DEF: [80, 81, 82, 83],
        MID: [70, 71, 72],
        ATT: [60, 61, 62],
      },
      { wrongPositionBucketField: true },
    );
    expect(xi.every((p) => p.positionBucket === 'GK')).toBe(true);

    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.bucketSums).toEqual({ GK: 90, DEF: 326, MID: 213, ATT: 183 });
    expect(input.bucketCounts).toEqual({ GK: 1, DEF: 4, MID: 3, ATT: 3 });
  });

  // ---------- ADR-020: fit/oppositionId params ----------

  it('computeScoreInput defaults fit=0, oppositionId="neutral" when omitted (pre-Wave-C call sites)', () => {
    const xi = buildXI({ GK: [90], DEF: [80], MID: [70], ATT: [60] });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.fit).toBe(0);
    expect(input.oppositionId).toBe('neutral');
  });

  it('computeScoreInput carries an explicitly passed fit/oppositionId through untouched', () => {
    const xi = buildXI({ GK: [90], DEF: [80], MID: [70], ATT: [60] });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING, 73, 'pressing-machine');
    expect(input.fit).toBe(73);
    expect(input.oppositionId).toBe('pressing-machine');
  });

  // ---------- 8. determinism ----------

  it('8. same input twice produces deep-equal output for both functions', () => {
    const xi = buildXI({
      GK: [88],
      DEF: [77, 78, 79, 80],
      MID: [81, 82, 83],
      ATT: [84, 85, 86],
    });

    const input1 = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    const input2 = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input1).toEqual(input2);

    const result1 = scoreBand(input1, CONFIG);
    const result2 = scoreBand(input2, CONFIG);
    expect(result1).toEqual(result2);
  });

  // ---------- 9. band order in config doesn't matter ----------

  it('9. bands given in ascending priority order still evaluate highest-priority-first', () => {
    const ascendingConfig = makeConfig([FALLBACK_BAND, LOW_BAND, MID_BAND, TOP_BAND]);
    const originalOrder = ascendingConfig.bands.map((b) => b.id);

    const xi = buildXI({
      GK: [80],
      DEF: [80, 80, 80, 80],
      MID: [80, 80, 80],
      ATT: [80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    const result = scoreBand(input, ascendingConfig);

    expect(result.bandId).toBe('TOP');
    // The caller's config.bands array must not be mutated (sorted in place).
    expect(ascendingConfig.bands.map((b) => b.id)).toEqual(originalOrder);
  });

  it('does not mutate or sort the caller-supplied config.bands array (descending config too)', () => {
    const originalOrder = CONFIG.bands.map((b) => b.id);
    const xi = buildXI({ GK: [1], DEF: [1, 1, 1, 1], MID: [1, 1, 1], ATT: [1, 1, 1] });
    scoreBand(computeScoreInput(xi, POSITION_MAP, ZERO_CEILING), CONFIG);
    expect(CONFIG.bands.map((b) => b.id)).toEqual(originalOrder);
  });
});

describe('withFormationMinCounts', () => {
  it('returns config unchanged when formationId is null/undefined', () => {
    const result = withFormationMinCounts(CONFIG, null);
    expect(result).toBe(CONFIG);
    expect(withFormationMinCounts(CONFIG, undefined)).toBe(CONFIG);
  });

  it('overrides minCounts when formationId matches a formation in config', () => {
    const configWithFormations = {
      ...CONFIG,
      formations: [
        ...CONFIG.formations,
        { id: '3-5-2', label: '3-5-2', description: 'test', minCounts: { GK: 1, DEF: 3, MID: 5, ATT: 2 } },
      ],
    };
    const result = withFormationMinCounts(configWithFormations, '3-5-2');
    expect(result.minCounts).toEqual({ GK: 1, DEF: 3, MID: 5, ATT: 2 });
    expect(result.referenceFormation).toBe('3-5-2');
    // Bands rebuilt with scaled minBucketSums (never same reference)
    expect(result.bands).not.toBe(configWithFormations.bands);
    expect(result.bands).toHaveLength(4);
    // TOP: DEF gate 320 * 3/4 = 240
    expect(result.bands[0].minBucketSums).toEqual({ GK: 80, DEF: 240, MID: 400, ATT: 160 });
    // MID: DEF gate 280 * 3/4 = 210
    expect(result.bands[1].minBucketSums).toEqual({ GK: 70, DEF: 210, MID: 350, ATT: 140 });
    // LOW band has no minBucketSums -> unchanged
    expect(result.bands[2].minBucketSums).toBeUndefined();
    // Fallback has no predicates
    expect(result.bands[3].fallback).toBe(true);
  });

  it('returns config unchanged when formationId not found', () => {
    const result = withFormationMinCounts(CONFIG, 'nonexistent');
    expect(result).toBe(CONFIG);
  });

  it('formation minCounts changes which band matches (3-5-2 unlocks band 4-3-3 blocks)', () => {
    // XI with 3 DEF, 5 MID, 2 ATT
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80, 80],
      MID: [80, 80, 80, 80, 80],
      ATT: [80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);

    // A band that only checks minCounts + allBucketsNonEmpty + high weakLink
    const SHAPE_BAND: BandDef = {
      id: 'SHAPE', priority: 100, label: 'GOOD SHAPE',
      requireAllBucketsNonEmpty: true, requireMinCounts: true, minWeakLink: 70,
    };
    const FB_BAND: BandDef = { id: 'FB', priority: 0, label: 'COLLAPSE', fallback: true };
    const baseConfig = makeConfig([SHAPE_BAND, FB_BAND]);

    // 4-3-3 config: DEF>=4 fails -> falls to FB
    const band433 = scoreBand(input, baseConfig);
    expect(band433.bandId).toBe('FB');

    // 3-5-2 config: DEF>=3/MID>=5/ATT>=2 all pass -> SHAPE band
    const config352 = withFormationMinCounts({
      ...baseConfig,
      formations: [
        { id: '4-3-3', label: '4-3-3', description: 'test', minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 } },
        { id: '3-5-2', label: '3-5-2', description: 'test', minCounts: { GK: 1, DEF: 3, MID: 5, ATT: 2 } },
      ],
    }, '3-5-2');
    const band352 = scoreBand(input, config352);
    expect(band352.bandId).toBe('SHAPE');
  });

  it('scales minBucketSums: 3-5-2 DEF gate 320 → 240 (reference 4 DEF → 3 DEF)', () => {
    const cfg = {
      ...CONFIG,
      formations: [
        ...CONFIG.formations,
        { id: '3-5-2', label: '3-5-2', description: 'test', minCounts: { GK: 1, DEF: 3, MID: 5, ATT: 2 } },
      ],
    };
    const r = withFormationMinCounts(cfg, '3-5-2');
    const top = r.bands.find((b) => b.id === 'TOP')!;
    expect(top.minBucketSums).toEqual({ GK: 80, DEF: 240, MID: 400, ATT: 160 });
  });

  it('4-3-3 view returns gates unchanged (identity scaling)', () => {
    const r = withFormationMinCounts(CONFIG, '4-3-3');
    const top = r.bands.find((b) => b.id === 'TOP')!;
    expect(top.minBucketSums).toEqual(TOP_BAND.minBucketSums);
    // Bands are new objects (never mutate caller)
    expect(r.bands).not.toBe(CONFIG.bands);
  });

  it('does not mutate the caller config', () => {
    const origBands = CONFIG.bands;
    const origTopMinBucketSums = CONFIG.bands[0].minBucketSums;
    withFormationMinCounts(CONFIG, '4-3-3');
    expect(CONFIG.bands).toBe(origBands);
    expect(CONFIG.bands[0].minBucketSums).toBe(origTopMinBucketSums);
  });

  it('reachability: every formation in thresholds.json can reach every non-fallback band', () => {
    const BUCKETS: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];
    const MAX_RATING = REAL_THRESHOLDS.ratingScale.max;

    for (const formation of REAL_THRESHOLDS.formations) {
      const view = withFormationMinCounts(REAL_THRESHOLDS, formation.id);
      for (const band of view.bands) {
        if (band.fallback) continue;
        if (!band.minBucketSums) continue;
        for (const bucket of BUCKETS) {
          const gate = band.minBucketSums[bucket];
          if (gate === undefined) continue;
          const maxPossible = MAX_RATING * formation.minCounts[bucket];
          expect(gate).toBeLessThanOrEqual(maxPossible);
        }
      }
    }
  });
});

describe('evaluateBandPredicates (ADR-013)', () => {
  it('emits one structured result per configured check, with exact required/actual', () => {
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80, 80, 74], // weakLink 74 < TOP's 75 -> exactly one failing predicate
      MID: [80, 80, 80],
      ATT: [80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    const results = evaluateBandPredicates(TOP_BAND, input, CONFIG);

    // TOP_BAND configures: allBucketsNonEmpty (4 buckets) + minCounts (4) +
    // minBucketSums (4 buckets configured) + minWeakLink (1) = 13 entries.
    expect(results).toHaveLength(13);
    for (const r of results) {
      expect(r.passed).toBe(r.actual >= r.required);
    }

    const failing = results.filter((r) => !r.passed);
    // DEF sum 80+80+80+74=314 < TOP minBucketSums.DEF 320; weakLink 74 < 75.
    expect(failing).toEqual([
      { name: 'minBucketSum', bucket: 'DEF', required: 320, actual: 314, passed: false },
      { name: 'minWeakLink', required: 75, actual: 74, passed: false },
    ]);
  });

  it('returns [] for the fallback band', () => {
    const xi = buildXI({ GK: [1], DEF: [1, 1, 1, 1], MID: [1, 1, 1], ATT: [1, 1, 1] });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(evaluateBandPredicates(FALLBACK_BAND, input, CONFIG)).toEqual([]);
  });

  it('bandMatches semantics: scoreBand still equals the conjunction of predicate results', () => {
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80],
      MID: [80, 80, 80, 80, 80],
      ATT: [80, 80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    const allPass = evaluateBandPredicates(TOP_BAND, input, CONFIG).every((r) => r.passed);
    expect(allPass).toBe(false);
    expect(scoreBand(input, CONFIG).bandId).not.toBe('TOP');
  });
});

describe('evaluateBandPredicates efficiency (ADR-019)', () => {
  const CEILING: CeilingResult = {
    bucketSums: { GK: 80, DEF: 320, MID: 240, ATT: 240 },
    total: 880,
  };

  it('minEfficiency: actual is round(100 * userTotal / ceilingTotal), integer % points', () => {
    const band: BandDef = { id: 'EFF', priority: 50, label: 'EFF', minEfficiency: 90 };
    // userTotal 792 / ceilingTotal 880 = 0.9 exactly -> 90.
    const xi = buildXI({ GK: [72], DEF: [72, 72, 72, 72], MID: [72, 72, 72], ATT: [72, 72, 72] });
    const input = computeScoreInput(xi, POSITION_MAP, CEILING);
    const results = evaluateBandPredicates(band, input, CONFIG);
    expect(results).toEqual([{ name: 'minEfficiency', required: 90, actual: 90, passed: true }]);
  });

  it('minEfficiency: one point below required fails', () => {
    const band: BandDef = { id: 'EFF', priority: 50, label: 'EFF', minEfficiency: 91 };
    const xi = buildXI({ GK: [72], DEF: [72, 72, 72, 72], MID: [72, 72, 72], ATT: [72, 72, 72] });
    const input = computeScoreInput(xi, POSITION_MAP, CEILING);
    const [result] = evaluateBandPredicates(band, input, CONFIG);
    expect(result).toEqual({ name: 'minEfficiency', required: 91, actual: 90, passed: false });
  });

  it('minEfficiency: perfect XI (userTotal === ceilingTotal) gives 100', () => {
    const band: BandDef = { id: 'EFF', priority: 50, label: 'EFF', minEfficiency: 100 };
    const xi = buildXI({ GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80] });
    const input = computeScoreInput(xi, POSITION_MAP, CEILING); // sums == CEILING.bucketSums, total 880
    const [result] = evaluateBandPredicates(band, input, CONFIG);
    expect(result).toEqual({ name: 'minEfficiency', required: 100, actual: 100, passed: true });
  });

  it('minEfficiency: ceilingTotal 0 -> actual 100 (never penalize a degenerate ceiling)', () => {
    const band: BandDef = { id: 'EFF', priority: 50, label: 'EFF', minEfficiency: 100 };
    const xi = buildXI({ GK: [1], DEF: [1, 1, 1, 1], MID: [1, 1, 1], ATT: [1, 1, 1] });
    const zeroCeiling: CeilingResult = { bucketSums: { GK: 0, DEF: 0, MID: 0, ATT: 0 }, total: 0 };
    const input = computeScoreInput(xi, POSITION_MAP, zeroCeiling);
    const [result] = evaluateBandPredicates(band, input, CONFIG);
    expect(result).toEqual({ name: 'minEfficiency', required: 100, actual: 100, passed: true });
  });

  it('minBucketEfficiency: one entry per configured bucket, same integer-% convention', () => {
    const band: BandDef = {
      id: 'BEFF', priority: 50, label: 'BEFF',
      minBucketEfficiency: { DEF: 90, ATT: 95 },
    };
    // DEF 288/320 = 90%; ATT 240/240 = 100%.
    const xi = buildXI({ GK: [80], DEF: [72, 72, 72, 72], MID: [80, 80, 80], ATT: [80, 80, 80] });
    const input = computeScoreInput(xi, POSITION_MAP, CEILING);
    const results = evaluateBandPredicates(band, input, CONFIG);
    expect(results).toEqual([
      { name: 'minBucketEfficiency', bucket: 'DEF', required: 90, actual: 90, passed: true },
      { name: 'minBucketEfficiency', bucket: 'ATT', required: 95, actual: 100, passed: true },
    ]);
  });

  it('minBucketEfficiency: a bucket-zero ceiling gives that bucket actual 100', () => {
    const band: BandDef = { id: 'BEFF0', priority: 50, label: 'BEFF0', minBucketEfficiency: { GK: 100 } };
    const xi = buildXI({ GK: [1], DEF: [1, 1, 1, 1], MID: [1, 1, 1], ATT: [1, 1, 1] });
    const ceilingNoGk: CeilingResult = { bucketSums: { GK: 0, DEF: 320, MID: 240, ATT: 240 }, total: 800 };
    const input = computeScoreInput(xi, POSITION_MAP, ceilingNoGk);
    const results = evaluateBandPredicates(band, input, CONFIG);
    expect(results).toEqual([{ name: 'minBucketEfficiency', bucket: 'GK', required: 100, actual: 100, passed: true }]);
  });
});

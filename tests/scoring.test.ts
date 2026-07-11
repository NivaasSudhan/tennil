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
import type { BandDef, FinalXI, Player, PositionBucket, PositionMap, ThresholdConfig } from '../src/domain/types';

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
  };
}

const CONFIG = makeConfig([TOP_BAND, MID_BAND, LOW_BAND, FALLBACK_BAND]);

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
    const input = computeScoreInput(xi, POSITION_MAP);
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
    const baseline = scoreBand(computeScoreInput(xi, POSITION_MAP), CONFIG);
    expect(baseline.bandId).toBe('TOP');

    // Drop one DEF player from 80 to 74 (TOP requires minWeakLink 75; MID requires 65).
    const weakened: FinalXI = xi.map((p, i) => (i === 1 ? { ...p, rating: 74 } : p));
    const input = computeScoreInput(weakened, POSITION_MAP);
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
    const input = computeScoreInput(xi, POSITION_MAP);
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
    const input = computeScoreInput(xi, POSITION_MAP);
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
    const input = computeScoreInput(xi, POSITION_MAP);

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
    const input = computeScoreInput(xi, POSITION_MAP);
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
    const input = computeScoreInput(xi, POSITION_MAP);

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

    const input = computeScoreInput(xi, POSITION_MAP);
    expect(input.bucketSums).toEqual({ GK: 90, DEF: 326, MID: 213, ATT: 183 });
    expect(input.bucketCounts).toEqual({ GK: 1, DEF: 4, MID: 3, ATT: 3 });
  });

  // ---------- 8. determinism ----------

  it('8. same input twice produces deep-equal output for both functions', () => {
    const xi = buildXI({
      GK: [88],
      DEF: [77, 78, 79, 80],
      MID: [81, 82, 83],
      ATT: [84, 85, 86],
    });

    const input1 = computeScoreInput(xi, POSITION_MAP);
    const input2 = computeScoreInput(xi, POSITION_MAP);
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
    const input = computeScoreInput(xi, POSITION_MAP);
    const result = scoreBand(input, ascendingConfig);

    expect(result.bandId).toBe('TOP');
    // The caller's config.bands array must not be mutated (sorted in place).
    expect(ascendingConfig.bands.map((b) => b.id)).toEqual(originalOrder);
  });

  it('does not mutate or sort the caller-supplied config.bands array (descending config too)', () => {
    const originalOrder = CONFIG.bands.map((b) => b.id);
    const xi = buildXI({ GK: [1], DEF: [1, 1, 1, 1], MID: [1, 1, 1], ATT: [1, 1, 1] });
    scoreBand(computeScoreInput(xi, POSITION_MAP), CONFIG);
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
    expect(result.bands).toBe(CONFIG.bands);
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
    const input = computeScoreInput(xi, POSITION_MAP);

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
});

describe('evaluateBandPredicates (ADR-013)', () => {
  it('emits one structured result per configured check, with exact required/actual', () => {
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80, 80, 74], // weakLink 74 < TOP's 75 -> exactly one failing predicate
      MID: [80, 80, 80],
      ATT: [80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP);
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
    const input = computeScoreInput(xi, POSITION_MAP);
    expect(evaluateBandPredicates(FALLBACK_BAND, input, CONFIG)).toEqual([]);
  });

  it('bandMatches semantics: scoreBand still equals the conjunction of predicate results', () => {
    const xi = buildXI({
      GK: [80],
      DEF: [80, 80],
      MID: [80, 80, 80, 80, 80],
      ATT: [80, 80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP);
    const allPass = evaluateBandPredicates(TOP_BAND, input, CONFIG).every((r) => r.passed);
    expect(allPass).toBe(false);
    expect(scoreBand(input, CONFIG).bandId).not.toBe('TOP');
  });
});

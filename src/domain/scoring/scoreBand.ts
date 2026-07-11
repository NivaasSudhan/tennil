/**
 * Scoring calculator (ADR-004; ARCHITECTURE.md §3/§7).
 *
 * PURE. No RNG, no react, no src/app imports. Same input ⇒ same output, forever.
 * The engine reads `BandDef` fields generically — no band id is ever hardcoded here.
 */

import type {
  BandDef,
  CeilingResult,
  FinalXI,
  PositionBucket,
  PositionMap,
  PredicateResult,
  ScoreBand,
  ScoreInput,
  ThresholdConfig,
} from '../types';

const BUCKETS: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

/**
 * computeScoreInput (ADR-004; ceiling param added ADR-019).
 * Bucket for each player = `positionMap[player.positionRaw]` — the map is the
 * source of truth, never the player's own (denormalized) `positionBucket` field.
 * `ceiling` is the session-relative denominator (computeSessionCeiling) that
 * powers the minEfficiency/minBucketEfficiency predicates below.
 */
export function computeScoreInput(
  xi: FinalXI,
  positionMap: PositionMap,
  ceiling: CeilingResult,
): ScoreInput {
  const bucketSums: Record<PositionBucket, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const bucketCounts: Record<PositionBucket, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };

  let weakLink = Number.POSITIVE_INFINITY;

  for (const player of xi) {
    const bucket = positionMap[player.positionRaw];
    bucketSums[bucket] += player.rating;
    bucketCounts[bucket] += 1;
    if (player.rating < weakLink) weakLink = player.rating;
  }

  if (xi.length === 0) weakLink = 0;

  return { bucketSums, bucketCounts, weakLink, ceiling };
}

/** Integer percentage points, ADR-019 convention: 0 ceiling => 100 (perfect). */
function efficiencyPct(userValue: number, ceilingValue: number): number {
  if (ceilingValue === 0) return 100;
  return Math.round((100 * userValue) / ceilingValue);
}

/**
 * evaluateBandPredicates (ADR-013). The ONE place band predicates are
 * evaluated — consumed by scoreBand (conjunction), explainScoreBand
 * (structured margins), and the simulator's near-miss diagnostics.
 * Fixed emission order (nonEmpty -> minCounts -> minBucketSums -> minWeakLink
 * -> minEfficiency -> minBucketEfficiency, buckets in GK/DEF/MID/ATT order)
 * so output is deterministic.
 * A fallback band configures no predicates: returns [].
 */
export function evaluateBandPredicates(
  band: BandDef,
  input: ScoreInput,
  config: ThresholdConfig,
): PredicateResult[] {
  if (band.fallback) return [];

  const results: PredicateResult[] = [];

  if (band.requireAllBucketsNonEmpty) {
    for (const bucket of BUCKETS) {
      results.push({
        name: 'allBucketsNonEmpty',
        bucket,
        required: 1,
        actual: input.bucketCounts[bucket],
        passed: input.bucketCounts[bucket] >= 1,
      });
    }
  }

  if (band.requireMinCounts) {
    for (const bucket of BUCKETS) {
      results.push({
        name: 'minCounts',
        bucket,
        required: config.minCounts[bucket],
        actual: input.bucketCounts[bucket],
        passed: input.bucketCounts[bucket] >= config.minCounts[bucket],
      });
    }
  }

  if (band.minBucketSums) {
    for (const bucket of BUCKETS) {
      const min = band.minBucketSums[bucket];
      if (min !== undefined) {
        results.push({
          name: 'minBucketSum',
          bucket,
          required: min,
          actual: input.bucketSums[bucket],
          passed: input.bucketSums[bucket] >= min,
        });
      }
    }
  }

  if (band.minWeakLink !== undefined) {
    results.push({
      name: 'minWeakLink',
      required: band.minWeakLink,
      actual: input.weakLink,
      passed: input.weakLink >= band.minWeakLink,
    });
  }

  if (band.minEfficiency !== undefined) {
    const userTotal = BUCKETS.reduce((sum, b) => sum + input.bucketSums[b], 0);
    const actual = efficiencyPct(userTotal, input.ceiling.total);
    results.push({
      name: 'minEfficiency',
      required: band.minEfficiency,
      actual,
      passed: actual >= band.minEfficiency,
    });
  }

  if (band.minBucketEfficiency) {
    for (const bucket of BUCKETS) {
      const required = band.minBucketEfficiency[bucket];
      if (required !== undefined) {
        const actual = efficiencyPct(input.bucketSums[bucket], input.ceiling.bucketSums[bucket]);
        results.push({
          name: 'minBucketEfficiency',
          bucket,
          required,
          actual,
          passed: actual >= required,
        });
      }
    }
  }

  return results;
}

function bandMatches(band: BandDef, input: ScoreInput, config: ThresholdConfig): boolean {
  if (band.fallback) return true;
  return evaluateBandPredicates(band, input, config).every((p) => p.passed);
}

/**
 * scoreBand (ADR-004).
 * Sort bands by priority DESCENDING (on a copy — never mutate the caller's config)
 * and return the first band whose predicates ALL pass. A `fallback: true` band
 * matches unconditionally.
 */
export function scoreBand(input: ScoreInput, config: ThresholdConfig): ScoreBand {
  const sorted = [...config.bands].sort((a, b) => b.priority - a.priority);

  for (const band of sorted) {
    if (bandMatches(band, input, config)) {
      return { bandId: band.id, label: band.label };
    }
  }

  throw new Error(
    'scoreBand: no band matched, including no fallback band — invalid ThresholdConfig (should have been rejected at load time)',
  );
}

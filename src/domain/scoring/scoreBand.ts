/**
 * Scoring calculator (ADR-004; ARCHITECTURE.md §3/§7).
 *
 * PURE. No RNG, no react, no src/app imports. Same input ⇒ same output, forever.
 * The engine reads `BandDef` fields generically — no band id is ever hardcoded here.
 */

import type {
  BandDef,
  FinalXI,
  PositionBucket,
  PositionMap,
  ScoreBand,
  ScoreInput,
  ThresholdConfig,
} from '../types';

const BUCKETS: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

/**
 * computeScoreInput (ADR-004).
 * Bucket for each player = `positionMap[player.positionRaw]` — the map is the
 * source of truth, never the player's own (denormalized) `positionBucket` field.
 */
export function computeScoreInput(xi: FinalXI, positionMap: PositionMap): ScoreInput {
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

  return { bucketSums, bucketCounts, weakLink };
}

function bandMatches(band: BandDef, input: ScoreInput, config: ThresholdConfig): boolean {
  if (band.fallback) return true;

  if (band.requireAllBucketsNonEmpty) {
    for (const bucket of BUCKETS) {
      if (input.bucketCounts[bucket] < 1) return false;
    }
  }

  if (band.requireMinCounts) {
    for (const bucket of BUCKETS) {
      if (input.bucketCounts[bucket] < config.minCounts[bucket]) return false;
    }
  }

  if (band.minBucketSums) {
    for (const bucket of BUCKETS) {
      const min = band.minBucketSums[bucket];
      if (min !== undefined && input.bucketSums[bucket] < min) return false;
    }
  }

  if (band.minWeakLink !== undefined && input.weakLink < band.minWeakLink) {
    return false;
  }

  return true;
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

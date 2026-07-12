/**
 * formationFit.ts — post-match FORMATION FIT-INSIGHT (2026-07-12 user decision).
 *
 * PURE. No RNG, no react. Every formation's minCounts sums to 11 (1 GK +
 * formation.minCounts, validated at load), so a FinalXI's bucket counts can
 * match AT MOST one formation exactly. When that matched shape differs from
 * the session's DECLARED formation, the UI shows one honest line: "your shape
 * was actually a 3-5-2 — here's the band THAT XI would have earned under it."
 *
 * CRITICAL INVARIANT: this module NEVER feeds the awarded band. ResultScreen
 * always scores against `session.formationId` (the declared formation); the
 * fitted-formation band computed here is display-only "what if" trivia.
 */
import type {
  CeilingResult,
  FinalXI,
  Formation,
  Player,
  PositionBucket,
  PositionMap,
  ScoreBand,
  Squad,
  ThresholdConfig,
} from '../types';
import { withFormationMinCounts } from './withFormation';
import { computeSessionCeiling } from './sessionCeiling';
import { computeScoreInput, scoreBand } from './scoreBand';

const BUCKETS: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

/**
 * detectFormationFit — the id of the formation whose minCounts equal
 * `bucketCounts` exactly (every bucket matches), or null if the XI's shape
 * doesn't correspond to any cataloged formation.
 */
export function detectFormationFit(
  bucketCounts: Record<PositionBucket, number>,
  formations: readonly Formation[],
): string | null {
  for (const f of formations) {
    const isExactMatch = BUCKETS.every((b) => bucketCounts[b] === f.minCounts[b]);
    if (isExactMatch) return f.id;
  }
  return null;
}

/**
 * scoreUnderFormation — the band this SAME XI would earn if the fitted
 * formation had been the declared one. Recomputes BOTH halves honestly:
 * the config view (`withFormationMinCounts`, for the bands' bucket-sum
 * scaling) and the ceiling (`computeSessionCeiling` under the fitted
 * formation's bucket counts, since the ceiling's ability to fill each
 * bucket depends on the target counts) — reusing the exact same pure
 * functions the real scoring path uses, no new scoring logic.
 */
export function scoreUnderFormation(
  xi: FinalXI,
  revealLog: string[],
  squadsById: Record<string, Squad>,
  positionMap: PositionMap,
  personKeyFn: (player: Player) => string,
  baseConfig: ThresholdConfig,
  fittedFormationId: string,
): ScoreBand {
  const fittedConfig = withFormationMinCounts(baseConfig, fittedFormationId);
  const ceiling: CeilingResult = computeSessionCeiling(
    revealLog,
    squadsById,
    fittedConfig.minCounts,
    positionMap,
    personKeyFn,
  );
  const scoreInput = computeScoreInput(xi, positionMap, ceiling);
  return scoreBand(scoreInput, fittedConfig);
}

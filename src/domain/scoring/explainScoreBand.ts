/**
 * explainScoreBand (ADR-013; Sprint-1 Task 5).
 *
 * PURE. No RNG, no react, no src/app imports, no hardcoded band ids.
 * Built entirely on evaluateBandPredicates — the same evaluator scoreBand
 * uses — so it can NEVER disagree with scoreBand truth (guaranteed by test).
 * Consumers: ResultBreakdown UI (Phase 2), simulator near-miss diagnostics.
 * Margins come free: every PredicateResult carries required and actual, so
 * "you were 3 points from a 5-0" is (required - actual) on the nextBetter
 * failing predicates — no extra logic anywhere downstream.
 */

import type {
  BandEvaluation,
  ScoreExplanation,
  ScoreInput,
  ThresholdConfig,
} from '../types';
import { evaluateBandPredicates } from './scoreBand';

export function explainScoreBand(input: ScoreInput, config: ThresholdConfig): ScoreExplanation {
  const sorted = [...config.bands].sort((a, b) => b.priority - a.priority);

  const evaluations: BandEvaluation[] = sorted.map((band) => {
    const predicates = evaluateBandPredicates(band, input, config);
    return {
      bandId: band.id,
      label: band.label,
      priority: band.priority,
      fallback: band.fallback === true,
      matched: band.fallback === true || predicates.every((p) => p.passed),
      predicates,
    };
  });

  const awardedIndex = evaluations.findIndex((e) => e.matched);
  if (awardedIndex === -1) {
    throw new Error(
      'explainScoreBand: no band matched, including no fallback band — invalid ThresholdConfig (should have been rejected at load time)',
    );
  }
  const awarded = evaluations[awardedIndex];

  const nextBetterEval = awardedIndex > 0 ? evaluations[awardedIndex - 1] : null;
  const nextBetter = nextBetterEval
    ? {
        bandId: nextBetterEval.bandId,
        label: nextBetterEval.label,
        failing: nextBetterEval.predicates.filter((p) => !p.passed),
      }
    : null;

  return { bandId: awarded.bandId, label: awarded.label, evaluations, nextBetter };
}

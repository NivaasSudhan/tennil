/**
 * nearMiss.ts — render the "2 POINTS FROM A 5-0" margin line from a
 * ScoreExplanation nextBetter block (ADR-013). Pure.
 *
 * explainScoreBand already carries the required/actual pairs on every failing
 * predicate of the next-better band; "margins come free" (per explainScoreBand
 * module doc). We pick the single most legible deficit for the broadcast line:
 *  - prefer a bucket-sum deficit ("N POINTS FROM A {band}") — the headline margin
 *  - else a weak-link deficit ("WEAK LINK {actual} · NEED {required} FOR {band}")
 *  - if nextBetter is null (awarded the top band), there is no near-miss line.
 */
import type { PredicateResult, ScoreExplanation } from '../domain/types';

export interface NearMissLine {
  /** null when the awarded band is the top band (no near-miss to show). */
  text: string | null;
}

const BUCKET_LABEL: Record<string, string> = {
  GK: 'GK',
  DEF: 'DEF',
  MID: 'MID',
  ATT: 'ATT',
};

export function formatNearMiss(explanation: ScoreExplanation): NearMissLine {
  const next = explanation.nextBetter;
  if (!next || next.failing.length === 0) return { text: null };

  // Prefer the largest bucket-sum gap — "x POINTS FROM A 5-0" reads cleanest.
  const sumFails = next.failing.filter((p) => p.name === 'minBucketSum');
  if (sumFails.length > 0) {
    const biggest = sumFails.reduce((acc, p) => (p.required - p.actual > acc.required - acc.actual ? p : acc));
    const gap = biggest.required - biggest.actual;
    const bucket = biggest.bucket ? BUCKET_LABEL[biggest.bucket] ?? biggest.bucket : '';
    return {
      text: `${gap} ${gap === 1 ? 'POINT' : 'POINTS'} FROM A ${next.bandId}${bucket ? ` (${bucket})` : ''}`,
    };
  }

  const minCountFail = next.failing.find((p) => p.name === 'minCounts');
  if (minCountFail && minCountFail.bucket) {
    const gap = minCountFail.required - minCountFail.actual;
    return {
      text: `${gap} MORE ${minCountFail.bucket} FOR A ${next.bandId}`,
    };
  }

  const wl = next.failing.find((p) => p.name === 'minWeakLink');
  if (wl) {
    const gap = wl.required - wl.actual;
    return {
      text: `WEAK LINK ${wl.actual} · NEED ${wl.required} (${gap} ${gap === 1 ? 'POINT' : 'POINTS'}) FOR A ${next.bandId}`,
    };
  }

  const any: PredicateResult = next.failing[0];
  return { text: `MARGIN TO ${next.bandId}: ${any.required - any.actual}` };
}
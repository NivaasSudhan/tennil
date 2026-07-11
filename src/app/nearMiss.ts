/**
 * nearMiss.ts — render the BandSlam margin line from a ScoreExplanation
 * nextBetter block (ADR-013; ADR-019 efficiency predicates). Pure.
 *
 * Under relative scoring (ADR-019) the failing predicates are efficiency
 * shortfalls (integer percentage points — required/actual from
 * efficiencyPct), the absolute weak-link floor, and the shape gates
 * (allBucketsNonEmpty / minCounts). Margins come free on every PredicateResult
 * (explainScoreBand: "required and actual" on each failing predicate). We
 * render the two most binding shortfalls (smallest gap first) joined by " · "
 * in BandSlam-typewriter style — uppercase, terse, one line, roughly ≤60 chars
 * so the per-character typewriter does not run too long.
 *
 *   minEfficiency        -> "N EFFICIENCY PTS FROM A 7-1"
 *   minBucketEfficiency  -> "LEFT N PTS IN MID — 7-1 WANTED MORE"
 *   minWeakLink          -> "WEAK LINK 74 — 10-0 DEMANDS 86"
 *   shape (counts/empty) -> "SHAPE BROKE THE CEILING — …"
 *
 * If nextBetter is null (awarded the top band), there is no near-miss line.
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

function pt(n: number): string {
  return n === 1 ? 'PT' : 'PTS';
}

interface Candidate {
  gap: number;
  text: string;
}

function shapeLine(p: PredicateResult, bandId: string): string {
  const bucket = p.bucket ? (BUCKET_LABEL[p.bucket] ?? p.bucket) : 'SHAPE';
  if (p.name === 'allBucketsNonEmpty') {
    return `SHAPE BROKE THE CEILING — EMPTY ${bucket} FOR ${bandId}`;
  }
  const gap = p.required - p.actual;
  return `SHAPE BROKE THE CEILING — ${gap} ${pt(gap)} MORE ${bucket} FOR ${bandId}`;
}

function efficiencyLine(p: PredicateResult, bandId: string): string {
  const gap = p.required - p.actual;
  return `${gap} EFFICIENCY ${pt(gap)} FROM A ${bandId}`;
}

function bucketEffLine(p: PredicateResult, bandId: string): string {
  const gap = p.required - p.actual;
  const bucket = p.bucket ? (BUCKET_LABEL[p.bucket] ?? p.bucket) : '';
  return `LEFT ${gap} ${pt(gap)}${bucket ? ` IN ${bucket}` : ''} — ${bandId} WANTED MORE`;
}

function weakLinkLine(p: PredicateResult, bandId: string): string {
  return `WEAK LINK ${p.actual} — ${bandId} DEMANDS ${p.required}`;
}

export function formatNearMiss(explanation: ScoreExplanation): NearMissLine {
  const next = explanation.nextBetter;
  if (!next || next.failing.length === 0) return { text: null };

  const bandId = next.bandId;
  const shape = next.failing.filter(
    (p) => p.name === 'minCounts' || p.name === 'allBucketsNonEmpty',
  );
  const rest = next.failing.filter(
    (p) => p.name !== 'minCounts' && p.name !== 'allBucketsNonEmpty',
  );

  const candidates: Candidate[] = [];

  if (shape.length > 0) {
    // One structural verdict for the whole shape group; emit the most-binding
    // shape failure (smallest gap, empty-bucket first on ties).
    const ordered = [...shape].sort((a, b) => {
      const ga = a.required - a.actual;
      const gb = b.required - b.actual;
      if (ga !== gb) return ga - gb;
      return a.name === 'allBucketsNonEmpty' ? -1 : 1;
    });
    const top = ordered[0];
    candidates.push({ gap: top.required - top.actual, text: shapeLine(top, bandId) });
  }

  for (const p of rest) {
    if (p.name === 'minEfficiency') {
      candidates.push({ gap: p.required - p.actual, text: efficiencyLine(p, bandId) });
    } else if (p.name === 'minBucketEfficiency') {
      candidates.push({ gap: p.required - p.actual, text: bucketEffLine(p, bandId) });
    } else if (p.name === 'minWeakLink') {
      candidates.push({ gap: p.required - p.actual, text: weakLinkLine(p, bandId) });
    } else {
      const gap = p.required - p.actual;
      candidates.push({ gap, text: `${gap} ${pt(gap)} TO ${bandId}` });
    }
  }

  // Two most binding = smallest shortfall first; one line when only one.
  candidates.sort((a, b) => a.gap - b.gap);
  const top = candidates.slice(0, Math.min(2, candidates.length));
  return { text: top.map((c) => c.text).join(' · ') };
}
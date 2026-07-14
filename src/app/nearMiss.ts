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
 * Structural failures (minCounts / allBucketsNonEmpty) REPLACE the whole
 * near-miss line — the mock IS the message.
 *
 * If nextBetter is null (awarded the top band), there is no near-miss line.
 */
import type { PositionBucket, PredicateResult, ScoreExplanation } from '../domain/types';
import type { AttrName, OppositionDef } from '../domain/scoring/profileFit';

export interface NearMissLine {
  /** null when the awarded band is the top band (no near-miss to show). */
  text: string | null;
}

interface Candidate {
  gap: number;
  text: string;
}

function efficiencyLine(p: PredicateResult, bandId: string): string {
  const gap = p.required - p.actual;
  return `${gap} SHY OF A ${bandId} SQUAD`;
}

function bucketEffLine(p: PredicateResult, bandId: string): string {
  const bucket = p.bucket ?? '';
  const lines: Record<string, string> = {
    MID: `MIDFIELD LEFT GOALS OUT THERE — ${bandId} NEEDED MORE`,
    DEF: `BACK LINE A YARD SHORT OF A ${bandId}`,
    ATT: `ATTACK TOO BLUNT FOR A ${bandId}`,
    GK: `KEEPER SHORT OF A ${bandId} DAY`,
  };
  return lines[bucket] ?? '';
}

function weakLinkLine(p: PredicateResult, bandId: string): string {
  return `PASSENGER AT ${p.actual} — A ${bandId} XI CARRIES NO ONE`;
}

/** ADR-020 Wave C card (plan.md line 48, dictated copy, verbatim):
 * dominant weightMod on today's opposition selects the template — strength
 * -> steel-press line, accuracy -> opponent-named craft line, pace -> legs
 * line; no dominant mod (neutral, or opposition omitted) -> shape-fit line. */
const ATTR_PRIORITY: AttrName[] = ['pace', 'strength', 'accuracy'];

function dominantWeightMod(opposition: OppositionDef | undefined): AttrName | null {
  if (!opposition) return null;
  let best: AttrName | null = null;
  let bestVal = -Infinity;
  for (const attr of ATTR_PRIORITY) {
    const v = opposition.weightMods[attr];
    if (v !== undefined && v > bestVal) {
      bestVal = v;
      best = attr;
    }
  }
  return best;
}

/** Strips a leading "THE " from an opposition label so templates that supply
 * their own "THE" prefix don't double it up (e.g. label "THE LOW BLOCK" ->
 * "LOW BLOCK" -> "THE LOW BLOCK HELD", matching design spec §3's example). */
function oppositionName(opposition: OppositionDef): string {
  return opposition.label.startsWith('THE ') ? opposition.label.slice(4) : opposition.label;
}

function minFitLine(bandId: string, opposition: OppositionDef | undefined): string {
  switch (dominantWeightMod(opposition)) {
    case 'strength':
      return `TOO SOFT FOR THE PRESS — ${bandId} WANTED STEEL`;
    case 'accuracy':
      return `ALL LEGS, NO CRAFT — THE ${oppositionName(opposition!)} HELD`;
    case 'pace':
      return `CAUGHT FLAT — ${bandId} NEEDED LEGS`;
    default:
      return `SHAPE FIT SHORT OF A ${bandId}`;
  }
}

const STRUCTURAL_MESSAGES: Record<PositionBucket, string> = {
  GK: 'NO KEEPER. BOLD. WRONG.',
  DEF: 'ELEVEN ARTISTS, NOBODY ON THE DOOR.',
  ATT: 'ALL DEFENCE, NO IDEAS.',
  MID: 'MIDFIELD MISSING IN ACTION.',
};

const BUCKET_PRIORITY: PositionBucket[] = ['GK', 'DEF', 'ATT', 'MID'];

export function formatNearMiss(
  explanation: ScoreExplanation,
  opposition?: OppositionDef,
): NearMissLine {
  const next = explanation.nextBetter;
  if (!next || next.failing.length === 0) return { text: null };

  const shape = next.failing.filter(
    (p) => p.name === 'minCounts' || p.name === 'allBucketsNonEmpty',
  );
  if (shape.length > 0) {
    for (const bucket of BUCKET_PRIORITY) {
      if (shape.some((p) => p.bucket === bucket)) {
        return { text: STRUCTURAL_MESSAGES[bucket] };
      }
    }
  }

  const bandId = next.bandId;
  const candidates: Candidate[] = [];

  for (const p of next.failing) {
    if (p.name === 'minEfficiency') {
      candidates.push({ gap: p.required - p.actual, text: efficiencyLine(p, bandId) });
    } else if (p.name === 'minBucketEfficiency') {
      candidates.push({ gap: p.required - p.actual, text: bucketEffLine(p, bandId) });
    } else if (p.name === 'minWeakLink') {
      candidates.push({ gap: p.required - p.actual, text: weakLinkLine(p, bandId) });
    } else if (p.name === 'minFit') {
      candidates.push({ gap: p.required - p.actual, text: minFitLine(bandId, opposition) });
    } else {
      const gap = p.required - p.actual;
      candidates.push({ gap, text: `${gap} TO ${bandId}` });
    }
  }

  candidates.sort((a, b) => a.gap - b.gap);
  const top = candidates.slice(0, Math.min(2, candidates.length));
  return { text: top.map((c) => c.text).join(' · ') };
}

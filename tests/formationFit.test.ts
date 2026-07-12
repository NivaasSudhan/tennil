/**
 * tests/formationFit.test.ts — post-match FORMATION FIT-INSIGHT (2026-07-12).
 *
 * Covers:
 * (a) detectFormationFit: exact-match lookup, "matches nothing" -> null, and a
 *     real-corpus property check that every cataloged formation's own
 *     minCounts maps back to ITSELF and only itself (the "sums to 11 => at
 *     most one match" argument the feature relies on).
 * (b) scoreUnderFormation: honestly recomputes BOTH the config view
 *     (withFormationMinCounts) and the ceiling (computeSessionCeiling under
 *     the fitted formation's own bucket caps) — demonstrated with a scenario
 *     where the fitted band ends up LOWER than the declared-formation award
 *     (efficiency is a genuine recompute, not a reuse of the declared ceiling).
 * (c) CRITICAL INVARIANT: computing the fit-insight never changes the
 *     declared-formation awarded band.
 * (d) determinism.
 * (e) the ResultScreen decision rule ("fitted === declared -> no insight")
 *     replicated here as a pure check on detectFormationFit's output, since
 *     ResultScreen.tsx itself is out of scope for a new test file.
 */
import { describe, expect, it } from 'vitest';
import { detectFormationFit, scoreUnderFormation } from '../src/domain/scoring/formationFit';
import { computeScoreInput, scoreBand } from '../src/domain/scoring/scoreBand';
import { computeSessionCeiling } from '../src/domain/scoring/sessionCeiling';
import { withFormationMinCounts } from '../src/domain/scoring/withFormation';
import type {
  BandDef,
  FinalXI,
  Formation,
  Player,
  PositionBucket,
  Squad,
  ThresholdConfig,
} from '../src/domain/types';
import realThresholdsRaw from '../src/data/config/thresholds.json';

const REAL_THRESHOLDS = realThresholdsRaw as ThresholdConfig;

const POSITION_MAP: Record<string, PositionBucket> = { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' };
const RAW_FOR_BUCKET: Record<PositionBucket, string> = { GK: 'GK', DEF: 'CB', MID: 'CM', ATT: 'ST' };

function player(id: string, bucket: PositionBucket, rating: number): Player {
  return { id, name: id, positionRaw: RAW_FOR_BUCKET[bucket], positionBucket: bucket, rating };
}

function squad(id: string, players: Player[]): Squad {
  return { id, country: 'zzz', year: 2000, players };
}

/** Trivial person-key: every synthetic player id is unique, so no cross-round conflicts. */
const personKeyFn = (p: Player) => p.id;

// ---------------------------------------------------------------------------
// (a) detectFormationFit
// ---------------------------------------------------------------------------

const FORMATIONS: Formation[] = [
  { id: '4-3-3', label: '4-3-3', description: 't', minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 } },
  { id: '5-3-2', label: '5-3-2', description: 't', minCounts: { GK: 1, DEF: 5, MID: 3, ATT: 2 } },
];

describe('detectFormationFit', () => {
  it('returns the formation id whose minCounts equal the given bucket counts exactly', () => {
    expect(detectFormationFit({ GK: 1, DEF: 4, MID: 3, ATT: 3 }, FORMATIONS)).toBe('4-3-3');
    expect(detectFormationFit({ GK: 1, DEF: 5, MID: 3, ATT: 2 }, FORMATIONS)).toBe('5-3-2');
  });

  it('returns null when the shape matches no cataloged formation', () => {
    expect(detectFormationFit({ GK: 2, DEF: 4, MID: 2, ATT: 3 }, FORMATIONS)).toBeNull();
    expect(detectFormationFit({ GK: 1, DEF: 4, MID: 4, ATT: 2 }, FORMATIONS)).toBeNull(); // 4-4-2, not cataloged here
  });

  it('real corpus: every cataloged formation maps back to ITSELF and only itself (sum-to-11 uniqueness)', () => {
    for (const f of REAL_THRESHOLDS.formations) {
      expect(detectFormationFit(f.minCounts, REAL_THRESHOLDS.formations)).toBe(f.id);
    }
  });

  it('ResultScreen decision rule: fitted === declared -> no insight (replicated pure check)', () => {
    const counts = { GK: 1, DEF: 4, MID: 3, ATT: 3 };
    const fitted = detectFormationFit(counts, FORMATIONS);
    const declaredFormationId = '4-3-3';
    const fitInsight = fitted && fitted !== declaredFormationId ? { formationId: fitted } : null;
    expect(fitted).toBe('4-3-3');
    expect(fitInsight).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (b)/(c)/(d) scoreUnderFormation — honest recompute + invariant + determinism
// ---------------------------------------------------------------------------

// Bands intentionally use ONLY minEfficiency (no requireMinCounts) so the
// scenario isolates the ceiling-honesty mechanism from the shape-match gate.
const TOP: BandDef = { id: '10-0', priority: 100, label: 'ROUT', minEfficiency: 97 };
const MID_BAND: BandDef = { id: '5-0', priority: 70, label: 'COMFORTABLE', minEfficiency: 90 };
const LOW: BandDef = { id: '2-1', priority: 40, label: 'NARROW', minEfficiency: 50 };
const FALLBACK: BandDef = { id: '0-4', priority: 0, label: 'COLLAPSE', fallback: true };

const BASE_CONFIG: ThresholdConfig = {
  version: 3,
  referenceFormation: '4-3-3',
  minCounts: FORMATIONS[0].minCounts,
  formations: FORMATIONS,
  ratingScale: { min: 1, max: 100 },
  bands: [TOP, MID_BAND, LOW, FALLBACK],
};

// Offered pool, one candidate per reveal round:
//   GK: {70}          DEF: {90,80,70,60,50}     MID: {90,80,70}     ATT: {90,80,70}
// FinalXI deliberately skips the top DEF (90), taking 80/70/60/50 instead —
// this is what makes the DEF bucket "inefficient" once a formation asks for
// only 4 of the 5 offered DEF candidates.
const gk1 = player('gk1', 'GK', 70);
const def1 = player('def1', 'DEF', 90); // offered, NOT drafted
const def2 = player('def2', 'DEF', 80);
const def3 = player('def3', 'DEF', 70);
const def4 = player('def4', 'DEF', 60);
const def5 = player('def5', 'DEF', 50);
const mid1 = player('mid1', 'MID', 90);
const mid2 = player('mid2', 'MID', 80);
const mid3 = player('mid3', 'MID', 70);
const att1 = player('att1', 'ATT', 90);
const att2 = player('att2', 'ATT', 80);
const att3 = player('att3', 'ATT', 70);

const squadsById: Record<string, Squad> = Object.fromEntries(
  [
    squad('s-gk1', [gk1]),
    squad('s-def1', [def1]),
    squad('s-def2', [def2]),
    squad('s-def3', [def3]),
    squad('s-def4', [def4]),
    squad('s-def5', [def5]),
    squad('s-mid1', [mid1]),
    squad('s-mid2', [mid2]),
    squad('s-mid3', [mid3]),
    squad('s-att1', [att1]),
    squad('s-att2', [att2]),
    squad('s-att3', [att3]),
  ].map((s) => [s.id, s]),
);

const REVEAL_LOG = [
  's-gk1',
  's-def1',
  's-def2',
  's-def3',
  's-def4',
  's-def5',
  's-mid1',
  's-mid2',
  's-mid3',
  's-att1',
  's-att2',
  's-att3',
];

// FinalXI: GK1, DEF4 (skips def1/90), MID3 (all), ATT3 (all) -> shape = 4-3-3.
const XI: FinalXI = [gk1, def2, def3, def4, def5, mid1, mid2, mid3, att1, att2, att3];

function scoreDeclared(): { bandId: string; label: string } {
  const declaredConfig = withFormationMinCounts(BASE_CONFIG, '5-3-2');
  const ceiling = computeSessionCeiling(REVEAL_LOG, squadsById, declaredConfig.minCounts, POSITION_MAP, personKeyFn);
  const input = computeScoreInput(XI, POSITION_MAP, ceiling);
  return scoreBand(input, declaredConfig);
}

describe('scoreUnderFormation', () => {
  it('shape matches 4-3-3 exactly, while the session declared 5-3-2', () => {
    const counts = { GK: 1, DEF: 4, MID: 3, ATT: 3 };
    expect(detectFormationFit(counts, FORMATIONS)).toBe('4-3-3');
  });

  it('honestly recomputes the ceiling under the fitted formation — fitted band may be LOWER than the declared award', () => {
    const declared = scoreDeclared();
    // Declared (5-3-2) ceiling caps ATT at 2 of the 3 offered — a smaller
    // ceiling that (for this session's fixed actual total) flatters efficiency.
    expect(declared.bandId).toBe('10-0');

    const fitted = scoreUnderFormation(XI, REVEAL_LOG, squadsById, POSITION_MAP, personKeyFn, BASE_CONFIG, '4-3-3');
    // Fitted (4-3-3) ceiling caps DEF at 4 of the 5 offered, correctly exposing
    // the skipped def1/90 as lost efficiency — and uncaps ATT to all 3, but not
    // enough to offset the DEF cost. Net: fitted efficiency < declared efficiency.
    expect(fitted.bandId).toBe('5-0');
    expect(fitted.bandId).not.toBe(declared.bandId);
  });

  it('CRITICAL INVARIANT: computing the fitted-formation band never changes the declared award', () => {
    const before = scoreDeclared();
    scoreUnderFormation(XI, REVEAL_LOG, squadsById, POSITION_MAP, personKeyFn, BASE_CONFIG, '4-3-3');
    const after = scoreDeclared();
    expect(after).toEqual(before);
    // BASE_CONFIG itself must be untouched by the fitted-formation recompute.
    expect(BASE_CONFIG.bands).toEqual([TOP, MID_BAND, LOW, FALLBACK]);
    expect(BASE_CONFIG.referenceFormation).toBe('4-3-3');
  });

  it('determinism: same inputs -> deep-equal output, always', () => {
    const a = scoreUnderFormation(XI, REVEAL_LOG, squadsById, POSITION_MAP, personKeyFn, BASE_CONFIG, '4-3-3');
    const b = scoreUnderFormation(XI, REVEAL_LOG, squadsById, POSITION_MAP, personKeyFn, BASE_CONFIG, '4-3-3');
    expect(a).toEqual(b);
  });

  it('fitted === declared -> no insight (fitted formation equals the declared formation)', () => {
    const fittedId = detectFormationFit({ GK: 1, DEF: 4, MID: 3, ATT: 3 }, FORMATIONS);
    const declaredFormationId = '4-3-3';
    expect(fittedId).toBe(declaredFormationId);
    const fitInsight = fittedId && fittedId !== declaredFormationId ? { formationId: fittedId } : null;
    expect(fitInsight).toBeNull();
  });
});

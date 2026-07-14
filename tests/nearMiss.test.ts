import { describe, it, expect } from 'vitest';
import { formatNearMiss } from '../src/app/nearMiss';
import type { PredicateResult, ScoreExplanation } from '../src/domain/types';
import type { OppositionDef } from '../src/domain/scoring/profileFit';

function explain(nextBetter: ScoreExplanation['nextBetter']): ScoreExplanation {
  return {
    bandId: 'AWARDED',
    label: 'AWARDED',
    evaluations: [],
    nextBetter,
  };
}

function fail(p: Omit<PredicateResult, 'passed'>): PredicateResult {
  return { ...p, passed: false };
}

describe('formatNearMiss', () => {
  it('returns null text when awarded the top band (nextBetter null)', () => {
    const e = explain(null);
    expect(formatNearMiss(e).text).toBeNull();
  });

  it('returns null when nextBetter exists but has no failing predicates', () => {
    const e = explain({ bandId: '10-0', label: 'x', failing: [] });
    expect(formatNearMiss(e).text).toBeNull();
  });

  it('renders minEfficiency -> "N SHY OF A BAND SQUAD"', () => {
    const e = explain({
      bandId: '2-1',
      label: 'HW',
      failing: [fail({ name: 'minEfficiency', required: 93, actual: 91 })],
    });
    expect(formatNearMiss(e).text).toBe('2 SHY OF A 2-1 SQUAD');
  });

  it('uses "1 SHY" when gap is 1', () => {
    const e = explain({
      bandId: '7-1',
      label: 'RD',
      failing: [fail({ name: 'minEfficiency', required: 99, actual: 98 })],
    });
    expect(formatNearMiss(e).text).toBe('1 SHY OF A 7-1 SQUAD');
  });

  it('renders minBucketEfficiency MID -> "MIDFIELD LEFT GOALS OUT THERE — BAND NEEDED MORE"', () => {
    const e = explain({
      bandId: '7-1',
      label: 'RD',
      failing: [fail({ name: 'minBucketEfficiency', bucket: 'MID', required: 99, actual: 96 })],
    });
    expect(formatNearMiss(e).text).toBe('MIDFIELD LEFT GOALS OUT THERE — 7-1 NEEDED MORE');
  });

  it('renders minBucketEfficiency DEF -> "BACK LINE A YARD SHORT OF A BAND"', () => {
    const e = explain({
      bandId: '5-0',
      label: 'DD',
      failing: [fail({ name: 'minBucketEfficiency', bucket: 'DEF', required: 97, actual: 95 })],
    });
    expect(formatNearMiss(e).text).toBe('BACK LINE A YARD SHORT OF A 5-0');
  });

  it('renders minBucketEfficiency ATT -> "ATTACK TOO BLUNT FOR A BAND"', () => {
    const e = explain({
      bandId: '10-0',
      label: 'LR',
      failing: [fail({ name: 'minBucketEfficiency', bucket: 'ATT', required: 99, actual: 98 })],
    });
    expect(formatNearMiss(e).text).toBe('ATTACK TOO BLUNT FOR A 10-0');
  });

  it('renders minBucketEfficiency GK -> "KEEPER SHORT OF A BAND DAY"', () => {
    const e = explain({
      bandId: '8-0',
      label: 'RD',
      failing: [fail({ name: 'minBucketEfficiency', bucket: 'GK', required: 99, actual: 90 })],
    });
    expect(formatNearMiss(e).text).toBe('KEEPER SHORT OF A 8-0 DAY');
  });

  it('renders minWeakLink -> "PASSENGER AT N — A BAND XI CARRIES NO ONE"', () => {
    const e = explain({
      bandId: '10-0',
      label: 'LR',
      failing: [fail({ name: 'minWeakLink', required: 86, actual: 84 })],
    });
    expect(formatNearMiss(e).text).toBe('PASSENGER AT 84 — A 10-0 XI CARRIES NO ONE');
  });

  it('structural minCounts DEF replaces whole near-miss', () => {
    const e = explain({
      bandId: '5-0',
      label: 'DD',
      failing: [fail({ name: 'minCounts', bucket: 'DEF', required: 4, actual: 3 })],
    });
    expect(formatNearMiss(e).text).toBe('ELEVEN ARTISTS, NOBODY ON THE DOOR.');
  });

  it('structural allBucketsNonEmpty GK replaces whole near-miss', () => {
    const e = explain({
      bandId: '1-2',
      label: 'UL',
      failing: [fail({ name: 'allBucketsNonEmpty', bucket: 'GK', required: 1, actual: 0 })],
    });
    expect(formatNearMiss(e).text).toBe('NO KEEPER. BOLD. WRONG.');
  });

  it('structural ATT replaces whole near-miss', () => {
    const e = explain({
      bandId: '7-1',
      label: 'RD',
      failing: [fail({ name: 'allBucketsNonEmpty', bucket: 'ATT', required: 1, actual: 0 })],
    });
    expect(formatNearMiss(e).text).toBe('ALL DEFENCE, NO IDEAS.');
  });

  it('structural MID replaces whole near-miss', () => {
    const e = explain({
      bandId: '7-1',
      label: 'RD',
      failing: [fail({ name: 'minCounts', bucket: 'MID', required: 3, actual: 2 })],
    });
    expect(formatNearMiss(e).text).toBe('MIDFIELD MISSING IN ACTION.');
  });

  it('structural override: shape + non-shape failures return only structural line', () => {
    const e = explain({
      bandId: '5-0',
      label: 'DD',
      failing: [
        fail({ name: 'minEfficiency', required: 98, actual: 95 }),
        fail({ name: 'minCounts', bucket: 'DEF', required: 4, actual: 3 }),
      ],
    });
    expect(formatNearMiss(e).text).toBe('ELEVEN ARTISTS, NOBODY ON THE DOOR.');
  });

  it('joins two most binding non-shape failures with " · "', () => {
    const e = explain({
      bandId: '10-0',
      label: 'LR',
      failing: [
        fail({ name: 'minBucketEfficiency', bucket: 'MID', required: 99, actual: 98 }),
        fail({ name: 'minWeakLink', required: 86, actual: 84 }),
      ],
    });
    expect(formatNearMiss(e).text).toBe(
      'MIDFIELD LEFT GOALS OUT THERE — 10-0 NEEDED MORE · PASSENGER AT 84 — A 10-0 XI CARRIES NO ONE',
    );
  });

  it('emits a single line when only one non-shape failing predicate exists', () => {
    const e = explain({
      bandId: '2-1',
      label: 'HW',
      failing: [fail({ name: 'minEfficiency', required: 93, actual: 91 })],
    });
    expect(formatNearMiss(e).text).toBe('2 SHY OF A 2-1 SQUAD');
  });

  it('multiple shape failures collapse to highest-priority bucket message (GK > DEF > ATT > MID)', () => {
    const e = explain({
      bandId: '7-1',
      label: 'RD',
      failing: [
        fail({ name: 'minCounts', bucket: 'DEF', required: 3, actual: 2 }),
        fail({ name: 'minCounts', bucket: 'MID', required: 3, actual: 1 }),
        fail({ name: 'minWeakLink', required: 86, actual: 80 }),
      ],
    });
    expect(formatNearMiss(e).text).toBe('ELEVEN ARTISTS, NOBODY ON THE DOOR.');
  });
});

// ---------------------------------------------------------------------------
// ADR-020 Wave C: minFit near-miss templates (plan.md line 48, dictated copy).
// Template selection keys on the active opposition's DOMINANT weightMod.
// ---------------------------------------------------------------------------
describe('formatNearMiss — ADR-020 minFit templates', () => {
  const STRENGTH_OPP: OppositionDef = {
    id: 'aerial-bombardment', label: 'AERIAL BOMBARDMENT', tagline: 't', weightMods: { strength: 1.25 },
  };
  const ACCURACY_OPP: OppositionDef = {
    id: 'low-block', label: 'THE LOW BLOCK', tagline: 't', weightMods: { accuracy: 1.25 },
  };
  const PACE_OPP: OppositionDef = {
    id: 'pressing-machine', label: 'THE PRESSING MACHINE', tagline: 't', weightMods: { pace: 1.25 },
  };
  const NEUTRAL_OPP: OppositionDef = { id: 'neutral', label: 'NEUTRAL', tagline: 't', weightMods: {} };
  const MIXED_OPP: OppositionDef = {
    id: 'counter-kings', label: 'COUNTER KINGS', tagline: 't', weightMods: { pace: 1.15, strength: 1.2 },
  };

  function minFitExplain(bandId: string): ScoreExplanation {
    return explain({ bandId, label: 'x', failing: [fail({ name: 'minFit', required: 65, actual: 60 })] });
  }

  it('strength-dominant opposition -> "TOO SOFT FOR THE PRESS — {BAND} WANTED STEEL"', () => {
    expect(formatNearMiss(minFitExplain('10-0'), STRENGTH_OPP).text).toBe(
      'TOO SOFT FOR THE PRESS — 10-0 WANTED STEEL',
    );
  });

  it('accuracy-dominant opposition -> "ALL LEGS, NO CRAFT — THE {OPP} HELD" (label\'s leading THE not doubled)', () => {
    expect(formatNearMiss(minFitExplain('7-1'), ACCURACY_OPP).text).toBe(
      'ALL LEGS, NO CRAFT — THE LOW BLOCK HELD',
    );
  });

  it('pace-dominant opposition -> "CAUGHT FLAT — {BAND} NEEDED LEGS"', () => {
    expect(formatNearMiss(minFitExplain('5-0'), PACE_OPP).text).toBe('CAUGHT FLAT — 5-0 NEEDED LEGS');
  });

  it('neutral opposition -> "SHAPE FIT SHORT OF A {BAND}"', () => {
    expect(formatNearMiss(minFitExplain('10-0'), NEUTRAL_OPP).text).toBe('SHAPE FIT SHORT OF A 10-0');
  });

  it('opposition omitted entirely -> falls back to the neutral shape-fit line', () => {
    expect(formatNearMiss(minFitExplain('10-0')).text).toBe('SHAPE FIT SHORT OF A 10-0');
  });

  it('mixed weightMods pick the strictly higher mod as dominant (strength 1.2 > pace 1.15)', () => {
    expect(formatNearMiss(minFitExplain('10-0'), MIXED_OPP).text).toBe(
      'TOO SOFT FOR THE PRESS — 10-0 WANTED STEEL',
    );
  });

  it('minFit near-miss joins with a second failing predicate when both present (two most binding)', () => {
    const e = explain({
      bandId: '10-0',
      label: 'x',
      failing: [
        fail({ name: 'minFit', required: 65, actual: 63 }),
        fail({ name: 'minWeakLink', required: 86, actual: 84 }),
      ],
    });
    expect(formatNearMiss(e, PACE_OPP).text).toBe(
      'CAUGHT FLAT — 10-0 NEEDED LEGS · PASSENGER AT 84 — A 10-0 XI CARRIES NO ONE',
    );
  });
});

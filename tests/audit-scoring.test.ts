/**
 * tests/audit-scoring.test.ts — edge-case audit of the scoring calculator
 * (ADR-004 / ADR-013; ARCHITECTURE.md §3/§7).
 *
 * SYNTHETIC ThresholdConfig built inline — never imports thresholds.json.
 * Covers: empty XI, single-bucket XI, exact boundary values (actual == required),
 * fallback selection, duplicate-priority determinism, minBucketSums subset
 * behaviour, positionMap-as-source-of-truth, and the explain/score consistency
 * guarantee at weird XI shapes.
 */

import { describe, expect, it } from 'vitest';
import { computeScoreInput, evaluateBandPredicates, scoreBand } from '../src/domain/scoring/scoreBand';
import { explainScoreBand } from '../src/domain/scoring/explainScoreBand';
import type { BandDef, CeilingResult, FinalXI, Player, PositionBucket, PositionMap, ThresholdConfig } from '../src/domain/types';

// ---------------------------------------------------------------------------
// Synthetic config + XI builder
// ---------------------------------------------------------------------------

// ADR-019: none of this file's bands configure minEfficiency/minBucketEfficiency,
// so a zero ceiling is inert — computeSessionCeiling itself is exercised in
// tests/sessionCeiling.test.ts.
const ZERO_CEILING: CeilingResult = { bucketSums: { GK: 0, DEF: 0, MID: 0, ATT: 0 }, total: 0 };

const POSITION_MAP: PositionMap = { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' };
const RAW_FOR_BUCKET: Record<PositionBucket, string> = { GK: 'GK', DEF: 'CB', MID: 'CM', ATT: 'ST' };
const MIN_COUNTS: Record<PositionBucket, number> = { GK: 1, DEF: 4, MID: 3, ATT: 3 };

const TOP: BandDef = {
  id: 'TOP', priority: 100, label: 'LEGENDARY',
  requireAllBucketsNonEmpty: true, requireMinCounts: true,
  minBucketSums: { GK: 80, DEF: 320, MID: 240, ATT: 240 }, minWeakLink: 75,
};
const MID: BandDef = {
  id: 'MID', priority: 70, label: 'COMFY',
  requireAllBucketsNonEmpty: true, requireMinCounts: true,
  minBucketSums: { GK: 70, DEF: 280, MID: 210, ATT: 210 }, minWeakLink: 65,
};
const LOW: BandDef = { id: 'LOW', priority: 40, label: 'NERVY', minWeakLink: 10 };
const FALLBACK: BandDef = { id: 'FALL', priority: 0, label: 'COLLAPSE', fallback: true };

function makeConfig(bands: BandDef[], minCounts = MIN_COUNTS): ThresholdConfig {
  return {
    version: 1, referenceFormation: '4-3-3', minCounts,
    formations: [
      { id: '4-3-3', label: '4-3-3', description: 'test', minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 } },
    ],
    ratingScale: { min: 1, max: 100 }, bands,
    profiles: {}, // ADR-020: unused by this synthetic scoring fixture (fit lands Wave C)
    oppositions: [],
  };
}
const CONFIG = makeConfig([TOP, MID, LOW, FALLBACK]);

let idc = 0;
function buildXI(
  spec: Partial<Record<PositionBucket, number[]>>,
  opts?: { wrongPositionBucketField?: boolean },
): FinalXI {
  const xi: Player[] = [];
  for (const bucket of Object.keys(spec) as PositionBucket[]) {
    for (const rating of spec[bucket] ?? []) {
      idc += 1;
      xi.push({
        id: `a${idc}-${bucket}-${rating}`,
        name: `Player ${idc}`,
        positionRaw: RAW_FOR_BUCKET[bucket],
        positionBucket: opts?.wrongPositionBucketField ? 'GK' : bucket,
        rating,
      });
    }
  }
  return xi;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('audit: empty XI', () => {
  it('computeScoreInput on a 0-player XI yields zeroed sums/counts and weakLink 0', () => {
    const input = computeScoreInput([], POSITION_MAP, ZERO_CEILING);
    expect(input.bucketSums).toEqual({ GK: 0, DEF: 0, MID: 0, ATT: 0 });
    expect(input.bucketCounts).toEqual({ GK: 0, DEF: 0, MID: 0, ATT: 0 });
    // weakLink starts at +Infinity and is reset to 0 for an empty XI.
    expect(input.weakLink).toBe(0);
  });

  it('an empty XI falls through every gating band to the fallback', () => {
    const input = computeScoreInput([], POSITION_MAP, ZERO_CEILING);
    const result = scoreBand(input, CONFIG);
    expect(result).toEqual({ bandId: 'FALL', label: 'COLLAPSE' });
  });

  it('explain/score consistency holds for an empty XI', () => {
    const input = computeScoreInput([], POSITION_MAP, ZERO_CEILING);
    expect(explainScoreBand(input, CONFIG).bandId).toBe(scoreBand(input, CONFIG).bandId);
  });
});

describe('audit: single-bucket XI', () => {
  it('all 11 players in MID: MID count 11, others 0, allGatesNonEmpty bands blocked', () => {
    const xi = buildXI({ MID: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80] });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.bucketCounts).toEqual({ GK: 0, DEF: 0, MID: 11, ATT: 0 });
    expect(input.bucketSums).toEqual({ GK: 0, DEF: 0, MID: 880, ATT: 0 });
    expect(input.weakLink).toBe(80);
    // TOP & MID require all buckets non-empty → skipped. LOW only needs weakLink>=10 → matches.
    expect(scoreBand(input, CONFIG).bandId).toBe('LOW');
  });

  it('all 11 in GK: bucketSums.GK = sum, weakLink = min; LOW band still matches', () => {
    const xi = buildXI({ GK: [60, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88] });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.bucketCounts).toEqual({ GK: 11, DEF: 0, MID: 0, ATT: 0 });
    expect(input.bucketSums.GK).toBe(850);
    expect(input.weakLink).toBe(60);
    expect(scoreBand(input, CONFIG).bandId).toBe('LOW');
  });
});

describe('audit: exact boundary values (actual == required) PASS', () => {
  it('every minBucketSums exactly at the threshold passes TOP; one-short fails', () => {
    // All rating 80 → sums exactly equal TOP thresholds (GK80/DEF320/MID240/ATT240),
    // counts exactly equal minCounts (1/4/3/3), weakLink 80 >= 75.
    const xi = buildXI({
      GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.bucketSums).toEqual({ GK: 80, DEF: 320, MID: 240, ATT: 240 });
    expect(input.bucketCounts).toEqual({ GK: 1, DEF: 4, MID: 3, ATT: 3 });
    expect(input.weakLink).toBe(80);
    expect(scoreBand(input, CONFIG).bandId).toBe('TOP');

    // Drop one DEF player by 1 → DEF sum 319 == required-1 → TOP fails on that sum.
    const weakened = xi.map((p) =>
      p.positionRaw === 'CB' && p.rating === 80 ? { ...p, rating: 79 } : p,
    );
    // Only weaken ONE DEF player (the first encountered).
    let mutated = false;
    const oneDown = xi.map((p) => {
      if (!mutated && p.positionRaw === 'CB') { mutated = true; return { ...p, rating: 79 }; }
      return p;
    });
    const wInput = computeScoreInput(oneDown, POSITION_MAP, ZERO_CEILING);
    expect(wInput.bucketSums.DEF).toBe(319);
    expect(scoreBand(wInput, CONFIG).bandId).not.toBe('TOP');
    void weakened;
  });

  it('minWeakLink exactly == required passes; one below fails', () => {
    const weakOnly: BandDef = { id: 'WK', priority: 50, label: 'WK', minWeakLink: 75 };
    const cfg2 = makeConfig([weakOnly, FALLBACK]);
    const passing = buildXI({
      GK: [75], DEF: [90, 90, 90, 90], MID: [90, 90, 90], ATT: [90, 90, 90],
    });
    const failing = passing.map((p, i) => (i === 0 ? { ...p, rating: 74 } : p));
    expect(computeScoreInput(passing, POSITION_MAP, ZERO_CEILING).weakLink).toBe(75);
    expect(scoreBand(computeScoreInput(passing, POSITION_MAP, ZERO_CEILING), cfg2).bandId).toBe('WK');
    expect(computeScoreInput(failing, POSITION_MAP, ZERO_CEILING).weakLink).toBe(74);
    expect(scoreBand(computeScoreInput(failing, POSITION_MAP, ZERO_CEILING), cfg2).bandId).toBe('FALL');
  });

  it('minCounts exactly == required passes; one short fails', () => {
    const cfg = makeConfig([MID, FALLBACK]);
    const exact = buildXI({
      GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80],
    });
    expect(computeScoreInput(exact, POSITION_MAP, ZERO_CEILING).bucketCounts).toEqual({
      GK: 1, DEF: 4, MID: 3, ATT: 3,
    });
    expect(scoreBand(computeScoreInput(exact, POSITION_MAP, ZERO_CEILING), cfg).bandId).toBe('MID');

    // Reclassify one ATT player as MID → ATT count 2 < 3 → MID blocked → fallback.
    let moved = false;
    const reshaped: FinalXI = exact.map((p) => {
      if (!moved && p.positionRaw === 'ST') {
        moved = true;
        return { ...p, positionRaw: 'CM', positionBucket: 'MID' as PositionBucket };
      }
      return p;
    });
    const s = computeScoreInput(reshaped, POSITION_MAP, ZERO_CEILING);
    expect(s.bucketCounts).toEqual({ GK: 1, DEF: 4, MID: 4, ATT: 2 });
    expect(scoreBand(s, cfg).bandId).toBe('FALL');
  });

  it('allBucketsNonEmpty exactly at count 1 for every bucket passes', () => {
    const ne: BandDef = { id: 'NE', priority: 60, label: 'NE', requireAllBucketsNonEmpty: true };
    const cfg = makeConfig([ne, FALLBACK]);
    const xi = buildXI({ GK: [50], DEF: [50], MID: [50], ATT: [60, 60, 60, 60, 60, 60, 60, 60] });
    expect(computeScoreInput(xi, POSITION_MAP, ZERO_CEILING).bucketCounts).toEqual({
      GK: 1, DEF: 1, MID: 1, ATT: 8,
    });
    expect(scoreBand(computeScoreInput(xi, POSITION_MAP, ZERO_CEILING), cfg).bandId).toBe('NE');

    // Replace the lone GK with a MID player → GK count 0 → NE blocked → fallback.
    const noGk: FinalXI = xi.map((p) =>
      p.positionRaw === 'GK'
        ? { ...p, positionRaw: 'CM', positionBucket: 'MID' as PositionBucket }
        : p,
    );
    const mixed = computeScoreInput(noGk, POSITION_MAP, ZERO_CEILING);
    expect(mixed.bucketCounts.GK).toBe(0);
    expect(mixed.bucketCounts.MID).toBe(2);
    expect(scoreBand(mixed, cfg).bandId).toBe('FALL');
  });
});

describe('audit: fallback selection', () => {
  it('a config with ONLY a fallback returns fallback for every XI shape', () => {
    const cfg = makeConfig([FALLBACK]);
    const shapes: Partial<Record<PositionBucket, number[]>>[] = [
      {},
      { GK: [50] },
      { MID: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
      { GK: [1], DEF: [1, 1, 1], MID: [1], ATT: [1, 1, 1, 1, 1, 1] },
    ];
    for (const spec of shapes) {
      const xi = buildXI(spec);
      const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
      expect(scoreBand(input, cfg)).toEqual({ bandId: 'FALL', label: 'COLLAPSE' });
      expect(explainScoreBand(input, cfg).bandId).toBe('FALL');
    }
  });

  it('the fallback is reachable even when a higher band partially passes', () => {
    // TOP partially matches (allBucketsNonEmpty + minCounts) but minWeakLink fails.
    const xi = buildXI({
      GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 40],
    });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    // weakLink 40 < TOP.minWeakLink 75 AND TOP ATT sum 200 < 240 — TOP fails.
    // LOW needs weakLink>=10 — 40 passes → LOW matches, not fallback. Ensure LOW wins.
    expect(scoreBand(input, CONFIG).bandId).toBe('LOW');
    // Force a true fallback: a band whose weakLink floor no one can meet.
    const cfg = makeConfig([
      { id: 'IMPOSSIBLE', priority: 90, label: 'X', minWeakLink: 200 },
      FALLBACK,
    ]);
    expect(scoreBand(input, cfg).bandId).toBe('FALL');
  });
});

describe('audit: duplicate priorities stay deterministic and stable', () => {
  it('two non-fallback bands sharing a priority resolve by config insertion order (stable)', () => {
    const alpha: BandDef = { id: 'ALPHA', priority: 50, label: 'Alpha', minWeakLink: 70 };
    const beta: BandDef = { id: 'BETA', priority: 50, label: 'Beta', minWeakLink: 10 };
    // Both pass for an XI with weakLink 80. Stable sort preserves insertion order,
    // so the band listed EARLIER in config.bands is evaluated first and wins.
    const xi = buildXI({ GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80] });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);

    const cfgAlphaFirst = makeConfig([alpha, beta, FALLBACK]);
    expect(scoreBand(input, cfgAlphaFirst).bandId).toBe('ALPHA');

    const cfgBetaFirst = makeConfig([beta, alpha, FALLBACK]);
    expect(scoreBand(input, cfgBetaFirst).bandId).toBe('BETA');
    // Re-running is stable — no nondeterminism between calls.
    expect(scoreBand(input, cfgAlphaFirst)).toEqual(scoreBand(input, cfgAlphaFirst));
  });

  it('when the earlier equal-priority band fails, the later one is still tried and can win', () => {
    const alpha: BandDef = { id: 'ALPHA', priority: 50, label: 'Alpha', minWeakLink: 90 };
    const beta: BandDef = { id: 'BETA', priority: 50, label: 'Beta', minWeakLink: 10 };
    const xi = buildXI({ GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80] });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING); // weakLink 80
    const cfg = makeConfig([alpha, beta, FALLBACK]);
    expect(scoreBand(input, cfg).bandId).toBe('BETA');
  });
});

describe('audit: minBucketSums subset behaviour', () => {
  it('a band configuring only a subset of buckets checks only those buckets', () => {
    const onlyAtt: BandDef = {
      id: 'ATT-ONLY', priority: 80, label: 'Att',
      minBucketSums: { ATT: 250 },
    };
    const cfg = makeConfig([onlyAtt, FALLBACK]);
    // ATT sum 250 exactly → ATT-ONLY passes even though other buckets are empty.
    const xi = buildXI({ DEF: [80, 80, 80], ATT: [80, 85, 85] }); // ATT sum 250
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.bucketSums.ATT).toBe(250);
    expect(scoreBand(input, cfg).bandId).toBe('ATT-ONLY');
    // ATT sum 249 → fails → fallback. xi indices: 0-2 DEF, 3-5 ATT (3=ATT 80).
    const xi2 = xi.map((p, i) => (i === 3 ? { ...p, rating: 79 } : p)); // [79,85,85]=249
    expect(computeScoreInput(xi2, POSITION_MAP, ZERO_CEILING).bucketSums.ATT).toBe(249);
    expect(scoreBand(computeScoreInput(xi2, POSITION_MAP, ZERO_CEILING), cfg).bandId).toBe('FALL');
  });

  it('evaluateBandPredicates emits one minBucketSum entry per configured bucket only', () => {
    const band: BandDef = {
      id: 'B', priority: 50, label: 'B',
      minBucketSums: { GK: 80, ATT: 240 },
    };
    const xi = buildXI({ GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80] });
    const results = evaluateBandPredicates(band, computeScoreInput(xi, POSITION_MAP, ZERO_CEILING), CONFIG);
    const sumEntries = results.filter((r) => r.name === 'minBucketSum');
    expect(sumEntries.map((r) => r.bucket)).toEqual(['GK', 'ATT']);
    expect(sumEntries.every((r) => r.passed)).toBe(true);
  });
});

describe('audit: positionMap is the source of truth, not positionBucket field', () => {
  it('a deliberately wrong positionBucket field is ignored in favour of the map', () => {
    // Every positionBucket set to 'GK' (wrong for 10 players); the map must drive bucketing.
    const xi = buildXI(
      { GK: [90], DEF: [80, 81, 82, 83], MID: [70, 71, 72], ATT: [60, 61, 62] },
      { wrongPositionBucketField: true },
    );
    expect(xi.every((p) => p.positionBucket === 'GK')).toBe(true);
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    expect(input.bucketSums).toEqual({ GK: 90, DEF: 326, MID: 213, ATT: 183 });
    expect(input.bucketCounts).toEqual({ GK: 1, DEF: 4, MID: 3, ATT: 3 });
  });

  it('multiple positionRaw codes mapping to the same bucket aggregate together', () => {
    const map: PositionMap = { GK: 'GK', CB: 'DEF', LB: 'DEF', CM: 'MID', AM: 'MID', ST: 'ATT' };
    const xi: FinalXI = [
      { id: 'g1', name: 'gk', positionRaw: 'GK', positionBucket: 'GK', rating: 85 },
      { id: 'd1', name: 'cb', positionRaw: 'CB', positionBucket: 'DEF', rating: 80 },
      { id: 'd2', name: 'lb', positionRaw: 'LB', positionBucket: 'DEF', rating: 78 },
      { id: 'm1', name: 'cm', positionRaw: 'CM', positionBucket: 'MID', rating: 82 },
      { id: 'm2', name: 'am', positionRaw: 'AM', positionBucket: 'MID', rating: 84 },
      { id: 's1', name: 'st', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 },
    ];
    const input = computeScoreInput(xi, map, ZERO_CEILING);
    expect(input.bucketCounts).toEqual({ GK: 1, DEF: 2, MID: 2, ATT: 1 });
    expect(input.bucketSums).toEqual({ GK: 85, DEF: 158, MID: 166, ATT: 90 });
    expect(input.weakLink).toBe(78);
  });
});

describe('audit: explain ↔ score consistency across weird shapes', () => {
  it('bandId agreement holds for empty, single-bucket, and boundary XIs', () => {
    const shapes: Partial<Record<PositionBucket, number[]>>[] = [
      {},
      { MID: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50] },
      { GK: [1], DEF: [1, 1, 1, 1], MID: [1, 1, 1], ATT: [1, 1, 1] },
      { GK: [75], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 75] },
    ];
    for (const spec of shapes) {
      const input = computeScoreInput(buildXI(spec), POSITION_MAP, ZERO_CEILING);
      expect(explainScoreBand(input, CONFIG).bandId).toBe(scoreBand(input, CONFIG).bandId);
    }
  });

  it('nextBetter is null only when the awarded band is the highest-priority matched band', () => {
    const xi = buildXI({ GK: [80], DEF: [80, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80] });
    const input = computeScoreInput(xi, POSITION_MAP, ZERO_CEILING);
    const ex = explainScoreBand(input, CONFIG);
    expect(ex.bandId).toBe('TOP');
    expect(ex.nextBetter).toBeNull();
  });
});

describe('audit: weakLink semantics', () => {
  it('weakLink is the single minimum rating across the XI (not per-bucket)', () => {
    const xi = buildXI({ GK: [90], DEF: [88, 87, 86, 30], MID: [85, 84, 83], ATT: [82, 81, 80] });
    expect(computeScoreInput(xi, POSITION_MAP, ZERO_CEILING).weakLink).toBe(30);
  });

  it('two players tied for the minimum rating: weakLink is that value (counts once)', () => {
    const xi = buildXI({ GK: [55], DEF: [55, 80, 80, 80], MID: [80, 80, 80], ATT: [80, 80, 80] });
    expect(computeScoreInput(xi, POSITION_MAP, ZERO_CEILING).weakLink).toBe(55);
  });
});
/**
 * tests/profileFit.test.ts — ADR-020 Wave C required test battery (plan.md
 * "Wave C/D algorithm addendum", items 1-15, BINDING). Also covers the
 * `minFit` evaluator predicate (scoreBand.ts) and the explainScoreBand ≡
 * scoreBand consistency invariant across the fit boundary, since those are
 * part of the same Wave C gate.
 *
 * test01..test15 map 1:1 to the addendum's numbered list (see each `describe`
 * heading below).
 */
import { describe, expect, it } from 'vitest';
import { computeProfileFit, selectOpposition } from '../src/domain/scoring/profileFit';
import type { Attrs, FormationProfile, OppositionDef } from '../src/domain/scoring/profileFit';
import { computeScoreInput, evaluateBandPredicates, scoreBand } from '../src/domain/scoring/scoreBand';
import { explainScoreBand } from '../src/domain/scoring/explainScoreBand';
import type { BandDef, CeilingResult, FinalXI, Player, PositionMap, ThresholdConfig } from '../src/domain/types';
import { mulberry32 } from '../src/lib/rng';

const POSITION_MAP: PositionMap = {
  GK: 'GK',
  CB: 'DEF',
  RB: 'DEF',
  CM: 'MID',
  DM: 'MID',
  ST: 'ATT',
  RW: 'ATT',
};

const ZERO_CEILING: CeilingResult = { bucketSums: { GK: 0, DEF: 0, MID: 0, ATT: 0 }, total: 0 };

/** A representative 3-bucket formation profile (arbitrary but fixed numbers). */
const PROFILE: FormationProfile = {
  DEF: { weights: { pace: 0.4, strength: 0.8, accuracy: 0.3 }, targets: { pace: 70, strength: 80, accuracy: 65 } },
  MID: { weights: { pace: 0.5, strength: 0.4, accuracy: 0.7 }, targets: { pace: 75, strength: 70, accuracy: 85 } },
  ATT: { weights: { pace: 0.8, strength: 0.3, accuracy: 0.5 }, targets: { pace: 88, strength: 68, accuracy: 78 } },
};

let idCounter = 0;
function makePlayer(
  positionRaw: string,
  attrs: Partial<Attrs> & { rating?: number } = {},
): Player {
  idCounter += 1;
  const bucket = POSITION_MAP[positionRaw];
  const isGk = bucket === 'GK';
  return {
    id: `p${idCounter}`,
    name: `Player ${idCounter}`,
    positionRaw,
    positionBucket: bucket,
    rating: attrs.rating ?? 75,
    pace: isGk ? undefined : attrs.pace ?? 70,
    strength: isGk ? undefined : attrs.strength ?? 70,
    accuracy: isGk ? undefined : attrs.accuracy ?? 70,
  };
}

/** Builds a bucket's players all sharing the same attrs (so bucket mean === attrs). */
function bucketPlayers(positionRaw: string, count: number, attrs: Attrs): Player[] {
  return Array.from({ length: count }, () => makePlayer(positionRaw, attrs));
}

describe('computeProfileFit — test01: determinism', () => {
  it('identical inputs twice yield deep-equal output', () => {
    const xi: FinalXI = [
      ...bucketPlayers('CB', 4, { pace: 72, strength: 84, accuracy: 66 }),
      ...bucketPlayers('CM', 3, { pace: 76, strength: 71, accuracy: 88 }),
      ...bucketPlayers('ST', 3, { pace: 90, strength: 70, accuracy: 80 }),
      makePlayer('GK'),
    ];
    const a = computeProfileFit(xi, POSITION_MAP, PROFILE, {});
    const b = computeProfileFit(xi, POSITION_MAP, PROFILE, {});
    expect(a).toEqual(b);
  });
});

describe('computeProfileFit — test02: bounds', () => {
  it('fit is an integer in [0,100] across a seeded randomized-fixture sweep', () => {
    const rng = mulberry32(20260712);
    const rawPositions = ['CB', 'RB', 'CM', 'DM', 'ST', 'RW'];
    for (let iter = 0; iter < 200; iter++) {
      const xi: FinalXI = [];
      // random 0-5 players per raw position (so buckets can be empty, mixed, etc.)
      for (const raw of rawPositions) {
        const n = Math.floor(rng.next() * 4); // 0..3
        for (let i = 0; i < n; i++) {
          xi.push(
            makePlayer(raw, {
              pace: 1 + Math.floor(rng.next() * 99),
              strength: 1 + Math.floor(rng.next() * 99),
              accuracy: 1 + Math.floor(rng.next() * 99),
            }),
          );
        }
      }
      const weightMods = { pace: 0.5 + rng.next() * 1.5, strength: 0.5 + rng.next() * 1.5, accuracy: 0.5 + rng.next() * 1.5 };
      const fit = computeProfileFit(xi, POSITION_MAP, PROFILE, weightMods);
      expect(Number.isInteger(fit)).toBe(true);
      expect(fit).toBeGreaterThanOrEqual(0);
      expect(fit).toBeLessThanOrEqual(100);
    }
  });
});

describe('computeProfileFit — test03: perfect XI', () => {
  it('all bucket means >= targets => exactly 100', () => {
    const xi: FinalXI = [
      ...bucketPlayers('CB', 4, { pace: 90, strength: 95, accuracy: 90 }), // >= DEF targets 70/80/65
      ...bucketPlayers('CM', 3, { pace: 90, strength: 90, accuracy: 90 }), // >= MID targets 75/70/85
      ...bucketPlayers('ST', 3, { pace: 95, strength: 90, accuracy: 90 }), // >= ATT targets 88/68/78
      makePlayer('GK'),
    ];
    expect(computeProfileFit(xi, POSITION_MAP, PROFILE, {})).toBe(100);
  });
});

describe('computeProfileFit — test04: overshoot-free', () => {
  it('raising an attr already >= target changes nothing', () => {
    // DEF: pace short (60 < 70), strength/accuracy already at/above target.
    const xi = (paceOvershootExtra: number): FinalXI => [
      ...bucketPlayers('CB', 4, { pace: 60, strength: 80 + paceOvershootExtra, accuracy: 65 }),
      ...bucketPlayers('CM', 3, { pace: 75, strength: 70, accuracy: 85 }),
      ...bucketPlayers('ST', 3, { pace: 88, strength: 68, accuracy: 78 }),
    ];
    const fit1 = computeProfileFit(xi(0), POSITION_MAP, PROFILE, {});
    const fit2 = computeProfileFit(xi(15), POSITION_MAP, PROFILE, {}); // strength pushed further above target
    expect(fit2).toBe(fit1);
  });
});

describe('computeProfileFit — test05: weak monotonicity', () => {
  it('raising a below-target attr never lowers fit', () => {
    const xi = (defPace: number): FinalXI => [
      ...bucketPlayers('CB', 4, { pace: defPace, strength: 80, accuracy: 65 }),
      ...bucketPlayers('CM', 3, { pace: 75, strength: 70, accuracy: 85 }),
      ...bucketPlayers('ST', 3, { pace: 88, strength: 68, accuracy: 78 }),
    ];
    const low = computeProfileFit(xi(40), POSITION_MAP, PROFILE, {});
    const mid = computeProfileFit(xi(55), POSITION_MAP, PROFILE, {});
    const high = computeProfileFit(xi(70), POSITION_MAP, PROFILE, {}); // reaches target
    expect(mid).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThanOrEqual(mid);
  });
});

describe('computeProfileFit — test06: weight sensitivity', () => {
  it('equal shortfalls, heavier-weighted attr hurts more (strict inequality)', () => {
    // Only DEF populated (MID/ATT empty -> excluded) so meanPenalty === penalty_DEF exactly.
    // pace mean 60 vs target 80 (shortfall 0.25); strength/accuracy AT target (shortfall 0).
    const xi: FinalXI = bucketPlayers('CB', 4, { pace: 60, strength: 80, accuracy: 80 });
    const targets: Attrs = { pace: 80, strength: 80, accuracy: 80 };

    const heavyOnShortfall: FormationProfile = {
      DEF: { weights: { pace: 0.8, strength: 0.1, accuracy: 0.1 }, targets },
      MID: PROFILE.MID,
      ATT: PROFILE.ATT,
    };
    const lightOnShortfall: FormationProfile = {
      DEF: { weights: { pace: 0.1, strength: 0.8, accuracy: 0.1 }, targets },
      MID: PROFILE.MID,
      ATT: PROFILE.ATT,
    };

    const fitHeavy = computeProfileFit(xi, POSITION_MAP, heavyOnShortfall, {});
    const fitLight = computeProfileFit(xi, POSITION_MAP, lightOnShortfall, {});
    expect(fitHeavy).toBeLessThan(fitLight);
  });
});

describe('computeProfileFit — test07: opposition direction', () => {
  it('a pace-deficient XI scores strictly lower under a pace-up archetype than under neutral', () => {
    // Pace short in EVERY bucket (not just one) so the weight bump's effect survives
    // the final round() over the 3-bucket mean — a single-bucket deficiency here washes
    // out under rounding (verified: needs a real, multi-bucket signal).
    const xi: FinalXI = [
      ...bucketPlayers('CB', 4, { pace: 40, strength: 80, accuracy: 65 }), // pace well short of 70
      ...bucketPlayers('CM', 3, { pace: 40, strength: 70, accuracy: 85 }), // pace well short of 75
      ...bucketPlayers('ST', 3, { pace: 40, strength: 68, accuracy: 78 }), // pace well short of 88
    ];
    const neutralFit = computeProfileFit(xi, POSITION_MAP, PROFILE, {});
    const paceUpFit = computeProfileFit(xi, POSITION_MAP, PROFILE, { pace: 1.25 });
    expect(paceUpFit).toBeLessThan(neutralFit);
  });

  it('a pace-rich XI scores >= its neutral fit under a pace-up archetype', () => {
    const xi: FinalXI = [
      ...bucketPlayers('CB', 4, { pace: 95, strength: 60, accuracy: 65 }), // pace overshoots, strength short
      ...bucketPlayers('CM', 3, { pace: 95, strength: 60, accuracy: 85 }),
      ...bucketPlayers('ST', 3, { pace: 95, strength: 60, accuracy: 78 }),
    ];
    const neutralFit = computeProfileFit(xi, POSITION_MAP, PROFILE, {});
    const paceUpFit = computeProfileFit(xi, POSITION_MAP, PROFILE, { pace: 1.25 });
    expect(paceUpFit).toBeGreaterThanOrEqual(neutralFit);
  });
});

describe('computeProfileFit — test08: empty-bucket exclusion', () => {
  it('an XI without ATT equals the hand-computed DEF/MID-only value exactly', () => {
    const xi: FinalXI = [
      ...bucketPlayers('CB', 4, { pace: 60, strength: 90, accuracy: 50 }),
      ...bucketPlayers('CM', 3, { pace: 80, strength: 60, accuracy: 95 }),
    ];
    // Hand computation:
    // DEF: shortfall pace = (70-60)/70 = 0.142857..; strength 0 (90>=80); accuracy (65-50)/65 = 0.230769..
    //   penalty_DEF = (0.4*0.142857 + 0.8*0 + 0.3*0.230769) / (0.4+0.8+0.3)
    //               = (0.0571428 + 0 + 0.0692307) / 1.5 = 0.1263736 / 1.5 = 0.0842490..
    // MID: shortfall pace 0 (80>=75); strength (70-60)/70=0.142857; accuracy 0 (95>=85)
    //   penalty_MID = (0.5*0 + 0.4*0.142857 + 0.7*0) / (0.5+0.4+0.7) = 0.0571428 / 1.6 = 0.0357142..
    // meanPenalty = (0.0842490 + 0.0357142) / 2 = 0.0599816..
    // fit = round(100*(1-0.0599816)) = round(94.0018) = 94
    const expected = 94;
    expect(computeProfileFit(xi, POSITION_MAP, PROFILE, {})).toBe(expected);
  });

  it('all three buckets empty (no outfield players) => fit = 0', () => {
    const xi: FinalXI = [makePlayer('GK')];
    expect(computeProfileFit(xi, POSITION_MAP, PROFILE, {})).toBe(0);
  });
});

describe('computeProfileFit — test09: GK invariance', () => {
  it('changing or removing the GK never changes fit', () => {
    const outfield = [
      ...bucketPlayers('CB', 4, { pace: 72, strength: 84, accuracy: 66 }),
      ...bucketPlayers('CM', 3, { pace: 76, strength: 71, accuracy: 88 }),
      ...bucketPlayers('ST', 3, { pace: 90, strength: 70, accuracy: 80 }),
    ];
    const withGk1: FinalXI = [makePlayer('GK', { rating: 80 }), ...outfield];
    const withGk2: FinalXI = [makePlayer('GK', { rating: 40 }), ...outfield]; // different GK rating
    const withoutGk: FinalXI = [...outfield]; // no GK at all

    const fitA = computeProfileFit(withGk1, POSITION_MAP, PROFILE, {});
    const fitB = computeProfileFit(withGk2, POSITION_MAP, PROFILE, {});
    const fitC = computeProfileFit(withoutGk, POSITION_MAP, PROFILE, {});
    expect(fitB).toBe(fitA);
    expect(fitC).toBe(fitA);
  });
});

describe('computeProfileFit — test10: scale invariance', () => {
  it('all weights x k yields identical fit', () => {
    const xi: FinalXI = [
      ...bucketPlayers('CB', 4, { pace: 60, strength: 90, accuracy: 50 }),
      ...bucketPlayers('CM', 3, { pace: 80, strength: 60, accuracy: 95 }),
      ...bucketPlayers('ST', 3, { pace: 70, strength: 90, accuracy: 60 }),
    ];
    const k = 4.5;
    const scaled: FormationProfile = {
      DEF: { weights: scaleAttrs(PROFILE.DEF.weights, k), targets: PROFILE.DEF.targets },
      MID: { weights: scaleAttrs(PROFILE.MID.weights, k), targets: PROFILE.MID.targets },
      ATT: { weights: scaleAttrs(PROFILE.ATT.weights, k), targets: PROFILE.ATT.targets },
    };
    const fitOriginal = computeProfileFit(xi, POSITION_MAP, PROFILE, {});
    const fitScaled = computeProfileFit(xi, POSITION_MAP, scaled, {});
    expect(fitScaled).toBe(fitOriginal);
  });
});
function scaleAttrs(a: Attrs, k: number): Attrs {
  return { pace: a.pace * k, strength: a.strength * k, accuracy: a.accuracy * k };
}

describe('computeProfileFit — test11: one fully hand-computed exact fixture', () => {
  it('matches hand arithmetic exactly', () => {
    // Fixture: DEF 4 players mean(pace=65, strength=85, accuracy=60); MID 3 players
    // mean(pace=75, strength=65, accuracy=90); ATT 3 players mean(pace=80, strength=75, accuracy=70).
    const xi: FinalXI = [
      ...bucketPlayers('CB', 4, { pace: 65, strength: 85, accuracy: 60 }),
      ...bucketPlayers('CM', 3, { pace: 75, strength: 65, accuracy: 90 }),
      ...bucketPlayers('ST', 3, { pace: 80, strength: 75, accuracy: 70 }),
    ];
    // DEF targets 70/80/65, weights 0.4/0.8/0.3:
    //   shortfall pace = (70-65)/70 = 0.0714285714
    //   shortfall strength = max(0, 80-85)/80 = 0 (overshoot free)
    //   shortfall accuracy = (65-60)/65 = 0.0769230769
    //   penalty_DEF = (0.4*0.0714285714 + 0.8*0 + 0.3*0.0769230769) / (0.4+0.8+0.3)
    //               = (0.0285714286 + 0 + 0.0230769231) / 1.5
    //               = 0.0516483516 / 1.5 = 0.0344322344
    // MID targets 75/70/85, weights 0.5/0.4/0.7:
    //   shortfall pace = 0 (75>=75); shortfall strength = (70-65)/70 = 0.0714285714;
    //   shortfall accuracy = (85-90)/85 -> overshoot -> 0
    //   penalty_MID = (0.5*0 + 0.4*0.0714285714 + 0.7*0) / (0.5+0.4+0.7)
    //               = 0.0285714286 / 1.6 = 0.0178571429
    // ATT targets 88/68/78, weights 0.8/0.3/0.5:
    //   shortfall pace = (88-80)/88 = 0.0909090909; shortfall strength = 0 (75>=68);
    //   shortfall accuracy = (78-70)/78 = 0.1025641026
    //   penalty_ATT = (0.8*0.0909090909 + 0.3*0 + 0.5*0.1025641026) / (0.8+0.3+0.5)
    //               = (0.0727272727 + 0 + 0.0512820513) / 1.6
    //               = 0.1240093240 / 1.6 = 0.0775058275
    // meanPenalty = (0.0344322344 + 0.0178571429 + 0.0775058275) / 3 = 0.1297952048 / 3 = 0.0432650683
    // fit = round(100 * (1 - 0.0432650683)) = round(95.6734932) = 96
    expect(computeProfileFit(xi, POSITION_MAP, PROFILE, {})).toBe(96);
  });
});

describe('computeProfileFit — test15: defensive throw', () => {
  it('throws when an outfield player is missing an attr', () => {
    const broken: Player = {
      id: 'broken', name: 'Broken', positionRaw: 'CB', positionBucket: 'DEF', rating: 75,
      pace: 70, strength: undefined, accuracy: 70,
    };
    const xi: FinalXI = [broken, ...bucketPlayers('CB', 3, { pace: 70, strength: 70, accuracy: 70 })];
    expect(() => computeProfileFit(xi, POSITION_MAP, PROFILE, {})).toThrow(/missing attr 'strength'/);
  });
});

// ---------------------------------------------------------------------------
// test12: selectOpposition. Per the SPEC DELTA (DECISIONS.md ADR-020, dated
// 2026-07-12) selectOpposition dropped its `mode` parameter entirely — every
// draft is matchday-framed now, so there is no 'free' mode branch to test.
// Adapted battery: selectOpposition NEVER returns neutral (structurally
// excluded from the candidate pool); deterministic per seed; JSON-reordered
// config yields identical selection (sort guard); a seed sweep hits every
// non-neutral archetype at least once.
// ---------------------------------------------------------------------------

function oppositionConfig(oppositions: OppositionDef[]): ThresholdConfig {
  return {
    version: 4,
    referenceFormation: '4-3-3',
    minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
    formations: [{ id: '4-3-3', label: '4-3-3', description: '', minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 } }],
    ratingScale: { min: 1, max: 100 },
    bands: [{ id: 'fb', priority: 0, label: 'FALL', fallback: true }],
    profiles: { '4-3-3': PROFILE },
    oppositions,
  };
}

const OPP_A: OppositionDef = { id: 'aaa', label: 'A', tagline: 'a', weightMods: { pace: 1.2 } };
const OPP_B: OppositionDef = { id: 'bbb', label: 'B', tagline: 'b', weightMods: { strength: 1.2 } };
const OPP_C: OppositionDef = { id: 'ccc', label: 'C', tagline: 'c', weightMods: { accuracy: 1.2 } };
const NEUTRAL: OppositionDef = { id: 'neutral', label: 'NEUTRAL', tagline: 'n', weightMods: {} };

describe('selectOpposition — test12: opposition selection', () => {
  it('never returns neutral (structurally excluded from the candidate pool)', () => {
    const config = oppositionConfig([NEUTRAL, OPP_A, OPP_B, OPP_C]);
    for (let seed = 0; seed < 20; seed++) {
      expect(selectOpposition(config, seed).id).not.toBe('neutral');
    }
  });

  it('is deterministic per seed', () => {
    const config = oppositionConfig([NEUTRAL, OPP_A, OPP_B, OPP_C]);
    expect(selectOpposition(config, 7).id).toBe(selectOpposition(config, 7).id);
    expect(selectOpposition(config, 7)).toEqual(selectOpposition(config, 7));
  });

  it('JSON-reordered config yields identical selection (sort guard)', () => {
    const inOrder = oppositionConfig([NEUTRAL, OPP_A, OPP_B, OPP_C]);
    const reordered = oppositionConfig([OPP_C, NEUTRAL, OPP_B, OPP_A]);
    for (let seed = 0; seed < 10; seed++) {
      expect(selectOpposition(reordered, seed)).toEqual(selectOpposition(inOrder, seed));
    }
  });

  it('a seed sweep hits every non-neutral archetype at least once', () => {
    const config = oppositionConfig([NEUTRAL, OPP_A, OPP_B, OPP_C]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      seen.add(selectOpposition(config, seed).id);
    }
    expect(seen).toEqual(new Set(['aaa', 'bbb', 'ccc']));
  });

  it('falls back to neutral when the catalog has zero non-neutral entries (defensive)', () => {
    const config = oppositionConfig([NEUTRAL]);
    expect(selectOpposition(config, 5).id).toBe('neutral');
  });
});

// ---------------------------------------------------------------------------
// test13: minFit emission rule (absent / 0 / >0) + integer margins.
// ---------------------------------------------------------------------------

describe('evaluateBandPredicates — test13: minFit emission rule', () => {
  const CONFIG: ThresholdConfig = oppositionConfig([NEUTRAL, OPP_A]);

  function scoreInputWithFit(fit: number) {
    return computeScoreInput([], POSITION_MAP, ZERO_CEILING, fit, 'neutral');
  }

  it('minFit absent (undefined) => no minFit predicate emitted', () => {
    const band: BandDef = { id: 'x', priority: 1, label: 'X', requireAllBucketsNonEmpty: false };
    const results = evaluateBandPredicates(band, scoreInputWithFit(50), CONFIG);
    expect(results.some((p) => p.name === 'minFit')).toBe(false);
  });

  it('minFit = 0 (Wave A placeholder) => no minFit predicate emitted', () => {
    const band: BandDef = { id: 'x', priority: 1, label: 'X', minFit: 0 };
    const results = evaluateBandPredicates(band, scoreInputWithFit(0), CONFIG);
    expect(results.some((p) => p.name === 'minFit')).toBe(false);
  });

  it('minFit > 0 => emitted with required/actual/passed and integer margin', () => {
    const band: BandDef = { id: 'x', priority: 1, label: 'X', minFit: 60 };
    const passing = evaluateBandPredicates(band, scoreInputWithFit(65), CONFIG);
    const fitResultPass = passing.find((p) => p.name === 'minFit')!;
    expect(fitResultPass).toEqual({ name: 'minFit', required: 60, actual: 65, passed: true });
    expect(Number.isInteger(fitResultPass.required - fitResultPass.actual)).toBe(true);

    const failing = evaluateBandPredicates(band, scoreInputWithFit(55), CONFIG);
    const fitResultFail = failing.find((p) => p.name === 'minFit')!;
    expect(fitResultFail).toEqual({ name: 'minFit', required: 60, actual: 55, passed: false });
    expect(fitResultFail.required - fitResultFail.actual).toBe(5); // integer margin
  });
});

// ---------------------------------------------------------------------------
// test14: boundary flip — fit = required-1 / required / required+1 flips the
// band exactly at the gate; explainScoreBand ≡ scoreBand retained.
// ---------------------------------------------------------------------------

describe('scoreBand / explainScoreBand — test14: minFit boundary flip', () => {
  const TOP: BandDef = { id: 'TOP', priority: 100, label: 'TOP', minFit: 70 };
  const FALLBACK: BandDef = { id: 'FB', priority: 0, label: 'FB', fallback: true };
  const CONFIG: ThresholdConfig = { ...oppositionConfig([NEUTRAL]), bands: [TOP, FALLBACK] };

  it('fit one below required misses TOP; at required and above required awards TOP; explainScoreBand agrees throughout', () => {
    for (const fit of [69, 70, 71]) {
      const input = computeScoreInput([], POSITION_MAP, ZERO_CEILING, fit, 'neutral');
      const scored = scoreBand(input, CONFIG);
      const explained = explainScoreBand(input, CONFIG);
      expect(explained.bandId).toBe(scored.bandId);
      if (fit < 70) {
        expect(scored.bandId).toBe('FB');
      } else {
        expect(scored.bandId).toBe('TOP');
      }
    }
  });
});

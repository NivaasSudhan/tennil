/**
 * tests/sessionCeiling.test.ts — computeSessionCeiling DP properties (ADR-019).
 *
 * (a) ceiling >= any legal draft's total, sampled from 25 real seeded greedy sims.
 * (b) efficiency 1.0 is attainable by construction (a scripted draft that hits the
 *     ceiling exactly makes minEfficiency:100 pass).
 * (c) a round that contributes nothing (the "skipped" reveal) never inflates or
 *     changes the ceiling.
 * (d) the person rule (ADR-018) is respected: two era-instances of the same
 *     normalized name across different rounds count as ONE person, so the DP
 *     cannot double-dip — it falls back to the best achievable partial fill.
 * (e) determinism: same inputs -> deep-equal output, always.
 */

import { describe, expect, it } from 'vitest';
import { computeSessionCeiling } from '../src/domain/scoring/sessionCeiling';
import { personKey } from '../src/domain/draft/person';
import { computeScoreInput, evaluateBandPredicates } from '../src/domain/scoring/scoreBand';
import { startDraft, pick, getFinalXI } from '../src/domain/draft/session';
import { mulberry32 } from '../src/lib/rng';
import { loadGameDataFromDisk, runSingleDraft } from '../scripts/simulate';
import type {
  BandDef,
  GameData,
  Player,
  PositionBucket,
  PositionMap,
  Squad,
  ThresholdConfig,
} from '../src/domain/types';

const POSITION_MAP: PositionMap = { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' };
const RAW_FOR_BUCKET: Record<PositionBucket, string> = { GK: 'GK', DEF: 'CB', MID: 'CM', ATT: 'ST' };

function player(id: string, name: string, bucket: PositionBucket, rating: number): Player {
  return { id, name, positionRaw: RAW_FOR_BUCKET[bucket], positionBucket: bucket, rating };
}

// ---------------------------------------------------------------------------
// (a) ceiling >= any legal draft — real corpus, real greedy bot, 25 seeds.
// ---------------------------------------------------------------------------

describe('computeSessionCeiling: (a) upper-bound property on real drafts', () => {
  it('ceiling.total >= the actual finalXI total for 25 seeded greedy drafts', () => {
    const data = loadGameDataFromDisk();
    for (let seed = 1; seed <= 25; seed++) {
      const result = runSingleDraft(data, seed, 'greedy', 84);
      const userTotal = result.finalXI.reduce((sum, p) => sum + p.rating, 0);
      expect(result.scoreInput.ceiling.total).toBeGreaterThanOrEqual(userTotal);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) efficiency 1.0 attainable by construction — synthetic corpus, scripted pick.
// One "good" player per squad, wildly better than its 10 filler teammates, so an
// always-take-the-best-in-reveal bot necessarily reaches the DP optimum.
// ---------------------------------------------------------------------------

const GOOD_SPEC: { bucket: PositionBucket; rating: number }[] = [
  { bucket: 'GK', rating: 90 },
  { bucket: 'DEF', rating: 85 },
  { bucket: 'DEF', rating: 84 },
  { bucket: 'DEF', rating: 83 },
  { bucket: 'DEF', rating: 82 },
  { bucket: 'MID', rating: 88 },
  { bucket: 'MID', rating: 87 },
  { bucket: 'MID', rating: 86 },
  { bucket: 'ATT', rating: 95 },
  { bucket: 'ATT', rating: 94 },
  { bucket: 'ATT', rating: 93 },
];
const FORMATION_COUNTS: Record<PositionBucket, number> = { GK: 1, DEF: 4, MID: 3, ATT: 3 };

/** One squad per GOOD_SPEC entry: a single standout player + 10 rating-1 filler. */
function buildOneGoodPerSquadCorpus(): Squad[] {
  return GOOD_SPEC.map((spec, si) => {
    const id = `sq${si}`;
    const good = player(`${id}-good`, `${id} star`, spec.bucket, spec.rating);
    const filler = Array.from({ length: 10 }, (_, i) =>
      player(`${id}-f${i}`, `${id} filler ${i}`, (['GK', 'DEF', 'MID', 'ATT'] as PositionBucket[])[i % 4], 1),
    );
    return { id, country: id, year: 2000 + si, players: [good, ...filler] };
  });
}

function makeGameData(squads: Squad[]): GameData {
  const thresholds: ThresholdConfig = {
    version: 3,
    referenceFormation: '4-3-3',
    minCounts: FORMATION_COUNTS,
    formations: [{ id: '4-3-3', label: '4-3-3', description: 'test', minCounts: FORMATION_COUNTS }],
    ratingScale: { min: 1, max: 100 },
    bands: [{ id: 'fallback', priority: 0, label: 'FALL', fallback: true }],
  };
  return {
    squads,
    positionMap: POSITION_MAP,
    thresholds,
    commentary: { version: 1, scripts: { fallback: { beats: [] } } },
  };
}

describe('computeSessionCeiling: (b) efficiency 1.0 attainable by construction', () => {
  it('a scripted always-take-the-best draft hits the ceiling exactly -> minEfficiency 100 passes', () => {
    const squads = buildOneGoodPerSquadCorpus();
    const data = makeGameData(squads);
    const squadsById = Object.fromEntries(squads.map((s) => [s.id, s]));

    const rng = mulberry32(2026);
    let session = startDraft(data, rng);
    while (session.phase !== 'COMPLETE') {
      const reveal = session.currentReveal!;
      const best = [...reveal.players].sort((a, b) => b.rating - a.rating)[0];
      session = pick(session, data, best.id, rng);
    }

    const finalXI = getFinalXI(session);
    const ceiling = computeSessionCeiling(session.revealLog, squadsById, FORMATION_COUNTS, POSITION_MAP, personKey);

    const expectedTotal = GOOD_SPEC.reduce((sum, s) => sum + s.rating, 0);
    expect(ceiling.total).toBe(expectedTotal);

    const scoreInput = computeScoreInput(finalXI, POSITION_MAP, ceiling);
    const userTotal = (['GK', 'DEF', 'MID', 'ATT'] as PositionBucket[]).reduce(
      (sum, b) => sum + scoreInput.bucketSums[b],
      0,
    );
    expect(userTotal).toBe(expectedTotal); // the scripted draft reached the ceiling exactly

    const band: BandDef = { id: 'PERFECT', priority: 100, label: 'PERFECT', minEfficiency: 100 };
    const [result] = evaluateBandPredicates(band, scoreInput, data.thresholds);
    expect(result).toEqual({ name: 'minEfficiency', required: 100, actual: 100, passed: true });
  });
});

// ---------------------------------------------------------------------------
// (c) a contributionless round never changes the ceiling.
// ---------------------------------------------------------------------------

describe('computeSessionCeiling: (c) skip round contributes nothing', () => {
  it('an extra all-filler round (standing in for the skipped reveal) leaves the ceiling unchanged', () => {
    const squads = buildOneGoodPerSquadCorpus();
    const squadsById = Object.fromEntries(squads.map((s) => [s.id, s]));
    const revealLogWithout = squads.map((s) => s.id);

    // A weak "skip" squad: every player rating 1 -- the format is already exactly
    // saturated by the 11 real squads, so this round can NEVER help.
    const skipSquad: Squad = {
      id: 'skip-squad',
      country: 'skip',
      year: 1999,
      players: Array.from({ length: 11 }, (_, i) =>
        player(`skip-p${i}`, `skip filler ${i}`, (['GK', 'DEF', 'MID', 'ATT'] as PositionBucket[])[i % 4], 1),
      ),
    };
    squadsById[skipSquad.id] = skipSquad;
    const revealLogWith = [skipSquad.id, ...revealLogWithout];

    const without = computeSessionCeiling(revealLogWithout, squadsById, FORMATION_COUNTS, POSITION_MAP, personKey);
    const withSkip = computeSessionCeiling(revealLogWith, squadsById, FORMATION_COUNTS, POSITION_MAP, personKey);

    expect(withSkip).toEqual(without);
  });
});

// ---------------------------------------------------------------------------
// (d) person rule: two era-instances of the same name can only be used once.
// ---------------------------------------------------------------------------

describe('computeSessionCeiling: (d) person rule respected', () => {
  it('two rounds offering the SAME person can only count once, even with room for both', () => {
    const attOnly: Record<PositionBucket, number> = { GK: 0, DEF: 0, MID: 0, ATT: 2 };

    const roundA: Squad = {
      id: 'era-a',
      country: 'x',
      year: 2010,
      players: [player('era-a-star', 'Star Player', 'ATT', 80)],
    };
    const roundB: Squad = {
      id: 'era-b',
      country: 'x',
      year: 2018,
      players: [player('era-b-star', 'star   player', 'ATT', 90)], // same personKey, different era/id/rating
    };
    const squadsById = { [roundA.id]: roundA, [roundB.id]: roundB };
    const revealLog = [roundA.id, roundB.id];

    const ceiling = computeSessionCeiling(revealLog, squadsById, attOnly, POSITION_MAP, personKey);

    // If the person rule were ignored, both would be taken: total 170, ATT 170.
    // Respecting it, only the better (90) instance counts; the 2nd ATT slot has
    // no other candidate, so the DP falls back to the best achievable PARTIAL fill.
    expect(ceiling.total).toBe(90);
    expect(ceiling.bucketSums.ATT).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// (e) determinism.
// ---------------------------------------------------------------------------

describe('computeSessionCeiling: (e) determinism', () => {
  it('identical inputs produce deep-equal output', () => {
    const squads = buildOneGoodPerSquadCorpus();
    const squadsById = Object.fromEntries(squads.map((s) => [s.id, s]));
    const revealLog = squads.map((s) => s.id);

    const a = computeSessionCeiling(revealLog, squadsById, FORMATION_COUNTS, POSITION_MAP, personKey);
    const b = computeSessionCeiling(revealLog, squadsById, FORMATION_COUNTS, POSITION_MAP, personKey);
    expect(a).toEqual(b);
  });

  it('never throws on a degenerate corpus that cannot fill every bucket', () => {
    // A corpus-of-one forces the ADR-003 repeat rule: the same squad is revealed
    // across both rounds (mirroring a real degenerate session), so both of its
    // players are reachable — one pick per round still applies (one round would
    // only ever yield ONE pick, so use two rounds here). Formation wants 4 DEF /
    // 3 ATT but the squad has neither -- best achievable partial fill, no throw.
    const oneSquad: Squad = {
      id: 'lonely',
      country: 'x',
      year: 2000,
      players: [player('lonely-gk', 'GK Only', 'GK', 70), player('lonely-mid', 'Mid Only', 'MID', 75)],
    };
    const squadsById = { [oneSquad.id]: oneSquad };
    const revealLog = [oneSquad.id, oneSquad.id];
    expect(() =>
      computeSessionCeiling(revealLog, squadsById, FORMATION_COUNTS, POSITION_MAP, personKey),
    ).not.toThrow();
    const result = computeSessionCeiling(revealLog, squadsById, FORMATION_COUNTS, POSITION_MAP, personKey);
    expect(result.total).toBe(70 + 75);
    expect(result.bucketSums).toEqual({ GK: 70, DEF: 0, MID: 75, ATT: 0 });
  });

  it('a single-round revealLog yields at most one pick (one pick per round)', () => {
    const oneSquad: Squad = {
      id: 'lonely',
      country: 'x',
      year: 2000,
      players: [player('lonely-gk', 'GK Only', 'GK', 70), player('lonely-mid', 'Mid Only', 'MID', 75)],
    };
    const squadsById = { [oneSquad.id]: oneSquad };
    const result = computeSessionCeiling([oneSquad.id], squadsById, FORMATION_COUNTS, POSITION_MAP, personKey);
    // Only one round -> only one pick, and the DP takes the higher-value one.
    expect(result.total).toBe(75);
    expect(result.bucketSums).toEqual({ GK: 0, DEF: 0, MID: 75, ATT: 0 });
  });

  it('an unknown squad id in revealLog (defensive) is treated as an empty round, never throws', () => {
    expect(() =>
      computeSessionCeiling(['does-not-exist'], {}, FORMATION_COUNTS, POSITION_MAP, personKey),
    ).not.toThrow();
    const result = computeSessionCeiling(['does-not-exist'], {}, FORMATION_COUNTS, POSITION_MAP, personKey);
    expect(result).toEqual({ bucketSums: { GK: 0, DEF: 0, MID: 0, ATT: 0 }, total: 0 });
  });
});

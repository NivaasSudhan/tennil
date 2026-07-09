/**
 * tests/commentary.test.ts — ARCHITECTURE.md §5 commentary slot resolution (T-013).
 *
 * Uses a SYNTHETIC CommentaryConfig built inline — deliberately does NOT depend on
 * src/data/config/commentary.json numbers changing in other tasks. One integration
 * case imports the real commentary.json to prove every slot in every real script
 * resolves with a realistic XI shape.
 */

import { describe, expect, it } from 'vitest';
import { buildCommentary } from '../src/domain/commentary/build';
import REAL_COMMENTARY from '../src/data/config/commentary.json';
import type { CommentaryConfig, FinalXI, Player, PositionBucket, ScoreBand } from '../src/domain/types';

// ---------- synthetic config ----------

const RAW_FOR_BUCKET: Record<PositionBucket, string> = {
  GK: 'GK',
  DEF: 'CB',
  MID: 'CM',
  ATT: 'ST',
};

let idCounter = 0;

function makePlayer(bucket: PositionBucket, rating: number, idSuffix: string): Player {
  idCounter += 1;
  return {
    id: `p${idCounter}-${bucket}-${rating}-${idSuffix}`,
    name: `Player ${idCounter}`,
    positionRaw: RAW_FOR_BUCKET[bucket],
    positionBucket: bucket,
    rating,
  };
}

function buildXI(spec: Partial<Record<PositionBucket, number[]>>, idSuffix = 'x'): FinalXI {
  const xi: Player[] = [];
  for (const bucket of Object.keys(spec) as PositionBucket[]) {
    const ratings = spec[bucket] ?? [];
    ratings.forEach((rating, idx) => {
      xi.push(makePlayer(bucket, rating, `${idSuffix}-${idx}`));
    });
  }
  return xi;
}

function makeConfig(text: string): CommentaryConfig {
  return {
    version: 1,
    scripts: {
      'TEST-BAND': {
        beats: [{ minute: 1, type: 'kickoff', text }],
      },
    },
  };
}

const BAND: ScoreBand = { bandId: 'TEST-BAND', label: 'TEST LABEL' };

// ---------- 1. every slot resolves correctly ----------

describe('buildCommentary', () => {
  it('1. resolves every slot to the expected player name', () => {
    const xi = buildXI(
      {
        GK: [80], // gk
        DEF: [60, 70, 85, 75], // topDef = 85
        MID: [78, 90, 82], // topMid = 90
        ATT: [88, 92, 89], // topAtt = 92, captain = 92 (tie with mid 90? no, 92 > 90)
      },
      'slots',
    );
    // Weakest is the GK at 80? Wait GK 80 is not weakest; DEF 60 is weakest.
    const text =
      'Captain={captain} GK={gk} DEF={topDef} MID={topMid} ATT={topAtt} Weakest={weakest}';
    const config = makeConfig(text);

    const script = buildCommentary(BAND, xi, config);

    expect(script.bandId).toBe('TEST-BAND');
    expect(script.label).toBe('TEST LABEL');
    expect(script.beats).toHaveLength(1);

    const resolved = script.beats[0].text;
    const topAtt = xi.find((p) => p.rating === 92 && p.positionBucket === 'ATT')!;
    const topMid = xi.find((p) => p.rating === 90 && p.positionBucket === 'MID')!;
    const topDef = xi.find((p) => p.rating === 85 && p.positionBucket === 'DEF')!;
    const gk = xi.find((p) => p.positionBucket === 'GK')!;
    const captain = topAtt;
    const weakest = xi.find((p) => p.rating === 60 && p.positionBucket === 'DEF')!;

    expect(resolved).toContain(`Captain=${captain.name}`);
    expect(resolved).toContain(`GK=${gk.name}`);
    expect(resolved).toContain(`DEF=${topDef.name}`);
    expect(resolved).toContain(`MID=${topMid.name}`);
    expect(resolved).toContain(`ATT=${topAtt.name}`);
    expect(resolved).toContain(`Weakest=${weakest.name}`);
  });

  // ---------- 2. rating ties broken by ascending player id ----------

  it('2. rating ties are broken by ascending player id for every slot', () => {
    // Two players at rating 95: ATT id should win captain/topAtt because id sorts earlier.
    const pAttEarly: Player = {
      id: 'a-att-95',
      name: 'Early Attacker',
      positionRaw: 'ST',
      positionBucket: 'ATT',
      rating: 95,
    };
    const pMidTie: Player = {
      id: 'z-mid-95',
      name: 'Late Midfielder',
      positionRaw: 'CM',
      positionBucket: 'MID',
      rating: 95,
    };
    const pGk: Player = {
      id: 'm-gk-90',
      name: 'Keeper',
      positionRaw: 'GK',
      positionBucket: 'GK',
      rating: 90,
    };
    const pDefA: Player = {
      id: 'b-def-88',
      name: 'Defender A',
      positionRaw: 'CB',
      positionBucket: 'DEF',
      rating: 88,
    };
    const pDefB: Player = {
      id: 'c-def-88',
      name: 'Defender B',
      positionRaw: 'CB',
      positionBucket: 'DEF',
      rating: 88,
    };
    const pWeak: Player = {
      id: 'w-weak-50',
      name: 'Weak Link',
      positionRaw: 'CB',
      positionBucket: 'DEF',
      rating: 50,
    };

    const xi = [pAttEarly, pMidTie, pGk, pDefA, pDefB, pWeak];
    const config = makeConfig('captain={captain};topAtt={topAtt};topMid={topMid};topDef={topDef};gk={gk};weakest={weakest}');

    const script = buildCommentary(BAND, xi, config);
    const resolved = script.beats[0].text;

    expect(resolved).toContain(`captain=${pAttEarly.name}`);
    expect(resolved).toContain(`topAtt=${pAttEarly.name}`);
    expect(resolved).toContain(`topMid=${pMidTie.name}`);
    expect(resolved).toContain(`topDef=${pDefA.name}`); // b-def-88 beats c-def-88
    expect(resolved).toContain(`gk=${pGk.name}`);
    expect(resolved).toContain(`weakest=${pWeak.name}`);
  });

  // ---------- 3. empty bucket falls back to captain ----------

  it('3. when a bucket is empty, its slot falls back to the captain name', () => {
    const xi = buildXI({ GK: [80], DEF: [85, 84], MID: [90, 88] }, 'noatt');
    // Highest rating is MID 90 -> captain.
    const config = makeConfig('topAtt={topAtt}; captain={captain}');

    const script = buildCommentary(BAND, xi, config);
    const resolved = script.beats[0].text;
    const captain = xi.find((p) => p.rating === 90)!;

    expect(resolved).toContain(`topAtt=${captain.name}`);
    expect(resolved).toContain(`captain=${captain.name}`);
  });

  // ---------- 4. determinism ----------

  it('4. two calls with the same inputs produce deep-equal outputs', () => {
    const xi = buildXI({ GK: [80], DEF: [85], MID: [90], ATT: [88] }, 'det');
    const config = makeConfig('{captain} and {weakest} walk out together.');

    const s1 = buildCommentary(BAND, xi, config);
    const s2 = buildCommentary(BAND, xi, config);

    expect(s1).toEqual(s2);
  });

  // ---------- 5. real commentary.json + realistic XI leaves no slots unresolved ----------

  it('5. real commentary scripts with a realistic XI contain no unresolved slots', () => {
    const xi: FinalXI = [
      makePlayer('GK', 85, 'real'),
      ...[80, 82, 84, 78].map((r, i) => makePlayer('DEF', r, `real-${i}`)),
      ...[86, 88, 84].map((r, i) => makePlayer('MID', r, `real-${i}`)),
      ...[90, 87, 89].map((r, i) => makePlayer('ATT', r, `real-${i}`)),
    ];

    for (const [bandId, scriptDef] of Object.entries(REAL_COMMENTARY.scripts)) {
      const band: ScoreBand = { bandId, label: 'Real Label' };
      const script = buildCommentary(band, xi, REAL_COMMENTARY as CommentaryConfig);

      expect(script.bandId).toBe(bandId);
      expect(script.label).toBe('Real Label');
      expect(script.beats).toHaveLength(scriptDef.beats.length);

      for (const beat of script.beats) {
        expect(beat.text).not.toContain('{');
      }
    }
  });

  // ---------- 6. inputs are not mutated ----------

  it('6. does not mutate the input xi, band, or config', () => {
    const xi = buildXI({ GK: [80], DEF: [85], MID: [90], ATT: [88] }, 'mut');
    const config = makeConfig('{captain} is the captain.');
    const xiBefore = JSON.stringify(xi);
    const bandBefore = JSON.stringify(BAND);
    const configBefore = JSON.stringify(config);

    buildCommentary(BAND, xi, config);

    expect(JSON.stringify(xi)).toBe(xiBefore);
    expect(JSON.stringify(BAND)).toBe(bandBefore);
    expect(JSON.stringify(config)).toBe(configBefore);
  });
});

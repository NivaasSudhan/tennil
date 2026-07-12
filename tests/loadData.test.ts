/**
 * tests/loadData.test.ts — ARCHITECTURE.md §6/§7 failure modes (T-004).
 *
 * Happy path imports the REAL vendored JSON files. Failure cases build corrupted
 * variants in-memory (deep clone of the real data, then break one thing) — nothing
 * corrupt is ever written to disk.
 */

import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/domain/loadData';
import { DataValidationError } from '../src/domain/types';

import squadsJson from '../src/data/squads/squads.json';
import thresholdsJson from '../src/data/config/thresholds.json';
import commentaryJson from '../src/data/config/commentary.json';
import positionMapJson from '../src/data/position-map.json';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface RawBundle {
  squads: unknown;
  thresholds: unknown;
  commentary: unknown;
  positionMap: unknown;
}

/** Builds a fresh valid raw bundle (deep-cloned from the real files) for mutation. */
function validRaw(): RawBundle {
  return {
    squads: clone(squadsJson),
    thresholds: clone(thresholdsJson),
    commentary: clone(commentaryJson),
    positionMap: clone(positionMapJson),
  };
}

function expectRejects(raw: RawBundle, matcher: (problems: string[]) => void) {
  let caught: unknown;
  try {
    loadGameData(raw);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DataValidationError);
  const err = caught as DataValidationError;
  expect(err.problems.length).toBeGreaterThan(0);
  matcher(err.problems);
}

describe('loadGameData — happy path', () => {
  it('loads the real vendored JSON files cleanly', () => {
    const data = loadGameData(validRaw());
    expect(data.squads).toHaveLength(60);
    const totalPlayers = data.squads.reduce((n, s) => n + s.players.length, 0);
    expect(totalPlayers).toBe(660);
    expect(data.thresholds.version).toBe(4);
    expect(data.commentary.version).toBe(1);
    expect(Object.keys(data.positionMap).length).toBeGreaterThan(0);
  });

  it('ADR-020: thresholds v4 profiles cover every formation and oppositions include neutral', () => {
    const data = loadGameData(validRaw());
    for (const formation of data.thresholds.formations) {
      const profile = data.thresholds.profiles[formation.id];
      expect(profile, `profile for formation ${formation.id}`).toBeDefined();
      for (const bucket of ['DEF', 'MID', 'ATT'] as const) {
        expect(profile[bucket].weights).toEqual(
          expect.objectContaining({ pace: expect.any(Number), strength: expect.any(Number), accuracy: expect.any(Number) }),
        );
        expect(profile[bucket].targets).toEqual(
          expect.objectContaining({ pace: expect.any(Number), strength: expect.any(Number), accuracy: expect.any(Number) }),
        );
      }
    }
    expect(data.thresholds.oppositions.length).toBeGreaterThan(0);
    expect(data.thresholds.oppositions.some((o) => o.id === 'neutral')).toBe(true);
  });
});

describe('loadGameData — failure modes (ARCHITECTURE.md §6)', () => {
  it('rejects malformed top-level shapes for each input', () => {
    expectRejects({ ...validRaw(), squads: 'not-an-object' }, (problems) => {
      expect(problems.some((p) => p.startsWith('squads:'))).toBe(true);
    });
    expectRejects({ ...validRaw(), thresholds: null }, (problems) => {
      expect(problems.some((p) => p.startsWith('thresholds:'))).toBe(true);
    });
    expectRejects({ ...validRaw(), commentary: [] }, (problems) => {
      expect(problems.some((p) => p.startsWith('commentary:'))).toBe(true);
    });
    expectRejects({ ...validRaw(), positionMap: 42 }, (problems) => {
      expect(problems.some((p) => p.startsWith('positionMap:'))).toBe(true);
    });
  });

  it('rejects a squad with 10 players instead of 11', () => {
    const raw = validRaw();
    const squad = (raw.squads as { squads: { id: string; players: unknown[] }[] }).squads[0];
    squad.players.pop();
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p === `squad ${squad.id}: 10 players (expected 11)`)).toBe(true);
    });
  });

  it('rejects a duplicate player id across squads', () => {
    const raw = validRaw();
    const squads = (raw.squads as { squads: { players: { id: string }[] }[] }).squads;
    const dupeId = squads[0].players[0].id;
    squads[1].players[0].id = dupeId;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${dupeId}: duplicate player id`))).toBe(true);
    });
  });

  it('rejects rating 0 (below range)', () => {
    const raw = validRaw();
    const squads = (raw.squads as { squads: { players: { id: string; rating: number }[] }[] }).squads;
    const player = squads[0].players[0];
    player.rating = 0;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${player.id}: rating 0 outside allowed range`))).toBe(true);
    });
  });

  it('rejects rating 101 (above range)', () => {
    const raw = validRaw();
    const squads = (raw.squads as { squads: { players: { id: string; rating: number }[] }[] }).squads;
    const player = squads[0].players[0];
    player.rating = 101;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${player.id}: rating 101 outside allowed range`))).toBe(true);
    });
  });

  it('rejects rating 85.5 (non-integer)', () => {
    const raw = validRaw();
    const squads = (raw.squads as { squads: { players: { id: string; rating: number }[] }[] }).squads;
    const player = squads[0].players[0];
    player.rating = 85.5;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${player.id}: rating must be an integer`))).toBe(true);
    });
  });

  it('rejects an unmapped positionRaw', () => {
    const raw = validRaw();
    const squads = (raw.squads as { squads: { players: { id: string; positionRaw: string }[] }[] }).squads;
    const player = squads[0].players[0];
    player.positionRaw = 'XX';
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${player.id}: positionRaw 'XX' not in position map`))).toBe(true);
    });
  });

  it('rejects a positionBucket that mismatches the position map', () => {
    const raw = validRaw();
    const squads = (
      raw.squads as { squads: { players: { id: string; positionRaw: string; positionBucket: string }[] }[] }
    ).squads;
    const player = squads[0].players.find((p) => p.positionRaw !== 'GK')!;
    player.positionBucket = 'GK';
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${player.id}: positionBucket 'GK' does not match position map`))).toBe(
        true,
      );
    });
  });

  it('rejects zero fallback bands', () => {
    const raw = validRaw();
    const bands = (raw.thresholds as { bands: { id: string; fallback?: boolean }[] }).bands;
    const fb = bands.find((b) => b.fallback === true)!;
    fb.fallback = false;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('no band has fallback:true'))).toBe(true);
    });
  });

  it('rejects two fallback bands', () => {
    const raw = validRaw();
    const bands = (raw.thresholds as { bands: { id: string; fallback?: boolean }[] }).bands;
    const nonFallback = bands.find((b) => b.fallback !== true)!;
    nonFallback.fallback = true;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('bands have fallback:true'))).toBe(true);
    });
  });

  it('rejects a band with no matching commentary script', () => {
    const raw = validRaw();
    const commentary = raw.commentary as { scripts: Record<string, unknown> };
    const bandId = Object.keys(commentary.scripts)[0];
    delete commentary.scripts[bandId];
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p === `band ${bandId}: missing commentary script`)).toBe(true);
    });
  });

  it('rejects a commentary beat with an illegal type', () => {
    const raw = validRaw();
    const commentary = raw.commentary as { scripts: Record<string, { beats: { type: string }[] }> };
    const bandId = Object.keys(commentary.scripts)[0];
    commentary.scripts[bandId].beats[0].type = 'illegal-type';
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`commentary script ${bandId} beat[0]`) && p.includes('illegal-type'))).toBe(
        true,
      );
    });
  });

  it('rejects commentary text with an unknown slot', () => {
    const raw = validRaw();
    const commentary = raw.commentary as { scripts: Record<string, { beats: { text: string }[] }> };
    const bandId = Object.keys(commentary.scripts)[0];
    commentary.scripts[bandId].beats[0].text = 'A wild {striker} appears.';
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`commentary script ${bandId} beat[0]`) && p.includes("unknown slot '{striker}'"))).toBe(
        true,
      );
    });
  });

  it('rejects a wrong top-level version', () => {
    const raw = validRaw();
    (raw.squads as { version: number }).version = 3;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p === 'squads: version must be 1 or 2 (got 3)')).toBe(true);
    });
  });

  it('collects MULTIPLE problems into a single throw', () => {
    const raw = validRaw();
    const squads = (
      raw.squads as { squads: { id: string; players: { id: string; rating: number }[] }[] }
    ).squads;

    // Problem 1: duplicate player id across squads.
    const dupeId = squads[0].players[0].id;
    squads[1].players[0].id = dupeId;

    // Problem 2: an out-of-range rating on an unrelated squad.
    const badRatingPlayer = squads[2].players[1];
    badRatingPlayer.rating = 999;

    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${dupeId}: duplicate player id`))).toBe(true);
      expect(
        problems.some((p) => p.includes(`player ${badRatingPlayer.id}: rating 999 outside allowed range`)),
      ).toBe(true);
      expect(problems.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---------------------------------------------------------------------------
// ADR-020: attrs (squads v1|v2) + profile fit / opposition (thresholds v4).
// Real squads.json stays v1 this wave — dual-accept must hold — so the accept
// direction for squads v2 is a small synthetic bundle built here.
// ---------------------------------------------------------------------------

/** Minimal valid synthetic v2 squad bundle: one squad, 1 GK (no attrs) + 10
 * outfield players (attrs 1-99), reusing the REAL thresholds/commentary/positionMap. */
function validV2Raw(): RawBundle {
  const base = validRaw();
  const outfieldRaw: [string, string][] = [
    ['CB', 'DEF'], ['CB', 'DEF'], ['RB', 'DEF'], ['LB', 'DEF'],
    ['CM', 'MID'], ['CM', 'MID'], ['DM', 'MID'],
    ['ST', 'ATT'], ['ST', 'ATT'], ['RW', 'ATT'],
  ];
  const players = [
    { id: 'v2sq-gk', name: 'Keeper', positionRaw: 'GK', positionBucket: 'GK', rating: 80 },
    ...outfieldRaw.map(([positionRaw, positionBucket], i) => ({
      id: `v2sq-p${i}`,
      name: `Player ${i}`,
      positionRaw,
      positionBucket,
      rating: 75,
      pace: 70 + i,
      strength: 65 + i,
      accuracy: 72 + i,
    })),
  ];
  return {
    ...base,
    squads: { version: 2, squads: [{ id: 'v2sq', country: 'Testland', year: 2000, players }] },
  };
}

describe('loadGameData — ADR-020 squads v2 attrs (both directions)', () => {
  it('accepts a well-formed squads v2 bundle: outfield attrs 1-99, GK carries none', () => {
    const data = loadGameData(validV2Raw());
    const squad = data.squads.find((s) => s.id === 'v2sq')!;
    const gk = squad.players.find((p) => p.positionBucket === 'GK')!;
    expect(gk.pace).toBeUndefined();
    expect(gk.strength).toBeUndefined();
    expect(gk.accuracy).toBeUndefined();
    for (const p of squad.players.filter((pl) => pl.positionBucket !== 'GK')) {
      expect(p.pace).toBeGreaterThanOrEqual(1);
      expect(p.pace).toBeLessThanOrEqual(99);
      expect(p.strength).toBeGreaterThanOrEqual(1);
      expect(p.accuracy).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects squads v1 carrying attrs (attrs are forbidden pre-v2)', () => {
    const raw = validRaw(); // real corpus, version 1
    const squads = (raw.squads as { squads: { players: Record<string, unknown>[] }[] }).squads;
    const player = squads[0].players[0];
    (player as Record<string, unknown>).pace = 80;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('squads v1 must not carry pace/strength/accuracy'))).toBe(true);
    });
  });

  it('rejects squads v2 where an outfield player is missing attrs', () => {
    const raw = validV2Raw();
    const squads = (raw.squads as { squads: { players: Record<string, unknown>[] }[] }).squads;
    const outfielder = squads[0].players.find((p) => p.positionBucket !== 'GK')!;
    delete outfielder.pace;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${outfielder.id}: pace must be an integer 1-99`))).toBe(true);
    });
  });

  it('rejects squads v2 where an outfield attr is out of range (100)', () => {
    const raw = validV2Raw();
    const squads = (raw.squads as { squads: { players: Record<string, unknown>[] }[] }).squads;
    const outfielder = squads[0].players.find((p) => p.positionBucket !== 'GK')!;
    outfielder.strength = 100;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${outfielder.id}: strength must be an integer 1-99`))).toBe(true);
    });
  });

  it('rejects squads v2 where the GK carries an attr', () => {
    const raw = validV2Raw();
    const squads = (raw.squads as { squads: { players: Record<string, unknown>[] }[] }).squads;
    const gk = squads[0].players.find((p) => p.positionBucket === 'GK')!;
    (gk as Record<string, unknown>).pace = 90;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`player ${gk.id}: GK players must not have pace/strength/accuracy`))).toBe(
        true,
      );
    });
  });

  it('real corpus (v1) still loads cleanly when re-flipped to v2 without attrs added (every outfield player rejected)', () => {
    const raw = validRaw();
    (raw.squads as { version: number }).version = 2;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('pace must be an integer 1-99'))).toBe(true);
    });
  });
});

describe('loadGameData — ADR-020 thresholds v4 profiles/oppositions/minFit', () => {
  it('rejects a profile missing for a cataloged formation', () => {
    const raw = validRaw();
    const thresholds = raw.thresholds as { profiles: Record<string, unknown> };
    delete thresholds.profiles['4-4-2'];
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes("missing a profile for formation '4-4-2'"))).toBe(true);
    });
  });

  it('rejects an unknown formation id inside profiles', () => {
    const raw = validRaw();
    const thresholds = raw.thresholds as { profiles: Record<string, unknown> };
    thresholds.profiles['made-up-formation'] = thresholds.profiles['4-3-3'];
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('made-up-formation: not a known formation id'))).toBe(true);
    });
  });

  it('rejects a GK bucket inside a formation profile (GK has no attrs)', () => {
    const raw = validRaw();
    const thresholds = raw.thresholds as {
      profiles: Record<string, Record<string, unknown>>;
    };
    thresholds.profiles['4-3-3'].GK = thresholds.profiles['4-3-3'].DEF;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes("bucket 'GK' is not a valid attr bucket"))).toBe(true);
    });
  });

  it('rejects a profile weight outside [0,1]', () => {
    const raw = validRaw();
    const thresholds = raw.thresholds as {
      profiles: Record<string, Record<string, { weights: Record<string, number> }>>;
    };
    thresholds.profiles['4-3-3'].DEF.weights.pace = 1.5;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('thresholds.profiles.4-3-3.DEF.weights.pace') && p.includes('[0,1]'))).toBe(
        true,
      );
    });
  });

  it('rejects a profile target outside [1,99] or non-integer', () => {
    const raw = validRaw();
    const thresholds = raw.thresholds as {
      profiles: Record<string, Record<string, { targets: Record<string, number> }>>;
    };
    thresholds.profiles['4-3-3'].MID.targets.accuracy = 150;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('thresholds.profiles.4-3-3.MID.targets.accuracy') && p.includes('[1,99]'))).toBe(
        true,
      );
    });
  });

  it('rejects an empty oppositions catalog', () => {
    const raw = validRaw();
    (raw.thresholds as { oppositions: unknown[] }).oppositions = [];
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('thresholds.oppositions: expected a non-empty array'))).toBe(true);
    });
  });

  it("rejects an oppositions catalog with no 'neutral' entry", () => {
    const raw = validRaw();
    const thresholds = raw.thresholds as { oppositions: { id: string }[] };
    thresholds.oppositions = thresholds.oppositions.filter((o) => o.id !== 'neutral');
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes("must include an opposition with id 'neutral'"))).toBe(true);
    });
  });

  it('rejects a duplicate opposition id', () => {
    const raw = validRaw();
    const thresholds = raw.thresholds as { oppositions: { id: string }[] };
    thresholds.oppositions[1].id = thresholds.oppositions[0].id;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('duplicate opposition id'))).toBe(true);
    });
  });

  it('rejects an unknown weightMods key on an opposition', () => {
    const raw = validRaw();
    const thresholds = raw.thresholds as { oppositions: { weightMods: Record<string, number> }[] };
    thresholds.oppositions[0].weightMods.stamina = 1.2;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes("weightMods key 'stamina' is not a valid attr name"))).toBe(true);
    });
  });

  it('rejects minFit outside [0,100]', () => {
    const raw = validRaw();
    const bands = (raw.thresholds as { bands: { id: string; minFit?: number }[] }).bands;
    const band = bands.find((b) => b.id === '10-0')!;
    band.minFit = 150;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes(`band ${band.id}: minFit must be an integer in [0,100]`))).toBe(true);
    });
  });

  it('rejects minFit configured on more than 3 bands', () => {
    const raw = validRaw();
    const bands = (raw.thresholds as { bands: { id: string; minFit?: number }[] }).bands;
    // Real config already has minFit on the top 3 bands (10-0/7-1/5-0); add a 4th.
    const fourthBand = bands.find((b) => b.id === '4-1')!;
    fourthBand.minFit = 0;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('minFit configured on 4 bands'))).toBe(true);
    });
  });
});

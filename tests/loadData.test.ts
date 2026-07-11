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
    expect(data.thresholds.version).toBe(3);
    expect(data.commentary.version).toBe(1);
    expect(Object.keys(data.positionMap).length).toBeGreaterThan(0);
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
    (raw.squads as { version: number }).version = 2;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p === 'squads: version must be 1 (got 2)')).toBe(true);
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

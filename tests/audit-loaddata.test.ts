/**
 * tests/audit-loaddata.test.ts — edge-case audit of loadGameData validation
 * (ADR-005; ARCHITECTURE.md §6).
 *
 * SYNTHETIC raw bundles built inline — never imports the vendored squads.json
 * or any real config file. Covers: malformed entries COLLECTED (not fail-fast
 * on the first), boundary ratings (at and one past each end), duplicate ids
 * (player / squad / band), and cross-section consistency (band→commentary).
 */

import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/domain/loadData';
import { DataValidationError } from '../src/domain/types';

type RawBundle = Parameters<typeof loadGameData>[0];

// ---------------------------------------------------------------------------
// A fully valid synthetic baseline bundle (built fresh each call).
// ---------------------------------------------------------------------------

function validRaw() {
  return {
    positionMap: { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' },
    thresholds: {
      version: 1,
      referenceFormation: 'test-form',
      minCounts: { GK: 1, DEF: 3, MID: 2, ATT: 5 },
      formations: [
        { id: 'test-form', label: 'TestForm', description: 'test', minCounts: { GK: 1, DEF: 3, MID: 2, ATT: 5 } },
      ],
      ratingScale: { min: 1, max: 100 },
      bands: [{ id: 'fb', priority: 0, label: 'FALL', fallback: true }],
      profiles: {
        'test-form': {
          DEF: { weights: { pace: 0.5, strength: 0.5, accuracy: 0.5 }, targets: { pace: 75, strength: 75, accuracy: 75 } },
          MID: { weights: { pace: 0.5, strength: 0.5, accuracy: 0.5 }, targets: { pace: 75, strength: 75, accuracy: 75 } },
          ATT: { weights: { pace: 0.5, strength: 0.5, accuracy: 0.5 }, targets: { pace: 75, strength: 75, accuracy: 75 } },
        },
      },
      oppositions: [{ id: 'neutral', label: 'NEUTRAL', tagline: 'test', weightMods: {} }],
    },
    commentary: {
      version: 1,
      scripts: { fb: { beats: [{ minute: 1, type: 'kickoff', text: 'go' }] } },
    },
    squads: {
      version: 2,
      squads: [squadRaw('sa', 2000), squadRaw('sb', 2001)],
    },
  };
}

/** A well-formed squad: 11 players, exactly 1 GK, mapped buckets. ADR-020 Wave C:
 * squads are v2-only now — every outfield player carries pace/strength/accuracy
 * (1-99), the GK carries none. */
function squadRaw(id: string, year: number) {
  const players = [
    { id: `${id}-gk`, name: 'Keeper', positionRaw: 'GK', positionBucket: 'GK', rating: 80 },
    { id: `${id}-d0`, name: 'D0', positionRaw: 'CB', positionBucket: 'DEF', rating: 75, pace: 70, strength: 80, accuracy: 72 },
    { id: `${id}-d1`, name: 'D1', positionRaw: 'CB', positionBucket: 'DEF', rating: 75, pace: 70, strength: 80, accuracy: 72 },
    { id: `${id}-d2`, name: 'D2', positionRaw: 'CB', positionBucket: 'DEF', rating: 75, pace: 70, strength: 80, accuracy: 72 },
    { id: `${id}-d3`, name: 'D3', positionRaw: 'CB', positionBucket: 'DEF', rating: 75, pace: 70, strength: 80, accuracy: 72 },
    { id: `${id}-m0`, name: 'M0', positionRaw: 'CM', positionBucket: 'MID', rating: 78, pace: 75, strength: 74, accuracy: 80 },
    { id: `${id}-m1`, name: 'M1', positionRaw: 'CM', positionBucket: 'MID', rating: 78, pace: 75, strength: 74, accuracy: 80 },
    { id: `${id}-m2`, name: 'M2', positionRaw: 'CM', positionBucket: 'MID', rating: 78, pace: 75, strength: 74, accuracy: 80 },
    { id: `${id}-a0`, name: 'A0', positionRaw: 'ST', positionBucket: 'ATT', rating: 82, pace: 85, strength: 73, accuracy: 78 },
    { id: `${id}-a1`, name: 'A1', positionRaw: 'ST', positionBucket: 'ATT', rating: 82, pace: 85, strength: 73, accuracy: 78 },
    { id: `${id}-a2`, name: 'A2', positionRaw: 'ST', positionBucket: 'ATT', rating: 82, pace: 85, strength: 73, accuracy: 78 },
  ];
  return { id, country: id.toUpperCase(), year, players };
}

type AnyObj = { [K in keyof RawBundle]: any } & Record<string, any>;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function makeRaw(): RawBundle {
  return clone(validRaw()) as unknown as RawBundle;
}

/** Run loadGameData; if it throws, return the DataValidationError; else null. */
function tryLoad(raw: RawBundle): DataValidationError | null {
  try {
    loadGameData(raw);
  } catch (e) {
    if (e instanceof DataValidationError) return e;
    throw e;
  }
  return null;
}

function expectRejects(raw: RawBundle, match: (problems: string[]) => void) {
  const err = tryLoad(raw);
  expect(err).not.toBeNull();
  expect(err!.problems.length).toBeGreaterThan(0);
  match(err!.problems);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('audit: happy path synthetic bundle', () => {
  it('a well-formed synthetic bundle loads cleanly', () => {
    const data = loadGameData(clone(validRaw()));
    expect(data.squads).toHaveLength(2);
    expect(data.squads.every((s) => s.players.length === 11)).toBe(true);
    expect(Object.keys(data.positionMap)).toHaveLength(4);
    expect(data.thresholds.bands).toHaveLength(1);
    expect(data.thresholds.bands[0].fallback).toBe(true);
  });
});

describe('audit: malformed entries COLLECTED, not fail-fast', () => {
  it('problems across positionMap, thresholds, and squads all surface in one throw', () => {
    const raw = makeRaw() as unknown as AnyObj;
    // positionMap problem: bad value.
    raw.positionMap.CB = 'WRONG';
    // thresholds problem: invalid version.
    raw.thresholds.version = 99;
    // squads problem: short a player.
    raw.squads.squads[0].players.pop();

    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.startsWith('positionMap.CB:'))).toBe(true);
      expect(problems.some((p) => p.startsWith('thresholds: version'))).toBe(true);
      expect(problems.some((p) => p.includes('players (expected 11)'))).toBe(true);
      expect(problems.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('two unrelated problems in DIFFERENT squads are both reported', () => {
    const raw = makeRaw() as unknown as AnyObj;
    // Problem 1: bad rating in squad 0.
    raw.squads.squads[0].players[1].rating = 999;
    // Problem 2: unmapped positionRaw in squad 1.
    raw.squads.squads[1].players[2].positionRaw = 'ZZ';

    expectRejects(raw, (problems) => {
      const ratingProblem = problems.filter((p) =>
        p.startsWith(`player ${raw.squads.squads[0].players[1].id}: rating 999 outside`));
      const posProblem = problems.filter((p) =>
        p.includes(`positionRaw 'ZZ' not in position map`));
      expect(ratingProblem.length).toBe(1);
      expect(posProblem.length).toBe(1);
      expect(problems.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('three problems in three separate config files all collected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.commentary.scripts.fb.beats[0].type = 'bogus'; // commentary
    raw.thresholds.bands[0].priority = 'not-a-number'; // thresholds
    raw.squads.squads[0].players[0].rating = 0; // squads (rating below min)
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('beat[0]') && p.includes('bogus'))).toBe(true);
      expect(problems.some((p) => p.includes("band fb: missing or invalid 'priority'"))).toBe(true);
      expect(problems.some((p) => p.includes('rating 0 outside'))).toBe(true);
    });
  });

  it('validation never short-circuits past an early squad with a fatal flaw', () => {
    // squad 0 completely missing players; squad 1 still checked for a rating fault.
    const raw = makeRaw() as unknown as AnyObj;
    (raw.squads.squads[0] as AnyObj).players = 'not-an-array';
    raw.squads.squads[1].players[5].rating = -5;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes("'players' must be an array"))).toBe(true);
      expect(problems.some((p) => p.includes('rating -5 outside'))).toBe(true);
    });
  });
});

describe('audit: boundary ratings', () => {
  it('ratings exactly at ratingScale.min and ratingScale.max are accepted', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads[0].players[1].rating = 1; // min
    raw.squads.squads[0].players[2].rating = 100; // max
    expect(() => loadGameData(raw)).not.toThrow();
  });

  it('one below the min (rating 0) is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads[0].players[1].rating = 0;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('rating 0 outside allowed range 1-100'))).toBe(true);
    });
  });

  it('one above the max (rating 101) is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads[0].players[1].rating = 101;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('rating 101 outside allowed range 1-100'))).toBe(true);
    });
  });

  it('a non-integer rating (85.5) is rejected even within range', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads[0].players[1].rating = 85.5;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('rating must be an integer'))).toBe(true);
    });
  });

  it('a custom ratingScale enforces its own endpoints', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.thresholds.ratingScale = { min: 50, max: 60 };
    raw.squads.squads[0].players[1].rating = 50; // ok
    raw.squads.squads[0].players[2].rating = 60; // ok
    raw.squads.squads[0].players[3].rating = 49; // below
    raw.squads.squads[0].players[4].rating = 61; // above
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('rating 49 outside allowed range 50-60'))).toBe(true);
      expect(problems.some((p) => p.includes('rating 61 outside allowed range 50-60'))).toBe(true);
    });
  });

  it('a malformed ratingScale itself is reported and bounds default to 1-100', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.thresholds.ratingScale = 'bad';
    // rating 100 still <= 100 (fallback) so squads may pass; the ratingScale error alone throws.
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.startsWith('thresholds.ratingScale:'))).toBe(true);
    });
  });
});

describe('audit: duplicate ids', () => {
  it('a duplicate PLAYER id across squads is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads[1].players[0].id = raw.squads.squads[0].players[0].id;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('duplicate player id'))).toBe(true);
    });
  });

  it('a duplicate SQUAD id is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads[1].id = raw.squads.squads[0].id;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('duplicate squad id'))).toBe(true);
    });
  });

  it('a duplicate BAND id is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.thresholds.bands.push({
      id: 'fb', priority: 5, label: 'DUP', fallback: false,
    });
    raw.commentary.scripts.fb2 = clone(raw.commentary.scripts.fb); // ensure fb2 only if needed
    // The duplicate 'fb' itself triggers rejection regardless of commentary.
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('band fb: duplicate band id'))).toBe(true);
    });
  });

  it('a player id colliding WITHIN the same squad is also caught (corpus-unique)', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads[0].players[1].id = raw.squads.squads[0].players[0].id;
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('duplicate player id'))).toBe(true);
    });
  });
});

describe('audit: cross-section band↔commentary consistency', () => {
  it('a band id with no commentary script is reported', () => {
    const raw = makeRaw() as unknown as AnyObj;
    // Add a second band; comment will lack its script.
    raw.thresholds.bands.push({ id: 'extra', priority: 10, label: 'X' });
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p === 'band extra: missing commentary script')).toBe(true);
    });
  });

  it('zero and multiple fallback bands are both rejected', () => {
    const zero = makeRaw() as unknown as AnyObj;
    delete (zero.thresholds.bands[0] as AnyObj).fallback;
    expectRejects(zero, (p) =>
      expect(p.some((m) => m.includes('no band has fallback:true'))).toBe(true));

    const multi = makeRaw() as unknown as AnyObj;
    multi.thresholds.bands.push({ id: 'fb2', priority: 1, label: 'F2', fallback: true });
    multi.commentary.scripts.fb2 = clone(multi.commentary.scripts.fb);
    expectRejects(multi, (p) =>
      expect(p.some((m) => m.includes('bands have fallback:true'))).toBe(true));
  });
});

describe('audit: structural edge cases', () => {
  it('a squad with exactly 11 players but ZERO GKs is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    // Reclassify the lone GK as a DEF.
    raw.squads.squads[0].players[0].positionRaw = 'CB';
    raw.squads.squads[0].players[0].positionBucket = 'DEF';
    expectRejects(raw, (problems) => {
      expect(problems.some((p) =>
        p.includes('0 GK-bucket players (expected exactly 1)'))).toBe(true);
    });
  });

  it('a squad with exactly 11 players but TWO GKs is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    // Make the first outfield player a second GK.
    raw.squads.squads[0].players[1].positionRaw = 'GK';
    raw.squads.squads[0].players[1].positionBucket = 'GK';
    expectRejects(raw, (problems) => {
      expect(problems.some((p) =>
        p.includes('2 GK-bucket players (expected exactly 1)'))).toBe(true);
    });
  });

  it('a player whose positionBucket disagrees with the position map is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads[0].players[1].positionRaw = 'CB';
    raw.squads.squads[0].players[1].positionBucket = 'MID'; // map says DEF
    expectRejects(raw, (problems) => {
      expect(problems.some((p) =>
        p.includes("positionBucket 'MID' does not match position map"))).toBe(true);
    });
  });

  it('unknown extra keys prefixed with _ are ignored, not errors', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.positionMap._comment = 'ignored';
    raw.commentary._meta = 'ignored';
    (raw.squads as AnyObj)._versionNote = 'ignored';
    expect(() => loadGameData(raw)).not.toThrow();
  });

  it('an empty squads array is rejected', () => {
    const raw = makeRaw() as unknown as AnyObj;
    raw.squads.squads = [];
    expectRejects(raw, (problems) => {
      expect(problems.some((p) => p.includes('squads.squads: expected a non-empty array'))).toBe(true);
    });
  });
});
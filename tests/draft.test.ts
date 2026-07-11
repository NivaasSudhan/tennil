import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/lib/rng';
import {
  startDraft,
  pick,
  skip,
  getFinalXI,
} from '../src/domain/draft/session';
import { IllegalActionError } from '../src/domain/types';
import type {
  DraftSession,
  GameData,
  PositionBucket,
  Player,
  Squad,
} from '../src/domain/types';

// ---------------------------------------------------------------------------
// Synthetic GameData — 3..8 small squads built inline (do NOT import squads.json;
// another agent owns that file). Shapes match ARCHITECTURE.md §5 (11 players/squad,
// 1 GK, buckets in {GK,DEF,MID,ATT}, positionRaw mapped, ratings 1..100 ints).
// ---------------------------------------------------------------------------

const RAW_FOR_BUCKET: Record<PositionBucket, string> = {
  GK: 'GK',
  DEF: 'CB',
  MID: 'CM',
  ATT: 'ST',
};

// 4-3-3 shape: exactly one GK per squad.
const SQUAD_SHAPE: PositionBucket[] = [
  'GK',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'MID',
  'MID',
  'MID',
  'ATT',
  'ATT',
  'ATT',
];

function makeSquad(id: string, country: string, year: number): Squad {
  const players: Player[] = SQUAD_SHAPE.map((bucket, i) => ({
    id: `${id}-p${i}`,
    name: `${id} player ${i}`,
    positionRaw: RAW_FOR_BUCKET[bucket],
    positionBucket: bucket,
    rating: 70 + i, // 70..80, all valid 1..100 ints
  }));
  return { id, country, year, players };
}

function makeData(squads: Squad[]): GameData {
  return {
    squads,
    positionMap: { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' },
    thresholds: {
      version: 1,
      referenceFormation: 'draft-test',
      minCounts: { GK: 1, DEF: 3, MID: 2, ATT: 5 },
      formations: [
        { id: 'draft-test', label: 'DraftTest', description: 'test-only shape, not real', minCounts: { GK: 1, DEF: 3, MID: 2, ATT: 5 } },
      ],
      ratingScale: { min: 1, max: 100 },
      bands: [{ id: 'fallback', priority: 0, label: 'MATCH', fallback: true }],
    },
    commentary: { version: 1, scripts: { fallback: { beats: [] } } },
  };
}

function corpus(n: number): GameData {
  const squads = Array.from({ length: n }, (_, i) =>
    makeSquad(`sq${i}-${1900 + i}`, `Country${i}`, 1900 + i),
  );
  return makeData(squads);
}

// ---------------------------------------------------------------------------
// Invariant harness (ARCHITECTURE.md §4 / ADR-003) — called after EVERY transition.
// ---------------------------------------------------------------------------

function assertInvariants(session: DraftSession): void {
  const {
    roundsPlayed,
    picks,
    skipRemaining,
    phase,
    seenSquadIds,
    excludedSquadIds,
    breachLog,
  } = session;

  // Core arithmetic invariant.
  const expected =
    picks.length + (1 - skipRemaining) + (phase === 'AWAIT_PICK' ? 1 : 0);
  expect(roundsPlayed).toBe(expected);

  // No duplicate player ids in picks.
  const pickIds = picks.map((p) => p.id);
  expect(new Set(pickIds).size).toBe(pickIds.length);

  // seenSquadIds may contain duplicates ONLY when a breach was recorded.
  const seenSet = new Set(seenSquadIds);
  if (seenSet.size !== seenSquadIds.length) {
    expect(breachLog.length).toBeGreaterThan(0);
  }

  // seenSquadIds length always equals roundsPlayed (one draw per round).
  expect(seenSquadIds.length).toBe(roundsPlayed);

  // Product = one skip token → at most one permanent exclude entry.
  expect(excludedSquadIds).toBeDefined();
  expect(excludedSquadIds.length).toBeLessThanOrEqual(1);

  if (phase === 'COMPLETE') {
    expect(picks.length).toBe(11);
    expect(roundsPlayed).toBe(11 + (1 - skipRemaining));
    expect(session.currentReveal).toBeNull();
  } else {
    expect(session.currentReveal).not.toBeNull();
    expect(picks.length).toBeLessThan(11);
  }
}

// Pick the first player in the current reveal not already picked.
function firstPickable(session: DraftSession): string {
  const reveal = session.currentReveal;
  if (!reveal) throw new Error('no current reveal to pick from');
  const pickedIds = new Set(session.picks.map((p) => p.id));
  const available = reveal.players.find((p) => !pickedIds.has(p.id));
  if (!available) throw new Error('no pickable player in reveal (unexpected)');
  return available.id;
}

// Drive to COMPLETE by picking first-available each round; asserts invariants
// after every transition and returns the ordered history of sessions.
function driveToComplete(
  data: GameData,
  seed: number,
): DraftSession[] {
  const rng = mulberry32(seed);
  let session = startDraft(data, rng);
  const history: DraftSession[] = [session];
  assertInvariants(session);

  while (session.phase !== 'COMPLETE') {
    session = pick(session, data, firstPickable(session), rng);
    history.push(session);
    assertInvariants(session);
  }
  return history;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('draft state machine (T-007)', () => {
  it('1. full no-skip draft: 11 picks and roundsPlayed === 11 at COMPLETE', () => {
    const data = corpus(7);
    const history = driveToComplete(data, 12345);
    const final = history[history.length - 1];

    expect(final.phase).toBe('COMPLETE');
    expect(final.picks.length).toBe(11);
    expect(final.roundsPlayed).toBe(11);
    expect(final.skipRemaining).toBe(1); // never skipped
    expect(final.currentReveal).toBeNull();
  });

  it('2. full draft with one skip: 12 rounds at COMPLETE, still exactly 11 picks', () => {
    const data = corpus(7);
    const rng = mulberry32(777);

    let session = startDraft(data, rng);
    assertInvariants(session);

    // Skip on the very first round.
    session = skip(session, data, rng);
    assertInvariants(session);
    expect(session.skipRemaining).toBe(0);

    while (session.phase !== 'COMPLETE') {
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }

    expect(session.phase).toBe('COMPLETE');
    expect(session.picks.length).toBe(11);
    expect(session.roundsPlayed).toBe(12);
    expect(session.skipRemaining).toBe(0);
  });

  it('3. skip when skipRemaining === 0 throws', () => {
    const data = corpus(7);
    const rng = mulberry32(42);

    let session = startDraft(data, rng);
    session = skip(session, data, rng); // uses the only skip
    assertInvariants(session);

    expect(() => skip(session, data, rng)).toThrow(IllegalActionError);
  });

  it('4. pick after COMPLETE throws', () => {
    const data = corpus(7);
    const history = driveToComplete(data, 999);
    const final = history[history.length - 1];
    expect(final.phase).toBe('COMPLETE');

    const rng = mulberry32(1);
    expect(() => pick(final, data, 'sq0-1900-p0', rng)).toThrow(
      IllegalActionError,
    );
  });

  it('5. pick of a playerId not in currentReveal throws', () => {
    const data = corpus(7);
    const rng = mulberry32(2024);
    const session = startDraft(data, rng);

    expect(() =>
      pick(session, data, 'this-player-does-not-exist', rng),
    ).toThrow(IllegalActionError);
  });

  it('6. duplicate pick on a repeated reveal throws (single-squad corpus forces repeat)', () => {
    // Single-squad corpus: round 2 must re-reveal the same squad (breach), so a
    // player picked in round 1 is present again and must reject as a duplicate.
    const data = corpus(1);
    const rng = mulberry32(5);

    let session = startDraft(data, rng);
    assertInvariants(session);
    const firstId = session.currentReveal!.players[0].id;

    session = pick(session, data, firstId, rng);
    assertInvariants(session);

    // Same squad revealed again (forced repeat).
    expect(session.currentReveal!.id).toBe(data.squads[0].id);
    expect(session.currentReveal!.players.some((p) => p.id === firstId)).toBe(
      true,
    );

    expect(() => pick(session, data, firstId, rng)).toThrow(IllegalActionError);
  });

  it('7. seen-squad preference: with N squads the first N reveals are all distinct', () => {
    const N = 5;
    const data = corpus(N);
    const rng = mulberry32(31337);

    const revealIds: string[] = [];
    let session = startDraft(data, rng);
    assertInvariants(session);
    revealIds.push(session.currentReveal!.id);

    // Advance to collect the first N reveals (N-1 more picks; N < 11 so no COMPLETE).
    for (let i = 1; i < N; i++) {
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
      revealIds.push(session.currentReveal!.id);
    }

    expect(revealIds.length).toBe(N);
    expect(new Set(revealIds).size).toBe(N); // all distinct until corpus exhausted
  });

  it('8. breachLog populated when a 2-squad corpus is drafted to completion', () => {
    const data = corpus(2);
    const history = driveToComplete(data, 8080);
    const final = history[history.length - 1];

    expect(final.phase).toBe('COMPLETE');
    expect(final.breachLog.length).toBeGreaterThan(0);
    expect(final.breachLog.every((m) => m.startsWith('repeat:'))).toBe(true);
    // seenSquadIds must contain duplicates given breaches occurred.
    expect(new Set(final.seenSquadIds).size).toBeLessThan(
      final.seenSquadIds.length,
    );
  });

  it('9. skip on round 1 is legal; skip late in the draft is legal', () => {
    // Round 1 skip.
    {
      const data = corpus(7);
      const rng = mulberry32(11);
      let session = startDraft(data, rng);
      expect(() => {
        session = skip(session, data, rng);
      }).not.toThrow();
      assertInvariants(session);
      expect(session.roundsPlayed).toBe(2);
      expect(session.skipRemaining).toBe(0);
    }

    // Late skip (after several picks).
    {
      const data = corpus(7);
      const rng = mulberry32(22);
      let session = startDraft(data, rng);
      assertInvariants(session);
      for (let i = 0; i < 5; i++) {
        session = pick(session, data, firstPickable(session), rng);
        assertInvariants(session);
      }
      expect(session.skipRemaining).toBe(1);
      expect(() => {
        session = skip(session, data, rng);
      }).not.toThrow();
      assertInvariants(session);
      expect(session.skipRemaining).toBe(0);
    }
  });

  it('10. determinism: same seed + same scripted actions => deep-equal at every step', () => {
    const data = corpus(4);
    const SEED = 246810;

    // A scripted sequence: pick, pick, skip, pick... driving to COMPLETE.
    // Actions are chosen by index so both runs are identical modulo RNG (which is
    // seeded identically), giving byte-for-byte identical session histories.
    function run(): DraftSession[] {
      const rng = mulberry32(SEED);
      let session = startDraft(data, rng);
      const steps: DraftSession[] = [session];
      let usedSkip = false;

      while (session.phase !== 'COMPLETE') {
        // Skip exactly once, at the 3rd round, if still available.
        if (!usedSkip && session.roundsPlayed === 3 && session.skipRemaining === 1) {
          session = skip(session, data, rng);
          usedSkip = true;
        } else {
          session = pick(session, data, firstPickable(session), rng);
        }
        steps.push(session);
        assertInvariants(session);
      }
      return steps;
    }

    const runA = run();
    const runB = run();

    expect(runA.length).toBe(runB.length);
    for (let i = 0; i < runA.length; i++) {
      expect(runA[i]).toEqual(runB[i]);
    }
    // The scripted run used the skip -> 12 rounds at COMPLETE.
    const last = runA[runA.length - 1];
    expect(last.phase).toBe('COMPLETE');
    expect(last.roundsPlayed).toBe(12);
  });

  it('11. arithmetic + structural invariants hold after every transition (covered across cases)', () => {
    // Explicit end-to-end sweep asserting invariants after each transition for
    // several corpus sizes, exercising both the no-breach and breach paths.
    for (const n of [1, 2, 3, 7]) {
      const data = corpus(n);
      const history = driveToComplete(data, 100 + n);
      history.forEach(assertInvariants);
      expect(history[history.length - 1].phase).toBe('COMPLETE');
    }
  });

  it('12. getFinalXI throws unless COMPLETE and returns 11 players when COMPLETE', () => {
    const data = corpus(7);
    const rng = mulberry32(64);

    const start = startDraft(data, rng);
    expect(() => getFinalXI(start)).toThrow(IllegalActionError);

    const history = driveToComplete(data, 64);
    const final = history[history.length - 1];
    const xi = getFinalXI(final);
    expect(xi.length).toBe(11);
    expect(new Set(xi.map((p) => p.id)).size).toBe(11);
  });

  it('purity: transitions never mutate the input session', () => {
    const data = corpus(3);
    const rng = mulberry32(7);
    const start = startDraft(data, rng);
    const snapshot = structuredClone(start);

    pick(start, data, firstPickable(start), rng);
    skip(start, data, rng);

    expect(start).toEqual(snapshot);
  });
});

describe('formationId', () => {
  it('startDraft with no formationId uses referenceFormation from config', () => {
    const data = corpus(7);
    const session = startDraft(data, mulberry32(1));
    expect(session.formationId).toBe('draft-test');
  });

  it('startDraft with valid formationId stores it on session', () => {
    const data = corpus(7);
    const session = startDraft(data, mulberry32(1), 'draft-test');
    expect(session.formationId).toBe('draft-test');
  });

  it('startDraft with invalid formationId throws IllegalActionError', () => {
    const data = corpus(7);
    expect(() => startDraft(data, mulberry32(1), 'nonexistent')).toThrow(IllegalActionError);
  });
});

describe('permanent skip exclude', () => {
  it('skip records squad id in excludedSquadIds', () => {
    const data = corpus(7);
    const rng = mulberry32(42);
    let session = startDraft(data, rng);
    const skippedId = session.currentReveal!.id;
    session = skip(session, data, rng);
    assertInvariants(session);
    expect(session.excludedSquadIds).toEqual([skippedId]);
  });

  it('startDraft has empty excludedSquadIds', () => {
    const session = startDraft(corpus(7), mulberry32(1));
    expect(session.excludedSquadIds).toEqual([]);
  });

  it('skipped squad never reappears when corpus has alternatives (corpus 7)', () => {
    const data = corpus(7);
    const rng = mulberry32(99);
    let session = startDraft(data, rng);
    const skippedId = session.currentReveal!.id;
    session = skip(session, data, rng);
    while (session.phase !== 'COMPLETE') {
      expect(session.currentReveal!.id).not.toBe(skippedId);
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }
    expect(session.picks.length).toBe(11);
  });

  it('skipped squad never reappears on breach path (corpus 2)', () => {
    // After skip, only 1 squad remains for 11 picks → many breaches, never excluded id.
    const data = corpus(2);
    const rng = mulberry32(7);
    let session = startDraft(data, rng);
    const skippedId = session.currentReveal!.id;
    session = skip(session, data, rng);
    while (session.phase !== 'COMPLETE') {
      expect(session.currentReveal!.id).not.toBe(skippedId);
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }
  });

  it('corpus of 1 remains playable after skip (degenerate may re-show only squad)', () => {
    const data = corpus(1);
    const rng = mulberry32(3);
    let session = startDraft(data, rng);
    session = skip(session, data, rng);
    assertInvariants(session);
    // Must still be able to complete 11 picks.
    while (session.phase !== 'COMPLETE') {
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }
    expect(session.picks.length).toBe(11);
  });
});

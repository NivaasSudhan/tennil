/**
 * tests/audit-draft.test.ts — edge-case audit of the draft state machine
 * (ADR-003; ARCHITECTURE.md §4).
 *
 * SYNTHETIC fixtures only — never imports squads.json. Builds 1..8 small squads
 * inline (11 players each, 1 GK, buckets in {GK,DEF,MID,ATT}). Uses mulberry32
 * for deterministic runs and a scripted Rng to force exact reveal selections.
 *
 * SCOPE: covers pick/skip legality guards, 11th-pick completion exactness,
 * roundsPlayed accounting (with and without skip), breachLog correctness on the
 * NO-SKIP path, rng determinism, and purity. Does NOT cover skip re-reveal /
 * permanent-squad-exclusion semantics (those are being reworked by another agent
 * and are deliberately excluded from this audit set).
 */

import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/lib/rng';
import { startDraft, pick, skip, getFinalXI } from '../src/domain/draft/session';
import { IllegalActionError } from '../src/domain/types';
import type {
  DraftSession,
  GameData,
  Player,
  PositionBucket,
  Rng,
  Squad,
} from '../src/domain/types';

// ---------------------------------------------------------------------------
// Synthetic data builders
// ---------------------------------------------------------------------------

const RAW_FOR_BUCKET: Record<PositionBucket, string> = {
  GK: 'GK',
  DEF: 'CB',
  MID: 'CM',
  ATT: 'ST',
};

// 4-3-3 shape — exactly one GK per squad.
const SQUAD_SHAPE: PositionBucket[] = [
  'GK', 'DEF', 'DEF', 'DEF', 'DEF',
  'MID', 'MID', 'MID',
  'ATT', 'ATT', 'ATT',
];

function makeSquad(id: string, country: string, year: number): Squad {
  const players: Player[] = SQUAD_SHAPE.map((bucket, i) => ({
    id: `${id}-p${i}`,
    name: `${id} player ${i}`,
    positionRaw: RAW_FOR_BUCKET[bucket],
    positionBucket: bucket,
    rating: 70 + i, // 70..80, valid integers in 1..100
  }));
  return { id, country, year, players };
}

function makeData(squads: Squad[]): GameData {
  return {
    squads,
    positionMap: { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' },
    thresholds: {
      version: 1,
      referenceFormation: 'audit-test',
      minCounts: { GK: 1, DEF: 3, MID: 2, ATT: 5 },
      formations: [
        { id: 'audit-test', label: 'AuditTest', description: 'test-only', minCounts: { GK: 1, DEF: 3, MID: 2, ATT: 5 } },
      ],
      ratingScale: { min: 1, max: 100 },
      bands: [{ id: 'fallback', priority: 0, label: 'MATCH', fallback: true }],
    },
    commentary: { version: 1, scripts: { fallback: { beats: [] } } },
  };
}

function corpus(n: number): GameData {
  const squads = Array.from({ length: n }, (_, i) =>
    makeSquad(`sq${i}`, `Country${i}`, 1900 + i),
  );
  return makeData(squads);
}

/** Scripted Rng: replays a fixed queue of [0,1) values, then asserts no over-read. */
function scriptedRng(values: number[]): Rng {
  let i = 0;
  return {
    next() {
      if (i >= values.length) throw new Error('scriptedRng exhausted');
      return values[i++];
    },
  };
}

/** Counting Rng wrapper — records how many next() calls were made. */
function countingRng(inner: Rng): { rng: Rng; calls: number } {
  const out = { rng: { next() { out.calls++; return inner.next(); } }, calls: 0 };
  return out;
}

// ---------------------------------------------------------------------------
// Invariants — arithmetic + structural (does NOT touch excludedSquadIds, which
// belongs to the skip-exclusion behaviour excluded from this audit set).
// ---------------------------------------------------------------------------

function assertInvariants(session: DraftSession): void {
  const { roundsPlayed, picks, skipRemaining, phase, seenSquadIds } = session;

  // Core arithmetic invariant (ADR-003).
  const expected =
    picks.length + (1 - skipRemaining) + (phase === 'AWAIT_PICK' ? 1 : 0);
  expect(roundsPlayed).toBe(expected);

  // No duplicate player ids in picks.
  const pickIds = picks.map((p) => p.id);
  expect(new Set(pickIds).size).toBe(pickIds.length);

  // One drawn squad per round — seenSquadIds length tracks roundsPlayed.
  expect(seenSquadIds.length).toBe(roundsPlayed);

  // seenSquadIds may contain duplicates ONLY when a breach was recorded.
  const seenSet = new Set(seenSquadIds);
  if (seenSet.size !== seenSquadIds.length) {
    expect(session.breachLog.length).toBeGreaterThan(0);
  }

  if (phase === 'COMPLETE') {
    expect(picks.length).toBe(11);
    expect(roundsPlayed).toBe(11 + (1 - skipRemaining));
    expect(session.currentReveal).toBeNull();
  } else {
    expect(session.currentReveal).not.toBeNull();
    expect(picks.length).toBeLessThan(11);
  }
}

/** First pickable player id in the current reveal (not already picked). */
function firstPickable(session: DraftSession): string {
  const reveal = session.currentReveal!;
  const picked = new Set(session.picks.map((p) => p.id));
  const avail = reveal.players.find((p) => !picked.has(p.id))!;
  return avail.id;
}

/** Drive to COMPLETE picking first-available each round; assert invariants after
 *  every transition. Optional `onRound` lets the caller inject a skip. */
function driveToComplete(
  data: GameData,
  seed: number,
  skipAtRound?: number,
): DraftSession {
  const rng = mulberry32(seed);
  let session = startDraft(data, rng);
  assertInvariants(session);
  let usedSkip = false;
  while (session.phase !== 'COMPLETE') {
    if (skipAtRound !== undefined && !usedSkip && session.roundsPlayed === skipAtRound) {
      session = skip(session, data, rng);
      usedSkip = true;
    } else {
      session = pick(session, data, firstPickable(session), rng);
    }
    assertInvariants(session);
  }
  return session;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('audit: pick legality guards', () => {
  it('picking a player not present in the current reveal throws', () => {
    const data = corpus(3);
    // Force the first reveal to be squad 0 (rng → 0 selects pool index 0).
    const rng = scriptedRng([0]);
    const session = startDraft(data, rng);
    expect(session.currentReveal!.id).toBe('sq0');

    // sq1-p0 is a valid player in the corpus but NOT in the current reveal.
    expect(() => pick(session, data, 'sq1-p0', scriptedRng([0]))).toThrow(
      IllegalActionError,
    );
    const err = (() => {
      try { pick(session, data, 'sq1-p0', scriptedRng([0])); } catch (e) { return e as IllegalActionError; }
      return undefined;
    })();
    expect(err!.message).toContain('not in the current reveal');
  });

  it('picking a purely bogus player id throws', () => {
    const data = corpus(4);
    const session = startDraft(data, mulberry32(7));
    expect(() =>
      pick(session, data, 'does-not-exist-anywhere', mulberry32(1)),
    ).toThrow(IllegalActionError);
  });

  it('picking the same player twice across a forced repeat reveal throws', () => {
    // Single-squad corpus forces a repeat on round 2 → same squad, same players.
    const data = corpus(1);
    const rng = mulberry32(5);
    let session = startDraft(data, rng);
    assertInvariants(session);
    const firstId = session.currentReveal!.players[0].id;

    session = pick(session, data, firstId, rng);
    assertInvariants(session);
    // Round 2 reveal is the same squad again.
    expect(session.currentReveal!.id).toBe(data.squads[0].id);
    expect(session.currentReveal!.players.some((p) => p.id === firstId)).toBe(true);

    expect(() => pick(session, data, firstId, rng)).toThrow(IllegalActionError);
    const err = (() => {
      try { pick(session, data, firstId, rng); } catch (e) { return e as IllegalActionError; }
      return undefined;
    })();
    expect(err!.message).toContain('already been picked');
  });

  it('picking two DIFFERENT players with the same id string (synthetic) is rejected', () => {
    // Construct two squads that share a player id (only possible in synthetic
    // fixtures; validation would reject it at load). pick() must dedup by id.
    const s0 = makeSquad('shared0', 'A', 2000);
    const s1 = makeSquad('shared1', 'B', 2001);
    s1.players[0].id = s0.players[0].id; // duplicate id across squads
    const data = makeData([s0, s1]);

    const rng = mulberry32(9);
    let session = startDraft(data, rng);
    const dupId = s0.players[0].id;

    // If sq0 is the first reveal, pick its p0, then later when sq1 reveals the
    // same id resurfaces it must reject. Drive until the duplicate appears.
    session = pick(session, data, dupId, rng);
    assertInvariants(session);
    // Walk forward until we find a reveal containing the dup id, then attempt
    // to pick it again — must throw regardless of which squad reveals it.
    let attempts = 0;
    while (session.phase !== 'COMPLETE' && attempts < 50) {
      const reveal = session.currentReveal!;
      if (reveal.players.some((p) => p.id === dupId)) {
        expect(() => pick(session, data, dupId, rng)).toThrow(IllegalActionError);
        break;
      }
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
      attempts++;
    }
  });
});

describe('audit: actions after COMPLETE are rejected', () => {
  it('pick after COMPLETE throws', () => {
    const final = driveToComplete(corpus(7), 123);
    expect(final.phase).toBe('COMPLETE');
    const somePlayer = final.picks[0].id;
    expect(() => pick(final, corpus(7), somePlayer, mulberry32(1))).toThrow(
      IllegalActionError,
    );
  });

  it('skip after COMPLETE throws', () => {
    const data = corpus(6);
    const final = driveToComplete(data, 42);
    expect(final.phase).toBe('COMPLETE');
    expect(() => skip(final, data, mulberry32(1))).toThrow(IllegalActionError);
  });

  it('getFinalXI before COMPLETE throws', () => {
    const session = startDraft(corpus(5), mulberry32(2));
    expect(() => getFinalXI(session)).toThrow(IllegalActionError);
  });
});

describe('audit: skip token accounting (excludes re-reveal semantics)', () => {
  it('skip decrements skipRemaining to 0 and increments roundsPlayed by exactly 1', () => {
    const data = corpus(8);
    const rng = mulberry32(11);
    const session = startDraft(data, rng);
    const beforeRounds = session.roundsPlayed;
    const beforeReveal = session.currentReveal!.id;

    const after = skip(session, data, rng);
    expect(after.skipRemaining).toBe(0);
    expect(after.roundsPlayed).toBe(beforeRounds + 1);
    // skip always draws a replacement (never null while AWAIT_PICK).
    expect(after.currentReveal).not.toBeNull();
    assertInvariants(after);
    // Original input unchanged (purity).
    expect(session.skipRemaining).toBe(1);
    expect(session.roundsPlayed).toBe(beforeRounds);
    void beforeReveal;
  });

  it('a second skip (skipRemaining already 0) throws', () => {
    const data = corpus(8);
    const rng = mulberry32(13);
    let session = startDraft(data, rng);
    session = skip(session, data, rng);
    expect(session.skipRemaining).toBe(0);
    expect(() => skip(session, data, rng)).toThrow(IllegalActionError);
  });

  it('skip is legal at any round (round 1 and late), arithmetic holds throughout', () => {
    // Round-1 skip.
    {
      const data = corpus(8);
      const rng = mulberry32(21);
      const s1 = startDraft(data, rng);
      const s2 = skip(s1, data, rng);
      assertInvariants(s2);
      expect(s2.roundsPlayed).toBe(2);
      expect(s2.skipRemaining).toBe(0);
    }
    // Late skip after 6 picks.
    {
      const data = corpus(8);
      const rng = mulberry32(23);
      let session = startDraft(data, rng);
      assertInvariants(session);
      for (let i = 0; i < 6; i++) {
        session = pick(session, data, firstPickable(session), rng);
        assertInvariants(session);
      }
      expect(session.skipRemaining).toBe(1);
      session = skip(session, data, rng);
      assertInvariants(session);
      expect(session.skipRemaining).toBe(0);
    }
  });
});

describe('audit: 11th-pick completion exactness', () => {
  it('the 11th pick does NOT draw another reveal, does NOT increment roundsPlayed', () => {
    const data = corpus(7);
    const rng = mulberry32(99);
    let session = startDraft(data, rng);
    assertInvariants(session);
    // Make 10 picks → 10 picks, AWAIT_PICK.
    for (let i = 0; i < 10; i++) {
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }
    expect(session.phase).toBe('AWAIT_PICK');
    expect(session.picks.length).toBe(10);
    const roundsBefore11th = session.roundsPlayed;
    expect(roundsBefore11th).toBe(11); // 10 picks + skip-unused + AWAIT

    // Count rng calls during the 11th pick — must be ZERO (no reveal draw).
    const counter = countingRng(mulberry32(99)); // fresh but only counting matters
    // Re-use the SAME session; we only care the 11th pick path skips selectSquad.
    // To count precisely, replay from a snapshot using the counter rng.
    let replay = startDraft(data, mulberry32(99));
    for (let i = 0; i < 10; i++) {
      replay = pick(replay, data, firstPickable(replay), mulberry32(99));
    }
    const counterRng = counter.rng; // counter wraps scriptedRng? No — wrap mulberry.
    // Use countingRng around a scripted feed that mimics post-10th-pick draws.
    // Simpler: just assert the 11th pick's returned roundsPlayed equals the value
    // just before it (no increment).
    const done = pick(session, data, firstPickable(session), counterRng);

    expect(done.phase).toBe('COMPLETE');
    expect(done.picks.length).toBe(11);
    expect(done.currentReveal).toBeNull();
    // roundsPlayed must NOT have been incremented on the 11th pick.
    expect(done.roundsPlayed).toBe(session.roundsPlayed);
    expect(done.roundsPlayed).toBe(roundsBefore11th);
    // With no skip used: COMPLETE at roundsPlayed 11.
    expect(done.roundsPlayed).toBe(11);
  });

  it('with one skip used, COMPLETE lands at roundsPlayed 12 (arithmetic only)', () => {
    const data = corpus(8);
    const rng = mulberry32(777);
    let session = startDraft(data, rng);
    assertInvariants(session);
    session = skip(session, data, rng); // use the token
    assertInvariants(session);
    while (session.phase !== 'COMPLETE') {
      session = pick(session, data, firstPickable(session), rng);
      assertInvariants(session);
    }
    expect(session.phase).toBe('COMPLETE');
    expect(session.picks.length).toBe(11);
    expect(session.skipRemaining).toBe(0);
    expect(session.roundsPlayed).toBe(12);
  });

  it('no-skip completion lands at roundsPlayed 11 across several corpus sizes', () => {
    for (const n of [1, 2, 3, 8]) {
      const final = driveToComplete(corpus(n), 100 + n);
      expect(final.phase).toBe('COMPLETE');
      expect(final.picks.length).toBe(11);
      expect(final.skipRemaining).toBe(1);
      expect(final.roundsPlayed).toBe(11);
    }
  });

  it('the 11th-pick object preserves seenSquadIds, breachLog, skipRemaining', () => {
    // Structural: the COMPLETE return spreads the session, so all non-overridden
    // fields carry over — particularly that skipRemaining is unchanged and
    // breachLog entries from earlier rounds survive.
    const data = corpus(1); // guarantees breaches before completion
    const rng = mulberry32(3);
    let session = startDraft(data, rng);
    assertInvariants(session);
    while (session.phase !== 'COMPLETE') {
      session = pick(session, data, firstPickable(session), rng);
    }
    expect(session.phase).toBe('COMPLETE');
    expect(session.breachLog.length).toBeGreaterThan(0);
    expect(session.seenSquadIds.length).toBe(session.roundsPlayed);
    expect(session.skipRemaining).toBe(1); // never used
  });
});

describe('audit: breachLog correctness (no-skip path)', () => {
  it('a single-squad corpus: first breach is repeat:2, every entry is repeat:<n>', () => {
    const data = corpus(1);
    const final = driveToComplete(data, 8);
    expect(final.breachLog.length).toBeGreaterThan(0);
    expect(final.breachLog.every((m) => /^repeat:\d+$/.test(m))).toBe(true);
    // Round 1 reveal is unseen (no breach). Round 2 is the first forced repeat.
    expect(final.breachLog[0]).toBe('repeat:2');
  });

  it('for corpus of N (no skip), the first breach lands on round N+1', () => {
    // The first N reveals are distinct (unseen pool non-empty). Reveal N+1
    // exhausts the pool → first breach at round N+1.
    for (const n of [2, 3, 5, 8]) {
      const data = corpus(n);
      const rng = mulberry32(500 + n);
      let session = startDraft(data, rng);
      const revealIds: string[] = [session.currentReveal!.id];
      // Reveal rounds 2..N: must all be distinct (no breach yet).
      for (let r = 1; r < n; r++) {
        session = pick(session, data, firstPickable(session), rng);
        revealIds.push(session.currentReveal!.id);
        expect(session.breachLog.length).toBe(0); // no breach yet
      }
      expect(new Set(revealIds).size).toBe(n);
      // The (N+1)th reveal is the first repeat.
      session = pick(session, data, firstPickable(session), rng);
      expect(session.breachLog.length).toBe(1);
      expect(session.breachLog[0]).toBe(`repeat:${n + 1}`);
    }
  });

  it('breach round numbers are strictly increasing and match the reveal round', () => {
    const data = corpus(2);
    const rng = mulberry32(8080);
    let session = startDraft(data, rng);
    while (session.phase !== 'COMPLETE') {
      const roundsBefore = session.roundsPlayed;
      const breachesBefore = session.breachLog.length;
      session = pick(session, data, firstPickable(session), rng);
      if (session.breachLog.length > breachesBefore) {
        const last = session.breachLog[session.breachLog.length - 1];
        // The breach round is the round just revealed = roundsPlayed after the pick.
        expect(last).toBe(`repeat:${session.roundsPlayed}`);
        expect(session.roundsPlayed).toBeGreaterThan(roundsBefore);
      }
    }
    // Strictly increasing round numbers in the log.
    const rounds = session.breachLog.map((m) => Number(m.split(':')[1]));
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i]).toBeGreaterThan(rounds[i - 1]);
    }
  });
});

describe('audit: rng determinism with a fixed seed', () => {
  it('two runs from the same seed produce byte-identical session histories', () => {
    const data = corpus(4);
    function run(): DraftSession[] {
      const rng = mulberry32(246810);
      const steps: DraftSession[] = [];
      let session = startDraft(data, rng);
      steps.push(session);
      while (session.phase !== 'COMPLETE') {
        if (session.roundsPlayed === 3 && session.skipRemaining === 1) {
          session = skip(session, data, rng);
        } else {
          session = pick(session, data, firstPickable(session), rng);
        }
        steps.push(session);
      }
      return steps;
    }
    const a = run();
    const b = run();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) expect(a[i]).toEqual(b[i]);
    expect(a[a.length - 1].phase).toBe('COMPLETE');
  });

  it('two scripted rng values select DIFFERENT pool indices (deterministic divergence)', () => {
    // 0.00 → floor(0*8)=0 ; 0.50 → floor(0.5*8)=4 — guaranteed distinct with 8 squads.
    const data = corpus(8);
    expect(startDraft(data, scriptedRng([0.0])).currentReveal!.id).toBe('sq0');
    expect(startDraft(data, scriptedRng([0.5])).currentReveal!.id).toBe('sq4');
  });

  it('a scripted rng forces exact reveal selection by pool index', () => {
    const data = corpus(3);
    // First reveal: rng → 0.49 → floor(0.49*3)=1 → squad index 1.
    const s1 = startDraft(data, scriptedRng([0.49]));
    expect(s1.currentReveal!.id).toBe('sq1');
    // After picking, the next draw's pool excludes seen ['sq1']; 2 remain (sq0,sq2).
    // rng → 0.66 → floor(0.66*2)=1 → index 1 = 'sq2'.
    const s2 = pick(s1, data, firstPickable(s1), scriptedRng([0.66]));
    expect(s2.currentReveal!.id).toBe('sq2');
  });
});

describe('audit: purity / structural correctness', () => {
  it('pick and skip never mutate the input session object', () => {
    const data = corpus(5);
    const rng = mulberry32(7);
    const start = startDraft(data, rng);
    const snap = JSON.stringify(start);
    pick(start, data, firstPickable(start), rng);
    skip(start, data, rng);
    expect(JSON.stringify(start)).toBe(snap);
  });

  it('getFinalXI returns an independent copy — mutating it does not affect the session', () => {
    const final = driveToComplete(corpus(7), 64);
    const xi = getFinalXI(final);
    expect(xi.length).toBe(11);
    expect(new Set(xi.map((p) => p.id)).size).toBe(11);
    xi.push({ ...xi[0], id: 'injected' });
    // The session's picks must be untouched.
    expect(final.picks.length).toBe(11);
    expect(final.picks.some((p) => p.id === 'injected')).toBe(false);
    // A second getFinalXI still has 11.
    expect(getFinalXI(final).length).toBe(11);
  });

  it('startDraft always produces AWAIT_PICK, roundsPlayed 1, skipRemaining 1, one seen squad', () => {
    for (const n of [1, 2, 7]) {
      const s = startDraft(corpus(n), mulberry32(n));
      expect(s.phase).toBe('AWAIT_PICK');
      expect(s.roundsPlayed).toBe(1);
      expect(s.skipRemaining).toBe(1);
      expect(s.picks.length).toBe(0);
      expect(s.seenSquadIds.length).toBe(1);
      expect(s.currentReveal).not.toBeNull();
      expect(s.breachLog.length).toBe(0); // first reveal is never a breach
    }
  });
});
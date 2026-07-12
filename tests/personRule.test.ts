import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/lib/rng';
import { startDraft, pick, skip } from '../src/domain/draft/session';
import { personKey, pickedPersonKeys, isPersonTaken } from '../src/domain/draft/person';
import { IllegalActionError } from '../src/domain/types';
import type { DraftSession, GameData, Player, PositionBucket, Squad } from '../src/domain/types';

// ---------------------------------------------------------------------------
// Synthetic GameData helpers (ADR-018 test scope). Mirrors tests/draft.test.ts
// shapes (4-3-3, 11 players/squad) but lets individual player names be
// overridden so cross-era duplicates can be constructed deliberately.
// ---------------------------------------------------------------------------

const RAW_FOR_BUCKET: Record<PositionBucket, string> = {
  GK: 'GK',
  DEF: 'CB',
  MID: 'CM',
  ATT: 'ST',
};

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

/** Builds a squad; `nameOverrides[i]` replaces the default name at index i. */
function makeSquad(id: string, country: string, year: number, nameOverrides: Record<number, string> = {}): Squad {
  const players: Player[] = SQUAD_SHAPE.map((bucket, i) => ({
    id: `${id}-p${i}`,
    name: nameOverrides[i] ?? `${id} player ${i}`,
    positionRaw: RAW_FOR_BUCKET[bucket],
    positionBucket: bucket,
    rating: 70 + i,
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
      profiles: {}, // ADR-020: unused by this synthetic draft fixture
      oppositions: [],
    },
    commentary: { version: 1, scripts: { fallback: { beats: [] } } },
  };
}

function firstPickable(session: DraftSession): string {
  const reveal = session.currentReveal;
  if (!reveal) throw new Error('no current reveal to pick from');
  const pickedIds = new Set(session.picks.map((p) => p.id));
  const available = reveal.players.find(
    (p) => !pickedIds.has(p.id) && !isPersonTaken(session, p),
  );
  if (!available) throw new Error('no pickable player in reveal (unexpected)');
  return available.id;
}

// ---------------------------------------------------------------------------
// (a) cross-era duplicate blocked
// ---------------------------------------------------------------------------

describe('person-identity pick rule (ADR-018)', () => {
  it('blocks picking the same person from a different era squad, but a different player from that reveal still succeeds', () => {
    // Two squads, each with "Lionel Messi" at index 0 (different ids/positionRaw
    // per squad is fine — same normalized name is what matters).
    const squadA = makeSquad('sqA-2006', 'CountryA', 2006, { 0: 'Lionel Messi' });
    const squadB = makeSquad('sqB-2022', 'CountryB', 2022, { 0: 'Lionel Messi' });
    const data = makeData([squadA, squadB]);
    const rng = mulberry32(1);

    let session = startDraft(data, rng);
    // Round 1: pick the Messi instance from whichever squad was revealed first.
    const round1SquadId = session.currentReveal!.id;
    const round1MessiId = session.currentReveal!.players[0].id;
    expect(session.currentReveal!.players[0].name).toBe('Lionel Messi');
    session = pick(session, data, round1MessiId, rng);

    // Round 2: with a 2-squad corpus, the seen-preference pool forces the OTHER
    // squad to reveal next (ADR-003 selectSquad).
    expect(session.currentReveal!.id).not.toBe(round1SquadId);
    const round2MessiId = session.currentReveal!.players[0].id;
    expect(session.currentReveal!.players[0].name).toBe('Lionel Messi');
    expect(round2MessiId).not.toBe(round1MessiId); // different Player.id (era instance)

    // Picking the second Messi instance is illegal: same person, already picked.
    expect(() => pick(session, data, round2MessiId, rng)).toThrow(IllegalActionError);
    expect(() => pick(session, data, round2MessiId, rng)).toThrow(/person already picked/);

    // A different (non-Messi) player from the SAME reveal is still legal.
    const otherPlayerId = session.currentReveal!.players[1].id;
    expect(() => {
      session = pick(session, data, otherPlayerId, rng);
    }).not.toThrow();
    expect(session.picks.some((p) => p.id === otherPlayerId)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // (b) diacritics collide
  // -------------------------------------------------------------------------

  it('diacritic variants of the same name collide: "Raphaël Varane" blocks "Raphael Varane"', () => {
    const squadA = makeSquad('sqA-2018', 'France', 2018, { 3: 'Raphaël Varane' });
    const squadB = makeSquad('sqB-2022', 'France', 2022, { 3: 'Raphael Varane' });
    const data = makeData([squadA, squadB]);
    const rng = mulberry32(2);

    let session = startDraft(data, rng);
    const round1VaraneId = session.currentReveal!.players[3].id;
    session = pick(session, data, round1VaraneId, rng);

    const round2VaraneId = session.currentReveal!.players[3].id;
    expect(() => pick(session, data, round2VaraneId, rng)).toThrow(IllegalActionError);
  });

  // -------------------------------------------------------------------------
  // (c) distinct persons unaffected
  // -------------------------------------------------------------------------

  it('distinct persons with different names are unaffected by the rule', () => {
    const squadA = makeSquad('sqA-1998', 'France', 1998, { 0: 'Fabien Barthez' });
    const squadB = makeSquad('sqB-2018', 'France', 2018, { 0: 'Hugo Lloris' });
    const data = makeData([squadA, squadB]);
    const rng = mulberry32(3);

    let session = startDraft(data, rng);
    const round1Id = session.currentReveal!.players[0].id;
    session = pick(session, data, round1Id, rng);

    const round2GkId = session.currentReveal!.players[0].id;
    // Different person (Lloris vs Barthez) -> legal.
    expect(() => {
      session = pick(session, data, round2GkId, rng);
    }).not.toThrow();
    expect(session.picks.some((p) => p.id === round2GkId)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // (d) personKey unit cases
  // -------------------------------------------------------------------------

  describe('personKey', () => {
    it('is case-insensitive', () => {
      expect(personKey({ id: 'x', name: 'LIONEL MESSI', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 }))
        .toBe(personKey({ id: 'y', name: 'lionel messi', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 }));
    });

    it('strips NFD combining marks (diacritics)', () => {
      expect(personKey({ id: 'x', name: 'Raphaël Varane', positionRaw: 'CB', positionBucket: 'DEF', rating: 85 }))
        .toBe(personKey({ id: 'y', name: 'Raphael Varane', positionRaw: 'CB', positionBucket: 'DEF', rating: 85 }));
    });

    it('collapses internal/leading/trailing whitespace', () => {
      expect(personKey({ id: 'x', name: '  Lionel   Messi  ', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 }))
        .toBe(personKey({ id: 'y', name: 'Lionel Messi', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 }));
    });

    it('distinct names produce distinct keys', () => {
      expect(personKey({ id: 'x', name: 'Lionel Messi', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 }))
        .not.toBe(personKey({ id: 'y', name: 'Cristiano Ronaldo', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 }));
    });
  });

  describe('pickedPersonKeys / isPersonTaken', () => {
    it('pickedPersonKeys returns the set of normalized keys for given picks', () => {
      const picks: Player[] = [
        { id: 'a', name: 'Lionel Messi', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 },
        { id: 'b', name: 'Raphaël Varane', positionRaw: 'CB', positionBucket: 'DEF', rating: 85 },
      ];
      const keys = pickedPersonKeys(picks);
      expect(keys.has('lionel messi')).toBe(true);
      expect(keys.has('raphael varane')).toBe(true);
      expect(keys.size).toBe(2);
    });

    it('isPersonTaken is true for an era-duplicate and false for a fresh person', () => {
      const squadA = makeSquad('sqA', 'X', 2000, { 0: 'Lionel Messi' });
      const data = makeData([squadA]);
      const rng = mulberry32(4);
      const session = startDraft(data, rng);
      const withPick: DraftSession = { ...session, picks: [session.currentReveal!.players[0]] };

      const sameMessiDifferentId: Player = {
        id: 'other-id',
        name: 'lionel   messi',
        positionRaw: 'ST',
        positionBucket: 'ATT',
        rating: 91,
      };
      expect(isPersonTaken(withPick, sameMessiDifferentId)).toBe(true);

      const freshPerson: Player = {
        id: 'fresh-id',
        name: 'Someone Else',
        positionRaw: 'ST',
        positionBucket: 'ATT',
        rating: 80,
      };
      expect(isPersonTaken(withPick, freshPerson)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // (e) existing draft invariants stay green with the new rule active
  // -------------------------------------------------------------------------

  it('a full draft with all-distinct persons still completes with 11 picks (no false positives)', () => {
    const squads = Array.from({ length: 7 }, (_, i) => makeSquad(`sq${i}-${1900 + i}`, `Country${i}`, 1900 + i));
    const data = makeData(squads);
    const rng = mulberry32(999);

    let session = startDraft(data, rng);
    while (session.phase !== 'COMPLETE') {
      session = pick(session, data, firstPickable(session), rng);
    }
    expect(session.phase).toBe('COMPLETE');
    expect(session.picks.length).toBe(11);
    expect(new Set(session.picks.map((p) => p.id)).size).toBe(11);
    // No collisions expected: distinct default names per squad/index.
    expect(new Set(session.picks.map((p) => personKey(p))).size).toBe(11);
  });

  it('skip is unaffected by the person rule (does not touch picks)', () => {
    const squadA = makeSquad('sqA', 'X', 2000, { 0: 'Lionel Messi' });
    const squadB = makeSquad('sqB', 'Y', 2001, { 0: 'Lionel Messi' });
    const data = makeData([squadA, squadB]);
    const rng = mulberry32(5);

    let session = startDraft(data, rng);
    expect(() => {
      session = skip(session, data, rng);
    }).not.toThrow();
    expect(session.picks.length).toBe(0);
  });
});

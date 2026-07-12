/**
 * Draft state machine (ADR-003; ARCHITECTURE.md §4).
 *
 * All functions are PURE: they never mutate the input session and always return a
 * NEW session object. Every illegal action throws `IllegalActionError` — never a
 * silent no-op. Randomness enters ONLY through the injected `Rng` (ADR-008); this
 * module never touches the system RNG, react, or `src/app`.
 */

import type {
  DraftSession,
  FinalXI,
  GameData,
  Rng,
  Squad,
  StartDraftOptions,
} from '../types';
import { IllegalActionError } from '../types';
import { isPersonTaken } from './person';

interface SelectResult {
  reveal: Squad;
  /** True when the seen-squad-preference pool was exhausted and a repeat was forced. */
  breached: boolean;
}

/**
 * selectSquad (ARCHITECTURE.md §4).
 * Prefer unseen + non-excluded. Breach relaxes seen but still honors permanent
 * `excluded` + one-shot `excludeId`. Degenerate last resort may re-include
 * excluded when no non-excluded squad remains (corpus of one after skip).
 */
function selectSquad(
  all: Squad[],
  seen: string[],
  excluded: string[],
  excludeId: string | null,
  rng: Rng,
): SelectResult {
  const notExcluded = (s: Squad) =>
    !excluded.includes(s.id) && s.id !== excludeId;

  let pool = all.filter((s) => !seen.includes(s.id) && notExcluded(s));
  let breached = false;

  if (pool.length === 0) {
    // Relax seen preference; still honor permanent + one-shot exclude.
    pool = all.filter(notExcluded);
    breached = true;
  }

  if (pool.length === 0) {
    // Degenerate: no non-excluded squad left. Allow any except one-shot excludeId.
    pool = all.filter((s) => s.id !== excludeId);
  }

  if (pool.length === 0) {
    // Corpus of one / everything excluded: allow all (playable).
    pool = all;
  }

  const idx = Math.floor(rng.next() * pool.length);
  return { reveal: pool[idx], breached };
}

export function startDraft(
  data: GameData,
  rng: Rng,
  formationId?: string,
  options?: StartDraftOptions,
): DraftSession {
  const id = formationId ?? data.thresholds.referenceFormation;
  const formation = data.thresholds.formations.find((f) => f.id === id);
  if (!formation) {
    throw new IllegalActionError(
      `formation id '${id}' not found in thresholds.formations (available: ${data.thresholds.formations.map((f) => f.id).join(', ')})`,
    );
  }

  const { reveal, breached } = selectSquad(data.squads, [], [], null, rng);
  const breachLog: string[] = [];
  if (breached) breachLog.push('repeat:1');

  return {
    phase: 'AWAIT_PICK',
    picks: [],
    skipRemaining: 1,
    roundsPlayed: 1,
    seenSquadIds: [reveal.id],
    excludedSquadIds: [],
    currentReveal: reveal,
    breachLog,
    formationId: id,
    revealLog: [reveal.id],
    seed: options?.seed ?? 0,
    mode: options?.mode ?? 'free',
  };
}

export function pick(
  session: DraftSession,
  data: GameData,
  playerId: string,
  rng: Rng,
): DraftSession {
  if (session.phase !== 'AWAIT_PICK') {
    throw new IllegalActionError(
      `pick called in phase ${session.phase}; expected AWAIT_PICK`,
    );
  }
  const reveal = session.currentReveal;
  if (!reveal) {
    throw new IllegalActionError('pick called with no current reveal');
  }

  const player = reveal.players.find((p) => p.id === playerId);
  if (!player) {
    throw new IllegalActionError(
      `player ${playerId} is not in the current reveal (${reveal.id})`,
    );
  }
  if (session.picks.some((p) => p.id === playerId)) {
    throw new IllegalActionError(`player ${playerId} has already been picked`);
  }
  if (isPersonTaken(session, player)) {
    throw new IllegalActionError(
      `player ${playerId}: person already picked (era-duplicate)`,
    );
  }

  const picks = [...session.picks, player];

  if (picks.length === 11) {
    return {
      ...session,
      picks,
      phase: 'COMPLETE',
      currentReveal: null,
    };
  }

  const roundsPlayed = session.roundsPlayed + 1;
  const { reveal: next, breached } = selectSquad(
    data.squads,
    session.seenSquadIds,
    session.excludedSquadIds,
    null,
    rng,
  );
  const breachLog = breached
    ? [...session.breachLog, `repeat:${roundsPlayed}`]
    : session.breachLog;

  return {
    ...session,
    picks,
    roundsPlayed,
    currentReveal: next,
    seenSquadIds: [...session.seenSquadIds, next.id],
    breachLog,
    revealLog: [...session.revealLog, next.id],
  };
}

export function skip(
  session: DraftSession,
  data: GameData,
  rng: Rng,
): DraftSession {
  if (session.phase !== 'AWAIT_PICK' || session.skipRemaining !== 1) {
    throw new IllegalActionError(
      `skip illegal: phase=${session.phase}, skipRemaining=${session.skipRemaining}`,
    );
  }
  const reveal = session.currentReveal;
  if (!reveal) {
    throw new IllegalActionError('skip called with no current reveal');
  }

  const roundsPlayed = session.roundsPlayed + 1;
  const excludedSquadIds = [...session.excludedSquadIds, reveal.id];
  // Permanent exclude + one-shot excludeId (belt) for the replacement draw.
  const { reveal: next, breached } = selectSquad(
    data.squads,
    session.seenSquadIds,
    excludedSquadIds,
    reveal.id,
    rng,
  );
  const breachLog = breached
    ? [...session.breachLog, `repeat:${roundsPlayed}`]
    : session.breachLog;

  return {
    ...session,
    skipRemaining: 0,
    roundsPlayed,
    currentReveal: next,
    seenSquadIds: [...session.seenSquadIds, next.id],
    excludedSquadIds,
    breachLog,
    revealLog: [...session.revealLog, next.id],
  };
}

export function getFinalXI(session: DraftSession): FinalXI {
  if (session.phase !== 'COMPLETE') {
    throw new IllegalActionError(
      `getFinalXI called in phase ${session.phase}; expected COMPLETE`,
    );
  }
  return [...session.picks];
}

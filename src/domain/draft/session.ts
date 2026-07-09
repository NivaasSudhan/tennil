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
} from '../types';
import { IllegalActionError } from '../types';

interface SelectResult {
  reveal: Squad;
  /** True when the seen-squad-preference pool was exhausted and a repeat was forced. */
  breached: boolean;
}

/**
 * selectSquad (ARCHITECTURE.md §4).
 * Uniform over squads not in `seen` and != `excludeId`. If that pool is empty, relax
 * to all squads except `excludeId` and flag a breach. If STILL empty (single-squad
 * corpus), allow the excluded/same squad — degenerate but playable.
 */
function selectSquad(
  all: Squad[],
  seen: string[],
  excludeId: string | null,
  rng: Rng,
): SelectResult {
  let pool = all.filter((s) => !seen.includes(s.id) && s.id !== excludeId);
  let breached = false;

  if (pool.length === 0) {
    // Last-resort repeat: relax the seen-preference, but still honour the exclude id.
    pool = all.filter((s) => s.id !== excludeId);
    breached = true;
  }

  if (pool.length === 0) {
    // Corpus of one (or every squad excluded): allow the same squad.
    pool = all;
  }

  const idx = Math.floor(rng.next() * pool.length);
  return { reveal: pool[idx], breached };
}

export function startDraft(data: GameData, rng: Rng): DraftSession {
  const { reveal, breached } = selectSquad(data.squads, [], null, rng);
  const breachLog: string[] = [];
  if (breached) breachLog.push('repeat:1');

  return {
    phase: 'AWAIT_PICK',
    picks: [],
    skipRemaining: 1,
    roundsPlayed: 1,
    seenSquadIds: [reveal.id],
    currentReveal: reveal,
    breachLog,
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
  // Exclude the squad just skipped from the replacement draw.
  const { reveal: next, breached } = selectSquad(
    data.squads,
    session.seenSquadIds,
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
    breachLog,
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

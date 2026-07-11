/**
 * Person-identity pick rule (ADR-018). Corpus spans 11 World Cups, so the same
 * human appears as multiple Player rows (different `id`, one per era squad --
 * e.g. Messi in arg-2006..arg-2022). Once a person is picked, every other
 * era-instance becomes unpickable for the rest of the draft.
 *
 * Pure, no RNG, no react -- same purity rules as session.ts (ADR-008/Invariant 8).
 */

import type { DraftSession, Player } from '../types';

/**
 * Derives the identity key for a player: normalized display name.
 * Lowercase, Unicode NFD with combining marks stripped, whitespace collapsed.
 * (Reserved escape hatch: a future `personKey` field on Player would override
 * this derivation -- schema change, not implemented now; see ADR-018.)
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function personKey(player: Player): string {
  return player.name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Set of person keys already present among the given picks. */
export function pickedPersonKeys(picks: Player[]): Set<string> {
  return new Set(picks.map(personKey));
}

/** True iff `player`'s person is already represented among `session.picks`. */
export function isPersonTaken(session: DraftSession, player: Player): boolean {
  return pickedPersonKeys(session.picks).has(personKey(player));
}

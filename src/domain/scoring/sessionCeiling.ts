/**
 * computeSessionCeiling (ADR-019).
 *
 * PURE. No RNG, no react. The max-total XI a player COULD have drafted this
 * session, honoring: one pick per reveal round (skip round contributes
 * nothing — it is simply never the best move for the DP), exact formation
 * bucket counts (never overfilled), and the person-identity rule (ADR-018,
 * injected via `personKeyFn` so this module never imports src/domain/draft).
 *
 * DP over (round index, GK/DEF/MID/ATT counts so far, conflict-person mask).
 * The mask only grows for person keys that are offered in 2+ DISTINCT rounds
 * of this revealLog (cross-era duplicates, e.g. Messi in two squads both
 * revealed this session) — the common case has zero conflicts, so the mask
 * dimension costs nothing. Rounds ~12, bucket ranges small (<=5 each): the
 * whole state space is a few hundred cells, trivial to memoize with a plain
 * Map keyed by a string.
 *
 * Degenerate corpora (reveals can't fill every bucket to its target count):
 * never throws. Buckets are capped at the target (never exceeded) but are
 * NOT required to hit it exactly — the DP naturally returns the best
 * achievable PARTIAL fill (every rating is >=0, so filling more is always
 * at least as good, up to the cap).
 */

import type { CeilingResult, Player, PositionBucket, PositionMap, Squad } from '../types';

type Counts = Record<PositionBucket, number>;

interface DpValue {
  total: number;
  bucketSums: Counts;
}

export function computeSessionCeiling(
  revealLog: string[],
  squadsById: Record<string, Squad>,
  formationCounts: Record<PositionBucket, number>,
  positionMap: PositionMap,
  personKeyFn: (player: Player) => string,
): CeilingResult {
  const rounds: Player[][] = revealLog.map((id) => squadsById[id]?.players ?? []);

  // ---- identify cross-round person conflicts (see module doc) ----
  const roundsByPerson = new Map<string, Set<number>>();
  rounds.forEach((players, idx) => {
    for (const p of players) {
      const key = personKeyFn(p);
      let set = roundsByPerson.get(key);
      if (!set) {
        set = new Set();
        roundsByPerson.set(key, set);
      }
      set.add(idx);
    }
  });
  const conflictBit = new Map<string, number>();
  let nextBit = 0;
  for (const [key, roundSet] of roundsByPerson) {
    if (roundSet.size > 1) {
      conflictBit.set(key, nextBit);
      nextBit += 1;
    }
  }

  const zeroCounts: Counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const memo = new Map<string, DpValue>();

  function key(idx: number, counts: Counts, mask: number): string {
    return `${idx}|${counts.GK}|${counts.DEF}|${counts.MID}|${counts.ATT}|${mask}`;
  }

  function solve(idx: number, counts: Counts, mask: number): DpValue {
    if (idx === rounds.length) {
      return { total: 0, bucketSums: { GK: 0, DEF: 0, MID: 0, ATT: 0 } };
    }
    const k = key(idx, counts, mask);
    const cached = memo.get(k);
    if (cached) return cached;

    // Option 1: skip this round (contributes nothing).
    let best = solve(idx + 1, counts, mask);

    // Option 2: pick one player from this round's squad, if room + person allow.
    for (const player of rounds[idx]) {
      const bucket = positionMap[player.positionRaw];
      if (bucket === undefined) continue; // defensive: unmapped positionRaw
      if (counts[bucket] >= formationCounts[bucket]) continue; // bucket already full

      const pKey = personKeyFn(player);
      const bit = conflictBit.get(pKey);
      if (bit !== undefined && (mask & (1 << bit)) !== 0) continue; // person already used

      const newCounts: Counts = { ...counts, [bucket]: counts[bucket] + 1 };
      const newMask = bit !== undefined ? mask | (1 << bit) : mask;
      const rest = solve(idx + 1, newCounts, newMask);
      const total = rest.total + player.rating;

      if (total > best.total) {
        best = {
          total,
          bucketSums: { ...rest.bucketSums, [bucket]: rest.bucketSums[bucket] + player.rating },
        };
      }
    }

    memo.set(k, best);
    return best;
  }

  const result = solve(0, zeroCounts, 0);
  return { bucketSums: result.bucketSums, total: result.total };
}

export type { CeilingResult };

import type { Pick, PositionBucket, Squad } from '../domain/types';
import PlayerRow from './PlayerRow';

const BUCKET_ORDER: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

interface TeamSheetBaseProps {
  /** Reveal variant: the opponent squad, pickable rows. */
  reveal?: Squad;
  /** Mine variant: the player's XI building up, grouped GK/DEF/MID/ATT. */
  picks?: Pick[];
  /** reveal rows whose id is already in session.picks render as `taken`. */
  takenIds?: Set<string>;
  /** Last picked player id — renders a SELECTED stamp on the matching reveal row. */
  lastPickId?: string | null;
  onPick?: (playerId: string) => void;
  /** Advisory per-bucket caps from chosen formation (mine variant only). */
  bucketCaps?: Record<PositionBucket, number>;
}

export type TeamSheetProps = TeamSheetBaseProps & {
  variant: 'reveal' | 'mine';
};

/**
 * TeamSheet (DESIGN.md Components) — the paper artifact. Anton masthead
 * carrying country + year (reveal) or "YOUR XI" (mine), typed Courier Prime
 * player rows with inked rating circles. Variants:
 *   reveal — opponent squad; rows are buttons; disabled/taken rows struck.
 *   mine   — the player's XI grouped GK/DEF/MID/ATT; plain lines, newest pick
 *            gets a SELECTED stamp entrance.
 * Presentation only: it receives already-derived read values (`takenIds`,
 * `lastPickId`) and forwards clicks to `onPick`. No draft rules here.
 */
export default function TeamSheet({
  variant,
  reveal,
  picks = [],
  takenIds,
  lastPickId,
  onPick,
  bucketCaps,
}: TeamSheetProps) {
  if (variant === 'reveal') {
    if (!reveal) return null;
    return (
      <article className="team-sheet team-sheet--reveal" aria-label="Squad reveal">
        <header className="team-sheet__masthead">
          <h2 className="team-sheet__title">
            {reveal.country} {reveal.year}
          </h2>
          <span className="team-sheet__sub">Now revealing</span>
        </header>
        <ul className="team-sheet__roster">
          {reveal.players.map((player) => {
            const taken = takenIds?.has(player.id) ?? false;
            return (
              <li key={player.id}>
                <PlayerRow
                  player={player}
                  state={taken ? 'taken' : 'pickable'}
                  as="button"
                  onPick={onPick}
                />
              </li>
            );
          })}
        </ul>
      </article>
    );
  }

  // mine variant
  const groups = groupByBucket(picks);
  return (
    <article className="team-sheet team-sheet--mine" aria-label="Your squad so far">
      <header className="team-sheet__masthead">
        <h2 className="team-sheet__title">Your XI</h2>
        <span className="team-sheet__sub">
          {picks.length} / 11
        </span>
      </header>
      {picks.length === 0 ? (
        <p className="team-sheet__empty">Picks appear here as the squads roll in…</p>
      ) : (
        <div className="team-sheet__roster">
          {BUCKET_ORDER.map((bucket) =>
            groups[bucket].length === 0 ? null : (
              <div key={bucket}>
                <div className="team-sheet__section">
                  {bucket} ({groups[bucket].length}{bucketCaps ? ` / ${bucketCaps[bucket]}` : ''})
                </div>
                {groups[bucket].map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    // Mine sheet never renders 'taken' — the user OWNS these rows.
                    // Newest pick gets the stamped 'picked' state; the rest are 'owned'.
                    state={p.id === lastPickId ? 'picked' : 'owned'}
                    as="line"
                    showStamp={p.id === lastPickId}
                  />
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </article>
  );
}

function groupByBucket(picks: Pick[]): Record<PositionBucket, Pick[]> {
  const groups: Record<PositionBucket, Pick[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of picks) {
    groups[p.positionBucket].push(p);
  }
  return groups;
}
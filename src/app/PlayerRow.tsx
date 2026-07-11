import type { Player } from '../domain/types';

export type RowState = 'pickable' | 'picked' | 'taken';

interface PlayerRowProps {
  player: Player;
  state: RowState;
  onPick?: (playerId: string) => void;
  /** Reveal/menu rows are interactive <button>s; mine-sheet rows are plain divs. */
  as: 'button' | 'line';
  showStamp?: boolean;
}

function ratingTier(rating: number): 'icon' | 'strong' | 'solid' {
  if (rating >= 93) return 'icon';
  if (rating >= 86) return 'strong';
  return 'solid';
}

/**
 * PlayerRow (DESIGN.md Components). One typed line on a paper team sheet:
 * `NAME ······ POS · ⬤RATING`. Rating is an inked circle badge colored by
 * tier (93+ red / 86-92 blue / <=85 plain). States:
 *   pickable — hover paints a ballpoint underline
 *   picked   — a red SELECTED stamp punches in (120ms)
 *   taken    — typed `— TAKEN —` strikethrough, not clickable
 * Presentation only. `state` is derived by the parent from `session.picks`.
 */
export default function PlayerRow({ player, state, onPick, as, showStamp }: PlayerRowProps) {
  const tier = ratingTier(player.rating);
  const interactive = as === 'button' && state === 'pickable';

  const inner = (
    <>
      <span className="row__name">{player.name}</span>
      <span className="row__leader" aria-hidden="true">
        ·······
      </span>
      <span className={`row__pos bucket-${player.positionBucket}`}>{player.positionRaw}</span>
      <span className="row__sep" aria-hidden="true">
        ·
      </span>
      <span className={`row__rating row__rating--${tier}`}>{player.rating}</span>
      {showStamp && state === 'picked' && (
        <span className="row__stamp" aria-hidden="true">
          Selected
        </span>
      )}
      {state === 'taken' && (
        <span className="row__taken" aria-hidden="true">
          — Taken —
        </span>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className="player-row"
        data-state="pickable"
        onClick={() => onPick?.(player.id)}
      >
        {inner}
      </button>
    );
  }

  // Non-interactive line (mine sheet) OR a disabled/taken/picked button-row:
  // still a <button> when it lives on the reveal sheet so it stays focusable
  // for a11y, but disabled.
  if (as === 'button') {
    return (
      <button type="button" className="player-row" data-state={state} disabled>
        {inner}
      </button>
    );
  }

  return (
    <div className="player-row" data-state={state}>
      {inner}
    </div>
  );
}
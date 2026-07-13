import type { Player } from '../domain/types';

export type RowState = 'pickable' | 'picked' | 'taken' | 'owned';

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

type AttrKey = 'pace' | 'strength' | 'accuracy';
const ATTR_ORDER: AttrKey[] = ['pace', 'strength', 'accuracy'];

/**
 * The dominant (highest) attr of an outfield player — rendered at full --ink
 * weight so the specialization is scannable at a glance (Wave E). Ties resolve
 * pace > strength > accuracy (fixed order). Returns null when any attr is
 * missing (GK, or non-v2 data) — such rows show no attr digits.
 */
function dominantAttr(player: Player): AttrKey | null {
  const { pace, strength, accuracy } = player;
  if (pace === undefined || strength === undefined || accuracy === undefined) return null;
  const vals: Record<AttrKey, number> = { pace, strength, accuracy };
  let best: AttrKey = 'pace';
  for (const a of ATTR_ORDER) {
    if (vals[a] > vals[best]) best = a;
  }
  return best;
}

/**
 * PlayerRow (DESIGN.md Components). One typed line on a paper team sheet:
 * `NAME ······ POS · ⬤RATING`. Rating is an inked circle badge colored by
 * tier (93+ red / 86-92 blue / <=85 plain). States:
 *   pickable — hover paints a ballpoint underline
 *   picked   — a red SELECTED stamp punches in (120ms); mine-sheet's newest pick
 *   owned    — mine-sheet row for an already-owned pick (not the newest); clean,
 *              no stamp, no taken markup — mine rows NEVER render 'taken'
 *   taken    — reveal-sheet row disabled (id already picked, or same person
 *              picked under a different era-id); small red TAKEN tag, not clickable
 * Presentation only. `state` is derived by the parent from `session.picks`
 * (+ isPersonTaken for reveal rows) — never computed here.
 */
export default function PlayerRow({ player, state, onPick, as, showStamp }: PlayerRowProps) {
  const tier = ratingTier(player.rating);
  const interactive = as === 'button' && state === 'pickable';
  const dominant = dominantAttr(player);

  const inner = (
    <>
      <span className="row__name">{player.name}</span>
      <span className="row__leader" aria-hidden="true">
        ·······
      </span>
      {state === 'taken' && (
        <span className="row__taken-tag" aria-hidden="true">
          Taken
        </span>
      )}
      <span className={`row__pos bucket-${player.positionBucket}`}>{player.positionRaw}</span>
      <span className="row__sep" aria-hidden="true">
        ·
      </span>
      <span className={`row__rating row__rating--${tier}`}>{player.rating}</span>
      {/* P·S·A micro-attrs (Wave E): outfield only; GK rows carry no attrs, so
          `dominant` is null and nothing renders. Dominant axis at full ink so
          the specialization reads at a glance; the rest carbon-copy faded. */}
      {dominant && (
        <span
          className="row__attrs"
          aria-label={`pace ${player.pace}, strength ${player.strength}, accuracy ${player.accuracy}`}
        >
          {ATTR_ORDER.map((a, i) => (
            <span key={a}>
              {i > 0 && (
                <span className="row__attr-sep" aria-hidden="true">
                  ·
                </span>
              )}
              <span className={`row__attr${dominant === a ? ' row__attr--dom' : ''}`}>
                {player[a]}
              </span>
            </span>
          ))}
        </span>
      )}
      {showStamp && state === 'picked' && (
        <span className="row__stamp" aria-hidden="true">
          Selected
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
      <button type="button" className="player-row" data-state={state} disabled aria-disabled="true">
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
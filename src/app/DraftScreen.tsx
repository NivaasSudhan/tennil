import type { DraftSession, Pick, PositionBucket } from '../domain/types';
import { invariant } from '../lib/assert';

const BUCKET_ORDER: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

interface DraftScreenProps {
  session: DraftSession;
  error: string | null;
  onPick: (playerId: string) => void;
  onSkip: () => void;
}

/**
 * DraftScreen (TASKS.md T-010). Pure render + input layer: it reads `session`
 * fields to decide what to show and what to disable, but every state change is
 * delegated to `onPick`/`onSkip`, which the App shell wires to the domain
 * `pick`/`skip` functions. No draft rules are evaluated here.
 */
export default function DraftScreen({ session, error, onPick, onSkip }: DraftScreenProps) {
  invariant(session.currentReveal, 'DraftScreen requires an active reveal (phase !== COMPLETE)');
  const reveal = session.currentReveal;

  const totalRounds = 11 + (1 - session.skipRemaining);
  const squadByBucket = groupByBucket(session.picks);

  return (
    <div className="draft-screen">
      <header className="draft-header">
        <div className="draft-header-title">
          <span className="eyebrow">Now revealing</span>
          <h1>
            {reveal.country} {reveal.year}
          </h1>
        </div>
        <div className="round-counter">
          Round {session.roundsPlayed} / {totalRounds}
        </div>
      </header>

      {error && <div className="action-error" role="alert">{error}</div>}

      <section className="reveal-grid" aria-label="Squad reveal">
        {reveal.players.map((player) => {
          const disabled = session.picks.some((p) => p.id === player.id);
          return (
            <button
              key={player.id}
              type="button"
              className={`player-card${disabled ? ' player-card-disabled' : ''}`}
              disabled={disabled}
              onClick={() => onPick(player.id)}
            >
              <span className={`bucket-badge bucket-${player.positionBucket}`}>
                {player.positionBucket}
              </span>
              <span className="player-name">{player.name}</span>
              <span className="player-meta">
                {player.positionRaw} &middot; {player.rating}
              </span>
              {disabled && <span className="player-picked-tag">Already picked</span>}
            </button>
          );
        })}
      </section>

      <div className="draft-actions">
        <button
          type="button"
          className="skip-button"
          disabled={session.skipRemaining === 0}
          onClick={onSkip}
        >
          Skip squad — once per draft
        </button>
      </div>

      <section className="squad-panel" aria-label="Your squad so far">
        <h2>Your XI ({session.picks.length} / 11)</h2>
        <div className="squad-groups">
          {BUCKET_ORDER.map((bucket) => (
            <div key={bucket} className="squad-group">
              <h3>
                {bucket} ({squadByBucket[bucket].length})
              </h3>
              <ul>
                {squadByBucket[bucket].map((p) => (
                  <li key={p.id}>
                    {p.name} <span className="rating-pill">{p.rating}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function groupByBucket(picks: Pick[]): Record<PositionBucket, Pick[]> {
  const groups: Record<PositionBucket, Pick[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of picks) {
    groups[p.positionBucket].push(p);
  }
  return groups;
}

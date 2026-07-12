import { useState } from 'react';
import type { Formation } from '../domain/types';

interface StartScreenProps {
  formations: Formation[];
  defaultFormationId: string;
  variant: 'landing' | 'formation-only';
  /** formation-only only: the mode being repeated (Draft Again keeps the same mode). */
  mode?: 'daily' | 'free';
  /** Today's matchday number (ADR-014-lite); shown when daily mode is active. */
  matchdayNumber?: number;
  onStart: (formationId: string, mode: 'daily' | 'free') => void;
}

export default function StartScreen({
  formations,
  defaultFormationId,
  variant,
  mode,
  matchdayNumber,
  onStart,
}: StartScreenProps) {
  const [selectedId, setSelectedId] = useState(defaultFormationId);
  // Landing chooses mode via toggle (defaults to daily — the primary CTA).
  // formation-only (Draft Again) repeats whatever mode the finished session used.
  const [selectedMode, setSelectedMode] = useState<'daily' | 'free'>(mode ?? 'daily');
  const activeMode = variant === 'formation-only' ? mode ?? 'free' : selectedMode;
  const selected = formations.find((f) => f.id === selectedId);

  return (
    <div className="start-screen">
      {variant === 'landing' && (
        <>
          <span className="start-screen__eyebrow">World Cup Draft-XI</span>
          <h1 className="start-screen__masthead">TenNil</h1>
          <p className="start-screen__blurb">
            Legendary World Cup squads, revealed one at a time under the lights.
            Take one player from each reveal, lock an XI, and see what scoreline
            history hands you.
          </p>
          <ul className="start-rules">
            <li>11 rounds — one pick per revealed squad.</li>
            <li>One skip token: pass on a squad, once per draft. It costs a round.</li>
            <li>Your final XI decides the result. No dice — squad quality is destiny.</li>
          </ul>

          <div className="mode-picker" role="group" aria-label="Choose your mode">
            <button
              type="button"
              className={`mode-option${selectedMode === 'daily' ? ' mode-option--selected' : ''}`}
              onClick={() => setSelectedMode('daily')}
              aria-pressed={selectedMode === 'daily'}
            >
              Today&rsquo;s Matchday
            </button>
            <button
              type="button"
              className={`mode-option${selectedMode === 'free' ? ' mode-option--selected' : ''}`}
              onClick={() => setSelectedMode('free')}
              aria-pressed={selectedMode === 'free'}
            >
              Free Draft
            </button>
          </div>
          {selectedMode === 'daily' && matchdayNumber !== undefined && (
            <p className="matchday-badge">MATCHDAY #{matchdayNumber}</p>
          )}
        </>
      )}

      <section className="formation-picker" aria-label="Choose your formation">
        <h2 className="formation-picker__heading">
          {variant === 'landing' ? 'Choose your formation' : 'Select formation'}
        </h2>
        <div className="formation-picker__options">
          {formations.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`formation-option${selectedId === f.id ? ' formation-option--selected' : ''}`}
              onClick={() => setSelectedId(f.id)}
              aria-pressed={selectedId === f.id}
            >
              <span className="formation-option__label">{f.label}</span>
              <span className="formation-option__desc">{f.description}</span>
              <span className="formation-option__counts">
                {f.minCounts.DEF}-{f.minCounts.MID}-{f.minCounts.ATT}
              </span>
            </button>
          ))}
        </div>
        {selected && (
          <p className="formation-picker__advisory">
            {variant === 'landing' ? 'Your shape:' : 'Locking'} {selected.label} &mdash;{' '}
            {selected.minCounts.GK} GK, {selected.minCounts.DEF} DEF, {selected.minCounts.MID} MID, {selected.minCounts.ATT} ATT
            {variant === 'landing'
              ? '. Your formation sets the scoring target for the broadcast finale — fill each position bucket to qualify for the highest result bands.'
              : '.'}
          </p>
        )}
      </section>

      <button
        type="button"
        className="stadium-button"
        onClick={() => onStart(selectedId, activeMode)}
      >
        {variant === 'landing'
          ? 'Kick off'
          : activeMode === 'daily'
            ? "Replay Today's Draw"
            : 'Confirm Draft'}
      </button>
    </div>
  );
}

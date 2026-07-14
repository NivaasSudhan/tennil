import { useState } from 'react';
import type { Difficulty, Formation } from '../domain/types';
import type { OppositionDef } from '../domain/scoring/profileFit';
import RulesProgramme from './RulesProgramme';

interface StartScreenProps {
  formations: Formation[];
  defaultFormationId: string;
  variant: 'landing' | 'formation-only';
  /** Today's matchday number (ADR-014-lite); date framing, always shown on landing. */
  matchdayNumber?: number;
  /** Today's opponent label (ADR-020) — the daily opposition banner, landing only. */
  opponentLabel?: string;
  /** Today's opponent tagline — the "…is at a premium today" read under the banner. */
  opponentTagline?: string;
  /** Full opposition object for the Rules Programme opponent page. */
  opposition?: OppositionDef;
  difficulty?: Difficulty;
  onDifficultyChange?: (d: Difficulty) => void;
  onStart: (formationId: string) => void;
}

export default function StartScreen({
  formations,
  defaultFormationId,
  variant,
  matchdayNumber,
  opponentLabel,
  opponentTagline,
  opposition,
  difficulty = 'normal',
  onDifficultyChange = () => {},
  onStart,
}: StartScreenProps) {
  const [selectedId, setSelectedId] = useState(defaultFormationId);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const selected = formations.find((f) => f.id === selectedId);

  return (
    <div className="start-screen">
      {variant === 'landing' && (
        <>
          <span className="start-screen__eyebrow">World Cup Draft-XI</span>
          <h1 className="start-screen__masthead">TenNil</h1>
          <p className="start-taunt">Can you score 10-0?</p>
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

          <p className="matchday-badge">MATCHDAY #{matchdayNumber ?? '?'}</p>
          {opponentLabel && (
            <p className="matchday-opponent">
              <span className="matchday-opponent__vs">vs {opponentLabel}</span>
              {opponentTagline && (
                <span className="matchday-opponent__tag">{opponentTagline}</span>
              )}
            </p>
          )}

          <div className="difficulty-toggle" role="radiogroup" aria-label="Game difficulty">
            <button
              type="button"
              className={`difficulty-option${difficulty === 'normal' ? ' difficulty-option--selected' : ''}`}
              aria-pressed={difficulty === 'normal'}
              onClick={() => onDifficultyChange('normal')}
            >
              <span className="difficulty-option__label">NORMAL</span>
              <span className="difficulty-option__desc">— pick the best XI. That is the whole job.</span>
            </button>
            <button
              type="button"
              className={`difficulty-option${difficulty === 'hard' ? ' difficulty-option--selected' : ''}`}
              aria-pressed={difficulty === 'hard'}
              onClick={() => onDifficultyChange('hard')}
            >
              <span className="difficulty-option__label">HARD</span>
              <span className="difficulty-option__desc">— an opponent awaits. Read them or suffer.</span>
            </button>
          </div>
        </>
      )}

      {variant === 'landing' && (
        <div className="start-marginalia" aria-label="Programme marginalia">
          <button
            type="button"
            className="start-marginalia__link"
            aria-expanded={aboutOpen}
            aria-controls="tennil-about-fold"
            onClick={() => setAboutOpen((v) => !v)}
          >
            About
          </button>
          <button
            type="button"
            className="start-marginalia__link"
            onClick={() => setRulesOpen(true)}
          >
            RULES
          </button>
          {aboutOpen && (
            <p id="tennil-about-fold" className="start-marginalia__about">
              TenNil turns World Cup history into a three-minute draft: pick one
              player from each revealed squad, lock an XI, and get a deterministic
              scoreline. No dice &mdash; squad quality is destiny.
            </p>
          )}
          <a
            className="start-marginalia__link start-marginalia__link--issue"
            href="https://github.com/NivaasSudhan/tennil/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            Report a bug
          </a>
        </div>
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
        onClick={() => onStart(selectedId)}
      >
        <span className="stadium-button__text">
          {variant === 'landing' ? 'Kick off' : 'Confirm Draft'}
        </span>
      </button>

      <RulesProgramme
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        opposition={opposition}
      />
    </div>
  );
}

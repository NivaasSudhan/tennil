import { useState } from 'react';
import type { Difficulty, Formation } from '../domain/types';
import type { OppositionDef } from '../domain/scoring/profileFit';
import RulesProgramme from './RulesProgramme';

interface StartScreenProps {
  formations: Formation[];
  defaultFormationId: string;
  variant: 'landing' | 'formation-only';
  opponentLabel?: string;
  opponentTagline?: string;
  opposition?: OppositionDef;
  difficulty?: Difficulty;
  onDifficultyChange?: (d: Difficulty) => void;
  onStart: (formationId: string) => void;
}

export default function StartScreen({
  formations,
  defaultFormationId,
  variant,
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
      {variant === 'landing' ? (
        <>
          <span className="start-screen__eyebrow">World Cup Draft-XI</span>
          <h1 className="start-screen__masthead">TenNil</h1>
          <p className="start-taunt">Can you score 10-0?</p>
          <p className="start-screen__blurb">
            Legendary World Cup squads, revealed one at a time under the lights.
            Take one player from each reveal, lock an XI, and see what scoreline
            history hands you.
          </p>

          {opponentLabel && (
            <p className="opponent-banner">
              <span className="opponent-banner__vs">vs {opponentLabel}</span>
              {opponentTagline && (
                <span className="opponent-banner__tag">{opponentTagline}</span>
              )}
            </p>
          )}

          <section className="match-setup-sheet" aria-label="Match setup">
            <h2 className="match-setup-sheet__heading">MATCH SETUP</h2>

            <ul className="match-setup-sheet__rules">
              <li>11 rounds — one pick per revealed squad.</li>
              <li>One skip token: pass on a squad, once per draft. It costs a round.</li>
              <li>Your final XI decides the result. No dice — squad quality is destiny.</li>
            </ul>

            <div className="match-setup-sheet__difficulty" role="radiogroup" aria-label="Game difficulty">
              <button
                type="button"
                className={`formation-option${difficulty === 'normal' ? ' formation-option--selected' : ''}`}
                aria-pressed={difficulty === 'normal'}
                onClick={() => onDifficultyChange('normal')}
              >
                <span className="formation-option__label">NORMAL</span>
                <span className="formation-option__desc">Pick the best XI. That is the whole job.</span>
              </button>
              <button
                type="button"
                className={`formation-option${difficulty === 'hard' ? ' formation-option--selected' : ''}`}
                aria-pressed={difficulty === 'hard'}
                onClick={() => onDifficultyChange('hard')}
              >
                <span className="formation-option__label">HARD</span>
                <span className="formation-option__desc">An opponent awaits. Read them or suffer.</span>
              </button>
            </div>

            {difficulty === 'normal' ? (
              <div className="formation-section">
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
                    Your shape: {selected.label} &mdash;{' '}
                    {selected.minCounts.GK} GK, {selected.minCounts.DEF} DEF, {selected.minCounts.MID} MID, {selected.minCounts.ATT} ATT
                    . Your formation sets the scoring target for the broadcast finale — fill each position bucket to qualify for the highest result bands.
                  </p>
                )}
              </div>
            ) : (
              <p className="match-setup-sheet__hard-hint">Your opponent reveals first — you choose your shape after.</p>
            )}
          </section>

          <button
            type="button"
            className="stadium-button"
            onClick={() => onStart(selectedId)}
          >
            <span className="stadium-button__text">Kick off</span>
          </button>

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
            <span className="start-marginalia__sep">·</span>
            <button
              type="button"
              className="start-marginalia__link"
              onClick={() => setRulesOpen(true)}
            >
RULES
            </button>
            <span className="start-marginalia__sep">·</span>
            <a
              className="start-marginalia__link start-marginalia__link--issue"
              href="https://github.com/NivaasSudhan/tennil/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              Report a bug
            </a>
            {aboutOpen && (
              <p id="tennil-about-fold" className="start-marginalia__about">
                TenNil turns World Cup history into a three-minute draft: pick one
                player from each revealed squad, lock an XI, and get a deterministic
                scoreline. No dice &mdash; squad quality is destiny.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <section className="formation-picker" aria-label="Choose your formation">
            <h2 className="formation-picker__heading">Select formation</h2>
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
                Locking {selected.label} &mdash;{' '}
                {selected.minCounts.GK} GK, {selected.minCounts.DEF} DEF, {selected.minCounts.MID} MID, {selected.minCounts.ATT} ATT
                .
              </p>
            )}
          </section>

          <button
            type="button"
            className="stadium-button"
            onClick={() => onStart(selectedId)}
          >
            <span className="stadium-button__text">Confirm Draft</span>
          </button>
        </>
      )}

      <RulesProgramme
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        opposition={opposition}
        difficulty={difficulty}
      />
    </div>
  );
}

import { useRef, useState } from 'react';
import type { Difficulty, DraftSession, GameData, Rng } from '../domain/types';
import { IllegalActionError } from '../domain/types';
import { pick as domainPick, skip as domainSkip, startDraft } from '../domain/draft/session';
import { mulberry32 } from '../lib/rng';
import DraftScreen from './DraftScreen';
import ResultScreen from './ResultScreen';
import StartScreen from './StartScreen';
import './app.css';

export default function App({ data }: { data: GameData }) {
  const [session, setSession] = useState<DraftSession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [gate, setGate] = useState<'landing' | 'formation'>('landing');
  const [lastFormationId, setLastFormationId] = useState(data.thresholds.referenceFormation);
  // ADR-014-lite: one rng instance per session, threaded through its whole
  // lifetime (startDraft + every pick/skip), constructed from the recorded
  // seed at handleStart time. A ref (not state) because it's mutated in place
  // by mulberry32's internal closure, not by React.
  const rngRef = useRef<Rng | null>(null);

  function handleStart(formationId: string) {
    setActionError(null);
    try {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const rng = mulberry32(seed);
      rngRef.current = rng;
      // ADR-021 M2a: difficulty from landing toggle state.
      setSession(startDraft(data, rng, formationId, { seed, difficulty }));
      setLastFormationId(formationId);
    } catch (err) {
      if (err instanceof IllegalActionError) {
        setActionError(err.message);
      } else {
        throw err;
      }
    }
  }

  function handlePick(playerId: string) {
    setActionError(null);
    try {
      setSession((current) =>
        current === null ? current : domainPick(current, data, playerId, rngRef.current ?? mulberry32(0)),
      );
    } catch (err) {
      if (err instanceof IllegalActionError) {
        setActionError(err.message);
      } else {
        throw err;
      }
    }
  }

  function handleSkip() {
    setActionError(null);
    try {
      setSession((current) =>
        current === null ? current : domainSkip(current, data, rngRef.current ?? mulberry32(0)),
      );
    } catch (err) {
      if (err instanceof IllegalActionError) {
        setActionError(err.message);
      } else {
        throw err;
      }
    }
  }

  function handleRestart() {
    setActionError(null);
    const lid = session?.formationId ?? data.thresholds.referenceFormation;
    setLastFormationId(lid);
    setSession(null);
    setGate('formation');
    if (session) setDifficulty(session.difficulty);
  }

  const showFormationGate = session === null && gate === 'formation';
  const showLanding = session === null && gate === 'landing';
  // ADR-021: matchday/daily removed and the opponent is now drawn at kickoff (per
  // session, HARD only) rather than pre-selected for the landing. M2 owns the
  // OpponentCard reveal + NORMAL/HARD toggle; this M1 landing is opponent-free.

  return (
    <div className="app-shell">
      {showLanding ? (
        <StartScreen
          formations={data.thresholds.formations}
          defaultFormationId={data.thresholds.referenceFormation}
          variant="landing"
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          onStart={handleStart}
        />
      ) : showFormationGate ? (
        <StartScreen
          formations={data.thresholds.formations}
          defaultFormationId={lastFormationId}
          variant="formation-only"
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          onStart={handleStart}
        />
      ) : session === null ? null : session.phase === 'COMPLETE' ? (
        <ResultScreen session={session} data={data} onRestart={handleRestart} />
      ) : (
        <DraftScreen
          session={session}
          error={actionError}
          onPick={handlePick}
          onSkip={handleSkip}
          formations={data.thresholds.formations}
          formationId={session.formationId}
        />
      )}
    </div>
  );
}

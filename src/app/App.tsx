import { useRef, useState } from 'react';
import type { Difficulty, DraftSession, GameData, Rng } from '../domain/types';
import { IllegalActionError } from '../domain/types';
import { drawOpposition, pick as domainPick, skip as domainSkip, startDraft } from '../domain/draft/session';
import OpponentCard from './OpponentCard';
import { mulberry32 } from '../lib/rng';
import DraftScreen from './DraftScreen';
import ResultScreen from './ResultScreen';
import StartScreen from './StartScreen';
import './app.css';

export default function App({ data }: { data: GameData }) {
  const [session, setSession] = useState<DraftSession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [gate, setGate] = useState<'landing' | 'opponent-card' | 'formation'>('landing');
  const [lastFormationId, setLastFormationId] = useState(data.thresholds.referenceFormation);
  // ADR-014-lite: one rng instance per session, threaded through its whole
  // lifetime (startDraft + every pick/skip), constructed from the recorded
  // seed at handleStart time. A ref (not state) because it's mutated in place
  // by mulberry32's internal closure, not by React.
  const rngRef = useRef<Rng | null>(null);
  const preSeedRef = useRef<number | null>(null);
  const preOppositionIdRef = useRef<string | null>(null);

  function handleStart(formationId: string) {
    setActionError(null);
    try {
      if (difficulty === 'hard' && gate === 'landing') {
        const seed = Math.floor(Math.random() * 2 ** 31);
        const rng = mulberry32(seed);
        preSeedRef.current = seed;
        preOppositionIdRef.current = drawOpposition(data.thresholds, rng);
        setLastFormationId(formationId);
        setGate('opponent-card');
        return;
      }
      const seed = preSeedRef.current ?? Math.floor(Math.random() * 2 ** 31);
      const rng = mulberry32(seed);
      rngRef.current = rng;
      setSession(startDraft(data, rng, formationId, { seed, difficulty }));
      setLastFormationId(formationId);
      preSeedRef.current = null;
      preOppositionIdRef.current = null;
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
    const diff = session?.difficulty ?? difficulty;
    if (diff === 'hard') {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const rng = mulberry32(seed);
      preSeedRef.current = seed;
      preOppositionIdRef.current = drawOpposition(data.thresholds, rng);
      setGate('opponent-card');
    } else {
      setGate('formation');
    }
    if (session) setDifficulty(session.difficulty);
  }

  const showFormationGate = session === null && gate === 'formation';
  const showLanding = session === null && gate === 'landing';
  const showOpponentCard = session === null && gate === 'opponent-card';
  const preOppositionDef = preOppositionIdRef.current
    ? data.thresholds.oppositions.find((o) => o.id === preOppositionIdRef.current) ?? null
    : null;

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
      ) : showOpponentCard && preOppositionDef ? (
        <OpponentCard
          opposition={preOppositionDef}
          onContinue={() => setGate('formation')}
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

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

/** ADR-021: pick the weightMod axis with the highest multiplier for the
 * opponent-chip display word. Returns null when no mods (neutral) — the
 * chip then renders label-only. */
export function dominantAttrWord(weightMods: Record<string, number>): string | null {
  const entries = Object.entries(weightMods);
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
}

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
      if (gate === 'landing') {
        if (difficulty === 'hard') {
          const seed = Math.floor(Math.random() * 2 ** 31);
          const rng = mulberry32(seed);
          preSeedRef.current = seed;
          preOppositionIdRef.current = drawOpposition(data.thresholds, rng);
          setLastFormationId(formationId);
          setGate('opponent-card');
          return;
        }
        setLastFormationId(formationId);
        setGate('formation');
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
    setSession(null);
    setGate('landing');
    preSeedRef.current = null;
    preOppositionIdRef.current = null;
    if (session) {
      setDifficulty(session.difficulty);
      setLastFormationId(session.formationId);
    }
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
          defaultFormationId={lastFormationId}
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
        (() => {
          const chip = session.difficulty === 'hard' && session.oppositionId
            ? (() => {
                const def = data.thresholds.oppositions.find((o) => o.id === session.oppositionId);
                if (!def) return null;
                return { label: def.label, attrWord: dominantAttrWord(def.weightMods as Record<string, number>) };
              })()
            : null;
          return (
          <DraftScreen
            session={session}
            error={actionError}
            onPick={handlePick}
            onSkip={handleSkip}
            formations={data.thresholds.formations}
            formationId={session.formationId}
            opponentLabel={chip?.label}
            dominantAttr={chip?.attrWord}
          />
          );
        })()
      )}
    </div>
  );
}

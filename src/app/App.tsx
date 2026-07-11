import { useState } from 'react';
import type { DraftSession, GameData } from '../domain/types';
import { IllegalActionError } from '../domain/types';
import { pick as domainPick, skip as domainSkip, startDraft } from '../domain/draft/session';
import { systemRng } from '../lib/rng';
import DraftScreen from './DraftScreen';
import ResultScreen from './ResultScreen';
import StartScreen from './StartScreen';
import './app.css';

export default function App({ data }: { data: GameData }) {
  const [session, setSession] = useState<DraftSession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [gate, setGate] = useState<'landing' | 'formation'>('landing');
  const [lastFormationId, setLastFormationId] = useState(data.thresholds.referenceFormation);

  function handleStart(formationId: string) {
    setActionError(null);
    try {
      setSession(startDraft(data, systemRng(), formationId));
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
        current === null ? current : domainPick(current, data, playerId, systemRng()),
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
        current === null ? current : domainSkip(current, data, systemRng()),
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
  }

  const showFormationGate = session === null && gate === 'formation';
  const showLanding = session === null && gate === 'landing';

  return (
    <div className="app-shell">
      {showLanding ? (
        <StartScreen
          formations={data.thresholds.formations}
          defaultFormationId={data.thresholds.referenceFormation}
          variant="landing"
          onStart={handleStart}
        />
      ) : showFormationGate ? (
        <StartScreen
          formations={data.thresholds.formations}
          defaultFormationId={lastFormationId}
          variant="formation-only"
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

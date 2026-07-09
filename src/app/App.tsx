import { useState } from 'react';
import type { DraftSession, GameData } from '../domain/types';
import { IllegalActionError } from '../domain/types';
import { pick as domainPick, skip as domainSkip, startDraft } from '../domain/draft/session';
import { systemRng } from '../lib/rng';
import DraftScreen from './DraftScreen';
import ResultScreen from './ResultScreen';
import './app.css';

/**
 * App shell (ARCHITECTURE.md §1/§4; ADR-002). Owns the ONE `DraftSession` in
 * `useState`. Every state change goes through `pick`/`skip` from
 * `src/domain/draft/session.ts`, seeded with `systemRng()`. This component never
 * evaluates draft legality itself — it only reads `session.phase` to choose which
 * screen to render, and catches `IllegalActionError` defensively (should never fire
 * if the child screens disable illegal actions correctly).
 */
export default function App({ data }: { data: GameData }) {
  const [session, setSession] = useState<DraftSession>(() => startDraft(data, systemRng()));
  const [actionError, setActionError] = useState<string | null>(null);

  function handlePick(playerId: string) {
    setActionError(null);
    try {
      setSession((current) => domainPick(current, data, playerId, systemRng()));
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
      setSession((current) => domainSkip(current, data, systemRng()));
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
    setSession(startDraft(data, systemRng()));
  }

  return (
    <div className="app-shell">
      {session.phase === 'COMPLETE' ? (
        <ResultScreen session={session} data={data} onRestart={handleRestart} />
      ) : (
        <DraftScreen session={session} error={actionError} onPick={handlePick} onSkip={handleSkip} />
      )}
    </div>
  );
}

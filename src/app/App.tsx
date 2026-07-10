import { useState } from 'react';
import type { DraftSession, GameData } from '../domain/types';
import { IllegalActionError } from '../domain/types';
import { pick as domainPick, skip as domainSkip, startDraft } from '../domain/draft/session';
import { systemRng } from '../lib/rng';
import DraftScreen from './DraftScreen';
import ResultScreen from './ResultScreen';
import StartScreen from './StartScreen';
import './app.css';

/**
 * App shell (ARCHITECTURE.md §1/§4; ADR-002). Owns the ONE `DraftSession` in
 * `useState`. `session === null` means landing — UI state only, deliberately
 * NOT a DraftSession phase (ROADMAP §10). Every state change goes through
 * `pick`/`skip`/`startDraft` from `src/domain/draft/session.ts`, seeded with
 * `systemRng()`. This component never evaluates draft legality itself.
 * "Draft again" restarts directly — replay never bounces through landing.
 */
export default function App({ data }: { data: GameData }) {
  const [session, setSession] = useState<DraftSession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleStart() {
    setActionError(null);
    setSession(startDraft(data, systemRng()));
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
    setSession(startDraft(data, systemRng()));
  }

  return (
    <div className="app-shell">
      {session === null ? (
        <StartScreen onStart={handleStart} />
      ) : session.phase === 'COMPLETE' ? (
        <ResultScreen session={session} data={data} onRestart={handleRestart} />
      ) : (
        <DraftScreen session={session} error={actionError} onPick={handlePick} onSkip={handleSkip} />
      )}
    </div>
  );
}
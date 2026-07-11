import { useEffect, useRef, useState } from 'react';
import type { DraftSession, Formation, PositionBucket } from '../domain/types';
import { isPersonTaken } from '../domain/draft/person';
import { invariant } from '../lib/assert';
import StadiumButton from './StadiumButton';
import TeamSheet from './TeamSheet';

interface DraftScreenProps {
  session: DraftSession;
  error: string | null;
  onPick: (playerId: string) => void;
  onSkip: () => void;
  formations: Formation[];
  formationId: string | null;
}

/**
 * DraftScreen (TASKS.md T-010; DESIGN.md Components — paper world). Render +
 * input layer only. It reads `session` to decide what to show / disable, but
 * every state change is delegated to `onPick` / `onSkip`, which the App shell
 * wires to the domain pick/skip functions. No draft rules are evaluated here.
 *
 * Presentation-only local state:
 *   - `lastPickId` — the most recently picked player's id, so the mine-sheet
 *     row gets a SELECTED stamp entrance. Reset whenever the reveal squad
 *     changes. This is display plumbing, not rules logic.
 */
export default function DraftScreen({
  session,
  error,
  onPick,
  onSkip,
  formations,
  formationId,
}: DraftScreenProps) {
  invariant(session.currentReveal, 'DraftScreen requires an active reveal (phase !== COMPLETE)');
  const reveal = session.currentReveal;

  const [lastPickId, setLastPickId] = useState<string | null>(null);
  const prevRevealId = useRef<string>(reveal.id);

  useEffect(() => {
    if (reveal.id !== prevRevealId.current) {
      prevRevealId.current = reveal.id;
      setLastPickId(null);
    }
  }, [reveal.id]);

  // The most recent pick (if any) is the latest entry in session.picks — a pure
  // read used only to place the SELECTED stamp on the mine sheet.
  const derivedLastPick: string | null =
    session.picks.length > 0 ? session.picks[session.picks.length - 1].id : null;
  const stampPickId = lastPickId ?? derivedLastPick;

  // A reveal row is taken if its exact id is already picked, OR the same
  // person was picked under a different era-id (ADR-018) — domain call only,
  // no name-normalization logic lives here (R-08).
  const pickedIds = new Set(session.picks.map((p) => p.id));
  const takenIds = new Set(
    reveal.players
      .filter((p) => pickedIds.has(p.id) || isPersonTaken(session, p))
      .map((p) => p.id),
  );
  const totalRounds = 11 + (1 - session.skipRemaining);

  // Advisory bucket caps from chosen formation (A-only, never blocks picking).
  const bucketCaps: Record<PositionBucket, number> | undefined = (() => {
    if (!formationId) return undefined;
    const f = formations.find((x) => x.id === formationId);
    return f?.minCounts as Record<PositionBucket, number> | undefined;
  })();

  function handlePick(playerId: string) {
    setLastPickId(playerId);
    onPick(playerId);
  }

  return (
    <div className="draft-screen">
      <div className="flood-flare" aria-hidden="true" />
      <div className="draft-screen__topline">
        <span className="draft-screen__round">
          Round {session.roundsPlayed} / {totalRounds}
        </span>
      </div>

      {error && (
        <div className="action-error" role="alert">
          {error}
        </div>
      )}

      <div className="draft-stage">
        <TeamSheet
          variant="reveal"
          reveal={reveal}
          takenIds={takenIds}
          onPick={handlePick}
        />
        <TeamSheet
          variant="mine"
          picks={session.picks}
          lastPickId={stampPickId}
          bucketCaps={bucketCaps}
        />
      </div>

      <div className="draft-actions">
        <StadiumButton
          variant="ghost"
          onClick={onSkip}
          disabled={session.skipRemaining === 0}
        >
          Skip squad — once per draft
        </StadiumButton>
      </div>
    </div>
  );
}
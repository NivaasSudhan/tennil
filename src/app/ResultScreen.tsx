import { useMemo } from 'react';
import { usePlaythrough } from './usePlaythrough';
import type { DraftSession, FinalXI, GameData, Pick, PositionBucket } from '../domain/types';
import { getFinalXI } from '../domain/draft/session';
import { computeScoreInput, scoreBand } from '../domain/scoring/scoreBand';
import { buildCommentary } from '../domain/commentary/build';

const BUCKET_ORDER: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

interface ResultScreenProps {
  session: DraftSession;
  data: GameData;
  onRestart: () => void;
}

/**
 * ResultScreen (TASKS.md T-011 + T-013). Reads the completed session through the
 * domain's own read path (`getFinalXI` → `computeScoreInput` → `scoreBand` →
 * `buildCommentary`) — all pure, all domain-owned. This component does no scoring
 * math of its own; the timed reveal is presentation only.
 */
export default function ResultScreen({ session, data, onRestart }: ResultScreenProps) {
  const { band, groups, commentary } = useMemo(() => {
    const xi: FinalXI = getFinalXI(session);
    const scoreInput = computeScoreInput(xi, data.positionMap);
    const scored = scoreBand(scoreInput, data.thresholds);
    return {
      band: scored,
      groups: groupByBucket(xi, data.positionMap),
      commentary: buildCommentary(scored, xi, data.commentary),
    };
  }, [session, data]);

  const { visibleBeatCount, showScoreline, speed, setSpeed, skipToResult } =
    usePlaythrough(commentary.beats.length);

  return (
    <div className="result-screen">
      <header className="result-header">
        <span className="eyebrow">{showScoreline ? 'Full time' : 'Match in progress'}</span>
        {showScoreline ? (
          <>
            <h1 className="band-headline">{band.label}</h1>
            <div className="band-scoreline">{band.bandId}</div>
          </>
        ) : (
          <h1 className="band-headline band-headline-pending">Commentary rolling…</h1>
        )}
      </header>

      <section className="final-xi" aria-label="Your final XI">
        <h2>Your Final XI</h2>
        <div className="squad-groups">
          {BUCKET_ORDER.map((bucket) => (
            <div key={bucket} className="squad-group">
              <h3>
                {bucket} ({groups[bucket].length})
              </h3>
              <ul>
                {groups[bucket].map((p) => (
                  <li key={p.id}>
                    {p.name} <span className="rating-pill">{p.rating}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="playthrough" className="playthrough" aria-label="Match commentary">
        <div className="playthrough-header">
          <h2>Match feed</h2>
          {!showScoreline && (
            <div className="playback-controls">
              {([1, 2, 4] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`speed-button${speed === s ? ' speed-button-active' : ''}`}
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                >
                  {s}&times;
                </button>
              ))}
              <button type="button" className="skip-result-button" onClick={skipToResult}>
                Skip to result
              </button>
            </div>
          )}
        </div>
        <ol className="playthrough-beats">
          {commentary.beats.slice(0, visibleBeatCount).map((beat, i) => (
            <li key={`${beat.minute}-${i}`} className={`playthrough-beat beat-${beat.type}`}>
              <span className="beat-minute">{formatMinute(beat.minute)}</span>
              <span className="beat-text">{beat.text}</span>
            </li>
          ))}
        </ol>
        {showScoreline && (
          <div className="playthrough-fulltime" aria-live="polite">
            <span className="eyebrow">Full time</span>
            <div className="band-scoreline">{band.bandId}</div>
            <p className="band-headline">{band.label}</p>
          </div>
        )}
      </section>

      <div className="result-actions">
        <button type="button" className="restart-button" onClick={onRestart}>
          Draft again
        </button>
      </div>
    </div>
  );
}

function formatMinute(minute: number): string {
  return `${minute}'`;
}

function groupByBucket(xi: FinalXI, positionMap: GameData['positionMap']): Record<PositionBucket, Pick[]> {
  const groups: Record<PositionBucket, Pick[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of xi) {
    groups[positionMap[p.positionRaw]].push(p);
  }
  return groups;
}

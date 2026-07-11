import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaythrough } from './usePlaythrough';
import { useAudio } from './useAudio';
import type { DraftSession, FinalXI, GameData, Pick, PositionBucket, ScoreExplanation } from '../domain/types';
import { getFinalXI } from '../domain/draft/session';
import { computeScoreInput, scoreBand } from '../domain/scoring/scoreBand';
import { explainScoreBand } from '../domain/scoring/explainScoreBand';
import { withFormationMinCounts } from '../domain/scoring/withFormation';
import { buildCommentary } from '../domain/commentary/build';
import { progressScoreline } from './scorelineProgress';
import Scoreboard from './Scoreboard';
import Ticker from './Ticker';
import BandSlam from './BandSlam';

const BUCKET_ORDER: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

interface ResultScreenProps {
  session: DraftSession;
  data: GameData;
  onRestart: () => void;
}

/**
 * ResultScreen — broadcast world (WAVE U2). Score + script + explanation are
 * computed EXACTLY ONCE in the useMemo below (compute-once invariant; the timed
 * reveal is presentation only —pure). The progressive scoreboard is pure
 * presentation derived from already-computed data: progressScoreline(bandId,
 * goal-beat progress) floors toward the fixed final and snaps exact at
 * showScoreline (C4 — never re-score in a timer).
 */
export default function ResultScreen({ session, data, onRestart }: ResultScreenProps) {
  // -- Compute-once: band + commentary + explanation, before any timer. --
  const { band, groups, commentary, explanation, goalBeatIndices, totalBeats } = useMemo(() => {
    const xi: FinalXI = getFinalXI(session);
    const scoreInput = computeScoreInput(xi, data.positionMap);
    const config = withFormationMinCounts(data.thresholds, session.formationId);
    const scored = scoreBand(scoreInput, config);
    const expl = explainScoreBand(scoreInput, config);
    const script = buildCommentary(scored, xi, data.commentary);
    const goalIndices: number[] = [];
    script.beats.forEach((b, i) => {
      if (b.type === 'goal') goalIndices.push(i);
    });
    return {
      band: scored,
      groups: groupByBucket(xi, data.positionMap),
      commentary: script,
      explanation: expl,
      goalBeatIndices: goalIndices,
      totalBeats: script.beats.length,
    };
  }, [session, data]);

  const { visibleBeatCount, showScoreline, speed, setSpeed, skipToResult } =
    usePlaythrough(totalBeats);

  const audio = useAudio();

  // -- Progressive score purely from already-computed data (pure presentation). --
  const totalGoalBeats = goalBeatIndices.length;
  const { home, away } = useMemo(() => {
    if (showScoreline || totalBeats === 0) {
      return progressScoreline(band.bandId, 1);
    }
    if (totalGoalBeats > 0) {
      const visibleGoals = goalBeatIndices.filter((idx) => idx < visibleBeatCount).length;
      return progressScoreline(band.bandId, visibleGoals / totalGoalBeats);
    }
    return progressScoreline(band.bandId, Math.min(1, visibleBeatCount / totalBeats));
  }, [band.bandId, showScoreline, totalBeats, totalGoalBeats, goalBeatIndices, visibleBeatCount]);

  // -- Goal moment: beat reveal just gained a goal-type beat → flash + shake + roar. --
  const prevVisible = useRef(0);
  const [flash, setFlash] = useState(false);
  const [shake, setShake] = useState(false);
  useEffect(() => {
    const grew = visibleBeatCount > prevVisible.current;
    prevVisible.current = visibleBeatCount;
    if (!grew) return;
    const newBeat = commentary.beats[visibleBeatCount - 1];
    if (newBeat && newBeat.type === 'goal') {
      setFlash(true);
      setShake(true);
      window.setTimeout(() => setFlash(false), 90);
      window.setTimeout(() => setShake(false), 240);
      audio.playRoar();
    } else if (newBeat && newBeat.type === 'kickoff') {
      audio.playWhistle();
    }
  }, [visibleBeatCount, commentary.beats, audio]);

  // -- Full-time whistle once the scoreline reveals. --
  const didFtWhistle = useRef(false);
  useEffect(() => {
    if (showScoreline && !didFtWhistle.current) {
      didFtWhistle.current = true;
      audio.playWhistle();
    }
  }, [showScoreline, audio]);

  const visibleBeats = commentary.beats.slice(0, visibleBeatCount);

  return (
    <div className={`result-screen result-screen--broadcast ${shake ? 'result-screen--shake' : ''}`}>
      {/* Floodlight sweep across the pitch on entering finals. */}
      <div className="flood-sweep" aria-hidden="true" />
      {/* Screen-edge goal flash (pointer-events:none so controls stay live). */}
      {flash && <div className="goal-flash" aria-hidden="true" />}

      {/* Broadcast chrome — scoreboard top center + audio toggle. */}
      <div className="broadcast-chrome">
        <span className="broadcast-chrome__eyebrow eyebrow">
          {showScoreline ? 'Full time' : visibleBeatCount === 0 ? 'Kickoff' : 'Live'}
        </span>
        <Scoreboard home={home} away={away} />
        <button
          type="button"
          className={`audio-toggle ${audio.muted ? 'audio-toggle--muted' : 'audio-toggle--on'}`}
          onClick={audio.toggleMuted}
          aria-pressed={!audio.muted}
          aria-label={audio.muted ? 'Unmute match audio' : 'Mute match audio'}
        >
          {audio.muted ? '♪ off' : '♪ on'}
        </button>
      </div>

      {/* Miniature team sheet docked bottom-left (the finished XI). */}
      <aside className="result-sheet-mini" aria-label="Your final XI (miniature)">
        <h2>Your XI</h2>
        <FormationExplain
          formationId={session.formationId}
          formations={data.thresholds.formations}
          groups={groups}
        />
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
      </aside>

      {/* Ticker — broadcast lower-third commentary feed. */}
      <section id="playthrough" className="ticker-stage" aria-label="Match commentary">
        <Ticker beats={visibleBeats} />
        {showScoreline && (
          <BandSlam bandId={band.bandId} label={band.label} explanation={explanation as ScoreExplanation} />
        )}
      </section>

      {/* Playback controls — kept visible through everything (PRODUCT principle 5). */}
      <div className="playback-bar" role="group" aria-label="Playback controls">
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
        <button type="button" className="skip-result-button" onClick={skipToResult} disabled={showScoreline}>
          Skip to result
        </button>
        <button type="button" className="restart-button restart-button--bar" onClick={onRestart}>
          Draft again
        </button>
      </div>
    </div>
  );
}

/**
 * FormationExplain — compact formation summary for the result sheet.
 * Shows formation label + per-bucket count/cap with met/unmet indicator.
 */
function FormationExplain({
  formationId,
  formations,
  groups,
}: {
  formationId: string;
  formations: readonly { id: string; label: string; minCounts: Record<string, number> }[];
  groups: Record<PositionBucket, Pick[]>;
}) {
  const f = formations.find((x) => x.id === formationId);
  if (!f) return null;
  const { label, minCounts } = f;
  return (
    <div className="formation-explain">
      <span className="formation-explain__label">{label}</span>
      <span className="formation-explain__buckets">
        {BUCKET_ORDER.map((b, i) => {
          const count = groups[b].length;
          const cap = minCounts[b] ?? 0;
          const met = count >= cap;
          return (
            <span key={b} className={`formation-explain__bucket bucket-${b}`}>
              {i > 0 && <span className="formation-explain__sep">|</span>}
              {b} {count}/{cap} {met ? '✓' : '✗'}
            </span>
          );
        })}
      </span>
    </div>
  );
}

function groupByBucket(xi: FinalXI, positionMap: GameData['positionMap']): Record<PositionBucket, Pick[]> {
  const groups: Record<PositionBucket, Pick[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of xi) {
    groups[positionMap[p.positionRaw]].push(p);
  }
  return groups;
}
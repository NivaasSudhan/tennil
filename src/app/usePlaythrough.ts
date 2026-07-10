import { useEffect, useState } from 'react';

export type PlaybackSpeed = 1 | 2 | 4;

const BASE_BEAT_REVEAL_MS = 900;

export interface Playthrough {
  visibleBeatCount: number;
  showScoreline: boolean;
  speed: PlaybackSpeed;
  setSpeed: (speed: PlaybackSpeed) => void;
  skipToResult: () => void;
}

/**
 * Playback state for the result screen (Sprint-1 Task 2; ROADMAP §6 Phase 1).
 * PRESENTATION ONLY, enforced structurally: this hook receives only the beat
 * COUNT — never beats, band, or session — so timing cannot influence content.
 * The scoreline + commentary script are computed once, before any timer, in
 * ResultScreen's useMemo. Changing speed mid-beat restarts the pending
 * timeout at the new duration (accepted: worst case one beat is briefly
 * re-delayed; content is unaffected).
 */
export function usePlaythrough(totalBeats: number): Playthrough {
  // 0 = nothing shown, 1..totalBeats = beats revealed, totalBeats+1 = scoreline
  const [revealStep, setRevealStep] = useState(0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  useEffect(() => {
    if (revealStep > totalBeats) return;
    const id = window.setTimeout(() => {
      setRevealStep((step) => step + 1);
    }, BASE_BEAT_REVEAL_MS / speed);
    return () => window.clearTimeout(id);
  }, [revealStep, totalBeats, speed]);

  return {
    visibleBeatCount: Math.min(revealStep, totalBeats),
    showScoreline: revealStep > totalBeats,
    speed,
    setSpeed,
    skipToResult: () => setRevealStep(totalBeats + 1),
  };
}

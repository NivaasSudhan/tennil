/**
 * BandSlam — full-time verdict (DESIGN.md Components / Motion).
 * Band label slams in (scale 1.15 → 1, 250ms ease-out-quint) with a gold
 * underline; the near-miss margin line beneath types itself in per-character
 * (Courier). 10-0 (top band, no near-miss) gets a gold confetti burst on top.
 *
 * aria-live polite, no focus trap (PRODUCT.md Accessibility). Near-miss text
 * comes from the ScoreExplanation computed once in ResultScreen's useMemo
 * (explainScoreBand) — never re-scored here.
 */
import { useEffect, useState } from 'react';
import type { ScoreExplanation } from '../domain/types';
import type { OppositionDef } from '../domain/scoring/profileFit';
import { formatNearMiss } from './nearMiss';

export interface BandSlamProps {
  bandId: string;
  label: string;
  explanation: ScoreExplanation;
  /** ADR-020: today's opposition — selects the minFit near-miss template's copy. */
  opposition?: OppositionDef;
}

export default function BandSlam({ bandId, label, explanation, opposition }: BandSlamProps) {
  const isTopBand = explanation.nextBetter === null;
  const { text: nearMissText } = formatNearMiss(explanation, opposition);
  const typed = useTypewriter(nearMissText ?? '');

  return (
    <div className="bandslam" aria-live="polite" role="status">
      {isTopBand && <ConfettiBurst />}
      <div className="bandslam__label" key={bandId}>
        {label}
        <span className="bandslam__underline" aria-hidden="true" />
      </div>
      <div className="bandslam__scoreline">{bandId}</div>
      {nearMissText && <p className="bandslam__nearmiss">{typed || '\u00A0'}</p>}
    </div>
  );
}

/**
 * Types `text` in one character at a time (~20ms/char) so the near-miss line
 * "2 POINTS FROM A 5-0" appears to be typed on a programme typewriter.
 * Cleared when text becomes empty. Under reduced-motion the full text renders
 * instantly (CSS forces the animation duration to ~0 — see app.css).
 */
function useTypewriter(text: string): string {
  const [shown, setShown] = useState('');
  useEffect(() => {
    setShown('');
    if (!text) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 20);
    return () => window.clearInterval(id);
  }, [text]);
  return shown;
}

/** Gold confetti burst — pure DOM/CSS, no binary asset. 10-0 only. */
function ConfettiBurst() {
  const bits = Array.from({ length: 18 });
  return (
    <div className="bandslam__confetti" aria-hidden="true">
      {bits.map((_, i) => (
        <span key={i} className="bandslam__confetti-bit" style={{ '--i': i } as Record<string, string | number>} />
      ))}
    </div>
  );
}
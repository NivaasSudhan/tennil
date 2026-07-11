/**
 * Scoreboard — broadcast chrome, top center (DESIGN.md Components).
 * Dumb presentational: parent passes already-derived home/away numbers.
 * No bandId parsing, no progress math, no timers — the parent (ResultScreen)
 * computes the score from visibleBeatCount / bandId via progressScoreline inside
 * its render (pure presentation derived from already-computed data). Flip-tick
 * animation is keyed by the digit value so CSS animates only when a digit changes.
 *
 * Accessibility: aria-live polite so a scored goal is announced once the board
 * settles; visually the digits flip. Not a focus trap.
 */
export interface ScoreboardProps {
  home: number;
  away: number;
  label?: string;
}

export default function Scoreboard({ home, away, label = 'DRAFT XI  ·  OPPONENTS' }: ScoreboardProps) {
  const [homeLabel, awayLabel] = label.includes('·')
    ? (label.split('·').map((s) => s.trim()) as [string, string])
    : (['DRAFT XI', 'OPPONENTS'] as [string, string]);

  return (
    <div className="scoreboard" role="status" aria-live="polite" aria-label={`Draft XI ${home}, Opponents ${away}`}>
      <div className="scoreboard__row">
        <div className="scoreboard__team">
          <span className="scoreboard__club">{homeLabel}</span>
          <span className="scoreboard__digit" key={`h${home}`}>
            {home}
          </span>
        </div>
        <span className="scoreboard__dash" aria-hidden="true">–</span>
        <div className="scoreboard__team">
          <span className="scoreboard__club">{awayLabel}</span>
          <span className="scoreboard__digit" key={`a${away}`}>
            {away}
          </span>
        </div>
      </div>
    </div>
  );
}
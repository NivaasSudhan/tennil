/**
 * Ticker — commentary beats as broadcast lower-third lines sliding in
 * (DESIGN.md Components). Minute stamp in gold. Replaces the plain list render
 * with a broadcast-feed look; the parent passes exactly the beats that should be
 * visible (slice already applied) so this component owns only presentation.
 *
 * Skip + speed controls stay owned by the parent (ResultScreen); they are kept
 * visible through everything per PRODUCT.md principle 5 — this component never
 * renders anything that covers them (no full-bleed overlay).
 */
import type { CommentaryBeat } from '../domain/types';

export interface TickerProps {
  beats: CommentaryBeat[];
}

export default function Ticker({ beats }: TickerProps) {
  return (
    <ol className="ticker" aria-label="Match commentary feed">
      {beats.map((beat, i) => (
        <li key={`${beat.minute}-${i}`} className={`ticker__line ticker__line--${beat.type}`}>
          <span className="ticker__minute">{formatMinute(beat.minute)}</span>
          <span className="ticker__text">{beat.text}</span>
        </li>
      ))}
    </ol>
  );
}

function formatMinute(minute: number): string {
  return `${minute}'`;
}
/**
 * ShareRow — broadcast-chrome row of share affordances, rendered under
 * the BandSlam once the scoreline is revealed. One row, small, never overlays
 * the playback controls. All share-text/url resolution happens upstream in
 * matchdayCard.ts (compute-once); this is pure presentation.
 *
 * Affordances: DOWNLOAD CARD (canvas→PNG→<a download>), SHARE (navigator.share
 * when available — otherwise hidden), POST TO X (twitter intent), WHATSAPP
 * (wa.me), COPY (clipboard). No new deps, no RNG.
 */
import { useState } from 'react';
import {
  downloadMatchdayCard,
  whatsappHref,
  xIntentHref,
  type MatchdayCardData,
} from './matchdayCard';

export interface ShareRowProps {
  cardData: MatchdayCardData;
}

export default function ShareRow({ cardData }: ShareRowProps) {
  const [copied, setCopied] = useState(false);
  const hasShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function onCopy() {
    try {
      await navigator.clipboard?.writeText(cardData.shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  async function onShare() {
    if (!hasShare) return;
    try {
      await navigator.share({ text: cardData.shareText, url: cardData.shareUrl });
    } catch {
      /* user cancelled or share blocked */
    }
  }

  return (
    <div className="share-row" role="group" aria-label="Share this result card">
      <button
        type="button"
        className="share-row__btn share-row__btn--download"
        onClick={() => { void downloadMatchdayCard(cardData); }}
      >
        Download card
      </button>
      {hasShare && (
        <button
          type="button"
          className="share-row__btn"
          onClick={() => { void onShare(); }}
        >
          Share
        </button>
      )}
      <a
        className="share-row__btn share-row__btn--link"
        href={xIntentHref(cardData.shareText)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Post to X
      </a>
      <a
        className="share-row__btn share-row__btn--link"
        href={whatsappHref(cardData.shareText)}
        target="_blank"
        rel="noopener noreferrer"
      >
        WhatsApp
      </a>
      <button
        type="button"
        className="share-row__btn"
        onClick={() => { void onCopy(); }}
        aria-label={copied ? 'Copied' : 'Copy share text'}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
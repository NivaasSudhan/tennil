/**
 * matchdayCard.ts — WAVE V4b paper team-sheet share card.
 *
 * Two halves:
 *   - buildCardData(): pure, canvas-free payload from already-memoized result
 *     values (band / groups / near-miss / formation / mode). Resolves the
 *     share-text templates + eyebrow + top-player here so the share row and
 *     the canvas painter share one source of truth (compute-once invariant).
 *   - renderMatchdayCard(): hand-draws a 1080x1350 (4:5) PAPER TEAM SHEET on a
 *     2D <canvas>. No html2canvas, no new deps. Guarded by try so jsdom (no
 *     real 2d context) is a silent no-op rather than a throw.
 *
 * No RNG, no scoring calls feed in here. Canvas colors are hardcoded hex
 * equivalents of the DESIGN.md OKLCH tokens (a <canvas> cannot read CSS vars);
 * each constant below documents the token it mirrors.
 */
import type { PositionBucket } from '../domain/types';

// ---------- Card dimensions ----------
export const CARD_W = 1080;
export const CARD_H = 1350; // 4:5 social/portrait
const SAFE = 72; // outer safe margin (px in card space)
export const SHARE_URL = 'https://nivaassudhan.github.io/tennil/';

export const BUCKET_ORDER: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

export interface CardPlayer {
  name: string;
  rating: number;
}

export interface CardGroups {
  GK: CardPlayer[];
  DEF: CardPlayer[];
  MID: CardPlayer[];
  ATT: CardPlayer[];
}

export interface MatchdayCardData {
  mode: 'daily' | 'free';
  matchdayNumber: number | undefined;
  formationId: string;
  formationLabel: string;
  bandId: string;
  bandLabel: string;
  nearMissText: string | null;
  groups: CardGroups;
  topPlayerName: string;
  eyebrow: string;
  shareText: string;
  shareUrl: string;
}

export interface BuildCardDataInput {
  mode: 'daily' | 'free';
  matchdayNumber?: number;
  formationId: string;
  formationLabel: string;
  bandId: string;
  bandLabel: string;
  nearMissText: string | null;
  groups: CardGroups;
}

/** Resolve the best-rated pick across the XI; ties → first in GK>DEF>MID>ATT. */
function resolveTopPlayer(groups: CardGroups): string {
  let best: CardPlayer | null = null;
  for (const bucket of BUCKET_ORDER) {
    for (const p of groups[bucket]) {
      if (!best || p.rating > best.rating) best = p;
    }
  }
  return best?.name ?? 'XI';
}

/** Daily: 'TenNil Matchday #N: BAND LABEL. Draft your XI: URL' (exact). */
function dailyShareText(matchdayNumber: number, bandId: string, bandLabel: string): string {
  return `TenNil Matchday #${matchdayNumber}: ${bandId} ${bandLabel}. Draft your XI: ${SHARE_URL}`;
}

/** Free: 'TenNil: I drafted {top} and it ended BANDID. URL' (exact). */
function freeShareText(topPlayer: string, bandId: string): string {
  return `TenNil: I drafted ${topPlayer} and it ended ${bandId}. ${SHARE_URL}`;
}

/** Pure payload builder — no DOM, no canvas, no RNG. */
export function buildCardData(input: BuildCardDataInput): MatchdayCardData {
  const topPlayerName = resolveTopPlayer(input.groups);
  const isDaily = input.mode === 'daily';
  const matchdayNumber = isDaily ? input.matchdayNumber : undefined;
  const eyebrow = isDaily
    ? `MATCHDAY #${matchdayNumber ?? ''}`
    : 'FREE DRAFT';
  const shareText = isDaily
    ? dailyShareText(matchdayNumber ?? 0, input.bandId, input.bandLabel)
    : freeShareText(topPlayerName, input.bandId);
  return {
    mode: input.mode,
    matchdayNumber,
    formationId: input.formationId,
    formationLabel: input.formationLabel,
    bandId: input.bandId,
    bandLabel: input.bandLabel,
    nearMissText: input.nearMissText,
    groups: input.groups,
    topPlayerName,
    eyebrow,
    shareText,
    shareUrl: SHARE_URL,
  };
}

/** Anchor download filename for the rendered PNG. */
export function cardFilename(data: MatchdayCardData): string {
  return data.mode === 'daily'
    ? `tennil-matchday-${data.matchdayNumber}.png`
    : `tennil-card-${data.bandId}.png`;
}

/** Twitter / X intent href (URL-encoded share text). */
export function xIntentHref(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/** WhatsApp wa.me href (URL-encoded share text, which already contains the URL). */
export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------- Canvas painter ----------
//
// Hardcoded DESIGN.md token equivalents (OKLCH → hex). A 2d canvas context
// cannot read CSS custom properties, so we freeze the resolved palette here.
// If DESIGN.md tokens change, update these constants together.
const PAPER        = '#f4f2ea'; // --paper       oklch(0.955 0.01 95)
const INK          = '#2f3340'; // --ink         oklch(0.27 0.02 260)
const INK_FADED    = '#6b6f7c'; // --ink-faded   oklch(0.42 0.02 260)
const STAMP        = '#b8412b'; // --stamp       oklch(0.52 0.19 27)
const GOLD         = '#cdA44a'; // --gold        oklch(0.82 0.14 88)
const RATING_RED   = '#b8412b'; // --rating-icon oklch(0.52 0.19 27) (93+)
const RATING_BLUE  = '#3f4f8e'; // --rating-strong oklch(0.40 0.10 260) (86-92)

function ratingColor(rating: number): string {
  if (rating >= 93) return RATING_RED;
  if (rating >= 86) return RATING_BLUE;
  return INK;
}

function mastheadFont(size: number): string {
  // Anton if loaded, else a condensed bold fallback the OS supplies.
  return `${size}px Anton, 'Oswald', 'Arial Narrow', sans-serif`;
}
function monoFont(size: number, bold = false): string {
  return `${bold ? '700' : '400'} ${size}px 'Courier Prime', 'Courier New', monospace`;
}
function uiFont(size: number, weight = '600'): string {
  return `${weight} ${size}px Archivo, system-ui, sans-serif`;
}

/**
 * Hand-draw the paper team sheet onto the supplied canvas (sized externally to
 * CARD_W x CARD_H). Pure drawing: no state read besides `data`. Wrapped in
 * try by the caller path (downloadMatchdayCard); a failed 2d context (jsdom)
 * throws here and is swallowed upstream. Best-effort document.fonts usage.
 */
export function renderMatchdayCard(canvas: HTMLCanvasElement, data: MatchdayCardData): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  ctx.textBaseline = 'alphabetic';

  // Paper base + gentle vignette toward paper-shade at edges.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const grad = ctx.createRadialGradient(
    CARD_W / 2, CARD_H / 2, CARD_W * 0.2,
    CARD_W / 2, CARD_H / 2, CARD_W * 0.95,
  );
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(120,110,85,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Masthead.
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  // Best-effort: wait for Anton if the FontFace API is present (no-op if not).
  try { void (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* no-op */ }
  ctx.font = mastheadFont(150);
  ctx.fillText('TENNIL', CARD_W / 2, SAFE + 120);

  // Eyebrow under masthead.
  ctx.font = uiFont(40, '600');
  ctx.fillStyle = INK_FADED;
  ctx.fillText(data.eyebrow, CARD_W / 2, SAFE + 185);

  // Thin divider rule.
  ctx.strokeStyle = INK_FADED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SAFE + 40, SAFE + 215);
  ctx.lineTo(CARD_W - SAFE - 40, SAFE + 215);
  ctx.stroke();

  // XI grouped rows — GK / DEF / MID / ATT.
  ctx.textAlign = 'left';
  const rowH = 70;
  let y = SAFE + 285;
  const labelX = SAFE;
  const nameX = SAFE + 150;
  const ratingX = CARD_W - SAFE - 70;
  for (const bucket of BUCKET_ORDER) {
    const players = data.groups[bucket];
    if (players.length === 0) continue;
    // Bucket tag.
    ctx.fillStyle = INK_FADED;
    ctx.font = uiFont(34, '800');
    ctx.fillText(`${bucket}`, labelX, y - 14);
    for (const p of players) {
      ctx.fillStyle = INK;
      ctx.font = monoFont(38);
      ctx.fillText(p.name.toUpperCase(), nameX, y);
      // dotted leader.
      ctx.fillStyle = INK_FADED;
      ctx.font = monoFont(38);
      const nameWidth = ctx.measureText(p.name.toUpperCase()).width;
      const dotsStart = nameX + nameWidth + 12;
      const dotsEnd = ratingX - 18;
      let dx = dotsStart;
      ctx.beginPath();
      ctx.fillStyle = INK_FADED;
      while (dx < dotsEnd) { ctx.fillText('·', dx, y); dx += 14; }
      // Rating circle.
      ctx.beginPath();
      ctx.arc(ratingX, y - 12, 26, 0, Math.PI * 2);
      ctx.fillStyle = ratingColor(p.rating);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.font = uiFont(30, '800');
      ctx.textAlign = 'center';
      ctx.fillText(String(p.rating), ratingX, y - 2);
      ctx.textAlign = 'left';
      y += rowH;
    }
    y += 14;
  }

  // Formation id (lower-left, monospace).
  ctx.fillStyle = INK_FADED;
  ctx.font = monoFont(30);
  ctx.fillText(`FORMATION  ${data.formationLabel.toUpperCase()}`, SAFE, y + 10);

  // Band verdict block (gold underline) + near-miss/mock line.
  const verdictY = y + 90;
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = uiFont(56, '800');
  ctx.fillText(data.bandLabel.toUpperCase(), CARD_W / 2, verdictY);
  // gold underline.
  const verdictW = ctx.measureText(data.bandLabel.toUpperCase()).width;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(CARD_W / 2 - verdictW / 2, verdictY + 14);
  ctx.lineTo(CARD_W / 2 + verdictW / 2, verdictY + 14);
  ctx.stroke();

  // bandId big.
  ctx.fillStyle = INK;
  ctx.font = mastheadFont(120);
  ctx.fillText(data.bandId, CARD_W / 2, verdictY + 130);

  // near-miss / mock line (Courier).
  if (data.nearMissText) {
    ctx.fillStyle = STAMP;
    ctx.font = monoFont(34, true);
    ctx.fillText(data.nearMissText, CARD_W / 2, verdictY + 180);
  }

  // Footer.
  ctx.fillStyle = INK_FADED;
  ctx.font = monoFont(28);
  ctx.fillText('nivaassudhan.github.io/tennil', CARD_W / 2, CARD_H - SAFE - 10);
  ctx.textAlign = 'left';
}

/**
 * Render the card off a fresh 1080x1350 canvas, convert to a PNG blob, and
 * click a transient <a download> to save it. Best-effort: if the 2d context
 * is unavailable (jsdom, locked-down browsers), bail silently. Pure-ish
 * (only DOM for the download side-effect; no React, no scoring).
 */
export async function downloadMatchdayCard(data: MatchdayCardData): Promise<void> {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  try {
    renderMatchdayCard(canvas, data);
  } catch {
    return; // no canvas 2d available — nothing to download
  }
  await new Promise<void>((resolve) => {
    const toBlob = (canvas as HTMLCanvasElement).toBlob;
    if (!toBlob) { resolve(); return; }
    toBlob.call(
      canvas,
      (blob) => {
        if (!blob) { resolve(); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = cardFilename(data);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        resolve();
      },
      'image/png',
    );
  });
}
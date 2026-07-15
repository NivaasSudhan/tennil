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
const MARGIN = 60; // outer margin (px, left/right)
// Top-down layout budget (y-values in px on 1080×1350 canvas) — docs
const VERDICT_START_Y = 1060;
const FOOTER_Y = 1310;
export const SHARE_URL = 'https://wctennil.com/';

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
  difficulty: 'normal' | 'hard';
  formationId: string;
  formationLabel: string;
  bandId: string;
  bandLabel: string;
  nearMissText: string | null;
  groups: CardGroups;
  topPlayerName: string;
  /** ADR-020 Wave E: today's opposition label ('THE PRESSING MACHINE'), if known. */
  opponentLabel: string | undefined;
  eyebrow: string;
  shareText: string;
  shareUrl: string;
}

export interface BuildCardDataInput {
  difficulty: 'normal' | 'hard';
  formationId: string;
  formationLabel: string;
  bandId: string;
  bandLabel: string;
  nearMissText: string | null;
  groups: CardGroups;
  /** ADR-020 Wave E: today's opposition label — flows into share text + card eyebrow. */
  opponentLabel?: string;
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

/** Hard: 'TenNil [HARD] vs THE PRESSING MACHINE: 7-1 CLASSY WIN. Draft your XI: URL' */
function hardShareText(
  bandId: string,
  bandLabel: string,
  opponentLabel?: string,
): string {
  const vs = opponentLabel ? ` vs ${opponentLabel}` : '';
  return `TenNil [HARD]${vs}: ${bandId} ${bandLabel}. Draft your XI: ${SHARE_URL}`;
}

/** Normal: 'TenNil: 7-1 CLASSY WIN. Draft your XI: URL' */
function normalShareText(bandId: string, bandLabel: string): string {
  return `TenNil: ${bandId} ${bandLabel}. Draft your XI: ${SHARE_URL}`;
}

/** Pure payload builder — no DOM, no canvas, no RNG. */
export function buildCardData(input: BuildCardDataInput): MatchdayCardData {
  const topPlayerName = resolveTopPlayer(input.groups);
  const isHard = input.difficulty === 'hard';
  const vsEyebrow = isHard && input.opponentLabel ? ` · vs ${input.opponentLabel}` : '';
  const eyebrow = isHard
    ? `[HARD]${vsEyebrow}`
    : '';
  const shareText = isHard
    ? hardShareText(input.bandId, input.bandLabel, input.opponentLabel)
    : normalShareText(input.bandId, input.bandLabel);
  return {
    difficulty: input.difficulty,
    formationId: input.formationId,
    formationLabel: input.formationLabel,
    bandId: input.bandId,
    bandLabel: input.bandLabel,
    nearMissText: input.nearMissText,
    groups: input.groups,
    topPlayerName,
    opponentLabel: input.opponentLabel,
    eyebrow,
    shareText,
    shareUrl: SHARE_URL,
  };
}

/** Anchor download filename for the rendered PNG. */
export function cardFilename(_data: MatchdayCardData): string {
  return 'tennil-result.png';
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

  // --- Masthead block (ends by y=300) ---
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  try { void (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* no-op */ }
  ctx.font = mastheadFont(120);
  ctx.fillText('TENNIL', CARD_W / 2, 155);

  // Eyebrow now carries the opponent (Wave E) — auto-shrink so long labels
  // ('MATCHDAY #33 · vs THE PRESSING MACHINE') never overflow the margins.
  let eyebrowSize = 36;
  ctx.font = uiFont(eyebrowSize, '600');
  while (eyebrowSize > 22 && ctx.measureText(data.eyebrow).width > CARD_W - 2 * MARGIN) {
    eyebrowSize -= 2;
    ctx.font = uiFont(eyebrowSize, '600');
  }
  ctx.fillStyle = INK_FADED;
  ctx.fillText(data.eyebrow, CARD_W / 2, 215);

  ctx.strokeStyle = INK_FADED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN + 30, 250);
  ctx.lineTo(CARD_W - MARGIN - 30, 250);
  ctx.stroke();

  // --- Roster block (y=300..1000 MAX) ---
  ctx.textAlign = 'left';
  const playerRows = BUCKET_ORDER.reduce((n, b) => n + data.groups[b].length, 0);
  const labelCount = BUCKET_ORDER.filter((b) => data.groups[b].length > 0).length;
  const rowH = Math.min(56, Math.floor(700 / (playerRows + labelCount * 0.6)));
  let y = 310;
  const labelX = MARGIN;
  const nameX = MARGIN + 130;
  const ratingX = CARD_W - MARGIN - 60;
  for (const bucket of BUCKET_ORDER) {
    const players = data.groups[bucket];
    if (players.length === 0) continue;
    ctx.fillStyle = INK_FADED;
    ctx.font = uiFont(28, '800');
    ctx.fillText(`${bucket}`, labelX, y - 8);
    for (const p of players) {
      ctx.fillStyle = INK;
      ctx.font = monoFont(32);
      ctx.fillText(p.name.toUpperCase(), nameX, y);
      ctx.fillStyle = INK_FADED;
      ctx.font = monoFont(32);
      const nameWidth = ctx.measureText(p.name.toUpperCase()).width;
      const dotsStart = nameX + nameWidth + 10;
      const dotsEnd = ratingX - 16;
      let dx = dotsStart;
      ctx.beginPath();
      ctx.fillStyle = INK_FADED;
      while (dx < dotsEnd) { ctx.fillText('·', dx, y); dx += 12; }
      ctx.beginPath();
      ctx.arc(ratingX, y - 10, 22, 0, Math.PI * 2);
      ctx.fillStyle = ratingColor(p.rating);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.font = uiFont(26, '800');
      ctx.textAlign = 'center';
      ctx.fillText(String(p.rating), ratingX, y);
      ctx.textAlign = 'left';
      y += rowH;
    }
    y += 8;
  }

  // Formation id (lower-left, monospace).
  const rosterEndY = y;
  ctx.fillStyle = INK_FADED;
  ctx.font = monoFont(26);
  ctx.fillText(`FORMATION  ${data.formationLabel.toUpperCase()}`, MARGIN, rosterEndY + 30);

  // --- Verdict block (stacked from y=1060, end by y=1270) ---
  const verdictBaseline = VERDICT_START_Y + 30; // 1090
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = uiFont(62, '800');
  ctx.fillText(data.bandLabel.toUpperCase(), CARD_W / 2, verdictBaseline);

  const verdictW = ctx.measureText(data.bandLabel.toUpperCase()).width;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(CARD_W / 2 - verdictW / 2, verdictBaseline + 10);
  ctx.lineTo(CARD_W / 2 + verdictW / 2, verdictBaseline + 10);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = mastheadFont(84);
  ctx.fillText(data.bandId, CARD_W / 2, verdictBaseline + 90);

  let verdictCursorY = verdictBaseline + 90;
  if (data.nearMissText) {
    ctx.fillStyle = STAMP;
    let nearMissSize = 28;
    ctx.font = monoFont(nearMissSize, true);
    const maxWidth = CARD_W - 2 * MARGIN;
    while (nearMissSize > 14 && ctx.measureText(data.nearMissText).width > maxWidth) {
      nearMissSize -= 2;
      ctx.font = monoFont(nearMissSize, true);
    }
    ctx.fillText(data.nearMissText, CARD_W / 2, verdictBaseline + 140);
    verdictCursorY = verdictBaseline + 140;
  }

  // --- Footer URL — drawn last, guarded from collision ---
  if (verdictCursorY + 15 > FOOTER_Y - 10) {
    throw new Error(`Card layout overflow: verdict block reaches y=${verdictCursorY}, footer at y=${FOOTER_Y}`);
  }
  ctx.fillStyle = INK_FADED;
  ctx.font = monoFont(24);
  ctx.fillText('wctennil.com', CARD_W / 2, FOOTER_Y);
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
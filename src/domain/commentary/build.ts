/**
 * src/domain/commentary/build.ts — band → commentary script (ADR-005).
 *
 * Pure: no RNG, no React, no input mutation. Resolves {slot} placeholders in
 * beat texts to deterministic player names derived from the FinalXI.
 */

import type { CommentaryConfig, CommentaryScript, FinalXI, Player } from '../types';

type PickMode = 'max' | 'min';

function pick(xi: FinalXI, mode: PickMode, predicate: (p: Player) => boolean): Player | null {
  let chosen: Player | null = null;
  for (const p of xi) {
    if (!predicate(p)) continue;
    if (chosen === null) {
      chosen = p;
      continue;
    }
    const better =
      mode === 'max'
        ? p.rating > chosen.rating || (p.rating === chosen.rating && p.id < chosen.id)
        : p.rating < chosen.rating || (p.rating === chosen.rating && p.id < chosen.id);
    if (better) chosen = p;
  }
  return chosen;
}

export function buildCommentary(
  band: { bandId: string; label: string },
  xi: FinalXI,
  config: CommentaryConfig,
): CommentaryScript {
  const scriptDef = config.scripts[band.bandId];
  if (!scriptDef) {
    throw new Error(`No commentary script defined for band "${band.bandId}"`);
  }

  const captain = pick(xi, 'max', () => true)!;
  const topAtt = pick(xi, 'max', (p) => p.positionBucket === 'ATT') ?? captain;
  const topMid = pick(xi, 'max', (p) => p.positionBucket === 'MID') ?? captain;
  const topDef = pick(xi, 'max', (p) => p.positionBucket === 'DEF') ?? captain;
  const gk = pick(xi, 'max', (p) => p.positionBucket === 'GK') ?? captain;
  const weakest = pick(xi, 'min', () => true)!;

  const slots: Record<string, string> = {
    captain: captain.name,
    topAtt: topAtt.name,
    topMid: topMid.name,
    topDef: topDef.name,
    gk: gk.name,
    weakest: weakest.name,
  };

  const beats = scriptDef.beats.map((beat) => ({
    ...beat,
    text: beat.text.replace(/\{(captain|topAtt|topMid|topDef|gk|weakest)\}/g, (_, slot) => slots[slot]),
  }));

  return {
    bandId: band.bandId,
    label: band.label,
    beats,
  };
}

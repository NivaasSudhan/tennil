/**
 * profileFit.ts — ADR-020 attribute profile fit.
 *
 * Wave A: TYPES ONLY. `computeProfileFit` and `selectOpposition` land in Wave C.
 * PURE module (no RNG, no react, no src/app imports) — this file only ever
 * grows pure functions/types, per the layering rule (ADR-002).
 */
import type { PositionBucket } from '../types';

/** The three attribute axes authored on outfield players (ADR-020 spec §2). */
export type AttrName = 'pace' | 'strength' | 'accuracy';

export interface Attrs {
  pace: number;
  strength: number;
  accuracy: number;
}

/** Outfield buckets that carry attrs — GK is excluded (no attrs, spec §2/§3). */
export type AttrBucket = Exclude<PositionBucket, 'GK'>;

/**
 * Per-formation attribute target: for each outfield bucket, the weight given
 * to each attr axis (how much it matters for that bucket, this formation) and
 * the target mean value that bucket's XI should hit. Consumed by
 * `computeProfileFit` (Wave C) against a drafted XI's per-bucket attr means.
 */
export type FormationProfile = Record<AttrBucket, { weights: Attrs; targets: Attrs }>;

/**
 * A rotating daily opponent. `weightMods` multiplies the active formation
 * profile's weights before fit is computed (`effectiveFit`, spec §3) — e.g.
 * PRESSING MACHINE raises pace weight everywhere. The `neutral` id (weightMods
 * `{}`, i.e. no modification) is required in the catalog: it is used for free
 * play and must always be present (validated in loadData).
 */
export interface OppositionDef {
  id: string;
  label: string;
  tagline: string;
  weightMods: Partial<Attrs>;
}

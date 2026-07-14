/**
 * profileFit.ts — ADR-020 attribute profile fit.
 *
 * Wave C: `computeProfileFit` lands here (types were Wave A). PURE module (no
 * RNG, no react, no src/app imports) — this file only ever grows pure
 * functions/types, per the layering rule (ADR-002).
 *
 * ADR-021: the seed-based `selectOpposition` was retired — the HARD-mode opponent
 * is now drawn in `draft/session.ts` (`drawOpposition`) and stamped on the
 * session as `oppositionId`; result/sim code reads that id.
 */
import type { FinalXI, PositionBucket, PositionMap } from '../types';

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

// ---------------------------------------------------------------------------
// Wave C — computeProfileFit (plan.md "Wave C/D algorithm addendum", BINDING
// exact-math steps 1-7). PURE, deterministic, no rounding until the final step.
// ---------------------------------------------------------------------------

const FIT_BUCKET_ORDER: AttrBucket[] = ['DEF', 'MID', 'ATT']; // step 1: fixed order
const FIT_ATTR_ORDER: AttrName[] = ['pace', 'strength', 'accuracy']; // step 1: fixed order

/**
 * computeProfileFit — integer 0-100. See plan.md addendum steps 1-7:
 * 1. Buckets [DEF,MID,ATT], attrs [pace,strength,accuracy] — fixed order (determinism).
 * 2. Empty bucket (no XI players in it) is EXCLUDED entirely, not penalized
 *    (double-punishing a structural failure violates the Reveal-Luck Law).
 *    All three empty (no outfield players at all) => fit = 0.
 * 3. mean_B[a] = arithmetic mean of attr a over bucket B's players (no rounding yet).
 *    An outfield player missing an attr is a defensive invariant violation (loadData
 *    v2 guarantees presence) — throws.
 * 4. w_B[a] = profile[B].weights[a] * (weightMods[a] ?? 1).
 * 5. shortfall_B[a] = max(0, targets[B][a] - mean_B[a]) / targets[B][a] — overshoot free.
 * 6. penalty_B = (Σ_a w_B[a]*shortfall_B[a]) / (Σ_a w_B[a]) — weight-normalized.
 * 7. fit = round(100 * (1 - mean(penalty_B over PRESENT buckets))), clamped [0,100].
 *
 * GK never participates (no attrs) — `positionMap[p.positionRaw] === 'GK'` players are
 * skipped entirely, so GK presence/rating never affects fit (test: GK invariance).
 */
export function computeProfileFit(
  xi: FinalXI,
  positionMap: PositionMap,
  profile: FormationProfile,
  weightMods: Partial<Attrs>,
): number {
  const playersByBucket: Record<AttrBucket, { id: string; pace?: number; strength?: number; accuracy?: number }[]> = {
    DEF: [],
    MID: [],
    ATT: [],
  };

  for (const player of xi) {
    const bucket = positionMap[player.positionRaw];
    if (bucket === 'GK' || bucket === undefined) continue; // GK excluded (step: GK never participates)
    playersByBucket[bucket].push(player);
  }

  const penalties: number[] = [];

  for (const bucket of FIT_BUCKET_ORDER) {
    const players = playersByBucket[bucket];
    if (players.length === 0) continue; // step 2: empty bucket excluded entirely

    const means: Attrs = { pace: 0, strength: 0, accuracy: 0 };
    for (const attr of FIT_ATTR_ORDER) {
      let sum = 0;
      for (const p of players) {
        const v = p[attr];
        if (v === undefined) {
          throw new Error(
            `computeProfileFit: outfield player '${p.id}' in bucket ${bucket} is missing attr '${attr}' — invalid squads v2 data (defensive invariant, ADR-020)`,
          );
        }
        sum += v;
      }
      means[attr] = sum / players.length; // step 3: mean, no rounding
    }

    const bucketProfile = profile[bucket];
    let weightedShortfallSum = 0;
    let weightSum = 0;
    for (const attr of FIT_ATTR_ORDER) {
      const w = bucketProfile.weights[attr] * (weightMods[attr] ?? 1); // step 4
      const target = bucketProfile.targets[attr];
      const shortfall = Math.max(0, target - means[attr]) / target; // step 5: overshoot free
      weightedShortfallSum += w * shortfall;
      weightSum += w;
    }
    const penalty = weightSum > 0 ? weightedShortfallSum / weightSum : 0; // step 6
    penalties.push(penalty);
  }

  if (penalties.length === 0) return 0; // step 2: all buckets empty => fit = 0

  const meanPenalty = penalties.reduce((sum, p) => sum + p, 0) / penalties.length;
  const fit = Math.round(100 * (1 - meanPenalty)); // step 7
  return Math.max(0, Math.min(100, fit));
}

/**
 * computeBucketAttrMeans — per-bucket arithmetic attr means for the stats screen
 * (Wave E, info-only display). PURE, no rounding. Mirrors computeProfileFit's
 * bucketing exactly (GK excluded, fixed order) but returns the raw means rather
 * than a fit score, so the broadcast stats bars can plot means vs targets.
 * Empty outfield bucket => `null` (nothing to plot, never zero-plotted). A
 * missing attr on an outfield player is the same defensive invariant violation
 * computeProfileFit guards against (loadData v2 guarantees presence) — throws.
 */
export function computeBucketAttrMeans(
  xi: FinalXI,
  positionMap: PositionMap,
): Record<AttrBucket, Attrs | null> {
  const playersByBucket: Record<AttrBucket, { id: string; pace?: number; strength?: number; accuracy?: number }[]> = {
    DEF: [],
    MID: [],
    ATT: [],
  };

  for (const player of xi) {
    const bucket = positionMap[player.positionRaw];
    if (bucket === 'GK' || bucket === undefined) continue; // GK excluded (no attrs)
    playersByBucket[bucket].push(player);
  }

  const out: Record<AttrBucket, Attrs | null> = { DEF: null, MID: null, ATT: null };
  for (const bucket of FIT_BUCKET_ORDER) {
    const players = playersByBucket[bucket];
    if (players.length === 0) continue; // empty bucket => null (excluded, like fit)
    const means: Attrs = { pace: 0, strength: 0, accuracy: 0 };
    for (const attr of FIT_ATTR_ORDER) {
      let sum = 0;
      for (const p of players) {
        const v = p[attr];
        if (v === undefined) {
          throw new Error(
            `computeBucketAttrMeans: outfield player '${p.id}' in bucket ${bucket} is missing attr '${attr}' — invalid squads v2 data (defensive invariant, ADR-020)`,
          );
        }
        sum += v;
      }
      means[attr] = sum / players.length;
    }
    out[bucket] = means;
  }
  return out;
}

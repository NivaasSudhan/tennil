/**
 * withMode.ts — ADR-021 difficulty-mode config view.
 *
 * PURE. No RNG, no react, no src/app imports. Same immutable config-view pattern
 * as `withFormationMinCounts` (ADR-017): returns a NEW ThresholdConfig whose
 * `bands` is the selected difficulty's ladder, never mutating the input.
 *
 * Per-formation `minFit` (hard bands may author `minFit` as a
 * `Record<formationId, number>`) is resolved to a scalar by `resolveMinFit` at
 * the same config-view layer (composed inside `withFormationMinCounts`), so
 * `evaluateBandPredicates` / `scoreBand` / `explainScoreBand` keep seeing a plain
 * number — their signatures never change (ADR-013/C2 discipline).
 */
import type { BandDef, Difficulty, ThresholdConfig } from '../types';

/**
 * withMode — swap the active `bands` to the chosen difficulty's ladder.
 * Defensive: a config without `modes` (a pre-v5 synthetic fixture) is returned
 * unchanged, since it never went through the v5 loader that populates `modes`.
 */
export function withMode(config: ThresholdConfig, difficulty: Difficulty): ThresholdConfig {
  if (!config.modes) return config;
  const bandSet = config.modes[difficulty];
  if (!bandSet) {
    throw new Error(
      `withMode: no band set for difficulty '${difficulty}' (modes has: ${Object.keys(config.modes).join(', ')})`,
    );
  }
  return { ...config, bands: bandSet.bands };
}

/**
 * resolveMinFit — collapse a band's `minFit` to a scalar for a given formation.
 * - scalar or absent minFit: band returned unchanged.
 * - `Record<formationId, number>`: replaced with the entry for `formationId`
 *   (or `undefined` — the minFit gate simply drops — when the formation has no
 *   entry, or when `formationId` is null/undefined).
 * Applied at the formation-view layer so evaluateBandPredicates only ever reads
 * a `number | undefined` minFit.
 */
export function resolveMinFit(band: BandDef, formationId: string | null | undefined): BandDef {
  const mf = band.minFit;
  if (mf === undefined || typeof mf === 'number') return band;
  const scalar = formationId != null ? mf[formationId] : undefined;
  return { ...band, minFit: scalar };
}

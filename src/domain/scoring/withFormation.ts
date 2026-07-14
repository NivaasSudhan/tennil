import type { BandDef, ThresholdConfig } from '../types';
import { resolveMinFit } from './withMode';

function scaleBucketSums(
  band: BandDef,
  refCounts: Record<string, number>,
  formationCounts: Record<string, number>,
): BandDef {
  if (!band.minBucketSums) return band;

  const scaled: Record<string, number> = {};
  for (const [bucket, gate] of Object.entries(band.minBucketSums)) {
    const ref = refCounts[bucket] ?? 0;
    if (ref === 0) {
      throw new Error(
        `withFormationMinCounts: reference formation minCounts.${bucket} is 0 — cannot scale`,
      );
    }
    const target = formationCounts[bucket] ?? 0;
    scaled[bucket] = Math.round(gate * target / ref);
  }

  return { ...band, minBucketSums: scaled };
}

export function withFormationMinCounts(
  config: ThresholdConfig,
  formationId: string | null | undefined,
): ThresholdConfig {
  if (!formationId) return config;
  const f = config.formations.find((x) => x.id === formationId);
  if (!f) return config;

  const refFormation = config.formations.find((x) => x.id === config.referenceFormation);
  if (!refFormation) {
    throw new Error(
      `withFormationMinCounts: reference formation '${config.referenceFormation}' not found in catalog — invalid ThresholdConfig`,
    );
  }

  // ADR-021: resolve any per-formation minFit (Record<formationId, number>) to a
  // scalar for THIS formation at the same view layer, then scale minBucketSums.
  const scaledBands = config.bands.map((band) =>
    scaleBucketSums(resolveMinFit(band, f.id), refFormation.minCounts, f.minCounts),
  );

  return { ...config, minCounts: f.minCounts, referenceFormation: f.id, bands: scaledBands };
}

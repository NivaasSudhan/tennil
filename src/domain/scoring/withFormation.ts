import type { ThresholdConfig } from '../types';

export function withFormationMinCounts(
  config: ThresholdConfig,
  formationId: string | null | undefined,
): ThresholdConfig {
  if (!formationId) return config;
  const f = config.formations.find((x) => x.id === formationId);
  if (!f) return config;
  return { ...config, minCounts: f.minCounts, referenceFormation: f.id };
}

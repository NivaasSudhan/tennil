/**
 * StatsScreen — ADR-020 Wave E, broadcast world. Rendered below the BandSlam
 * once the scoreline shows: per-bucket attr bars (DEF/MID/ATT × pace/strength/
 * accuracy) plotting the XI's bucket means against the formation profile
 * targets, with today's opposition-weighted attr picked out in gold. The fit
 * number is presented as football insight ('TACTICAL FIT 91') with one
 * dry-pundit line derived from the biggest shortfall on the demanded axis.
 *
 * INFO-ONLY (RISKS R-13 D5): fit never gates bands — this screen is where fit
 * lives as a product. Pure presentation: every number arrives via props from
 * ResultScreen's compute-once useMemo (computeBucketAttrMeans / computeProfileFit
 * are called there, never here). No engine jargon in player-facing copy.
 */
import type { AttrBucket, AttrName, Attrs, FormationProfile, OppositionDef } from '../domain/scoring/profileFit';

const BUCKETS: AttrBucket[] = ['DEF', 'MID', 'ATT'];
const ATTRS: AttrName[] = ['pace', 'strength', 'accuracy'];

/** Broadcast shorthand for the attr axes (football language, not engine terms). */
const ATTR_SHORT: Record<AttrName, string> = {
  pace: 'PAC',
  strength: 'STR',
  accuracy: 'ACC',
};

/** Pundit vocabulary per axis — matches the near-miss voice (nearMiss.ts). */
const ATTR_WORD: Record<AttrName, string> = {
  pace: 'PACE',
  strength: 'STEEL',
  accuracy: 'CRAFT',
};

/** Football-speak bucket phrases for the insight line. */
const BUCKET_PHRASE: Record<AttrBucket, string> = {
  DEF: 'YOUR BACK LINE',
  MID: 'YOUR MIDFIELD',
  ATT: 'YOUR WINGS',
};

export interface StatsScreenProps {
  /** Per-bucket attr means (GK excluded); null = empty bucket, nothing to plot. */
  means: Record<AttrBucket, Attrs | null>;
  /** The declared formation's profile (weights + targets per bucket). */
  profile: FormationProfile;
  /** Today's opposition — emphasized attr(s) come from its weightMods. */
  opposition: OppositionDef;
  /** ProfileFit 0-100, already computed once in ResultScreen's useMemo. */
  fit: number;
}

/** Attrs today's opponent leans on (weightMods > 1) — highlighted gold. */
export function emphasizedAttrs(opposition: OppositionDef): AttrName[] {
  return ATTRS.filter((a) => (opposition.weightMods[a] ?? 1) > 1);
}

/**
 * The one dry-pundit line under the fit number. Demanded axis = the opponent's
 * heaviest weightMod (ties → pace > strength > accuracy, same fixed order as
 * everywhere); a no-preference opponent (neutral) falls back to the axis with
 * the biggest total shortfall vs targets. Then: worst present bucket on that
 * axis — short of target ⇒ '{OPP} WANTED {WORD} — {BUCKET} DIDN'T HAVE IT';
 * every present bucket at/over target ⇒ the best bucket '…HAD IT'.
 */
export function fitInsightLine(
  means: Record<AttrBucket, Attrs | null>,
  profile: FormationProfile,
  opposition: OppositionDef,
): string {
  // Demanded axis from the opponent's dominant weightMod.
  let demanded: AttrName | null = null;
  let bestMod = -Infinity;
  for (const a of ATTRS) {
    const v = opposition.weightMods[a];
    if (v !== undefined && v > bestMod) {
      bestMod = v;
      demanded = a;
    }
  }
  if (demanded === null) {
    // Neutral opponent: pick the axis with the biggest total shortfall.
    let worstSum = -Infinity;
    demanded = 'pace';
    for (const a of ATTRS) {
      let sum = 0;
      for (const b of BUCKETS) {
        const m = means[b];
        if (m === null) continue;
        sum += Math.max(0, profile[b].targets[a] - m[a]);
      }
      if (sum > worstSum) {
        worstSum = sum;
        demanded = a;
      }
    }
  }

  // Worst / best present bucket on the demanded axis (target minus mean).
  let worstBucket: AttrBucket | null = null;
  let worstGap = -Infinity;
  let bestBucket: AttrBucket | null = null;
  let bestGap = Infinity;
  for (const b of BUCKETS) {
    const m = means[b];
    if (m === null) continue;
    const gap = profile[b].targets[demanded] - m[demanded];
    if (gap > worstGap) {
      worstGap = gap;
      worstBucket = b;
    }
    if (gap < bestGap) {
      bestGap = gap;
      bestBucket = b;
    }
  }

  const word = ATTR_WORD[demanded];
  if (worstBucket === null || bestBucket === null) {
    return `${opposition.label} WANTED ${word} — NOBODY SHOWED UP`;
  }
  if (worstGap > 0) {
    return `${opposition.label} WANTED ${word} — ${BUCKET_PHRASE[worstBucket]} DIDN'T HAVE IT`;
  }
  return `${opposition.label} WANTED ${word} — ${BUCKET_PHRASE[bestBucket]} HAD IT`;
}

export default function StatsScreen({ means, profile, opposition, fit }: StatsScreenProps) {
  const emphasized = new Set(emphasizedAttrs(opposition));
  const insight = fitInsightLine(means, profile, opposition);

  return (
    <section className="stats-screen" aria-label="Tactical fit statistics">
      <h2 className="stats-screen__fit">
        TACTICAL FIT <span className="stats-screen__fit-number">{fit}</span>
      </h2>
      <p className="stats-screen__insight">{insight}</p>
      <div className="stats-screen__buckets">
        {BUCKETS.map((bucket) => {
          const m = means[bucket];
          if (m === null) return null;
          return (
            <div key={bucket} className="stats-screen__bucket">
              <h3 className={`stats-screen__bucket-name bucket-${bucket}`}>{bucket}</h3>
              {ATTRS.map((attr) => {
                const mean = Math.round(m[attr]);
                const target = profile[bucket].targets[attr];
                const isEmph = emphasized.has(attr);
                return (
                  <div
                    key={attr}
                    className={`stats-bar${isEmph ? ' stats-bar--emph' : ''}`}
                    data-attr={attr}
                  >
                    <span className="stats-bar__label">{ATTR_SHORT[attr]}</span>
                    <span
                      className="stats-bar__track"
                      role="img"
                      aria-label={`${bucket} ${attr}: ${mean} against a target of ${target}`}
                    >
                      <span
                        className="stats-bar__fill"
                        style={{ width: `${Math.min(100, mean)}%` }}
                      />
                      <span
                        className="stats-bar__target"
                        style={{ left: `${Math.min(100, target)}%` }}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="stats-bar__value">{mean}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

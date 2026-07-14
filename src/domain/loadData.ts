/**
 * loadGameData (ADR-005; ARCHITECTURE.md §3/§5/§6).
 *
 * PURE, fail-closed validation of the four vendored JSON files. Every problem found
 * is collected into a `string[]` — validation never stops at the first error — and if
 * that list is non-empty a single `DataValidationError` is thrown naming every
 * offending entity. Only on a fully clean pass does this return a typed `GameData`.
 *
 * No react, no RNG, no `src/app` imports. Unknown extra keys (e.g. "_comment", any
 * key starting with "_") are ignored, never errors.
 */

import type {
  BandDef,
  CommentaryBeat,
  CommentaryConfig,
  Formation,
  GameData,
  ModeBandSets,
  Player,
  PositionBucket,
  PositionMap,
  Squad,
  ThresholdConfig,
} from './types';
import { DataValidationError } from './types';
import type { AttrBucket, AttrName, FormationProfile, OppositionDef } from './scoring/profileFit';

const BUCKETS: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];
const BUCKET_SET = new Set<string>(BUCKETS);
const BEAT_TYPES = new Set(['kickoff', 'goal', 'chance', 'halftime', 'drama', 'fulltime']);
const SLOT_NAMES = new Set(['captain', 'topAtt', 'topMid', 'topDef', 'gk', 'weakest']);

// ---------- ADR-020: attrs / profile fit ----------
const ATTR_NAMES: AttrName[] = ['pace', 'strength', 'accuracy'];
const ATTR_NAME_SET = new Set<string>(ATTR_NAMES);
const ATTR_BUCKETS: AttrBucket[] = ['DEF', 'MID', 'ATT']; // GK excluded — no attrs (spec §2/§3)
const ATTR_BUCKET_SET = new Set<string>(ATTR_BUCKETS);
const MAX_MIN_FIT_BANDS = 3; // minFit is staged onto the top three bands only (ADR-020 spec §3)

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------- band set (ADR-021: one per difficulty mode) ----------

/**
 * validateBandSet — validates ONE mode's band ladder with the generic band
 * rules (id/priority/label/predicate types, exactly one fallback). Called once
 * per mode ('normal'/'hard'); minFit is forbidden entirely in normal bands
 * (`allowFit=false`), and in hard bands may be a scalar 0-100 OR a
 * `Record<formationId, number>` whose keys must all be known formation ids and
 * whose values are integers 0-100 (per-formation calibration, ADR-021/M3).
 */
function validateBandSet(
  rawBands: unknown,
  modeLabel: 'normal' | 'hard',
  allowFit: boolean,
  knownFormationIds: Set<string>,
  problems: string[],
): BandDef[] {
  const bands: BandDef[] = [];
  const setPath = `thresholds.modes.${modeLabel}.bands`;

  if (!Array.isArray(rawBands) || rawBands.length === 0) {
    problems.push(`${setPath}: expected a non-empty array of band definitions`);
    return bands;
  }

  const seenIds = new Set<string>();
  let fallbackCount = 0;
  let minFitBandCount = 0;

  rawBands.forEach((bandRaw: unknown, i: number) => {
    if (!isPlainObject(bandRaw)) {
      problems.push(`${setPath}[${i}]: expected an object`);
      return;
    }

    const hasId = typeof bandRaw.id === 'string' && bandRaw.id.length > 0;
    const entity = hasId ? `band ${bandRaw.id as string}` : `${setPath}[${i}]`;

    if (!hasId) {
      problems.push(`${entity}: missing or invalid 'id'`);
    } else {
      const id = bandRaw.id as string;
      if (seenIds.has(id)) {
        problems.push(`band ${id}: duplicate band id`);
      }
      seenIds.add(id);
    }

    if (typeof bandRaw.priority !== 'number') {
      problems.push(`${entity}: missing or invalid 'priority' (must be a number)`);
    }

    if (typeof bandRaw.label !== 'string' || bandRaw.label.length === 0) {
      problems.push(`${entity}: missing or invalid 'label'`);
    }

    if (bandRaw.minBucketSums !== undefined) {
      if (!isPlainObject(bandRaw.minBucketSums)) {
        problems.push(`${entity}: minBucketSums must be an object`);
      } else {
        for (const [k, v] of Object.entries(bandRaw.minBucketSums)) {
          if (!BUCKET_SET.has(k)) {
            problems.push(`${entity}: minBucketSums key '${k}' is not a valid bucket (GK/DEF/MID/ATT)`);
          } else if (typeof v !== 'number') {
            problems.push(`${entity}: minBucketSums.${k} must be a number (got ${JSON.stringify(v)})`);
          }
        }
      }
    }

    if (bandRaw.minWeakLink !== undefined && typeof bandRaw.minWeakLink !== 'number') {
      problems.push(`${entity}: minWeakLink must be a number`);
    }

    // ADR-019: authored as a fraction in [0,1], converted to integer % points.
    let minEfficiency: number | undefined;
    if (bandRaw.minEfficiency !== undefined) {
      if (typeof bandRaw.minEfficiency !== 'number' || bandRaw.minEfficiency < 0 || bandRaw.minEfficiency > 1) {
        problems.push(`${entity}: minEfficiency must be a number in [0,1] (got ${JSON.stringify(bandRaw.minEfficiency)})`);
      } else {
        minEfficiency = Math.round(bandRaw.minEfficiency * 100);
      }
    }

    // minBucketEfficiency is efficiency-family (NOT fit-family) — allowed in both modes.
    let minBucketEfficiency: Partial<Record<PositionBucket, number>> | undefined;
    if (bandRaw.minBucketEfficiency !== undefined) {
      if (!isPlainObject(bandRaw.minBucketEfficiency)) {
        problems.push(`${entity}: minBucketEfficiency must be an object`);
      } else {
        minBucketEfficiency = {};
        for (const [k, v] of Object.entries(bandRaw.minBucketEfficiency)) {
          if (!BUCKET_SET.has(k)) {
            problems.push(`${entity}: minBucketEfficiency key '${k}' is not a valid bucket (GK/DEF/MID/ATT)`);
          } else if (typeof v !== 'number' || v < 0 || v > 1) {
            problems.push(`${entity}: minBucketEfficiency.${k} must be a number in [0,1] (got ${JSON.stringify(v)})`);
          } else {
            minBucketEfficiency[k as PositionBucket] = Math.round(v * 100);
          }
        }
      }
    }

    // ADR-020/ADR-021: minFit — fit-family, forbidden in normal bands.
    // In hard: scalar 0-100, or Record<formationId, number> (per-formation).
    let minFit: number | Record<string, number> | undefined;
    if (bandRaw.minFit !== undefined) {
      if (!allowFit) {
        problems.push(
          `${entity}: minFit is not allowed in normal bands (normal is OVR/efficiency only, ADR-021)`,
        );
      } else if (typeof bandRaw.minFit === 'number') {
        if (!Number.isInteger(bandRaw.minFit) || bandRaw.minFit < 0 || bandRaw.minFit > 100) {
          problems.push(`${entity}: minFit must be an integer in [0,100] (got ${JSON.stringify(bandRaw.minFit)})`);
        } else {
          minFit = bandRaw.minFit;
        }
      } else if (isPlainObject(bandRaw.minFit)) {
        const map: Record<string, number> = {};
        for (const [k, v] of Object.entries(bandRaw.minFit)) {
          if (!knownFormationIds.has(k)) {
            problems.push(`${entity}: minFit formation key '${k}' is not a known formation id`);
          } else if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) {
            problems.push(`${entity}: minFit.${k} must be an integer in [0,100] (got ${JSON.stringify(v)})`);
          } else {
            map[k] = v;
          }
        }
        minFit = map;
      } else {
        problems.push(`${entity}: minFit must be an integer 0-100 or a per-formation object (got ${JSON.stringify(bandRaw.minFit)})`);
      }
      minFitBandCount += 1;
    }

    if (bandRaw.requireAllBucketsNonEmpty !== undefined && typeof bandRaw.requireAllBucketsNonEmpty !== 'boolean') {
      problems.push(`${entity}: requireAllBucketsNonEmpty must be a boolean`);
    }
    if (bandRaw.requireMinCounts !== undefined && typeof bandRaw.requireMinCounts !== 'boolean') {
      problems.push(`${entity}: requireMinCounts must be a boolean`);
    }
    if (bandRaw.fallback !== undefined && typeof bandRaw.fallback !== 'boolean') {
      problems.push(`${entity}: fallback must be a boolean`);
    }
    if (bandRaw.fallback === true) fallbackCount += 1;

    bands.push({ ...(bandRaw as unknown as BandDef), minEfficiency, minBucketEfficiency, minFit });
  });

  if (fallbackCount === 0) {
    problems.push(`${setPath}: no band has fallback:true — exactly one fallback band is required`);
  } else if (fallbackCount > 1) {
    problems.push(`${setPath}: ${fallbackCount} bands have fallback:true — exactly one fallback band is required`);
  }

  if (minFitBandCount > MAX_MIN_FIT_BANDS) {
    problems.push(
      `${setPath}: minFit configured on ${minFitBandCount} bands — at most ${MAX_MIN_FIT_BANDS} allowed (ADR-020, top bands only)`,
    );
  }

  return bands;
}

// ---------- positionMap ----------

function validatePositionMap(raw: unknown, problems: string[]): PositionMap {
  const map: PositionMap = {};
  if (!isPlainObject(raw)) {
    problems.push("positionMap: expected an object mapping positionRaw codes to buckets ('GK'|'DEF'|'MID'|'ATT')");
    return map;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_')) continue;
    if (typeof value !== 'string' || !BUCKET_SET.has(value)) {
      problems.push(`positionMap.${key}: value ${JSON.stringify(value)} must be one of GK/DEF/MID/ATT`);
      continue;
    }
    map[key] = value as PositionBucket;
  }
  return map;
}

// ---------- thresholds ----------

function validateThresholds(raw: unknown, problems: string[]): ThresholdConfig {
  const fallback: ThresholdConfig = {
    version: 1,
    referenceFormation: '',
    minCounts: { GK: 0, DEF: 0, MID: 0, ATT: 0 },
    formations: [],
    ratingScale: { min: 1, max: 100 },
    bands: [],
    profiles: {},
    oppositions: [],
  };

  if (!isPlainObject(raw)) {
    problems.push('thresholds: expected an object with version/minCounts/ratingScale/bands');
    return fallback;
  }

  if (raw.version !== 5) {
    problems.push(`thresholds: version must be 5 (got ${JSON.stringify(raw.version)})`);
  }

  const minCounts: Record<PositionBucket, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  if (!isPlainObject(raw.minCounts)) {
    problems.push('thresholds.minCounts: expected an object with GK/DEF/MID/ATT counts');
  } else {
    for (const bucket of BUCKETS) {
      const v = raw.minCounts[bucket];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        problems.push(`thresholds.minCounts.${bucket}: expected a non-negative integer (got ${JSON.stringify(v)})`);
      } else {
        minCounts[bucket] = v;
      }
    }
  }

  let ratingScale = { min: 1, max: 100 };
  const ratingScaleRaw = raw.ratingScale;
  if (!isPlainObject(ratingScaleRaw) || typeof ratingScaleRaw.min !== 'number' || typeof ratingScaleRaw.max !== 'number') {
    problems.push('thresholds.ratingScale: expected { min: number, max: number }');
  } else {
    ratingScale = { min: ratingScaleRaw.min, max: ratingScaleRaw.max };
  }

  // ---------- formations (validated BEFORE modes: minFit Record keys reference
  // formation ids, so knownFormationIds must be known first) ----------
  const formations: Formation[] = [];
  if (!Array.isArray(raw.formations) || raw.formations.length === 0) {
    problems.push('thresholds.formations: expected a non-empty array of formation definitions');
  } else {
    const seenFormationIds = new Set<string>();
    raw.formations.forEach((fRaw: unknown, i: number) => {
      if (!isPlainObject(fRaw)) {
        problems.push(`thresholds.formations[${i}]: expected an object`);
        return;
      }
      const hasId = typeof fRaw.id === 'string' && fRaw.id.length > 0;
      const fLabel = hasId ? (fRaw.id as string) : `thresholds.formations[${i}]`;
      if (!hasId) {
        problems.push(`${fLabel}: missing or invalid 'id'`);
      } else {
        const id = fRaw.id as string;
        if (seenFormationIds.has(id)) {
          problems.push(`formation ${id}: duplicate formation id`);
        }
        seenFormationIds.add(id);
      }
      if (typeof fRaw.label !== 'string' || fRaw.label.length === 0) {
        problems.push(`${fLabel}: missing or invalid 'label'`);
      }
      if (typeof fRaw.description !== 'string') {
        problems.push(`${fLabel}: 'description' must be a string`);
      }
      const fmc: Record<PositionBucket, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
      if (!isPlainObject(fRaw.minCounts)) {
        problems.push(`${fLabel}.minCounts: expected an object with GK/DEF/MID/ATT counts`);
      } else {
        for (const bucket of BUCKETS) {
          const v = (fRaw.minCounts as Record<string, unknown>)[bucket];
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
            problems.push(`${fLabel}.minCounts.${bucket}: expected a non-negative integer (got ${JSON.stringify(v)})`);
          } else {
            fmc[bucket] = v;
          }
        }
        // sum validation: GK===1, DEF+MID+ATT===10
        if (fmc.GK !== 1) {
          problems.push(`${fLabel}.minCounts: GK must be 1 (got ${fmc.GK})`);
        }
        const outfieldSum = fmc.DEF + fmc.MID + fmc.ATT;
        if (outfieldSum !== 10) {
          problems.push(`${fLabel}.minCounts: DEF+MID+ATT must equal 10 (got ${outfieldSum})`);
        }
      }
      formations.push({
        id: hasId ? (fRaw.id as string) : fLabel,
        label: typeof fRaw.label === 'string' ? fRaw.label : '',
        description: typeof fRaw.description === 'string' ? fRaw.description : '',
        minCounts: fmc,
      });
    });

    // Validate default minCounts matches reference formation
    const refId = typeof raw.referenceFormation === 'string' ? raw.referenceFormation : '';
    const refFormation = formations.find((f) => f.id === refId);
    if (refFormation) {
      for (const bucket of BUCKETS) {
        if (minCounts[bucket] !== refFormation.minCounts[bucket]) {
          problems.push(
            `thresholds: default minCounts.${bucket} (${minCounts[bucket]}) does not match reference formation '${refId}'.minCounts.${bucket} (${refFormation.minCounts[bucket]})`,
          );
        }
      }
    }
  }

  // ---------- modes (ADR-021: one band ladder per difficulty) ----------
  const knownFormationIds = new Set(formations.map((f) => f.id));
  let modes: ModeBandSets | undefined;
  if (!isPlainObject(raw.modes)) {
    problems.push('thresholds.modes: expected an object with `normal` and `hard` band sets');
  } else {
    const normalRaw = isPlainObject(raw.modes.normal)
      ? (raw.modes.normal as Record<string, unknown>).bands
      : undefined;
    const hardRaw = isPlainObject(raw.modes.hard)
      ? (raw.modes.hard as Record<string, unknown>).bands
      : undefined;
    if (!isPlainObject(raw.modes.normal)) {
      problems.push('thresholds.modes.normal: expected an object with a `bands` array');
    }
    if (!isPlainObject(raw.modes.hard)) {
      problems.push('thresholds.modes.hard: expected an object with a `bands` array');
    }
    // normal bands forbid fit gates (allowFit=false); hard bands allow scalar or
    // per-formation minFit (allowFit=true).
    const normalBands = validateBandSet(normalRaw, 'normal', false, knownFormationIds, problems);
    const hardBands = validateBandSet(hardRaw, 'hard', true, knownFormationIds, problems);
    modes = { normal: { bands: normalBands }, hard: { bands: hardBands } };
  }

  // ---------- profiles (ADR-020) ----------
  const profiles: Record<string, FormationProfile> = {};
  if (!isPlainObject(raw.profiles)) {
    problems.push('thresholds.profiles: expected an object keyed by formation id');
  } else {
    const knownFormationIds = new Set(formations.map((f) => f.id));
    const seenProfileIds = new Set<string>();

    for (const [formationId, profileRaw] of Object.entries(raw.profiles)) {
      if (formationId.startsWith('_')) continue;
      seenProfileIds.add(formationId);

      if (!knownFormationIds.has(formationId)) {
        problems.push(`thresholds.profiles.${formationId}: not a known formation id`);
      }

      if (!isPlainObject(profileRaw)) {
        problems.push(`thresholds.profiles.${formationId}: expected an object keyed by bucket (DEF/MID/ATT)`);
        continue;
      }

      const profileKeys = Object.keys(profileRaw).filter((k) => !k.startsWith('_'));
      for (const key of profileKeys) {
        if (!ATTR_BUCKET_SET.has(key)) {
          problems.push(`thresholds.profiles.${formationId}: bucket '${key}' is not a valid attr bucket (DEF/MID/ATT — GK has no attrs)`);
        }
      }

      const profile = {} as FormationProfile;
      for (const bucket of ATTR_BUCKETS) {
        const bucketRaw = (profileRaw as Record<string, unknown>)[bucket];
        const entity = `thresholds.profiles.${formationId}.${bucket}`;
        if (!isPlainObject(bucketRaw)) {
          problems.push(`${entity}: expected an object with 'weights' and 'targets'`);
          profile[bucket] = { weights: { pace: 0, strength: 0, accuracy: 0 }, targets: { pace: 0, strength: 0, accuracy: 0 } };
          continue;
        }

        const weights = validateAttrs(bucketRaw.weights, `${entity}.weights`, problems, 0, 1, false);
        const targets = validateAttrs(bucketRaw.targets, `${entity}.targets`, problems, 1, 99, true);
        // ADR-020 Wave C addendum: per bucket, Σ weights > 0 (a bucket where every
        // weight is 0 would make computeProfileFit's weight-normalized penalty divide
        // by zero — caught here at load time, never at scoring time).
        const weightSum = ATTR_NAMES.reduce((sum, attr) => sum + weights[attr], 0);
        if (weightSum <= 0) {
          problems.push(`${entity}.weights: sum of pace+strength+accuracy must be > 0 (got ${weightSum})`);
        }
        profile[bucket] = { weights, targets };
      }

      profiles[formationId] = profile;
    }

    for (const f of formations) {
      if (!seenProfileIds.has(f.id)) {
        problems.push(`thresholds.profiles: missing a profile for formation '${f.id}'`);
      }
    }
  }

  // ---------- oppositions (ADR-020) ----------
  const oppositions: OppositionDef[] = [];
  if (!Array.isArray(raw.oppositions) || raw.oppositions.length === 0) {
    problems.push('thresholds.oppositions: expected a non-empty array of opposition definitions');
  } else {
    const seenOppIds = new Set<string>();
    raw.oppositions.forEach((oppRaw: unknown, i: number) => {
      if (!isPlainObject(oppRaw)) {
        problems.push(`thresholds.oppositions[${i}]: expected an object`);
        return;
      }

      const hasId = typeof oppRaw.id === 'string' && oppRaw.id.length > 0;
      const entity = hasId ? `opposition ${oppRaw.id as string}` : `thresholds.oppositions[${i}]`;

      if (!hasId) {
        problems.push(`${entity}: missing or invalid 'id'`);
      } else {
        const id = oppRaw.id as string;
        if (seenOppIds.has(id)) {
          problems.push(`opposition ${id}: duplicate opposition id`);
        }
        seenOppIds.add(id);
      }

      if (typeof oppRaw.label !== 'string' || oppRaw.label.length === 0) {
        problems.push(`${entity}: missing or invalid 'label'`);
      }
      if (typeof oppRaw.tagline !== 'string' || oppRaw.tagline.length === 0) {
        problems.push(`${entity}: missing or invalid 'tagline'`);
      }

      const weightMods: Partial<Record<AttrName, number>> = {};
      if (!isPlainObject(oppRaw.weightMods)) {
        problems.push(`${entity}: weightMods must be an object`);
      } else {
        for (const [k, v] of Object.entries(oppRaw.weightMods)) {
          if (!ATTR_NAME_SET.has(k)) {
            problems.push(`${entity}: weightMods key '${k}' is not a valid attr name (pace/strength/accuracy)`);
          } else if (typeof v !== 'number' || !Number.isFinite(v)) {
            problems.push(`${entity}: weightMods.${k} must be a finite number (got ${JSON.stringify(v)})`);
          } else if (v < 0.5 || v > 2.0) {
            // ADR-020 Wave C addendum: weightMods values restricted to [0.5, 2.0] —
            // keeps opposition modifiers a "premium," never a shape-erasing multiplier.
            problems.push(`${entity}: weightMods.${k} must be in [0.5,2.0] (got ${JSON.stringify(v)})`);
          } else {
            weightMods[k as AttrName] = v;
          }
        }
      }

      oppositions.push({
        id: hasId ? (oppRaw.id as string) : entity,
        label: typeof oppRaw.label === 'string' ? oppRaw.label : '',
        tagline: typeof oppRaw.tagline === 'string' ? oppRaw.tagline : '',
        weightMods,
      });
    });

    if (oppositions.length > 0 && !oppositions.some((o) => o.id === 'neutral')) {
      problems.push("thresholds.oppositions: catalog must include an opposition with id 'neutral' (used for free play)");
    }
  }

  return {
    version: typeof raw.version === 'number' ? raw.version : 5,
    referenceFormation: typeof raw.referenceFormation === 'string' ? raw.referenceFormation : '',
    minCounts,
    formations,
    ratingScale,
    // Default active band set = hard (app default difficulty; withMode swaps it).
    bands: modes ? modes.hard.bands : [],
    modes,
    profiles,
    oppositions,
  };
}

/** ADR-020: validates a {pace,strength,accuracy} object; returns a best-effort Attrs
 * (0-filled on failure) so callers can keep building a full ThresholdConfig even
 * when validation fails — problems are collected, never thrown mid-parse. */
function validateAttrs(
  raw: unknown,
  entity: string,
  problems: string[],
  min: number,
  max: number,
  requireInteger: boolean,
): { pace: number; strength: number; accuracy: number } {
  const result = { pace: 0, strength: 0, accuracy: 0 };
  if (!isPlainObject(raw)) {
    problems.push(`${entity}: expected an object with pace/strength/accuracy`);
    return result;
  }
  for (const attr of ATTR_NAMES) {
    const v = (raw as Record<string, unknown>)[attr];
    if (typeof v !== 'number' || (requireInteger && !Number.isInteger(v)) || v < min || v > max) {
      problems.push(`${entity}.${attr}: expected a${requireInteger ? 'n integer' : ' number'} in [${min},${max}] (got ${JSON.stringify(v)})`);
    } else {
      result[attr] = v;
    }
  }
  return result;
}

// ---------- squads ----------

function validateSquads(raw: unknown, positionMap: PositionMap, thresholds: ThresholdConfig, problems: string[]): Squad[] {
  if (!isPlainObject(raw)) {
    problems.push('squads: expected an object with version/squads');
    return [];
  }

  if (raw.version !== 2) {
    problems.push(`squads: version must be 2 (got ${JSON.stringify(raw.version)})`);
  }
  // ADR-020 Wave C: v1 (pre-attrs) acceptance dropped — the corpus is v2 for real
  // (Wave B landed attrs on all 660 outfield players). Every outfield player must
  // carry pace/strength/accuracy; GK must carry none, checked unconditionally below
  // (no more version branch — there is only one valid version now).

  if (!Array.isArray(raw.squads) || raw.squads.length === 0) {
    problems.push('squads.squads: expected a non-empty array of squads');
    return [];
  }

  const squads: Squad[] = [];
  const seenSquadIds = new Set<string>();
  const seenPlayerIds = new Set<string>();
  const ratingMin = thresholds.ratingScale.min;
  const ratingMax = thresholds.ratingScale.max;

  raw.squads.forEach((squadRaw: unknown, si: number) => {
    if (!isPlainObject(squadRaw)) {
      problems.push(`squads.squads[${si}]: expected an object`);
      return;
    }

    const hasSquadId = typeof squadRaw.id === 'string' && squadRaw.id.length > 0;
    const squadLabel = hasSquadId ? (squadRaw.id as string) : `squads.squads[${si}]`;

    if (!hasSquadId) {
      problems.push(`squad ${squadLabel}: missing or invalid 'id'`);
    } else {
      const id = squadRaw.id as string;
      if (seenSquadIds.has(id)) {
        problems.push(`squad ${id}: duplicate squad id`);
      }
      seenSquadIds.add(id);
    }

    if (typeof squadRaw.country !== 'string' || squadRaw.country.length === 0) {
      problems.push(`squad ${squadLabel}: missing or invalid 'country'`);
    }
    if (typeof squadRaw.year !== 'number') {
      problems.push(`squad ${squadLabel}: missing or invalid 'year'`);
    }

    if (!Array.isArray(squadRaw.players)) {
      problems.push(`squad ${squadLabel}: 'players' must be an array`);
      return;
    }

    if (squadRaw.players.length !== 11) {
      problems.push(`squad ${squadLabel}: ${squadRaw.players.length} players (expected 11)`);
    }

    let gkCount = 0;
    const players: Player[] = [];

    squadRaw.players.forEach((playerRaw: unknown, pi: number) => {
      if (!isPlainObject(playerRaw)) {
        problems.push(`squad ${squadLabel} player[${pi}]: expected an object`);
        return;
      }

      const hasPlayerId = typeof playerRaw.id === 'string' && playerRaw.id.length > 0;
      const playerLabel = hasPlayerId ? (playerRaw.id as string) : `squad ${squadLabel} player[${pi}]`;

      if (!hasPlayerId) {
        problems.push(`${playerLabel}: missing or invalid 'id'`);
      } else {
        const id = playerRaw.id as string;
        if (seenPlayerIds.has(id)) {
          problems.push(`player ${id}: duplicate player id (must be unique across the whole corpus)`);
        }
        seenPlayerIds.add(id);
      }

      if (typeof playerRaw.name !== 'string' || playerRaw.name.length === 0) {
        problems.push(`player ${playerLabel}: missing or invalid 'name'`);
      }

      let positionRaw: string | undefined;
      if (typeof playerRaw.positionRaw !== 'string' || playerRaw.positionRaw.length === 0) {
        problems.push(`player ${playerLabel}: missing or invalid 'positionRaw'`);
      } else {
        positionRaw = playerRaw.positionRaw;
        if (!(positionRaw in positionMap)) {
          problems.push(`player ${playerLabel}: positionRaw '${positionRaw}' not in position map`);
        }
      }

      let positionBucket: PositionBucket | undefined;
      if (typeof playerRaw.positionBucket !== 'string' || !BUCKET_SET.has(playerRaw.positionBucket)) {
        problems.push(`player ${playerLabel}: missing or invalid 'positionBucket' (must be GK/DEF/MID/ATT)`);
      } else {
        positionBucket = playerRaw.positionBucket as PositionBucket;
        if (positionRaw !== undefined && positionRaw in positionMap && positionMap[positionRaw] !== positionBucket) {
          problems.push(
            `player ${playerLabel}: positionBucket '${positionBucket}' does not match position map ('${positionRaw}' -> '${positionMap[positionRaw]}')`,
          );
        }
      }

      let rating: number | undefined;
      if (typeof playerRaw.rating !== 'number' || !Number.isInteger(playerRaw.rating)) {
        problems.push(`player ${playerLabel}: rating must be an integer (got ${JSON.stringify(playerRaw.rating)})`);
      } else {
        rating = playerRaw.rating;
        if (rating < ratingMin || rating > ratingMax) {
          problems.push(`player ${playerLabel}: rating ${rating} outside allowed range ${ratingMin}-${ratingMax}`);
        }
      }

      if (positionBucket === 'GK') gkCount += 1;

      // ---------- ADR-020: attrs (squads v2 only, Wave C dropped v1) ----------
      const attrsPresent = ATTR_NAMES.some((attr) => playerRaw[attr] !== undefined);
      let pace: number | undefined;
      let strength: number | undefined;
      let accuracy: number | undefined;

      if (positionBucket !== undefined) {
        // Only checked when positionBucket itself validated cleanly, so a broken
        // record doesn't also cascade a spurious attrs complaint on top.
        if (positionBucket === 'GK') {
          if (attrsPresent) {
            problems.push(`player ${playerLabel}: GK players must not have pace/strength/accuracy (ADR-020)`);
          }
        } else {
          for (const attr of ATTR_NAMES) {
            const v = playerRaw[attr];
            if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 99) {
              problems.push(`player ${playerLabel}: ${attr} must be an integer 1-99 (got ${JSON.stringify(v)})`);
            } else if (attr === 'pace') {
              pace = v;
            } else if (attr === 'strength') {
              strength = v;
            } else {
              accuracy = v;
            }
          }
        }
      }

      players.push({
        id: hasPlayerId ? (playerRaw.id as string) : playerLabel,
        name: typeof playerRaw.name === 'string' ? playerRaw.name : '',
        positionRaw: positionRaw ?? '',
        positionBucket: positionBucket ?? 'GK',
        rating: rating ?? 0,
        pace,
        strength,
        accuracy,
      });
    });

    if (squadRaw.players.length > 0 && gkCount !== 1) {
      problems.push(`squad ${squadLabel}: ${gkCount} GK-bucket players (expected exactly 1)`);
    }

    squads.push({
      id: hasSquadId ? (squadRaw.id as string) : squadLabel,
      country: typeof squadRaw.country === 'string' ? squadRaw.country : '',
      year: typeof squadRaw.year === 'number' ? squadRaw.year : 0,
      players,
    });
  });

  return squads;
}

// ---------- commentary ----------

function validateCommentary(raw: unknown, thresholds: ThresholdConfig, problems: string[]): CommentaryConfig {
  const empty: CommentaryConfig = { version: 1, scripts: {} };

  if (!isPlainObject(raw)) {
    problems.push('commentary: expected an object with version/scripts');
    return empty;
  }

  if (raw.version !== 1) {
    problems.push(`commentary: version must be 1 (got ${JSON.stringify(raw.version)})`);
  }

  if (!isPlainObject(raw.scripts)) {
    problems.push('commentary.scripts: expected an object keyed by band id');
    return { version: typeof raw.version === 'number' ? raw.version : 1, scripts: {} };
  }

  // ADR-021: a script is required for every band id in EITHER mode (union), so a
  // band unique to one mode still needs commentary. Falls back to the active
  // `bands` for pre-v5 synthetic configs that carry no `modes`.
  const allBands = thresholds.modes
    ? [...thresholds.modes.normal.bands, ...thresholds.modes.hard.bands]
    : thresholds.bands;
  const bandIds = [
    ...new Set(
      allBands
        .map((b) => b.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  for (const bandId of bandIds) {
    if (!(bandId in raw.scripts)) {
      problems.push(`band ${bandId}: missing commentary script`);
    }
  }

  const scripts: CommentaryConfig['scripts'] = {};

  for (const [bandId, scriptRaw] of Object.entries(raw.scripts)) {
    if (bandId.startsWith('_')) continue;

    if (!isPlainObject(scriptRaw)) {
      problems.push(`commentary script ${bandId}: expected an object with 'beats'`);
      continue;
    }

    if (!Array.isArray(scriptRaw.beats) || scriptRaw.beats.length === 0) {
      problems.push(`commentary script ${bandId}: 'beats' must be a non-empty array`);
      continue;
    }

    const beats: CommentaryBeat[] = [];

    scriptRaw.beats.forEach((beatRaw: unknown, bi: number) => {
      if (!isPlainObject(beatRaw)) {
        problems.push(`commentary script ${bandId} beat[${bi}]: expected an object`);
        return;
      }

      let minute: number | undefined;
      if (typeof beatRaw.minute !== 'number') {
        problems.push(`commentary script ${bandId} beat[${bi}]: 'minute' must be a number`);
      } else {
        minute = beatRaw.minute;
      }

      let type: CommentaryBeat['type'] | undefined;
      if (typeof beatRaw.type !== 'string' || !BEAT_TYPES.has(beatRaw.type)) {
        problems.push(
          `commentary script ${bandId} beat[${bi}]: type ${JSON.stringify(beatRaw.type)} not in ${[...BEAT_TYPES].join('/')}`,
        );
      } else {
        type = beatRaw.type as CommentaryBeat['type'];
      }

      let text: string | undefined;
      if (typeof beatRaw.text !== 'string' || beatRaw.text.length === 0) {
        problems.push(`commentary script ${bandId} beat[${bi}]: 'text' must be a non-empty string`);
      } else {
        text = beatRaw.text;
        const slots = [...text.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
        for (const slot of slots) {
          if (!SLOT_NAMES.has(slot)) {
            problems.push(`commentary script ${bandId} beat[${bi}]: text contains unknown slot '{${slot}}'`);
          }
        }
      }

      beats.push({ minute: minute ?? 0, type: type ?? 'kickoff', text: text ?? '' });
    });

    scripts[bandId] = { beats };
  }

  return { version: typeof raw.version === 'number' ? raw.version : 1, scripts };
}

// ---------- entry point ----------

export function loadGameData(raw: {
  squads: unknown;
  thresholds: unknown;
  commentary: unknown;
  positionMap: unknown;
}): GameData {
  const problems: string[] = [];

  const positionMap = validatePositionMap(raw.positionMap, problems);
  const thresholds = validateThresholds(raw.thresholds, problems);
  const squads = validateSquads(raw.squads, positionMap, thresholds, problems);
  const commentary = validateCommentary(raw.commentary, thresholds, problems);

  if (problems.length > 0) {
    throw new DataValidationError(problems);
  }

  return { squads, thresholds, commentary, positionMap };
}

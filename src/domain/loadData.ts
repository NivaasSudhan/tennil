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
  Player,
  PositionBucket,
  PositionMap,
  Squad,
  ThresholdConfig,
} from './types';
import { DataValidationError } from './types';

const BUCKETS: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];
const BUCKET_SET = new Set<string>(BUCKETS);
const BEAT_TYPES = new Set(['kickoff', 'goal', 'chance', 'halftime', 'drama', 'fulltime']);
const SLOT_NAMES = new Set(['captain', 'topAtt', 'topMid', 'topDef', 'gk', 'weakest']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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
  };

  if (!isPlainObject(raw)) {
    problems.push('thresholds: expected an object with version/minCounts/ratingScale/bands');
    return fallback;
  }

  if (raw.version !== 1 && raw.version !== 2) {
    problems.push(`thresholds: version must be 1 or 2 (got ${JSON.stringify(raw.version)})`);
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

  const bands: BandDef[] = [];
  if (!Array.isArray(raw.bands) || raw.bands.length === 0) {
    problems.push('thresholds.bands: expected a non-empty array of band definitions');
  } else {
    const seenIds = new Set<string>();
    let fallbackCount = 0;

    raw.bands.forEach((bandRaw: unknown, i: number) => {
      if (!isPlainObject(bandRaw)) {
        problems.push(`thresholds.bands[${i}]: expected an object`);
        return;
      }

      const hasId = typeof bandRaw.id === 'string' && bandRaw.id.length > 0;
      const entity = hasId ? `band ${bandRaw.id as string}` : `thresholds.bands[${i}]`;

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

      bands.push(bandRaw as unknown as BandDef);
    });

    if (fallbackCount === 0) {
      problems.push('thresholds.bands: no band has fallback:true — exactly one fallback band is required');
    } else if (fallbackCount > 1) {
      problems.push(`thresholds.bands: ${fallbackCount} bands have fallback:true — exactly one fallback band is required`);
    }
  }

  // ---------- formations ----------
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

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    referenceFormation: typeof raw.referenceFormation === 'string' ? raw.referenceFormation : '',
    minCounts,
    formations,
    ratingScale,
    bands,
  };
}

// ---------- squads ----------

function validateSquads(raw: unknown, positionMap: PositionMap, thresholds: ThresholdConfig, problems: string[]): Squad[] {
  if (!isPlainObject(raw)) {
    problems.push('squads: expected an object with version/squads');
    return [];
  }

  if (raw.version !== 1) {
    problems.push(`squads: version must be 1 (got ${JSON.stringify(raw.version)})`);
  }

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

      players.push({
        id: hasPlayerId ? (playerRaw.id as string) : playerLabel,
        name: typeof playerRaw.name === 'string' ? playerRaw.name : '',
        positionRaw: positionRaw ?? '',
        positionBucket: positionBucket ?? 'GK',
        rating: rating ?? 0,
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

  const bandIds = thresholds.bands
    .map((b) => b.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

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

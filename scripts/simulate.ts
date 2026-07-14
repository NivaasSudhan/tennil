/**
 * scripts/simulate.ts — T-014 rarity simulation harness.
 *
 * Runs N seeded full drafts through the REAL draft state machine
 * (src/domain/draft/session.ts) and scores each resulting XI through the REAL
 * scoring engine (src/domain/scoring/scoreBand.ts). Prints a band histogram so
 * T-015 can tune `thresholds.json` from data instead of vibes.
 *
 * This script does not reimplement or alter any domain logic — it only drives
 * the public `startDraft`/`pick`/`skip`/`getFinalXI` API with two bot
 * strategies (greedy "skilled proxy" and random "floor").
 *
 * Usage:
 *   npx tsx scripts/simulate.ts --n 500 --seed 42 --bot greedy
 *   npx tsx scripts/simulate.ts --n 500 --seed 42 --bot random
 *   npx tsx scripts/simulate.ts --n 500 --seed 42 --bot greedy --skipThreshold 80
 *
 * Reproducibility: output is a pure function of (--n, --seed, --bot,
 * --skipThreshold) and the vendored JSON data files — no wall-clock, no
 * Math.random, no unordered-map iteration in the output path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadGameData } from '../src/domain/loadData';
import { startDraft, pick, skip, getFinalXI } from '../src/domain/draft/session';
import { isPersonTaken, personKey } from '../src/domain/draft/person';
import { computeScoreInput, evaluateBandPredicates, scoreBand } from '../src/domain/scoring/scoreBand';
import { computeSessionCeiling } from '../src/domain/scoring/sessionCeiling';
import { explainScoreBand } from '../src/domain/scoring/explainScoreBand';
import { withFormationMinCounts } from '../src/domain/scoring/withFormation';
import { withMode } from '../src/domain/scoring/withMode';
import {
  computeProfileFit,
  type AttrBucket,
  type AttrName,
  type Attrs,
  type FormationProfile,
} from '../src/domain/scoring/profileFit';
import { mulberry32 } from '../src/lib/rng';
import type {
  Difficulty,
  DraftSession,
  FinalXI,
  GameData,
  Player,
  PositionBucket,
  PredicateName,
  Rng,
  ScoreInput,
  Squad,
  ThresholdConfig,
} from '../src/domain/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Data loading — reads the four vendored JSON files from disk (build-time
// script; not part of the app bundle) and runs them through the real
// fail-closed validator.
// ---------------------------------------------------------------------------

function readJson(relPath: string): unknown {
  const abs = path.join(__dirname, '..', relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf-8'));
}

export function loadGameDataFromDisk(): GameData {
  const squads = readJson('src/data/squads/squads.json');
  const thresholds = readJson('src/data/config/thresholds.json');
  const commentary = readJson('src/data/config/commentary.json');
  const positionMap = readJson('src/data/position-map.json');
  return loadGameData({ squads, thresholds, commentary, positionMap });
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

export interface SimArgs {
  n: number;
  seed: number;
  bot: 'greedy' | 'random' | 'fitaware';
  skipThreshold: number;
  nearMissDelta?: number; // default 3
  report?: string;        // path for sim-report.json; omit = no file
  /** ADR-020 Wave C: opposition id to score every draft against (looked up in
   * ThresholdConfig.oppositions by id (ADR-021: session/sim flag, not seed-based)
   * daily selection; the sim wants an explicit, repeatable archetype per run).
   * Optional — every pre-Wave-C call site (existing tests constructing SimArgs
   * literals) omits it; default 'neutral' (spec delta: sim default when no flag
   * is passed) is applied at runSingleDraft.
   *
   * Wave D: the special value 'cycle' runs the full `n` for EVERY non-neutral
   * archetype and prints a per-archetype 10-0 count table (the Reveal-Luck Law
   * gate — 10-0 must be > 0% under every archetype with the fitaware bot). */
  opposition?: string;
  formation?: string;
  /** ADR-021: which difficulty band set to score against (via withMode). Default
   * 'hard' (the v2 fit-dominant ladder). 'normal' scores against the v1
   * OVR/efficiency ladder — no fit gates; --opposition is then only used to
   * compute fit for diagnostics (inert against the gateless normal bands). */
  mode?: Difficulty;
}

export function parseArgs(argv: string[]): SimArgs {
  const args: SimArgs = { n: 500, seed: 42, bot: 'greedy', skipThreshold: 84, opposition: 'neutral', mode: 'hard' };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];

    switch (flag) {
      case '--n':
        args.n = Number(value);
        i++;
        break;
      case '--seed':
        args.seed = Number(value);
        i++;
        break;
      case '--bot':
        if (value !== 'greedy' && value !== 'random' && value !== 'fitaware') {
          throw new Error(`--bot must be "greedy", "random", or "fitaware" (got ${JSON.stringify(value)})`);
        }
        args.bot = value;
        i++;
        break;
      case '--skipThreshold':
        args.skipThreshold = Number(value);
        i++;
        break;
      case '--nearMissDelta':
        args.nearMissDelta = Number(value);
        i++;
        break;
      case '--report':
        args.report = value;
        i++;
        break;
      case '--opposition':
        if (!value) throw new Error('--opposition requires a value');
        args.opposition = value;
        i++;
        break;
      case '--formation':
        if (!value) throw new Error('--formation requires a value');
        args.formation = value;
        i++;
        break;
      case '--mode':
        if (value !== 'normal' && value !== 'hard') {
          throw new Error(`--mode must be "normal" or "hard" (got ${JSON.stringify(value)})`);
        }
        args.mode = value;
        i++;
        break;
      default:
        throw new Error(`unknown argument: ${flag}`);
    }
  }

  if (!Number.isFinite(args.n) || args.n <= 0) throw new Error(`--n must be a positive number (got ${args.n})`);
  if (!Number.isFinite(args.seed)) throw new Error(`--seed must be a number (got ${args.seed})`);
  if (!Number.isFinite(args.skipThreshold)) {
    throw new Error(`--skipThreshold must be a number (got ${args.skipThreshold})`);
  }
  if (args.nearMissDelta !== undefined && (!Number.isFinite(args.nearMissDelta) || args.nearMissDelta < 0)) {
    throw new Error(`--nearMissDelta must be a non-negative number (got ${args.nearMissDelta})`);
  }

  return args;
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

type BotDecision = { action: 'pick'; playerId: string } | { action: 'skip' };

/** Deterministic sort: rating descending, then id ascending (tie-break). */
function byRatingDescThenId(a: Player, b: Player): number {
  if (b.rating !== a.rating) return b.rating - a.rating;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function bucketCounts(picks: Player[], positionMap: GameData['positionMap']): Record<PositionBucket, number> {
  const counts: Record<PositionBucket, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of picks) {
    counts[positionMap[p.positionRaw]] += 1;
  }
  return counts;
}

/**
 * GREEDY BOT — skilled-player proxy (RISKS_AND_UNKNOWNS.md §Experiment: 10-0
 * rarity protocol).
 *
 * Each reveal: among pickable players (not already picked), prefer a player
 * filling a currently-unmet need bucket (per `thresholds.minCounts`),
 * highest rating first (ties broken by ascending player id for
 * determinism). Once every bucket has met its minimum, pick the
 * highest-rated pickable player overall.
 *
 * Spends its one skip when the best need-filling player in the reveal is
 * weak (`rating < skipThreshold`) while needs are still unmet — betting that
 * the replacement squad offers something stronger for the same need.
 */
function greedyBot(
  session: DraftSession,
  pickable: Player[],
  data: GameData,
  skipThreshold: number,
  minCounts: Record<PositionBucket, number>,
): BotDecision {
  const counts = bucketCounts(session.picks, data.positionMap);
  const unmet = new Set<PositionBucket>(
    (['GK', 'DEF', 'MID', 'ATT'] as PositionBucket[]).filter((b) => counts[b] < minCounts[b]),
  );

  const needFillers = pickable
    .filter((p) => unmet.has(data.positionMap[p.positionRaw]))
    .sort(byRatingDescThenId);

  if (needFillers.length > 0) {
    const best = needFillers[0];
    if (session.skipRemaining === 1 && best.rating < skipThreshold) {
      return { action: 'skip' };
    }
    return { action: 'pick', playerId: best.id };
  }

  // No pickable player fills an unmet need (either all needs are met, or this
  // reveal simply has no players for the buckets still short) — take the best
  // player available rather than waste the round on a bucket already full.
  if (pickable.length === 0) {
    throw new Error('greedyBot: no pickable players in reveal — draft-session invariant violated');
  }
  const best = [...pickable].sort(byRatingDescThenId)[0];
  return { action: 'pick', playerId: best.id };
}

/**
 * FITAWARE BOT — ADR-020 Wave D + R-13 revision (plan.md "Wave D estimation
 * guidance + Law gate" + SPECIALIZATION table): the second skill axis. Greedy
 * on OVR with attr-tie-break-first near-tie swaps (ΔOVR ≤ 1) toward today's
 * weighted attributes; existing greedy stays the attr-blind baseline, random
 * stays the floor.
 *
 * Exact rule (R-13 revision, BINDING — tighter than Wave D's original ΔOVR ≤ 2
 * so attrs win without sacrificing OVR ceiling under the decoupled SPECIALIZATION
 * corpus): take the OVR-best need-filler UNLESS a candidate within ΔOVR ≤ 1 of
 * it has strictly higher Σ_a w[a]·attr[a] under today's bucket weights ×
 * opposition mods; ties ⇒ ascending id. GK candidates fall back to the OVR rule
 * (no attrs — their score is their rating, never an attr sum).
 *
 * The ΔOVR ≤ 1 pool bounds the OVR sacrifice to at most 1 point: a fit-good
 * outfielder within 1 of a higher-rated GK/peer can win the slot, but a
 * lower-rated player never does. Once every bucket has met its minimum, picks
 * the highest-rated pickable player overall (OVR-only, like greedy — the attr
 * axis only breaks near-ties while needs are unmet). Skip policy matches greedy:
 * spend the one skip iff the OVR-best need-filler is weak
 * (rating < skipThreshold) while needs are still unmet.
 */
const FITAWARE_ATTR_ORDER: AttrName[] = ['pace', 'strength', 'accuracy'];

/** Per-bucket effective weights = profile weights × opposition mods (absent ⇒ 1). */
function effectiveWeights(
  profile: FormationProfile,
  mods: Partial<Attrs>,
): Record<AttrBucket, Attrs> {
  const out = {} as Record<AttrBucket, Attrs>;
  for (const bucket of ['DEF', 'MID', 'ATT'] as AttrBucket[]) {
    const w = profile[bucket].weights;
    out[bucket] = {
      pace: w.pace * (mods.pace ?? 1),
      strength: w.strength * (mods.strength ?? 1),
      accuracy: w.accuracy * (mods.accuracy ?? 1),
    };
  }
  return out;
}

/** Σ_a effW[bucket][a] · player.attrs[a]. Outfield only (GK has no attrs). */
function fitAwareAttrScore(player: Player, bucket: PositionBucket, effW: Record<AttrBucket, Attrs>): number {
  const w = effW[bucket as AttrBucket];
  let sum = 0;
  for (const attr of FITAWARE_ATTR_ORDER) {
    const v = player[attr];
    // loadData v2 guarantees outfield attrs are present; defensive invariant
    // (matches computeProfileFit's throw) — a missing attr is a data bug.
    if (v === undefined) {
      throw new Error(
        `fitAwareAttrScore: outfield player '${player.id}' missing attr '${attr}' — invalid squads v2 data`,
      );
    }
    sum += w[attr] * v;
  }
  return sum;
}

/** fitaware selection score: GK ⇒ rating (OVR rule, no attrs); outfield ⇒ Σ w·attr. */
function fitAwareScore(player: Player, bucket: PositionBucket, effW: Record<AttrBucket, Attrs>): number {
  return bucket === 'GK' ? player.rating : fitAwareAttrScore(player, bucket, effW);
}

function fitawareBot(
  session: DraftSession,
  pickable: Player[],
  data: GameData,
  skipThreshold: number,
  profile: FormationProfile,
  oppMods: Partial<Attrs>,
  minCounts: Record<PositionBucket, number>,
): BotDecision {
  const counts = bucketCounts(session.picks, data.positionMap);
  const unmet = new Set<PositionBucket>(
    (['GK', 'DEF', 'MID', 'ATT'] as PositionBucket[]).filter((b) => counts[b] < minCounts[b]),
  );

  const needFillers = pickable
    .filter((p) => unmet.has(data.positionMap[p.positionRaw]))
    .sort(byRatingDescThenId);

  if (needFillers.length > 0) {
    const ovrBest = needFillers[0];
    if (session.skipRemaining === 1 && ovrBest.rating < skipThreshold) {
      return { action: 'skip' };
    }
    // Near-tie pool: need-fillers within ΔOVR ≤ 1 of the OVR-best (R-13
    // revision — tighter than Wave D's original ΔOVR ≤ 2). The OVR primary axis
    // is preserved (pool is bounded by rating); attrs only pick the winner
    // among near-OVR-equivalent candidates (attr-tie-break-first).
    const pool = needFillers.filter((p) => p.rating >= ovrBest.rating - 1);
    const effW = effectiveWeights(profile, oppMods);
    // Deterministic selection: max fitAwareScore; ties ⇒ ascending id.
    const pick = pool.reduce((best, p) => {
      const sp = fitAwareScore(p, data.positionMap[p.positionRaw], effW);
      const sb = fitAwareScore(best, data.positionMap[best.positionRaw], effW);
      if (sp > sb) return p;
      if (sp < sb) return best;
      return p.id < best.id ? p : best;
    }, pool[0]);
    return { action: 'pick', playerId: pick.id };
  }

  // No pickable need-filler (all needs met, or this reveal has none for the
  // short buckets) — take the highest-rated pickable player (OVR-only, greedy).
  if (pickable.length === 0) {
    throw new Error('fitawareBot: no pickable players in reveal — draft-session invariant violated');
  }
  const best = [...pickable].sort(byRatingDescThenId)[0];
  return { action: 'pick', playerId: best.id };
}

/**
 * RANDOM BOT — the floor. Picks uniformly at random among pickable players
 * every round and NEVER skips (documented choice: a "random" player has no
 * strategic reason to burn the skip token, so it is left unused — this keeps
 * the random bot a clean floor baseline rather than adding another random
 * decision to reason about).
 */
function randomBot(pickable: Player[], rng: Rng): BotDecision {
  if (pickable.length === 0) {
    throw new Error('randomBot: no pickable players in reveal — draft-session invariant violated');
  }
  const idx = Math.floor(rng.next() * pickable.length);
  return { action: 'pick', playerId: pickable[idx].id };
}

// ---------------------------------------------------------------------------
// Single draft
// ---------------------------------------------------------------------------

export interface DraftResult {
  bandId: string;
  finalXI: FinalXI;
  scoreInput: ScoreInput;
  formationId: string;
  revealLog: string[];
}

// Cheap memo so repeated sim runs (N drafts, same `data` object) don't rebuild
// the id->Squad lookup every draft.
const squadsByIdCache = new WeakMap<GameData, Record<string, Squad>>();
function squadsById(data: GameData): Record<string, Squad> {
  let map = squadsByIdCache.get(data);
  if (!map) {
    map = Object.fromEntries(data.squads.map((s) => [s.id, s]));
    squadsByIdCache.set(data, map);
  }
  return map;
}

export function runSingleDraft(
  data: GameData,
  seed: number,
  botType: 'greedy' | 'random' | 'fitaware',
  skipThreshold: number,
  oppositionId: string = 'neutral',
  formationId?: string,
  mode: Difficulty = 'hard',
): DraftResult {
  const rng = mulberry32(seed);
  const oppositionDef = data.thresholds.oppositions.find((o) => o.id === oppositionId);
  if (!oppositionDef) {
    throw new Error(`runSingleDraft: unknown --opposition id '${oppositionId}' (not in thresholds.oppositions)`);
  }

  // ADR-021: select the difficulty band set, then apply the formation view
  // (mirrors ResultScreen's withFormationMinCounts(withMode(...)) path). The
  // draft session itself is drawn in the default (normal) mode — no opponent
  // draw — so reveal sequences stay identical across --mode; fit is scored
  // against the explicit --opposition regardless of mode (inert vs normal bands).
  const modeConfig = withMode(data.thresholds, mode);
  const config = formationId ? withFormationMinCounts(modeConfig, formationId) : modeConfig;
  const effFormationId = config.referenceFormation; // withFormationMinCounts sets this to the target
  const minCounts = config.minCounts;
  const profile = config.profiles[effFormationId];

  let session = startDraft(data, rng, effFormationId);

  while (session.phase !== 'COMPLETE') {
    const reveal = session.currentReveal;
    if (!reveal) throw new Error('runSingleDraft: AWAIT_PICK session has no currentReveal');

    const pickedIds = new Set(session.picks.map((p) => p.id));
    const pickable = reveal.players.filter(
      (p) => !pickedIds.has(p.id) && !isPersonTaken(session, p),
    );

    let decision: BotDecision;
    if (botType === 'random') {
      decision = randomBot(pickable, rng);
    } else if (botType === 'fitaware') {
      decision = fitawareBot(session, pickable, data, skipThreshold, profile, oppositionDef.weightMods, minCounts);
    } else {
      decision = greedyBot(session, pickable, data, skipThreshold, minCounts);
    }

    if (decision.action === 'skip' && session.skipRemaining === 1) {
      session = skip(session, data, rng);
    } else {
      const playerId = decision.action === 'pick' ? decision.playerId : pickable[0].id;
      session = pick(session, data, playerId, rng);
    }
  }

  const finalXI = getFinalXI(session);
  const ceiling = computeSessionCeiling(
    session.revealLog,
    squadsById(data),
    minCounts,
    data.positionMap,
    personKey,
  );
  const fit = computeProfileFit(finalXI, data.positionMap, profile, oppositionDef.weightMods);
  const scoreInput = computeScoreInput(finalXI, data.positionMap, ceiling, fit, oppositionDef.id);
  const { bandId } = scoreBand(scoreInput, config);

  return { bandId, finalXI, scoreInput, formationId: effFormationId, revealLog: session.revealLog };
}

// ---------------------------------------------------------------------------
// N-draft simulation
// ---------------------------------------------------------------------------

export interface SimResult {
  args: SimArgs;
  results: DraftResult[];
  histogram: { bandId: string; label: string; priority: number; count: number; percent: number }[];
  topBandExample: DraftResult | null;
  fallbackExample: DraftResult | null;
  diagnostics: SimDiagnostics;
}

export function runSimulation(data: GameData, args: SimArgs): SimResult {
  const mode: Difficulty = args.mode ?? 'hard';
  const modeConfig = withMode(data.thresholds, mode);
  const results: DraftResult[] = [];
  for (let i = 0; i < args.n; i++) {
    results.push(runSingleDraft(data, args.seed + i, args.bot, args.skipThreshold, args.opposition, args.formation, mode));
  }

  const bandsByPriorityDesc = [...modeConfig.bands].sort((a, b) => b.priority - a.priority);
  const counts = new Map<string, number>();
  for (const band of bandsByPriorityDesc) counts.set(band.id, 0);
  for (const r of results) counts.set(r.bandId, (counts.get(r.bandId) ?? 0) + 1);

  const histogram = bandsByPriorityDesc.map((band) => ({
    bandId: band.id,
    label: band.label,
    priority: band.priority,
    count: counts.get(band.id) ?? 0,
    percent: args.n > 0 ? ((counts.get(band.id) ?? 0) / args.n) * 100 : 0,
  }));

  const topBand = bandsByPriorityDesc[0];
  const fallbackBand = bandsByPriorityDesc.find((b) => b.fallback === true) ?? null;

  const topBandExample = topBand ? results.find((r) => r.bandId === topBand.id) ?? null : null;
  const fallbackExample = fallbackBand ? results.find((r) => r.bandId === fallbackBand.id) ?? null : null;

  const diagnostics = computeDiagnostics(results, modeConfig, args.nearMissDelta ?? 3);
  return { args, results, histogram, topBandExample, fallbackExample, diagnostics };
}

// ---------------------------------------------------------------------------
// Diagnostics (Sprint-1 T6; ROADMAP §3.2/§7). Percentiles show where each
// threshold gate bites; near-misses (computed through explainScoreBand — the
// shared evaluator, never a reimplementation) measure "one more draft" tension.
// ---------------------------------------------------------------------------

export interface DistributionSummary {
  p10: number; p25: number; p50: number; p75: number; p90: number;
  min: number; max: number;
}

export interface SimDiagnostics {
  bucketSums: Record<PositionBucket, DistributionSummary>;
  weakLink: DistributionSummary;
  efficiency: DistributionSummary; // ADR-019: integer % points, userTotal/ceilingTotal
  /** ADR-020 Wave D: per-draft profile-fit distribution (integer 0-100) — the
   * second skill axis. p10-p90 per bot per archetype drives minFit tuning per
   * the plan addendum ("top-band minFit ≈ fitaware p60-p70"). */
  fit: DistributionSummary;
  seedQuartiles: { drafts: string; bands: Record<string, number> }[];
  nearMisses: { missedBandId: string; count: number; percent: number }[];
  nearMissDelta: number;
}

/** Linear-interpolation percentile over an ASCENDING-sorted array. */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) throw new Error('percentile: empty input');
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];
  const rank = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (rank - lo);
}

export function summarizeDistribution(values: number[]): DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

// ADR-019: minBucketSum retired from real thresholds (efficiency replaces it) but kept
// here for synthetic/legacy configs; minEfficiency/minBucketEfficiency are the new
// numeric gates near-miss diagnostics care about. ADR-020 Wave D: minFit joins the
// numeric set so near-miss counts fit-margin shortfalls (≤ delta) on the top bands —
// the top-band near-miss gate (12-20%) is "efficiency OR fit margin within 3".
const NUMERIC_PREDICATES: ReadonlySet<PredicateName> = new Set([
  'minBucketSum',
  'minWeakLink',
  'minEfficiency',
  'minBucketEfficiency',
  'minFit',
]);

export function computeDiagnostics(
  results: DraftResult[],
  config: ThresholdConfig,
  nearMissDelta: number,
): SimDiagnostics {
  const buckets: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];

  const bucketSums = {} as Record<PositionBucket, DistributionSummary>;
  for (const bucket of buckets) {
    bucketSums[bucket] = summarizeDistribution(results.map((r) => r.scoreInput.bucketSums[bucket]));
  }
  const weakLink = summarizeDistribution(results.map((r) => r.scoreInput.weakLink));
  const efficiency = summarizeDistribution(
    results.map((r) => {
      const userTotal = buckets.reduce((sum, b) => sum + r.scoreInput.bucketSums[b], 0);
      const ceilingTotal = r.scoreInput.ceiling.total;
      return ceilingTotal === 0 ? 100 : Math.round((100 * userTotal) / ceilingTotal);
    }),
  );
  const fit = summarizeDistribution(results.map((r) => r.scoreInput.fit));

  // Contiguous quartiles over the seed range: detects drift across seeds
  // (should be roughly flat when n is large enough to trust the histogram).
  const bandIds = config.bands.map((b) => b.id);
  const quartileSize = Math.ceil(results.length / 4);
  const seedQuartiles = [0, 1, 2, 3].map((q) => {
    const slice = results.slice(q * quartileSize, (q + 1) * quartileSize);
    const bands: Record<string, number> = {};
    for (const id of bandIds) bands[id] = 0;
    for (const r of slice) bands[r.bandId] += 1;
    return { drafts: `${q * quartileSize}..${q * quartileSize + slice.length - 1}`, bands };
  });

  // Near miss: nextBetter exists AND every failing predicate is numeric with
  // shortfall <= delta. Structural failures (counts/empty buckets) never count.
  const nearMissCounts = new Map<string, number>();
  for (const r of results) {
    const next = explainScoreBand(r.scoreInput, config).nextBetter;
    if (!next || next.failing.length === 0) continue;
    const close = next.failing.every(
      (p) => NUMERIC_PREDICATES.has(p.name) && p.required - p.actual <= nearMissDelta,
    );
    if (close) nearMissCounts.set(next.bandId, (nearMissCounts.get(next.bandId) ?? 0) + 1);
  }
  const nearMisses = bandIds
    .filter((id) => nearMissCounts.has(id))
    .map((id) => ({
      missedBandId: id,
      count: nearMissCounts.get(id)!,
      percent: (nearMissCounts.get(id)! / results.length) * 100,
    }));

  return { bucketSums, weakLink, efficiency, fit, seedQuartiles, nearMisses, nearMissDelta };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatXI(data: GameData, result: DraftResult): string {
  const lines: string[] = [];
  lines.push(`  bandId: ${result.bandId}`);
  const buckets: PositionBucket[] = ['GK', 'DEF', 'MID', 'ATT'];
  for (const bucket of buckets) {
    const players = result.finalXI
      .filter((p) => data.positionMap[p.positionRaw] === bucket)
      .sort(byRatingDescThenId);
    const names = players.map((p) => `${p.name} (${p.rating})`).join(', ') || '(none)';
    lines.push(`  ${bucket}: ${names}`);
  }
  lines.push(
    `  bucketSums: GK ${result.scoreInput.bucketSums.GK} / DEF ${result.scoreInput.bucketSums.DEF} / MID ${result.scoreInput.bucketSums.MID} / ATT ${result.scoreInput.bucketSums.ATT}`,
  );
  lines.push(`  weakLink: ${result.scoreInput.weakLink}`);
  return lines.join('\n');
}

export function formatReport(data: GameData, sim: SimResult): string {
  const lines: string[] = [];
  lines.push('=== TenNil rarity simulation (T-014) ===');
  lines.push(
    `n=${sim.args.n} seed=${sim.args.seed} bot=${sim.args.bot} skipThreshold=${sim.args.skipThreshold} mode=${sim.args.mode ?? 'hard'} opposition=${sim.args.opposition}`,
  );
  lines.push('');
  lines.push('Band histogram (sorted by priority desc):');
  for (const row of sim.histogram) {
    const pct = row.percent.toFixed(2).padStart(6, ' ');
    lines.push(`  ${row.bandId.padEnd(6)} ${row.label.padEnd(20)} count=${String(row.count).padStart(4)}  ${pct}%`);
  }
  lines.push('');

  if (sim.topBandExample) {
    lines.push(`Example top-band draft (${sim.topBandExample.bandId}):`);
    lines.push(formatXI(data, sim.topBandExample));
  } else {
    lines.push('Example top-band draft: none occurred in this run.');
  }
  lines.push('');

  if (sim.fallbackExample) {
    lines.push(`Example fallback-band draft (${sim.fallbackExample.bandId}):`);
    lines.push(formatXI(data, sim.fallbackExample));
  } else {
    lines.push('Example fallback-band draft: none occurred in this run.');
  }

  lines.push('');
  lines.push(`Diagnostics (nearMissDelta=${sim.diagnostics.nearMissDelta}):`);
  const fmt = (d: DistributionSummary) =>
    `p10 ${d.p10.toFixed(1)}  p25 ${d.p25.toFixed(1)}  p50 ${d.p50.toFixed(1)}  p75 ${d.p75.toFixed(1)}  p90 ${d.p90.toFixed(1)}  (min ${d.min} / max ${d.max})`;
  for (const bucket of ['GK', 'DEF', 'MID', 'ATT'] as PositionBucket[]) {
    lines.push(`  sum ${bucket.padEnd(3)}  ${fmt(sim.diagnostics.bucketSums[bucket])}`);
  }
  lines.push(`  weakLink ${fmt(sim.diagnostics.weakLink)}`);
  lines.push(`  efficiency% ${fmt(sim.diagnostics.efficiency)}`);
  lines.push(`  fit      ${fmt(sim.diagnostics.fit)}`);
  if (sim.diagnostics.nearMisses.length > 0) {
    for (const nm of sim.diagnostics.nearMisses) {
      lines.push(`  near-miss ${nm.missedBandId}: ${nm.count} drafts (${nm.percent.toFixed(2)}%) within ${sim.diagnostics.nearMissDelta} pts`);
    }
  } else {
    lines.push('  near-miss: none within delta');
  }
  for (const q of sim.diagnostics.seedQuartiles) {
    const cells = Object.entries(q.bands).map(([id, c]) => `${id}:${c}`).join(' ');
    lines.push(`  quartile ${q.drafts}: ${cells}`);
  }

  return lines.join('\n');
}

export function buildSimReport(sim: SimResult): object {
  return {
    schema: 1,
    args: sim.args,
    histogram: sim.histogram,
    diagnostics: sim.diagnostics,
  };
}

// ---------------------------------------------------------------------------
// ADR-020 Wave D — opposition cycle (Reveal-Luck Law gate)
// ---------------------------------------------------------------------------

/**
 * Per-archetype summary from a cycle run. The Law gate (plan addendum): with
 * the fitaware bot, 10-0 count must be > 0 for EVERY non-neutral archetype at
 * n=500 — if any archetype zeroes out, lower minFit (never raise targets).
 */
export interface CycleArchetypeResult {
  oppositionId: string;
  oppositionLabel: string;
  tenZeroCount: number;
  tenZeroPercent: number;
  fit: DistributionSummary;
  histogram: SimResult['histogram'];
}

export interface CycleResult {
  args: SimArgs;
  perArchetype: CycleArchetypeResult[];
  /** true iff every archetype has tenZeroCount > 0 (the Law gate). */
  lawGatePass: boolean;
}

/**
 * Runs the full `n` drafts for EVERY non-neutral opposition archetype (sorted
 * by id for determinism) and collects each one's 10-0 count + fit distribution.
 * The Law gate is `lawGatePass` — every archetype must let 10-0 stay attainable.
 */
export function runOppositionCycle(data: GameData, args: SimArgs): CycleResult {
  const nonNeutral = [...data.thresholds.oppositions]
    .filter((o) => o.id !== 'neutral')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const perArchetype: CycleArchetypeResult[] = [];
  for (const opp of nonNeutral) {
    const sim = runSimulation(data, { ...args, opposition: opp.id });
    const tenZero = sim.histogram.find((h) => h.bandId === '10-0');
    perArchetype.push({
      oppositionId: opp.id,
      oppositionLabel: opp.label,
      tenZeroCount: tenZero?.count ?? 0,
      tenZeroPercent: tenZero?.percent ?? 0,
      fit: sim.diagnostics.fit,
      histogram: sim.histogram,
    });
  }

  const lawGatePass = perArchetype.every((r) => r.tenZeroCount > 0);
  return { args, perArchetype, lawGatePass };
}

export function formatCycleReport(cycle: CycleResult): string {
  const lines: string[] = [];
  lines.push('=== TenNil opposition cycle — Reveal-Luck Law gate (ADR-020 Wave D) ===');
  lines.push(
    `n=${cycle.args.n} seed=${cycle.args.seed} bot=${cycle.args.bot} skipThreshold=${cycle.args.skipThreshold}`,
  );
  lines.push('');
  lines.push('Per-archetype 10-0 attainment (Law: every archetype > 0%):');
  lines.push(`  ${'archetype'.padEnd(20)} ${'10-0 count'.padStart(10)} ${'10-0 %'.padStart(9)}   fit p10/p50/p90`);
  for (const r of cycle.perArchetype) {
    const mark = r.tenZeroCount > 0 ? 'OK ' : 'ZERO';
    lines.push(
      `  ${r.oppositionId.padEnd(20)} ${String(r.tenZeroCount).padStart(10)} ${r.tenZeroPercent.toFixed(2).padStart(8)}%   ` +
        `p10 ${r.fit.p10.toFixed(0)} / p50 ${r.fit.p50.toFixed(0)} / p90 ${r.fit.p90.toFixed(0)}  [${mark}]`,
    );
  }
  lines.push('');
  lines.push(`Law gate: ${cycle.lawGatePass ? 'PASS (10-0 attainable under every archetype)' : 'FAIL (some archetype blocks 10-0 — lower minFit, never raise targets)'}`);
  return lines.join('\n');
}

export function buildCycleReport(cycle: CycleResult): object {
  return {
    schema: 2,
    kind: 'opposition-cycle',
    args: cycle.args,
    lawGatePass: cycle.lawGatePass,
    perArchetype: cycle.perArchetype,
  };
}

// ---------------------------------------------------------------------------
// Per-formation comparison (--formation all)
// ---------------------------------------------------------------------------

export interface FormationSimResult {
  formationId: string;
  label: string;
  sim: SimResult;
}

/**
 * Among non-10-0 drafts, count how many fail each 10-0 predicate type.
 * Uses evaluateBandPredicates against the 10-0 band with the formation's config.
 */
export function computeMissed10Breakdown(
  results: DraftResult[],
  config: ThresholdConfig,
): {
  total: number; minEfficiency: number; minFit: number; minWeakLink: number;
  minBucketEfficiencyMID: number; minBucketEfficiencyATT: number;
} {
  const tenZeroBand = config.bands.find((b) => b.id === '10-0');
  if (!tenZeroBand) return { total: 0, minEfficiency: 0, minFit: 0, minWeakLink: 0, minBucketEfficiencyMID: 0, minBucketEfficiencyATT: 0 };

  let total = 0, minEfficiency = 0, minFit = 0, minWeakLink = 0, minBucketEfficiencyMID = 0, minBucketEfficiencyATT = 0;

  for (const r of results) {
    if (r.bandId === '10-0') continue;
    // Re-derive the formation config from what was used at scoring time
    const predicates = evaluateBandPredicates(tenZeroBand, r.scoreInput, config);
    total++;
    for (const p of predicates) {
      if (p.passed) continue;
      if (p.name === 'minEfficiency') minEfficiency++;
      else if (p.name === 'minFit') minFit++;
      else if (p.name === 'minWeakLink') minWeakLink++;
      else if (p.name === 'minBucketEfficiency' && p.bucket === 'MID') minBucketEfficiencyMID++;
      else if (p.name === 'minBucketEfficiency' && p.bucket === 'ATT') minBucketEfficiencyATT++;
    }
  }
  return { total, minEfficiency, minFit, minWeakLink, minBucketEfficiencyMID, minBucketEfficiencyATT };
}

export function runFormationComparison(data: GameData, args: SimArgs): FormationSimResult[] {
  return data.thresholds.formations.map((f) => ({
    formationId: f.id,
    label: f.label,
    sim: runSimulation(data, { ...args, formation: f.id }),
  }));
}

export function formatFormationReport(_data: GameData, fr: FormationSimResult): string {
  const lines: string[] = [];
  lines.push(`=== Formation: ${fr.label} (${fr.formationId}) ===`);
  lines.push(`n=${fr.sim.args.n} seed=${fr.sim.args.seed} bot=${fr.sim.args.bot} opposition=${fr.sim.args.opposition}`);
  lines.push('');
  for (const row of fr.sim.histogram) {
    const pct = row.percent.toFixed(2).padStart(6, ' ');
    lines.push(`  ${row.bandId.padEnd(6)} ${row.label.padEnd(20)} count=${String(row.count).padStart(4)}  ${pct}%`);
  }
  lines.push('');
  const eff = fr.sim.diagnostics.efficiency;
  const fit = fr.sim.diagnostics.fit;
  lines.push(`  efficiency%  p50 ${eff.p50.toFixed(1)}  p90 ${eff.p90.toFixed(1)}`);
  lines.push(`  fit          p50 ${fit.p50.toFixed(1)}  p90 ${fit.p90.toFixed(1)}`);
  return lines.join('\n');
}

export function formatFormationComparison(
  data: GameData,
  comparisons: FormationSimResult[],
  extraSeedResults?: { seed: number; formationId: string; tenZeroCount: number; tenZeroPercent: number }[],
): string {
  const lines: string[] = [];
  lines.push('=== TenNil formation comparison ===');
  const first = comparisons[0];
  const mode: Difficulty = first.sim.args.mode ?? 'hard';
  lines.push(`n=${first.sim.args.n} seed=${first.sim.args.seed} bot=${first.sim.args.bot} mode=${mode} opposition=${first.sim.args.opposition}`);
  lines.push('');

  // Band histogram comparison table (ids are shared across modes)
  const bandIds = withMode(data.thresholds, mode).bands.map((b) => b.id);
  const header = ['Formation', ...bandIds.map((id) => id.padStart(6)), 'eff p50', 'eff p90', 'fit p50', 'fit p90'].join(' ');
  lines.push(header);
  for (const c of comparisons) {
    const histMap = new Map(c.sim.histogram.map((h) => [h.bandId, h.percent.toFixed(2)]));
    const bands = bandIds.map((id) => (histMap.get(id) ?? '0.00').padStart(6));
    const eff = c.sim.diagnostics.efficiency;
    const fit = c.sim.diagnostics.fit;
    const row = [
      c.formationId.padEnd(8),
      ...bands,
      eff.p50.toFixed(1).padStart(7),
      eff.p90.toFixed(1).padStart(7),
      fit.p50.toFixed(1).padStart(7),
      fit.p90.toFixed(1).padStart(7),
    ].join(' ');
    lines.push(row);
  }

  // Extra seed 10-0 rates
  if (extraSeedResults && extraSeedResults.length > 0) {
    lines.push('');
    lines.push('10-0 rate by seed:');
    lines.push('  formation     seed=42    seed=1000  seed=5000');
    for (const c of comparisons) {
      const s42 = (c.sim.histogram.find((h) => h.bandId === '10-0')?.percent ?? 0).toFixed(2).padStart(8);
      const s1000 = (extraSeedResults.find((e) => e.formationId === c.formationId && e.seed === 1000)?.tenZeroPercent ?? 0).toFixed(2).padStart(8);
      const s5000 = (extraSeedResults.find((e) => e.formationId === c.formationId && e.seed === 5000)?.tenZeroPercent ?? 0).toFixed(2).padStart(8);
      lines.push(`  ${c.formationId.padEnd(12)} ${s42}%  ${s1000}%  ${s5000}%`);
    }
  }

  // Missed-10-0 failure-predicate breakdown per formation
  lines.push('');
  lines.push('Missed-10-0 failure-predicate breakdown (among non-10-0 drafts, seed=42):');
  lines.push('  formation      total  eff<99  fit<94  wl<86  bEff-MID  bEff-ATT  any-multi');
  for (const c of comparisons) {
    const config = withFormationMinCounts(withMode(data.thresholds, mode), c.formationId);
    const breakdown = computeMissed10Breakdown(c.sim.results, config);
    const multi = breakdown.total > 0
      ? (breakdown.minEfficiency + breakdown.minFit + breakdown.minWeakLink + breakdown.minBucketEfficiencyMID + breakdown.minBucketEfficiencyATT - breakdown.total).toFixed(0)
      : '0';
    lines.push(
      `  ${c.formationId.padEnd(12)} ${String(breakdown.total).padStart(5)} ${String(breakdown.minEfficiency).padStart(7)} ${String(breakdown.minFit).padStart(7)} ${String(breakdown.minWeakLink).padStart(6)} ${String(breakdown.minBucketEfficiencyMID).padStart(9)} ${String(breakdown.minBucketEfficiencyATT).padStart(9)} ${multi.padStart(10)}`,
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  const args = parseArgs(process.argv.slice(2));
  const data = loadGameDataFromDisk();

  if (args.opposition === 'cycle') {
    // Law gate: run the full n for every non-neutral archetype, print the
    // per-archetype 10-0 table. Exit non-zero iff the fitaware bot fails the
    // Law (some archetype zeroes 10-0) — the gate the addendum binds.
    const cycle = runOppositionCycle(data, args);
    console.log(formatCycleReport(cycle));
    if (args.report) {
      fs.writeFileSync(args.report, JSON.stringify(buildCycleReport(cycle), null, 2) + '\n');
      console.log(`\nreport written: ${args.report}`);
    }
    if (!cycle.lawGatePass && args.bot === 'fitaware') {
      process.exitCode = 2;
    }
  } else if (args.formation === 'all') {
    // Per-formation comparison: run the full n for every cataloged formation
    // and print a comparison table.
    const comparisons = runFormationComparison(data, args);

    // Also run extra seeds for 10-0 rate (seed 1000 and 5000)
    const extraSeedResults: { seed: number; formationId: string; tenZeroCount: number; tenZeroPercent: number }[] = [];
    for (const extraSeed of [1000, 5000]) {
      for (const f of data.thresholds.formations) {
        const s = runSimulation(data, { ...args, seed: extraSeed, formation: f.id });
        const tenZero = s.histogram.find((h) => h.bandId === '10-0');
        extraSeedResults.push({
          seed: extraSeed,
          formationId: f.id,
          tenZeroCount: tenZero?.count ?? 0,
          tenZeroPercent: tenZero?.percent ?? 0,
        });
      }
    }

    console.log(formatFormationComparison(data, comparisons, extraSeedResults));

    // Write detailed per-formation reports
    fs.mkdirSync('./.simout', { recursive: true });
    for (const fr of comparisons) {
      const text = formatFormationReport(data, fr);
      fs.writeFileSync(`./.simout/${fr.formationId}.txt`, text + '\n');
    }
    // Write seed comparison
    const seedLines = extraSeedResults.map(
      (e) => `${e.formationId} seed=${e.seed} 10-0=${e.tenZeroCount} (${e.tenZeroPercent.toFixed(2)}%)`,
    );
    fs.writeFileSync('./.simout/tenzero_seeds.txt', seedLines.join('\n') + '\n');

    if (args.report) {
      fs.writeFileSync(args.report, JSON.stringify(comparisons.map((c) => ({ formationId: c.formationId, histogram: c.sim.histogram, diagnostics: c.sim.diagnostics })), null, 2) + '\n');
    }
  } else {
    const sim = runSimulation(data, args);
    console.log(formatReport(data, sim));
    if (args.report) {
      fs.writeFileSync(args.report, JSON.stringify(buildSimReport(sim), null, 2) + '\n');
      console.log(`\nreport written: ${args.report}`);
    }
  }
}

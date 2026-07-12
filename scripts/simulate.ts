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
import { computeScoreInput, scoreBand } from '../src/domain/scoring/scoreBand';
import { computeSessionCeiling } from '../src/domain/scoring/sessionCeiling';
import { explainScoreBand } from '../src/domain/scoring/explainScoreBand';
import { mulberry32 } from '../src/lib/rng';
import type {
  DraftSession,
  FinalXI,
  GameData,
  Player,
  PositionBucket,
  PredicateName,
  Rng,
  ScoreInput,
  Squad,
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
  bot: 'greedy' | 'random';
  skipThreshold: number;
  nearMissDelta?: number; // default 3
  report?: string;        // path for sim-report.json; omit = no file
}

export function parseArgs(argv: string[]): SimArgs {
  const args: SimArgs = { n: 500, seed: 42, bot: 'greedy', skipThreshold: 84 };

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
        if (value !== 'greedy' && value !== 'random') {
          throw new Error(`--bot must be "greedy" or "random" (got ${JSON.stringify(value)})`);
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
): BotDecision {
  const minCounts = data.thresholds.minCounts;
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
  botType: 'greedy' | 'random',
  skipThreshold: number,
): DraftResult {
  const rng = mulberry32(seed);
  // ADR-017 C6: sim drives the default (reference) formation only.
  let session = startDraft(data, rng);

  while (session.phase !== 'COMPLETE') {
    const reveal = session.currentReveal;
    if (!reveal) throw new Error('runSingleDraft: AWAIT_PICK session has no currentReveal');

    const pickedIds = new Set(session.picks.map((p) => p.id));
    // Filter by id AND person (ADR-018) — an era-duplicate of an already-picked
    // human would make pick() throw if a bot chose it.
    const pickable = reveal.players.filter(
      (p) => !pickedIds.has(p.id) && !isPersonTaken(session, p),
    );

    const decision: BotDecision =
      botType === 'greedy'
        ? greedyBot(session, pickable, data, skipThreshold)
        : randomBot(pickable, rng);

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
    data.thresholds.minCounts,
    data.positionMap,
    personKey,
  );
  const scoreInput = computeScoreInput(finalXI, data.positionMap, ceiling);
  const { bandId } = scoreBand(scoreInput, data.thresholds);

  return { bandId, finalXI, scoreInput };
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
  const results: DraftResult[] = [];
  for (let i = 0; i < args.n; i++) {
    results.push(runSingleDraft(data, args.seed + i, args.bot, args.skipThreshold));
  }

  const bandsByPriorityDesc = [...data.thresholds.bands].sort((a, b) => b.priority - a.priority);
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

  const diagnostics = computeDiagnostics(results, data, args.nearMissDelta ?? 3);
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
// numeric gates near-miss diagnostics care about.
const NUMERIC_PREDICATES: ReadonlySet<PredicateName> = new Set([
  'minBucketSum',
  'minWeakLink',
  'minEfficiency',
  'minBucketEfficiency',
]);

export function computeDiagnostics(
  results: DraftResult[],
  data: GameData,
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

  // Contiguous quartiles over the seed range: detects drift across seeds
  // (should be roughly flat when n is large enough to trust the histogram).
  const bandIds = data.thresholds.bands.map((b) => b.id);
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
    const next = explainScoreBand(r.scoreInput, data.thresholds).nextBetter;
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

  return { bucketSums, weakLink, efficiency, seedQuartiles, nearMisses, nearMissDelta };
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
  lines.push(`n=${sim.args.n} seed=${sim.args.seed} bot=${sim.args.bot} skipThreshold=${sim.args.skipThreshold}`);
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
  const sim = runSimulation(data, args);
  console.log(formatReport(data, sim));
  if (args.report) {
    fs.writeFileSync(args.report, JSON.stringify(buildSimReport(sim), null, 2) + '\n');
    console.log(`\nreport written: ${args.report}`);
  }
}

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
import { computeScoreInput, scoreBand } from '../src/domain/scoring/scoreBand';
import { mulberry32 } from '../src/lib/rng';
import type {
  DraftSession,
  FinalXI,
  GameData,
  Player,
  PositionBucket,
  Rng,
  ScoreInput,
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
      default:
        throw new Error(`unknown argument: ${flag}`);
    }
  }

  if (!Number.isFinite(args.n) || args.n <= 0) throw new Error(`--n must be a positive number (got ${args.n})`);
  if (!Number.isFinite(args.seed)) throw new Error(`--seed must be a number (got ${args.seed})`);
  if (!Number.isFinite(args.skipThreshold)) {
    throw new Error(`--skipThreshold must be a number (got ${args.skipThreshold})`);
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

export function runSingleDraft(
  data: GameData,
  seed: number,
  botType: 'greedy' | 'random',
  skipThreshold: number,
): DraftResult {
  const rng = mulberry32(seed);
  let session = startDraft(data, rng);

  while (session.phase !== 'COMPLETE') {
    const reveal = session.currentReveal;
    if (!reveal) throw new Error('runSingleDraft: AWAIT_PICK session has no currentReveal');

    const pickedIds = new Set(session.picks.map((p) => p.id));
    const pickable = reveal.players.filter((p) => !pickedIds.has(p.id));

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
  const scoreInput = computeScoreInput(finalXI, data.positionMap);
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

  return { args, results, histogram, topBandExample, fallbackExample };
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
  lines.push('=== fifaTenZero rarity simulation (T-014) ===');
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
  const sim = runSimulation(data, args);
  console.log(formatReport(data, sim));
}

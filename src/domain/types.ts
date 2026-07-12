/**
 * Canonical domain types — World Cup Draft-XI Game.
 * Source of truth for names/shapes: ARCHITECTURE.md §3/§5, DECISIONS.md ADR-002..005, ADR-020.
 * This file has NO imports from react, src/app, or src/lib/rng (except the Rng type seam below).
 * `FormationProfile`/`OppositionDef` are imported type-only from scoring/profileFit.ts
 * (ADR-020) — a type-only circular reference (that file imports `PositionBucket` back
 * from here), erased at compile time, never a runtime dependency.
 */

import type { FormationProfile, OppositionDef } from './scoring/profileFit';

export type PositionBucket = 'GK' | 'DEF' | 'MID' | 'ATT';

export interface Player {
  id: string;            // unique across corpus, e.g. "arg-1986-maradona"
  name: string;
  positionRaw: string;   // must exist as a key in position-map.json
  positionBucket: PositionBucket;
  rating: number;        // integer 1..100
  /** ADR-020: outfield-only attrs (squads v2). GK players must never carry these. */
  pace?: number;         // integer 1..99
  strength?: number;     // integer 1..99
  accuracy?: number;     // integer 1..99
}

export interface Squad {
  id: string;            // "<iso3-lowercase>-<year>", e.g. "bra-1970"
  country: string;
  year: number;
  players: Player[];     // exactly 11
}

export type PositionMap = Record<string, PositionBucket>;

/** Everything loaded + validated at boot. Fail-closed: see loadData.ts. */
export interface GameData {
  squads: Squad[];
  thresholds: ThresholdConfig;
  commentary: CommentaryConfig;
  positionMap: PositionMap;
}

// ---------- Draft (ADR-003) ----------

export type Pick = Player;
export type FinalXI = Player[]; // exactly 11, validated by getFinalXI

export interface DraftSession {
  phase: 'AWAIT_PICK' | 'COMPLETE';
  picks: Pick[];               // 0..11
  skipRemaining: 0 | 1;        // the SkipToken
  roundsPlayed: number;        // reveals so far, includes the skipped one
  seenSquadIds: string[];
  excludedSquadIds: string[];  // session-scoped permanent ban after skip
  currentReveal: Squad | null; // null iff COMPLETE
  breachLog: string[];         // Invariant-7 relaxations (forced squad repeats)
  formationId: string;         // chosen formation id, set at startDraft
  revealLog: string[];         // ADR-019: ordered squad id per reveal round (skipped round
                                // included); canonical truth for computeSessionCeiling.
                                // revealLog.length === roundsPlayed, always.
  readonly seed: number;       // ADR-014-lite: seed the session's rng was constructed from
  readonly mode: 'daily' | 'free'; // ADR-014-lite: daily = shared seed, free = per-session random seed
}

/** startDraft options (ADR-014-lite): seed/mode are recorded on the session for
 * attribution/replay; they do NOT construct the rng themselves — the caller
 * (App) constructs `rng` from the same `seed` and passes both through. */
export interface StartDraftOptions {
  seed?: number;
  mode?: 'daily' | 'free';
}

/** Injectable randomness (ADR-008). NEVER imported by scoring/ or commentary/. */
export interface Rng {
  next(): number; // uniform [0, 1)
}

// ---------- Scoring (ADR-004) ----------

/** ADR-019: max-total XI a session's reveals could have produced (see sessionCeiling.ts). */
export interface CeilingResult {
  bucketSums: Record<PositionBucket, number>;
  total: number;
}

export interface ScoreInput {
  bucketSums: Record<PositionBucket, number>;
  bucketCounts: Record<PositionBucket, number>;
  weakLink: number; // min individual rating in the FinalXI
  ceiling: CeilingResult; // ADR-019: session-relative denominator for efficiency predicates
  /** ADR-020: integer 0-100, computeProfileFit(xi, positionMap, profile, opposition.weightMods).
   * Defaults to 0 at computeScoreInput call sites that don't pass it explicitly (pre-Wave-C
   * synthetic fixtures) — 0 is inert against `minFit` gates staged at 0 (Wave A placeholder). */
  fit: number;
  /** ADR-020: id of the ThresholdConfig.oppositions entry whose weightMods produced `fit`
   * (e.g. 'neutral' when no real opposition selection ran). */
  oppositionId: string;
}

export interface BandDef {
  id: string;                 // e.g. "10-0" — must have a script in commentary.json
  priority: number;           // evaluated descending; first full match wins
  label: string;              // margin label for UI, e.g. "LEGENDARY ROUT"
  requireAllBucketsNonEmpty?: boolean;
  requireMinCounts?: boolean; // vs ThresholdConfig.minCounts
  minBucketSums?: Partial<Record<PositionBucket, number>>;
  minWeakLink?: number;
  /** ADR-019: integer percentage points (0-100) of userTotal/ceilingTotal required. */
  minEfficiency?: number;
  /** ADR-019: per-bucket variant, same integer-% convention. */
  minBucketEfficiency?: Partial<Record<PositionBucket, number>>;
  /** ADR-020: integer 0-100, top-three-bands-only gate on the session's effectiveFit. */
  minFit?: number;
  fallback?: boolean;         // exactly one band; matches unconditionally
}

export interface Formation {
  id: string;
  label: string;
  description: string;
  minCounts: Record<PositionBucket, number>;
}

export interface ThresholdConfig {
  version: number;
  referenceFormation: string; // e.g. "4-3-3"
  minCounts: Record<PositionBucket, number>;
  formations: Formation[];    // NEW required after schema v2
  ratingScale: { min: number; max: number };
  bands: BandDef[];
  /** ADR-020 (schema v4): per-formation attr targets, keyed by Formation.id. */
  profiles: Record<string, FormationProfile>;
  /** ADR-020 (schema v4): rotating daily opponent catalog; must include id 'neutral'. */
  oppositions: OppositionDef[];
}

export interface ScoreBand {
  bandId: string;
  label: string;
}

// ---------- Scoring explainability (ADR-013) ----------

export type PredicateName =
  | 'allBucketsNonEmpty'
  | 'minCounts'
  | 'minBucketSum'
  | 'minWeakLink'
  | 'minEfficiency'
  | 'minBucketEfficiency'
  | 'minFit';

/** One structured check result. passed === (actual >= required), always. */
export interface PredicateResult {
  name: PredicateName;
  bucket?: PositionBucket; // absent only for minWeakLink
  required: number;
  actual: number;
  passed: boolean;
}

export interface BandEvaluation {
  bandId: string;
  label: string;
  priority: number;
  fallback: boolean;
  matched: boolean;
  predicates: PredicateResult[]; // [] for the fallback band
}

export interface ScoreExplanation {
  bandId: string; // ALWAYS equals scoreBand(input, config).bandId
  label: string;
  evaluations: BandEvaluation[]; // priority descending
  nextBetter: { bandId: string; label: string; failing: PredicateResult[] } | null;
}

// ---------- Commentary (ADR-005) ----------

export type BeatType = 'kickoff' | 'goal' | 'chance' | 'halftime' | 'drama' | 'fulltime';

export interface CommentaryBeat {
  minute: number; // display flavor only
  type: BeatType;
  text: string;   // may contain slots {captain} {topAtt} {topMid} {topDef} {gk} {weakest}
}

export interface CommentaryConfig {
  version: number;
  scripts: Record<string, { beats: CommentaryBeat[] }>; // key = band id
}

/** Output of buildCommentary: beats with all slots resolved to player names. */
export interface CommentaryScript {
  bandId: string;
  label: string;
  beats: CommentaryBeat[]; // text fully interpolated, no remaining {slots}
}

// ---------- Errors ----------

export class DataValidationError extends Error {
  constructor(public problems: string[]) {
    super(`Game data invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'DataValidationError';
  }
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

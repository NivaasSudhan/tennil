/**
 * Canonical domain types — World Cup Draft-XI Game.
 * Source of truth for names/shapes: ARCHITECTURE.md §3/§5, DECISIONS.md ADR-002..005.
 * This file has NO imports from react, src/app, or src/lib/rng (except the Rng type seam below).
 */

export type PositionBucket = 'GK' | 'DEF' | 'MID' | 'ATT';

export interface Player {
  id: string;            // unique across corpus, e.g. "arg-1986-maradona"
  name: string;
  positionRaw: string;   // must exist as a key in position-map.json
  positionBucket: PositionBucket;
  rating: number;        // integer 1..100
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
  currentReveal: Squad | null; // null iff COMPLETE
  breachLog: string[];         // Invariant-7 relaxations (forced squad repeats)
}

/** Injectable randomness (ADR-008). NEVER imported by scoring/ or commentary/. */
export interface Rng {
  next(): number; // uniform [0, 1)
}

// ---------- Scoring (ADR-004) ----------

export interface ScoreInput {
  bucketSums: Record<PositionBucket, number>;
  bucketCounts: Record<PositionBucket, number>;
  weakLink: number; // min individual rating in the FinalXI
}

export interface BandDef {
  id: string;                 // e.g. "10-0" — must have a script in commentary.json
  priority: number;           // evaluated descending; first full match wins
  label: string;              // margin label for UI, e.g. "LEGENDARY ROUT"
  requireAllBucketsNonEmpty?: boolean;
  requireMinCounts?: boolean; // vs ThresholdConfig.minCounts
  minBucketSums?: Partial<Record<PositionBucket, number>>;
  minWeakLink?: number;
  fallback?: boolean;         // exactly one band; matches unconditionally
}

export interface ThresholdConfig {
  version: number;
  referenceFormation: string; // e.g. "4-3-3"
  minCounts: Record<PositionBucket, number>;
  ratingScale: { min: number; max: number };
  bands: BandDef[];
}

export interface ScoreBand {
  bandId: string;
  label: string;
}

// ---------- Scoring explainability (ADR-013) ----------

export type PredicateName = 'allBucketsNonEmpty' | 'minCounts' | 'minBucketSum' | 'minWeakLink';

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

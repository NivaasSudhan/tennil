/**
 * tests/nearMiss.test.ts — WAVE W4 near-miss margin line formatter (ADR-019).
 * Pure: consumes a ScoreExplanation-shaped object. Covers every ADR-019
 * predicate vocabulary: minEfficiency, minBucketEfficiency, minWeakLink, and
 * the shape gates (minCounts / allBucketsNonEmpty); plus the two-most-binding
 * join (smallest shortfall first).
 */
import { describe, it, expect } from 'vitest';
import { formatNearMiss } from '../src/app/nearMiss';
import type { PredicateResult, ScoreExplanation } from '../src/domain/types';

function explain(nextBetter: ScoreExplanation['nextBetter']): ScoreExplanation {
  return {
    bandId: 'AWARDED',
    label: 'AWARDED',
    evaluations: [],
    nextBetter,
  };
}

function fail(p: Omit<PredicateResult, 'passed'>): PredicateResult {
  return { ...p, passed: false };
}

describe('formatNearMiss', () => {
  it('returns null text when awarded the top band (nextBetter null)', () => {
    const e = explain(null);
    expect(formatNearMiss(e).text).toBeNull();
  });

  it('returns null when nextBetter exists but has no failing predicates', () => {
    const e = explain({ bandId: '10-0', label: 'x', failing: [] });
    expect(formatNearMiss(e).text).toBeNull();
  });

  it('renders minEfficiency -> "N EFFICIENCY PTS FROM A 2-1"', () => {
    const e = explain({
      bandId: '2-1',
      label: 'HW',
      failing: [fail({ name: 'minEfficiency', required: 93, actual: 91 })],
    });
    expect(formatNearMiss(e).text).toBe('2 EFFICIENCY PTS FROM A 2-1');
  });

  it('prints "EFFICIENCY PT" singular when the gap is 1', () => {
    const e = explain({
      bandId: '7-1',
      label: 'RD',
      failing: [fail({ name: 'minEfficiency', required: 99, actual: 98 })],
    });
    expect(formatNearMiss(e).text).toBe('1 EFFICIENCY PT FROM A 7-1');
  });

  it('renders minBucketEfficiency -> "LEFT N PTS IN MID — 7-1 WANTED MORE"', () => {
    const e = explain({
      bandId: '7-1',
      label: 'RD',
      failing: [fail({ name: 'minBucketEfficiency', bucket: 'MID', required: 99, actual: 96 })],
    });
    expect(formatNearMiss(e).text).toBe('LEFT 3 PTS IN MID — 7-1 WANTED MORE');
  });

  it('prints "PT" singular on minBucketEfficiency gap of 1', () => {
    const e = explain({
      bandId: '10-0',
      label: 'LR',
      failing: [fail({ name: 'minBucketEfficiency', bucket: 'ATT', required: 99, actual: 98 })],
    });
    expect(formatNearMiss(e).text).toBe('LEFT 1 PT IN ATT — 10-0 WANTED MORE');
  });

  it('renders minWeakLink -> "WEAK LINK 84 — 10-0 DEMANDS 86"', () => {
    const e = explain({
      bandId: '10-0',
      label: 'LR',
      failing: [fail({ name: 'minWeakLink', required: 86, actual: 84 })],
    });
    expect(formatNearMiss(e).text).toBe('WEAK LINK 84 — 10-0 DEMANDS 86');
  });

  it('renders minCounts shape failure -> "SHAPE BROKE THE CEILING — 1 PT MORE DEF FOR 5-0"', () => {
    const e = explain({
      bandId: '5-0',
      label: 'DD',
      failing: [fail({ name: 'minCounts', bucket: 'DEF', required: 4, actual: 3 })],
    });
    expect(formatNearMiss(e).text).toBe('SHAPE BROKE THE CEILING — 1 PT MORE DEF FOR 5-0');
  });

  it('renders allBucketsNonEmpty shape failure -> "SHAPE BROKE THE CEILING — EMPTY GK FOR 1-2"', () => {
    const e = explain({
      bandId: '1-2',
      label: 'UL',
      failing: [fail({ name: 'allBucketsNonEmpty', bucket: 'GK', required: 1, actual: 0 })],
    });
    expect(formatNearMiss(e).text).toBe('SHAPE BROKE THE CEILING — EMPTY GK FOR 1-2');
  });

  it('joins the two most binding failures (smallest shortfall first) with " · "', () => {
    // The W4 spec example: missed 10-0 by minBucketEfficiency MID (99 vs 98,
    // gap 1) + minWeakLink (86 vs 84, gap 2). Smallest gap first.
    const e = explain({
      bandId: '10-0',
      label: 'LR',
      failing: [
        fail({ name: 'minBucketEfficiency', bucket: 'MID', required: 99, actual: 98 }),
        fail({ name: 'minWeakLink', required: 86, actual: 84 }),
      ],
    });
    expect(formatNearMiss(e).text).toBe(
      'LEFT 1 PT IN MID — 10-0 WANTED MORE · WEAK LINK 84 — 10-0 DEMANDS 86',
    );
  });

  it('joins shape (most binding) with minEfficiency when both fail', () => {
    // minCounts DEF gap 1 vs minEfficiency gap 3 -> shape first.
    const e = explain({
      bandId: '5-0',
      label: 'DD',
      failing: [
        fail({ name: 'minEfficiency', required: 98, actual: 95 }),
        fail({ name: 'minCounts', bucket: 'DEF', required: 4, actual: 3 }),
      ],
    });
    expect(formatNearMiss(e).text).toBe(
      'SHAPE BROKE THE CEILING — 1 PT MORE DEF FOR 5-0 · 3 EFFICIENCY PTS FROM A 5-0',
    );
  });

  it('emits a single line when only one failing predicate exists', () => {
    const e = explain({
      bandId: '2-1',
      label: 'HW',
      failing: [fail({ name: 'minEfficiency', required: 93, actual: 91 })],
    });
    expect(formatNearMiss(e).text).toBe('2 EFFICIENCY PTS FROM A 2-1');
  });

  it('collapses multiple shape failures into one shape verdict (smallest gap)', () => {
    // Two buckets fail counts; shape should render the smallest gap once —
    // the line below DEF (3 vs 2, gap 1) not MID (3 vs 1, gap 2).
    const e = explain({
      bandId: '7-1',
      label: 'RD',
      failing: [
        fail({ name: 'minCounts', bucket: 'DEF', required: 3, actual: 2 }),
        fail({ name: 'minCounts', bucket: 'MID', required: 3, actual: 1 }),
        fail({ name: 'minWeakLink', required: 86, actual: 80 }),
      ],
    });
    expect(formatNearMiss(e).text).toBe(
      'SHAPE BROKE THE CEILING — 1 PT MORE DEF FOR 7-1 · WEAK LINK 80 — 7-1 DEMANDS 86',
    );
  });
});
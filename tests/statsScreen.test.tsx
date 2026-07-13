// @vitest-environment jsdom
/**
 * tests/statsScreen.test.tsx — ADR-020 Wave E stats screen (broadcast world).
 *
 * StatsScreen is pure presentation: per-bucket attr bars vs formation targets,
 * today's opposition-weighted attr emphasized (gold class), 'TACTICAL FIT N'
 * heading and one dry-pundit insight line. Data arrives fully computed via
 * props (compute-once in ResultScreen's useMemo). Also covers the small pure
 * helper computeBucketAttrMeans exported from profileFit.ts for that memo.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StatsScreen, { emphasizedAttrs, fitInsightLine } from '../src/app/StatsScreen';
import { computeBucketAttrMeans } from '../src/domain/scoring/profileFit';
import type { Attrs, AttrBucket, FormationProfile, OppositionDef } from '../src/domain/scoring/profileFit';
import type { FinalXI, PositionMap } from '../src/domain/types';

afterEach(cleanup);

const PROFILE: FormationProfile = {
  DEF: { weights: { pace: 0.7, strength: 0.2, accuracy: 0.55 }, targets: { pace: 86, strength: 85, accuracy: 72 } },
  MID: { weights: { pace: 0.2, strength: 0.85, accuracy: 0.4 }, targets: { pace: 76, strength: 83, accuracy: 88 } },
  ATT: { weights: { pace: 0.5, strength: 0.2, accuracy: 0.85 }, targets: { pace: 88, strength: 72, accuracy: 87 } },
};

const PRESSING: OppositionDef = {
  id: 'pressing-machine',
  label: 'THE PRESSING MACHINE',
  tagline: 'pace is at a premium today.',
  weightMods: { pace: 1.25 },
};

const NEUTRAL: OppositionDef = {
  id: 'neutral',
  label: 'NEUTRAL',
  tagline: 'a fair fight today.',
  weightMods: {},
};

function means(over: Partial<Record<AttrBucket, Attrs | null>> = {}): Record<AttrBucket, Attrs | null> {
  return {
    DEF: { pace: 80, strength: 88, accuracy: 75 },
    MID: { pace: 78, strength: 85, accuracy: 90 },
    ATT: { pace: 92, strength: 70, accuracy: 84 },
    ...over,
  };
}

describe('StatsScreen — bars, fit number, emphasis', () => {
  it('renders TACTICAL FIT number, insight line, and 9 attr bars (3 buckets x 3 attrs)', () => {
    const { container } = render(
      <StatsScreen means={means()} profile={PROFILE} opposition={PRESSING} fit={91} />,
    );
    expect(screen.getByText(/TACTICAL FIT/i)).toBeTruthy();
    expect(screen.getByText('91')).toBeTruthy();
    expect(container.querySelectorAll('.stats-bar').length).toBe(9);
    expect(container.querySelector('.stats-screen__insight')?.textContent).toContain(
      'THE PRESSING MACHINE WANTED PACE',
    );
  });

  it("emphasizes today's opposition-weighted attr (gold class) on every bucket", () => {
    const { container } = render(
      <StatsScreen means={means()} profile={PROFILE} opposition={PRESSING} fit={80} />,
    );
    const emph = container.querySelectorAll('.stats-bar--emph');
    expect(emph.length).toBe(3); // pace bar per bucket
    emph.forEach((el) => expect(el.getAttribute('data-attr')).toBe('pace'));
  });

  it('skips empty buckets (null means) — no zero-plotted bars', () => {
    const { container } = render(
      <StatsScreen means={means({ ATT: null })} profile={PROFILE} opposition={PRESSING} fit={70} />,
    );
    expect(container.querySelectorAll('.stats-bar').length).toBe(6);
  });

  it('engine jargon never appears in the rendered copy', () => {
    const { container } = render(
      <StatsScreen means={means()} profile={PROFILE} opposition={PRESSING} fit={91} />,
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['efficiency', 'ceiling', 'predicate', 'config', 'fit-gate', 'weightmod']) {
      expect(text).not.toContain(banned);
    }
  });
});

describe('fitInsightLine — dry-pundit copy from the biggest shortfall', () => {
  it('shortfall on the demanded axis names the worst bucket: DIDN\'T HAVE IT', () => {
    // DEF pace 80 vs target 86 = -6 (worst); MID -(-2)... DEF is worst.
    const line = fitInsightLine(means(), PROFILE, PRESSING);
    expect(line).toBe("THE PRESSING MACHINE WANTED PACE — YOUR BACK LINE DIDN'T HAVE IT");
  });

  it('all buckets at/over target on the demanded axis: best bucket HAD IT', () => {
    const rich = means({
      DEF: { pace: 90, strength: 88, accuracy: 75 },
      MID: { pace: 80, strength: 85, accuracy: 90 },
      ATT: { pace: 95, strength: 70, accuracy: 84 },
    });
    // Gaps: DEF -4, MID -4, ATT -7 → ATT is the best surplus.
    const line = fitInsightLine(rich, PROFILE, PRESSING);
    expect(line).toBe('THE PRESSING MACHINE WANTED PACE — YOUR WINGS HAD IT');
  });

  it('neutral opponent falls back to the axis with the biggest total shortfall', () => {
    // pace shortfalls: DEF 6 + MID 0 + ATT 0 = 6; strength: 0+0+2=2; accuracy: 0+0+3=3.
    const line = fitInsightLine(means(), PROFILE, NEUTRAL);
    expect(line).toContain('WANTED PACE');
  });
});

describe('emphasizedAttrs', () => {
  it('returns the attrs the opponent weights above 1; empty for neutral', () => {
    expect(emphasizedAttrs(PRESSING)).toEqual(['pace']);
    expect(emphasizedAttrs(NEUTRAL)).toEqual([]);
    expect(
      emphasizedAttrs({ id: 'ck', label: 'COUNTER KINGS', tagline: '', weightMods: { pace: 1.15, strength: 1.15 } }),
    ).toEqual(['pace', 'strength']);
  });
});

describe('computeBucketAttrMeans (profileFit.ts pure helper)', () => {
  const POSITION_MAP: PositionMap = { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' };

  function player(id: string, positionRaw: string, bucket: 'GK' | 'DEF' | 'MID' | 'ATT', attrs?: Attrs) {
    return {
      id,
      name: id,
      positionRaw,
      positionBucket: bucket,
      rating: 85,
      ...(attrs ?? {}),
    };
  }

  it('per-bucket arithmetic means, GK excluded, empty bucket null', () => {
    const xi = [
      player('gk', 'GK', 'GK'), // no attrs — must be ignored, not throw
      player('cb1', 'CB', 'DEF', { pace: 70, strength: 90, accuracy: 60 }),
      player('cb2', 'CB', 'DEF', { pace: 80, strength: 80, accuracy: 70 }),
      player('cm1', 'CM', 'MID', { pace: 75, strength: 85, accuracy: 95 }),
    ] as unknown as FinalXI;
    const m = computeBucketAttrMeans(xi, POSITION_MAP);
    expect(m.DEF).toEqual({ pace: 75, strength: 85, accuracy: 65 });
    expect(m.MID).toEqual({ pace: 75, strength: 85, accuracy: 95 });
    expect(m.ATT).toBeNull();
  });

  it('throws the defensive invariant error on an outfield player missing an attr', () => {
    const xi = [player('cb1', 'CB', 'DEF')] as unknown as FinalXI;
    expect(() => computeBucketAttrMeans(xi, POSITION_MAP)).toThrow(/missing attr/);
  });
});

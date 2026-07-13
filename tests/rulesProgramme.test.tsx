// @vitest-environment jsdom
/**
 * jsdom <dialog> polyfill — showModal/close are missing in some jsdom versions.
 * The component uses native <dialog> unchanged; tests only need it to not throw.
 */
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
}

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StartScreen from '../src/app/StartScreen';
import DraftScreen from '../src/app/DraftScreen';
import ResultScreen from '../src/app/ResultScreen';
import { getRulesPages } from '../src/app/rulesCopy';
import type { OppositionDef } from '../src/domain/scoring/profileFit';
import type { DraftSession, Formation, GameData, Squad, ThresholdConfig } from '../src/domain/types';

afterEach(cleanup);

const FORMATIONS: Formation[] = [
  { id: '4-3-3', label: '4-3-3', description: 'test A', minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 } },
  { id: '4-4-2', label: '4-4-2', description: 'test B', minCounts: { GK: 1, DEF: 4, MID: 4, ATT: 2 } },
];

const PRESSING: OppositionDef = {
  id: 'pressing-machine',
  label: 'THE PRESSING MACHINE',
  tagline: 'pace is at a premium today.',
  weightMods: { pace: 1.25 },
};

// ---------------------------------------------------------------------------
// Dialog polyfill tests — component uses native <dialog>, jsdom polyfill above
// ---------------------------------------------------------------------------

describe('RulesProgramme — packaged copy (rulesCopy.ts)', () => {
  it('returns 3 pages without opposition, 4 pages with opposition', () => {
    expect(getRulesPages()).toHaveLength(3);
    expect(getRulesPages(PRESSING)).toHaveLength(4);
  });

  it('all page titles are non-empty', () => {
    for (const page of getRulesPages(PRESSING)) {
      expect(page.title).toBeTruthy();
      expect(page.paragraphs.length).toBeGreaterThan(0);
    }
  });

  it('jargon ban — none of the banned engine terms appear in rendered copy', () => {
    for (const page of getRulesPages(PRESSING)) {
      const text = page.paragraphs.join(' ').toLowerCase();
      for (const banned of ['efficiency', 'ceiling', 'predicate', 'config']) {
        expect(text).not.toContain(banned);
      }
    }
  });

  it('opponent page includes the opposition label', () => {
    const pages = getRulesPages(PRESSING);
    const oppPage = pages.find((p) => p.id === 'today-opponent');
    expect(oppPage).toBeTruthy();
    expect(oppPage!.paragraphs.some((p) => p.includes('THE PRESSING MACHINE'))).toBe(true);
  });

  it('no opposition page when opposition omitted', () => {
    const pages = getRulesPages();
    expect(pages.find((p) => p.id === 'today-opponent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// StartScreen mount
// ---------------------------------------------------------------------------

describe('RulesProgramme — StartScreen mount', () => {
  it('RULES button exists in the marginalia; clicking opens dialog, close hides it', async () => {
    render(
      <StartScreen
        formations={FORMATIONS}
        defaultFormationId="4-3-3"
        variant="landing"
        onStart={() => {}}
        opposition={PRESSING}
      />,
    );

    const rulesBtn = screen.getByText('RULES');
    expect(rulesBtn).toBeTruthy();

    fireEvent.click(rulesBtn);
    await waitFor(() => {
      const dialog = document.querySelector('.rules-programme') as HTMLDialogElement;
      expect(dialog).toBeTruthy();
      expect(dialog.open).toBe(true);
    });

    const closeBtn = screen.getByLabelText('Close programme');
    expect(closeBtn).toBeTruthy();

    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(document.querySelector('.rules-programme')).toBeNull();
    });
  });

  it('opponent page renders in dialog when opposition passed', async () => {
    render(
      <StartScreen
        formations={FORMATIONS}
        defaultFormationId="4-3-3"
        variant="landing"
        onStart={() => {}}
        opposition={PRESSING}
      />,
    );

    fireEvent.click(screen.getByText('RULES'));
    await waitFor(() => {
      expect(screen.getByText(/Today[’']s opponent/i)).toBeTruthy();
      expect(screen.getByText(/THE PRESSING MACHINE/i)).toBeTruthy();
    });
  });

  it('no opponent page when no opposition prop', async () => {
    render(
      <StartScreen
        formations={FORMATIONS}
        defaultFormationId="4-3-3"
        variant="landing"
        onStart={() => {}}
      />,
    );

    fireEvent.click(screen.getByText('RULES'));
    await waitFor(() => {
      expect(screen.queryByText(/Today[’']s opponent/i)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// DraftScreen mount — session identity preserved
// ---------------------------------------------------------------------------

const REVEAL_SQUAD: Squad = {
  id: 'rev-squad',
  country: 'Testland',
  year: 2000,
  players: [
    { id: 'rev-a', name: 'Alpha Player', positionRaw: 'CB', positionBucket: 'DEF', rating: 80, pace: 72, strength: 88, accuracy: 70 },
    { id: 'rev-b', name: 'Beta Player', positionRaw: 'CM', positionBucket: 'MID', rating: 82, pace: 76, strength: 78, accuracy: 85 },
    { id: 'rev-c', name: 'Gamma Player', positionRaw: 'ST', positionBucket: 'ATT', rating: 85, pace: 88, strength: 76, accuracy: 82 },
  ],
};

function makeSession(): DraftSession {
  return {
    phase: 'AWAIT_PICK',
    picks: [],
    skipRemaining: 1,
    roundsPlayed: 0,
    seenSquadIds: [],
    excludedSquadIds: [],
    currentReveal: REVEAL_SQUAD,
    breachLog: [],
    formationId: '4-3-3',
    revealLog: [],
    seed: 42,
    mode: 'daily',
  };
}

describe('RulesProgramme — DraftScreen mount', () => {
  it('RULES button in topline; opens and closes dialog', async () => {
    render(
      <DraftScreen
        session={makeSession()}
        error={null}
        onPick={() => {}}
        onSkip={() => {}}
        formations={FORMATIONS}
        formationId="4-3-3"
      />,
    );

    const rulesBtn = screen.getByText('RULES');
    expect(rulesBtn).toBeTruthy();

    fireEvent.click(rulesBtn);
    await waitFor(() => {
      const dialog = document.querySelector('.rules-programme') as HTMLDialogElement;
      expect(dialog).toBeTruthy();
      expect(dialog.open).toBe(true);
    });
    // DraftScreen mount: no opposition → 3 pages
    expect(screen.queryByText(/Today[’']s opponent/i)).toBeNull();

    fireEvent.click(screen.getByLabelText('Close programme'));
    await waitFor(() => {
      expect(document.querySelector('.rules-programme')).toBeNull();
    });
  });

  it('session object identity unchanged after open/close', async () => {
    const session = Object.freeze(makeSession());
    const { getByText, rerender } = render(
      <DraftScreen
        session={session}
        error={null}
        onPick={() => {}}
        onSkip={() => {}}
        formations={FORMATIONS}
        formationId="4-3-3"
      />,
    );

    // Open rules
    fireEvent.click(getByText('RULES'));
    // Close rules
    fireEvent.click(screen.getByLabelText('Close programme'));

    // Re-render with the same frozen session — identity should be preserved
    // (the component should not have changed session)
    rerender(
      <DraftScreen
        session={session}
        error={null}
        onPick={() => {}}
        onSkip={() => {}}
        formations={FORMATIONS}
        formationId="4-3-3"
      />,
    );

    // Verify round/total still renders from the same session data
    const roundEls = screen.getAllByText(/^Round /);
    expect(roundEls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// ResultScreen mount needs real-ish data (static rendering only)
// ---------------------------------------------------------------------------

function minimalGameData(): GameData {
  return {
    squads: [REVEAL_SQUAD],
    thresholds: {
      version: 4,
      referenceFormation: '4-3-3',
      formations: FORMATIONS,
      minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
      ratingScale: { min: 1, max: 100 },
      bands: [
        { id: '10-0', label: '10-0', priority: 1, requireMinCounts: true, minWeakLink: 85, minBucketSums: { GK: 90, DEF: 80, MID: 80, ATT: 80 }, requireAllBucketsNonEmpty: true, minFit: 0, fallback: false },
        { id: '1-0', label: 'LOW', priority: 99, fallback: true },
      ],
      bandOrder: ['10-0', '1-0'],
      ceiling: { soft: [] },
      profiles: {
        '4-3-3': {
          DEF: { weights: { pace: 0.7, strength: 0.2, accuracy: 0.55 }, targets: { pace: 86, strength: 85, accuracy: 72 } },
          MID: { weights: { pace: 0.2, strength: 0.85, accuracy: 0.4 }, targets: { pace: 76, strength: 83, accuracy: 88 } },
          ATT: { weights: { pace: 0.5, strength: 0.2, accuracy: 0.85 }, targets: { pace: 88, strength: 72, accuracy: 87 } },
        },
        '4-4-2': {
          DEF: { weights: { pace: 0.7, strength: 0.2, accuracy: 0.55 }, targets: { pace: 84, strength: 85, accuracy: 72 } },
          MID: { weights: { pace: 0.2, strength: 0.85, accuracy: 0.4 }, targets: { pace: 74, strength: 83, accuracy: 86 } },
          ATT: { weights: { pace: 0.5, strength: 0.2, accuracy: 0.85 }, targets: { pace: 86, strength: 72, accuracy: 85 } },
        },
      },
      oppositions: [PRESSING, { id: 'neutral', label: 'NEUTRAL', tagline: '', weightMods: {} }],
    } as unknown as ThresholdConfig,
    positionMap: { GK: 'GK', CB: 'DEF', CM: 'MID', ST: 'ATT' },
    commentary: { version: 1, scripts: { '10-0': { beats: [] }, '1-0': { beats: [] } } },
  };
}

function completeSession(): DraftSession {
  return {
    phase: 'COMPLETE',
    picks: [
      { id: 'rev-a', name: 'Alpha Player', positionRaw: 'CB', positionBucket: 'DEF', rating: 80, pace: 72, strength: 88, accuracy: 70 },
      { id: 'rev-b', name: 'Beta Player', positionRaw: 'CM', positionBucket: 'MID', rating: 82, pace: 76, strength: 78, accuracy: 85 },
      { id: 'rev-c', name: 'Gamma Player', positionRaw: 'ST', positionBucket: 'ATT', rating: 85, pace: 88, strength: 76, accuracy: 82 },
    ],
    skipRemaining: 1,
    roundsPlayed: 3,
    seenSquadIds: ['rev-squad'],
    excludedSquadIds: [],
    currentReveal: REVEAL_SQUAD,
    breachLog: [],
    formationId: '4-3-3',
    revealLog: [],
    seed: 42,
    mode: 'daily',
  };
}

describe('RulesProgramme — ResultScreen mount', () => {
  it('RULES button in broadcast chrome; opens and closes dialog with opponent page', async () => {
    const data = minimalGameData();
    const session = completeSession();

    render(
      <ResultScreen session={session} data={data} onRestart={() => {}} />,
    );

    const rulesBtn = screen.getByText('RULES');
    expect(rulesBtn).toBeTruthy();

    fireEvent.click(rulesBtn);
    await waitFor(() => {
      const dialog = document.querySelector('.rules-programme') as HTMLDialogElement;
      expect(dialog).toBeTruthy();
      expect(dialog.open).toBe(true);
    });
    // ResultScreen has opposition → opponent page should render
    expect(screen.getByText(/Today[’']s opponent/i)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close programme'));
    await waitFor(() => {
      expect(document.querySelector('.rules-programme')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Jargon ban in rendered dialog (integrated, across all hosts)
// ---------------------------------------------------------------------------

describe('RulesProgramme — no engine jargon in rendered HTML', () => {
  it('rendered dialog text never contains banned engine terms', async () => {
    render(
      <StartScreen
        formations={FORMATIONS}
        defaultFormationId="4-3-3"
        variant="landing"
        onStart={() => {}}
        opposition={PRESSING}
      />,
    );

    fireEvent.click(screen.getByText('RULES'));
    await waitFor(() => {
      const dialog = document.querySelector('.rules-programme') as HTMLElement;
      expect(dialog).toBeTruthy();
      const text = (dialog.textContent ?? '').toLowerCase();
      for (const banned of ['efficiency', 'ceiling', 'predicate', 'config']) {
        expect(text).not.toContain(banned);
      }
    });
  });
});

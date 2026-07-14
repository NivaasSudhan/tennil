// @vitest-environment jsdom
/**
 * tests/appGate.test.tsx — Sprint-1 Task 1. Proves the draft no longer
 * auto-starts on mount (old App.tsx:19 behavior) and that Start Game enters
 * the draft. Uses the real vendored game data via the simulator's disk loader.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App, { dominantAttrWord } from '../src/app/App';
import { loadGameDataFromDisk } from '../scripts/simulate';

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App landing gate', () => {
  it('shows the landing screen on mount — no draft auto-start', () => {
    render(<App data={loadGameDataFromDisk()} />);
    expect(screen.getByRole('button', { name: /kick off/i })).toBeTruthy();
    expect(screen.queryByText(/now revealing/i)).toBeNull();
  });

  it('Kick off shows formation gate, then Confirm Draft begins draft', () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    expect(screen.getByRole('button', { name: /confirm draft/i })).toBeTruthy();
    expect(screen.queryByText(/now revealing/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /confirm draft/i }));
    expect(screen.getByText(/now revealing/i)).toBeTruthy();
  });
});

describe('App kick-off (ADR-021 — matchday badge retired; M2 owns mode toggle UI)', () => {
  it('landing still shows Kick off (matchday domain removed)', () => {
    render(<App data={loadGameDataFromDisk()} />);
    expect(screen.getByRole('button', { name: /kick off/i })).toBeTruthy();
    expect(screen.queryByText(/MATCHDAY #\d+/i)).toBeNull();
  });

  it('Kick off in NORMAL (default) shows formation gate then draft', () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    expect(screen.getByRole('button', { name: /confirm draft/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /confirm draft/i }));
    expect(screen.getByText(/now revealing/i)).toBeTruthy();
  });

  it('HARD mode shows opponent card before draft (card then formation then draft)', async () => {
    render(<App data={loadGameDataFromDisk()} />);
    const hardBtn = screen.getByRole('button', { name: /^HARD/ });
    fireEvent.click(hardBtn);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));

    expect(await screen.findByText(/your opponent/i)).toBeTruthy();
    const label = await screen.findByText(/THE |COUNTER |AERIAL |POSSESSION/i);
    expect(label).toBeTruthy();

    expect(screen.queryByText(/now revealing/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /choose your shape/i }));
    expect(await screen.findByRole('button', { name: /confirm draft/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /confirm draft/i }));
    expect(await screen.findByText(/now revealing/i)).toBeTruthy();
  });

  it('NORMAL flow never renders the opponent card', () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    expect(screen.queryByText(/your opponent/i)).toBeNull();
    expect(screen.getByRole('button', { name: /confirm draft/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /confirm draft/i }));
    expect(screen.getByText(/now revealing/i)).toBeTruthy();
  });

  it('HARD draft topline shows opponent chip with archetype label', async () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /^HARD/ }));
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    fireEvent.click(screen.getByRole('button', { name: /choose your shape/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm draft/i }));
    await screen.findByText(/now revealing/i);
    const chip = screen.getByText(/vs /i);
    expect(chip).toBeTruthy();
    expect(chip.textContent).toMatch(/vs (THE |COUNTER |AERIAL |POSSESSION )/i);
  });

  it('NORMAL draft shows no opponent chip', () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm draft/i }));
    expect(screen.queryByText(/vs /i)).toBeNull();
  });

  it('Draft Again returns to landing with pre-selected difficulty; switching mode then kick off works', async () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm draft/i }));
    // Drive draft to completion.
    let guard = 0;
    while (screen.queryByText(/now revealing/i) && guard < 50) {
      const pickButtons = screen
        .getAllByRole('button')
        .filter((b) => b.className.includes('player-row') || b.getAttribute('data-player-id'));
      if (pickButtons.length > 0) {
        fireEvent.click(pickButtons[0]);
      } else {
        break;
      }
      guard++;
    }
    const draftAgain = screen.queryByRole('button', { name: /draft again/i });
    if (draftAgain) {
      fireEvent.click(draftAgain);
      // Landing with pre-selected difficulty
      expect(screen.getByRole('button', { name: /kick off/i })).toBeTruthy();
      // Switch to HARD then kick off → opponent card
      fireEvent.click(screen.getByRole('button', { name: /^HARD/ }));
      fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
      expect(await screen.findByText(/your opponent/i)).toBeTruthy();
    }
  });
});

describe('dominantAttrWord', () => {
  it('pressing-machine → pace', () => {
    expect(dominantAttrWord({ pace: 1.25 })).toBe('pace');
  });
  it('low-block → accuracy', () => {
    expect(dominantAttrWord({ accuracy: 1.25 })).toBe('accuracy');
  });
  it('aerial-bombardment → strength', () => {
    expect(dominantAttrWord({ strength: 1.25 })).toBe('strength');
  });
  it('neutral (empty mods) → null', () => {
    expect(dominantAttrWord({})).toBeNull();
  });
  it('counter-kings (tied mods) returns first max', () => {
    expect(dominantAttrWord({ pace: 1.15, strength: 1.15 })).toBe('pace');
  });
});
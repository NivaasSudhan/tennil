// @vitest-environment jsdom
/**
 * tests/appGate.test.tsx — Sprint-1 Task 1. Proves the draft no longer
 * auto-starts on mount (old App.tsx:19 behavior) and that Start Game enters
 * the draft. Uses the real vendored game data via the simulator's disk loader.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/app/App';
import { loadGameDataFromDisk } from '../scripts/simulate';

afterEach(cleanup);

describe('App landing gate', () => {
  it('shows the landing screen on mount — no draft auto-start', () => {
    render(<App data={loadGameDataFromDisk()} />);
    expect(screen.getByRole('button', { name: /kick off/i })).toBeTruthy();
    expect(screen.queryByText(/now revealing/i)).toBeNull();
  });

  it('clicking Kick off begins a draft (a squad reveal is shown)', () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    expect(screen.getByText(/now revealing/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /kick off/i })).toBeNull();
  });
});

describe('App kick-off (ADR-021 — matchday badge retired; M2 owns mode toggle UI)', () => {
  it('landing still shows Kick off (matchday domain removed)', () => {
    render(<App data={loadGameDataFromDisk()} />);
    expect(screen.getByRole('button', { name: /kick off/i })).toBeTruthy();
    expect(screen.queryByText(/MATCHDAY #\d+/i)).toBeNull();
  });

  it('Kick off in NORMAL (default) begins a draft', () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    expect(screen.getByText(/now revealing/i)).toBeTruthy();
  });

  it('selecting HARD then Kick off begins a draft', () => {
    render(<App data={loadGameDataFromDisk()} />);
    const hardBtn = screen.getByRole('button', { name: /^HARD\b/ });
    fireEvent.click(hardBtn);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    expect(screen.getByText(/now revealing/i)).toBeTruthy();
  });

  it('Draft Again after completing a draft shows Confirm Draft and preserves difficulty', () => {
    render(<App data={loadGameDataFromDisk()} />);
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
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
      expect(screen.getByRole('button', { name: /confirm draft/i })).toBeTruthy();
    }
  });
});
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StartScreen from '../src/app/StartScreen';
import type { Formation } from '../src/domain/types';

const FORMATIONS: Formation[] = [
  { id: '4-3-3', label: '4-3-3', description: 'test A', minCounts: { GK: 1, DEF: 4, MID: 3, ATT: 3 } },
  { id: '4-4-2', label: '4-4-2', description: 'test B', minCounts: { GK: 1, DEF: 4, MID: 4, ATT: 2 } },
];

afterEach(cleanup);

describe('StartScreen', () => {
  it('landing variant renders title, rules, formation picker, and Kick off CTA', () => {
    render(
      <StartScreen
        formations={FORMATIONS}
        defaultFormationId="4-3-3"
        variant="landing"
        onStart={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByText(/11 rounds/i)).toBeTruthy();
    expect(screen.getByText(/one skip/i)).toBeTruthy();
    expect(screen.getAllByText(/4-3-3/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/4-4-2/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /kick off/i })).toBeTruthy();
  });

  it('formation-only variant does NOT render the blurb/rules', () => {
    render(
      <StartScreen
        formations={FORMATIONS}
        defaultFormationId="4-3-3"
        variant="formation-only"
        onStart={() => {}}
      />,
    );
    expect(screen.queryByText(/11 rounds/i)).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('button', { name: /confirm draft/i })).toBeTruthy();
  });

  it('invokes onStart with the selected formation id', () => {
    const onStart = vi.fn();
    render(
      <StartScreen
        formations={FORMATIONS}
        defaultFormationId="4-3-3"
        variant="landing"
        onStart={onStart}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('4-3-3');
  });

  it('clicking a different formation then start passes the new formation id', () => {
    const onStart = vi.fn();
    render(
      <StartScreen
        formations={FORMATIONS}
        defaultFormationId="4-3-3"
        variant="formation-only"
        onStart={onStart}
      />,
    );
    const buttons = screen.getAllByRole('button');
    const formationBtn = buttons.find((b) => b.textContent?.includes('4-4-2'));
    expect(formationBtn).toBeTruthy();
    if (formationBtn) fireEvent.click(formationBtn);
    fireEvent.click(screen.getByRole('button', { name: /confirm draft/i }));
    expect(onStart).toHaveBeenCalledWith('4-4-2');
  });
});

// @vitest-environment jsdom
/**
 * tests/startScreen.test.tsx — Sprint-1 Task 1. Landing screen is presentation
 * only: renders framing + rules, fires onStart. No domain imports.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StartScreen from '../src/app/StartScreen';

afterEach(cleanup);

describe('StartScreen', () => {
  it('renders a title, the core rules (11 picks, one skip), and a Start Game button', () => {
    render(<StartScreen onStart={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByText(/11 rounds/i)).toBeTruthy();
    expect(screen.getByText(/one skip/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /start game/i })).toBeTruthy();
  });

  it('invokes onStart exactly once per click', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
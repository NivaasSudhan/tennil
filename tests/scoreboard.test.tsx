// @vitest-environment jsdom
/**
 * tests/scoreboard.test.tsx — broadcast Scoreboard is dumb presentational,
 * just renders the parent-derived numbers + club labels.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Scoreboard from '../src/app/Scoreboard';

afterEach(cleanup);

describe('Scoreboard', () => {
  it('renders the supplied home/away numbers', () => {
    render(<Scoreboard home={3} away={1} />);
    expect(screen.getByLabelText('Home 3 away 1')).toBeTruthy();
  });

  it('defaults club labels to HOME / DRAFT XI', () => {
    render(<Scoreboard home={0} away={0} />);
    expect(screen.getByText('HOME')).toBeTruthy();
    expect(screen.getByText('DRAFT XI')).toBeTruthy();
  });

  it('accepts a custom split label', () => {
    render(<Scoreboard home={5} away={0} label={'BRA · YOUR XI'} />);
    expect(screen.getByText('BRA')).toBeTruthy();
    expect(screen.getByText('YOUR XI')).toBeTruthy();
  });

  it('shows at 0-0 on initial render', () => {
    render(<Scoreboard home={0} away={0} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('0');
  });
});
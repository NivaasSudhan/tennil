// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import OpponentCard from '../src/app/OpponentCard';
import { drawOpposition, startDraft } from '../src/domain/draft/session';
import { mulberry32 } from '../src/lib/rng';
import { loadGameDataFromDisk } from '../scripts/simulate';

afterEach(cleanup);

const mockOpposition = {
  id: 'pressing-machine',
  label: 'THE PRESSING MACHINE',
  tagline: 'Full-throttle press for ninety minutes — pace is at a premium today.',
  weightMods: { pace: 1.25 },
};

describe('OpponentCard', () => {
  it('renders opponent label and tagline', () => {
    render(<OpponentCard opposition={mockOpposition} onContinue={() => {}} />);
    expect(screen.getByText('THE PRESSING MACHINE')).toBeTruthy();
    expect(screen.getByText(/Full-throttle press/i)).toBeTruthy();
  });

  it('shows YOUR OPPONENT eyebrow', () => {
    render(<OpponentCard opposition={mockOpposition} onContinue={() => {}} />);
    expect(screen.getByText(/your opponent/i)).toBeTruthy();
  });

  it('has a CHOOSE YOUR SHAPE button', () => {
    render(<OpponentCard opposition={mockOpposition} onContinue={() => {}} />);
    expect(screen.getByRole('button', { name: /choose your shape/i })).toBeTruthy();
  });

  it('calls onContinue when button clicked', () => {
    let called = false;
    render(<OpponentCard opposition={mockOpposition} onContinue={() => { called = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: /choose your shape/i }));
    expect(called).toBe(true);
  });
});

describe('Seed consistency — drawOpposition matches startDraft oppositionId', () => {
  it('same seed produces same oppositionId through both paths', () => {
    const data = loadGameDataFromDisk();
    const seed = 42;
    const formationId = data.thresholds.referenceFormation;

    const rng1 = mulberry32(seed);
    const oppId = drawOpposition(data.thresholds, rng1);

    const rng2 = mulberry32(seed);
    const session = startDraft(data, rng2, formationId, { seed, difficulty: 'hard' });

    expect(oppId).toBe(session.oppositionId);
  });

  it('produces a non-neutral opposition (HARD mode)', () => {
    const data = loadGameDataFromDisk();
    const seed = 42;
    const rng = mulberry32(seed);
    const oppId = drawOpposition(data.thresholds, rng);
    expect(oppId).not.toBe('neutral');
    // Verify it maps to a real opposition
    const def = data.thresholds.oppositions.find((o) => o.id === oppId);
    expect(def).toBeDefined();
    expect(def!.label).toBeTruthy();
  });

  it('drawOpposition is deterministic — same seed, same result', () => {
    const data = loadGameDataFromDisk();
    const rng1 = mulberry32(99);
    const rng2 = mulberry32(99);
    expect(drawOpposition(data.thresholds, rng1)).toBe(drawOpposition(data.thresholds, rng2));
  });
});

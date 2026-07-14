// @vitest-environment jsdom
/**
 * tests/playerRow.test.tsx — U-fix (taken-state UI bugs).
 * (1)/(4) exercise PlayerRow directly for the mine/reveal row states.
 * (2)/(3) exercise DraftScreen's wiring of isPersonTaken/id-match into the
 * reveal sheet's `taken` flags (R-08 — rules live in the domain, DraftScreen
 * only calls the helper and forwards booleans).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PlayerRow from '../src/app/PlayerRow';
import DraftScreen from '../src/app/DraftScreen';
import type { DraftSession, Player, Squad } from '../src/domain/types';

afterEach(cleanup);

const OWNED_PLAYER: Player = {
  id: 'owned-1',
  name: 'Diego Maradona',
  positionRaw: 'CAM',
  positionBucket: 'MID',
  rating: 96,
};

const REVEAL_PLAYER: Player = {
  id: 'reveal-1',
  name: 'Zico',
  positionRaw: 'CAM',
  positionBucket: 'MID',
  rating: 88,
};

// ---------------------------------------------------------------------------
// ADR-020 Wave E — P·S·A micro-attr digits after the rating circle.
// Outfield rows show all three digits with the dominant axis at full ink
// (.row__attr--dom); GK rows (no attrs authored) render no digits at all.
// ---------------------------------------------------------------------------

const OUTFIELD_WITH_ATTRS: Player = {
  id: 'attr-1',
  name: 'Roberto Carlos',
  positionRaw: 'LB',
  positionBucket: 'DEF',
  rating: 90,
  pace: 94,
  strength: 78,
  accuracy: 82,
};

const GK_PLAYER: Player = {
  id: 'gk-1',
  name: 'Oliver Kahn',
  positionRaw: 'GK',
  positionBucket: 'GK',
  rating: 93,
};

describe('PlayerRow — attr micro-digits (ADR-020 Wave E)', () => {
  it('outfield row renders P·S·A digits with dominant attr at full ink', () => {
    const { container } = render(
      <PlayerRow player={OUTFIELD_WITH_ATTRS} state="pickable" as="button" />,
    );
    const attrs = container.querySelector('.row__attrs') as HTMLElement;
    expect(attrs).toBeTruthy();
    expect(attrs.textContent).toContain('94');
    expect(attrs.textContent).toContain('78');
    expect(attrs.textContent).toContain('82');
    const dom = attrs.querySelector('.row__attr--dom') as HTMLElement;
    expect(dom).toBeTruthy();
    expect(dom.textContent).toBe('94'); // pace is this player's dominant axis
    expect(attrs.querySelectorAll('.row__attr--dom').length).toBe(1);
  });

  it('attr digits also appear on mine-sheet (line) rows', () => {
    const { container } = render(
      <PlayerRow player={OUTFIELD_WITH_ATTRS} state="owned" as="line" />,
    );
    expect(container.querySelector('.row__attrs')).toBeTruthy();
  });

  it('GK row renders attr digits with labels (REF·HAN·DIS)', () => {
    const { container } = render(<PlayerRow player={GK_PLAYER} state="pickable" as="button" />);
    const attrs = container.querySelector('.row__attrs') as HTMLElement;
    expect(attrs).toBeTruthy();
    const tags = attrs.querySelectorAll('.row__attr-tag');
    expect(tags.length).toBe(3);
    expect(tags[0].textContent).toBe('REF');
    expect(tags[1].textContent).toBe('HAN');
    expect(tags[2].textContent).toBe('DIS');
    expect(attrs.textContent).toContain('96');
    expect(attrs.textContent).toContain('91');
    expect(attrs.textContent).toContain('92');
  });

  it('legacy fixture without authored attrs renders GK-like derived digits', () => {
    const { container } = render(<PlayerRow player={REVEAL_PLAYER} state="pickable" as="button" />);
    const attrs = container.querySelector('.row__attrs') as HTMLElement;
    expect(attrs).toBeTruthy();
    expect(attrs.querySelectorAll('.row__attr-tag').length).toBe(3);
    expect(attrs.textContent).toContain('REF');
    expect(attrs.textContent).toContain('HAN');
    expect(attrs.textContent).toContain('DIS');
  });

  it('outfield row renders PAC/STR/ACC label tags', () => {
    const { container } = render(
      <PlayerRow player={OUTFIELD_WITH_ATTRS} state="pickable" as="button" />,
    );
    const attrs = container.querySelector('.row__attrs') as HTMLElement;
    expect(attrs).toBeTruthy();
    const tags = attrs.querySelectorAll('.row__attr-tag');
    expect(tags.length).toBe(3);
    expect(tags[0].textContent).toBe('PAC');
    expect(tags[1].textContent).toBe('STR');
    expect(tags[2].textContent).toBe('ACC');
  });
});

describe('PlayerRow — mine sheet never shows taken (Bug 1)', () => {
  it('mine-variant row for a picked player never shows TAKEN text or line-through state', () => {
    render(<PlayerRow player={OWNED_PLAYER} state="owned" as="line" />);
    expect(screen.queryByText(/taken/i)).toBeNull();
    const row = screen.getByText(OWNED_PLAYER.name).closest('.player-row') as HTMLElement;
    expect(row.getAttribute('data-state')).not.toBe('taken');
  });
});

describe('PlayerRow — reveal sheet taken/enabled states', () => {
  it('reveal-variant row flagged taken renders disabled + TAKEN tag', () => {
    render(<PlayerRow player={REVEAL_PLAYER} state="taken" as="button" />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(within(btn).getByText(/taken/i)).toBeTruthy();
  });

  it('normal reveal row is enabled and fires onPick once', () => {
    const onPick = vi.fn();
    render(<PlayerRow player={REVEAL_PLAYER} state="pickable" as="button" onPick={onPick} />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(screen.queryByText(/taken/i)).toBeNull();
    fireEvent.click(btn);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(REVEAL_PLAYER.id);
  });
});

// ---------------------------------------------------------------------------
// DraftScreen wiring: id-taken AND person-taken (ADR-018) both disable the
// reveal row, computed via the real domain helper (isPersonTaken).
// ---------------------------------------------------------------------------

const REVEAL_SQUAD: Squad = {
  id: 'rev-squad',
  country: 'Testland',
  year: 2000,
  players: [
    { id: 'rev-a', name: 'Alpha Player', positionRaw: 'CB', positionBucket: 'DEF', rating: 80 },
    { id: 'rev-b', name: 'Lionel Messi', positionRaw: 'ST', positionBucket: 'ATT', rating: 93 },
    { id: 'rev-c', name: 'Beta Player', positionRaw: 'CM', positionBucket: 'MID', rating: 82 },
  ],
};

function makeSession(): DraftSession {
  return {
    phase: 'AWAIT_PICK',
    picks: [
      // Exact id already picked (id-taken path).
      { id: 'rev-a', name: 'Alpha Player', positionRaw: 'CB', positionBucket: 'DEF', rating: 80 },
      // Same person as rev-b (case/whitespace-insensitive), different id/era (person-taken path).
      { id: 'other-id-messi', name: 'lionel   MESSI', positionRaw: 'ST', positionBucket: 'ATT', rating: 90 },
    ],
    skipRemaining: 1,
    roundsPlayed: 2,
    seenSquadIds: [],
    excludedSquadIds: [],
    currentReveal: REVEAL_SQUAD,
    breachLog: [],
    formationId: 'x',
    revealLog: [],
    seed: 0,
    difficulty: 'hard',
  };
}

describe('DraftScreen — reveal row taken flags (Bug 2)', () => {
  it('disables rows for exact id-taken AND person-taken; leaves the untouched player pickable', () => {
    const onPick = vi.fn();
    const { container } = render(
      <DraftScreen
        session={makeSession()}
        error={null}
        onPick={onPick}
        onSkip={() => {}}
        formations={[]}
        formationId={null}
      />,
    );
    // Scope to the reveal sheet — "Alpha Player" also appears on the mine
    // sheet (it's an owned pick), and must NOT be confused with that row.
    const revealSheet = container.querySelector('.team-sheet--reveal') as HTMLElement;
    const reveal = within(revealSheet);

    const rowA = reveal.getByText('Alpha Player').closest('button') as HTMLButtonElement;
    expect(rowA.disabled).toBe(true);
    expect(within(rowA).getByText(/taken/i)).toBeTruthy();

    const rowB = reveal.getByText('Lionel Messi').closest('button') as HTMLButtonElement;
    expect(rowB.disabled).toBe(true);
    expect(within(rowB).getByText(/taken/i)).toBeTruthy();

    const rowC = reveal.getByText('Beta Player').closest('button') as HTMLButtonElement;
    expect(rowC.disabled).toBe(false);
    fireEvent.click(rowC);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('rev-c');
  });
});

// @vitest-environment jsdom
/**
 * tests/shareRow.test.tsx — WAVE V4b share-card + share row.
 *
 * buildCardData (matchdayCard.ts) is the pure, canvas-free payload builder;
 * share text templates + eyebrow are asserted exact here. The ShareRow
 * component is tested via @testing-library: clipboard writeText, X intent
 * href encoding, whatsapp href, native-share visibility, and the download
 * anchor filename. Canvas rendering itself is not pixel-asserted (jsdom has
 * no real 2d context); the download path is exercised with a stubbed ctx +
 * toBlob so the produced <a download> filename can be captured.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PositionBucket } from '../src/domain/types';
import { buildCardData, cardFilename } from '../src/app/matchdayCard';
import ShareRow from '../src/app/ShareRow';

const SHARE_URL = 'https://nivaassudhan.github.io/tennil/';

function groups(): Record<PositionBucket, { name: string; rating: number }[]> {
  return {
    GK: [{ name: 'Keeper', rating: 84 }],
    DEF: [
      { name: 'Moore', rating: 86 },
      { name: 'Scirea', rating: 87 },
    ],
    MID: [
      { name: 'Xavi', rating: 89 },
      { name: 'Iniesta', rating: 90 },
    ],
    ATT: [
      { name: 'Romário', rating: 92 },
      { name: 'Pelé', rating: 91 },
    ],
  };
}

afterEach(cleanup);

describe('buildCardData — share text templates (pure)', () => {
  it('daily mode: exact share text + MATCHDAY eyebrow', () => {
    const data = buildCardData({
      mode: 'daily',
      matchdayNumber: 7,
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '7-1',
      bandLabel: 'CLASSY WIN',
      nearMissText: '2 SHY OF A 9-0 SQUAD',
      groups: groups(),
    });
    expect(data.mode).toBe('daily');
    expect(data.matchdayNumber).toBe(7);
    expect(data.eyebrow).toBe('MATCHDAY #7');
    expect(data.shareUrl).toBe(SHARE_URL);
    expect(data.shareText).toBe(
      'TenNil Matchday #7: 7-1 CLASSY WIN. Draft your XI: https://nivaassudhan.github.io/tennil/',
    );
  });

  it('free mode: exact share text with top player + FREE DRAFT eyebrow', () => {
    const data = buildCardData({
      mode: 'free',
      formationId: '4-4-2',
      formationLabel: '4-4-2',
      bandId: '3-2',
      bandLabel: 'SCRAPED HOME',
      nearMissText: null,
      groups: groups(),
    });
    expect(data.mode).toBe('free');
    expect(data.matchdayNumber).toBeUndefined();
    expect(data.eyebrow).toBe('FREE DRAFT');
    expect(data.topPlayerName).toBe('Romário'); // 92 = highest in groups
    expect(data.shareText).toBe(
      'TenNil: I drafted Romário and it ended 3-2. https://nivaassudhan.github.io/tennil/',
    );
  });

  it('top player tie breaks to the first encountered (GK>DEF>MID>ATT order)', () => {
    const tied = {
      GK: [{ name: 'Aaa', rating: 90 }],
      DEF: [{ name: 'Bbb', rating: 90 }],
      MID: [],
      ATT: [],
    };
    const data = buildCardData({
      mode: 'free',
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '1-0',
      bandLabel: 'NIL-NIL HEART',
      nearMissText: null,
      groups: tied,
    });
    expect(data.topPlayerName).toBe('Aaa');
  });
});

describe('cardFilename', () => {
  it('daily → tennil-matchday-N.png', () => {
    const data = buildCardData({
      mode: 'daily',
      matchdayNumber: 14,
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '5-0',
      bandLabel: 'ROUT',
      nearMissText: null,
      groups: groups(),
    });
    expect(cardFilename(data)).toBe('tennil-matchday-14.png');
  });

  it('free → tennil-card-BANDID.png', () => {
    const data = buildCardData({
      mode: 'free',
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '3-2',
      bandLabel: 'SCRAPED HOME',
      nearMissText: null,
      groups: groups(),
    });
    expect(cardFilename(data)).toBe('tennil-card-3-2.png');
    expect(cardFilename(data)).toMatch(/\.png$/);
  });
});

describe('ShareRow', () => {
  let originalClipboard: unknown;
  let originalShare: unknown;

  beforeEach(() => {
    originalClipboard = (navigator as unknown as { clipboard?: unknown }).clipboard;
    originalShare = (navigator as unknown as { share?: unknown }).share;
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      share: undefined,
    });
  });

  afterEach(() => {
    Object.assign(navigator, {
      clipboard: originalClipboard,
      share: originalShare,
    });
  });

  it('COPY writes the share text to the clipboard', () => {
    const data = buildCardData({
      mode: 'daily',
      matchdayNumber: 7,
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '7-1',
      bandLabel: 'CLASSY WIN',
      nearMissText: null,
      groups: groups(),
    });
    render(<ShareRow cardData={data} />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(data.shareText);
  });

  it('POST TO X link href URL-encodes the share text', () => {
    const data = buildCardData({
      mode: 'daily',
      matchdayNumber: 7,
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '7-1',
      bandLabel: 'CLASSY WIN',
      nearMissText: null,
      groups: groups(),
    });
    render(<ShareRow cardData={data} />);
    const xLink = screen.getByRole('link', { name: /post to x/i });
    const href = xLink.getAttribute('href') ?? '';
    expect(href.startsWith('https://twitter.com/intent/tweet?text=')).toBe(true);
    const encoded = href.slice('https://twitter.com/intent/tweet?text='.length);
    expect(decodeURIComponent(encoded)).toBe(data.shareText);
  });

  it('WHATSAPP link href encodes the share text on wa.me', () => {
    const data = buildCardData({
      mode: 'free',
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '3-2',
      bandLabel: 'SCRAPED HOME',
      nearMissText: null,
      groups: groups(),
    });
    render(<ShareRow cardData={data} />);
    const wa = screen.getByRole('link', { name: /whatsapp/i });
    const href = wa.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.slice('https://wa.me/?text='.length))).toBe(data.shareText);
  });

  it(' SHARE button is absent when navigator.share is unavailable', () => {
    const data = buildCardData({
      mode: 'daily',
      matchdayNumber: 7,
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '7-1',
      bandLabel: 'CLASSY WIN',
      nearMissText: null,
      groups: groups(),
    });
    render(<ShareRow cardData={data} />);
    expect(screen.queryByRole('button', { name: /^share$/i })).toBeNull();
  });

  it('renders a SHARE button that invokes navigator.share when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: shareMock });
    const data = buildCardData({
      mode: 'daily',
      matchdayNumber: 7,
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '7-1',
      bandLabel: 'CLASSY WIN',
      nearMissText: null,
      groups: groups(),
    });
    render(<ShareRow cardData={data} />);
    const shareBtn = screen.getByRole('button', { name: /^share$/i });
    await fireEvent.click(shareBtn);
    expect(shareMock).toHaveBeenCalledTimes(1);
    const arg = shareMock.mock.calls[0][0];
    expect(arg.text).toBe(data.shareText);
    expect(arg.url).toBe(SHARE_URL);
  });

  it('DOWNLOAD CARD produces an <a download> with a .png filename', async () => {
    // jsdom has no real 2d context: stub getContext with a no-op proxy so
    // renderMatchdayCard does not throw, and stub toBlob to call back with a
    // Blob so the anchor is created.
    // A 2d-context stub that no-ops every call and returns sensible shapes for
    // the few accessors the painter reads (measureText().width, gradients).
    function ctxStub(): unknown {
      const target = () => {};
      return new Proxy(target, {
        get: (_t, prop) => {
          if (prop === 'measureText') return () => ({ width: 0 });
          if (prop === 'createRadialGradient' || prop === 'createLinearGradient')
            return () => ({ addColorStop: () => {} });
          if (typeof prop === 'string') return () => ctxStub();
          return undefined;
        },
      });
    }
    const ctxProxy = ctxStub();
    HTMLCanvasElement.prototype.getContext = (() => ctxProxy) as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = ((cb: BlobCallback) => {
      cb(new Blob([''], { type: 'image/png' }));
    }) as typeof HTMLCanvasElement.prototype.toBlob;
    // jsdom has no URL.createObjectURL/revokeURL.
    (globalThis.URL as unknown as { createObjectURL: unknown; revokeObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:fake');
    (globalThis.URL as unknown as { createObjectURL: unknown; revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

    const createdAnchors: HTMLAnchorElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement & { click?: () => void };
      if (tag.toLowerCase() === 'a') {
        createdAnchors.push(el as unknown as HTMLAnchorElement);
      }
      return el;
    });

    const data = buildCardData({
      mode: 'daily',
      matchdayNumber: 9,
      formationId: '4-3-3',
      formationLabel: '4-3-3',
      bandId: '6-0',
      bandLabel: 'ROUT',
      nearMissText: null,
      groups: groups(),
    });
    render(<ShareRow cardData={data} />);
    await fireEvent.click(screen.getByRole('button', { name: /download card/i }));
    // The share row also renders POST TO X & WhatsApp <a> links; only the
    // transient download anchor carries a `download` attribute.
    const dlAnchor = createdAnchors.find((a) => a.download);
    expect(dlAnchor).toBeTruthy();
    expect(dlAnchor!.download).toBe('tennil-matchday-9.png');
    expect(dlAnchor!.download).toMatch(/\.png$/);
  });
});
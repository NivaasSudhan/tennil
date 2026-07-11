/**
 * tests/audit-commentary.test.ts — edge-case audit of commentary slot resolution
 * (ADR-005; ARCHITECTURE.md §5).
 *
 * SYNTHETIC CommentaryConfig inline — never imports commentary.json. Covers:
 * slot resolution ties for every slot (ascending-id tie-break), missing / no
 * slots in beat text, fallback to captain for empty buckets, band with no
 * script throws, captain/weakest interaction, determinism, and purity.
 */

import { describe, expect, it } from 'vitest';
import { buildCommentary } from '../src/domain/commentary/build';
import type { CommentaryConfig, FinalXI, Player, PositionBucket, ScoreBand } from '../src/domain/types';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const RAW_FOR_BUCKET: Record<PositionBucket, string> = {
  GK: 'GK', DEF: 'CB', MID: 'CM', ATT: 'ST',
};

let idc = 0;
function mk(
  bucket: PositionBucket,
  rating: number,
  id: string,
  name?: string,
): Player {
  return {
    id,
    name: name ?? id,
    positionRaw: RAW_FOR_BUCKET[bucket],
    positionBucket: bucket,
    rating,
  };
}

function buildXI(spec: Partial<Record<PositionBucket, number[]>>, suffix = 'x'): FinalXI {
  const xi: Player[] = [];
  for (const bucket of Object.keys(spec) as PositionBucket[]) {
    spec[bucket]!.forEach((rating, i) => {
      idc += 1;
      xi.push({
        id: `a${idc}-${bucket}-${suffix}-${i}`,
        name: `Player ${idc}`,
        positionRaw: RAW_FOR_BUCKET[bucket],
        positionBucket: bucket,
        rating,
      });
    });
  }
  return xi;
}

function cfg(beats: { minute?: number; type?: string; text: string }[], bandId = 'B'): CommentaryConfig {
  return {
    version: 1,
    scripts: { [bandId]: { beats: beats.map((b) => ({
      minute: b.minute ?? 1,
      type: (b.type ?? 'kickoff') as CommentaryConfig['scripts'][string]['beats'][number]['type'],
      text: b.text,
    })) } },
  };
}

const BAND: ScoreBand = { bandId: 'B', label: 'Test Band' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('audit: slot resolution ties — ascending player id wins', () => {
  it('captain tie broken by ascending id', () => {
    const xi = [
      mk('ATT', 95, 'z-att', 'Zatt'),
      mk('MID', 95, 'a-mid', 'Amid'),
      mk('DEF', 50, 'd-low'),
    ];
    const s = buildCommentary(BAND, xi, cfg([{ text: 'captain={captain}' }]));
    // Both 95; 'a-mid' < 'z-att' → a-mid is captain.
    expect(s.beats[0].text).toBe('captain=Amid');
  });

  it('topAtt tie broken by ascending id (isolated)', () => {
    const xi = [
      mk('ATT', 90, 'b-att', 'Batt'),
      mk('ATT', 90, 'a-att', 'Aatt'),
      mk('GK', 70, 'g1'),
    ];
    const s = buildCommentary(BAND, xi, cfg([{ text: 'topAtt={topAtt}' }]));
    expect(s.beats[0].text).toBe('topAtt=Aatt');
  });

  it('topDef tie broken by ascending id (isolated)', () => {
    const xi = [
      mk('DEF', 80, 'm-def', 'Mdef'),
      mk('DEF', 80, 'n-def', 'Ndef'),
      mk('GK', 60, 'g'),
    ];
    const s = buildCommentary(BAND, xi, cfg([{ text: 'topDef={topDef}' }]));
    expect(s.beats[0].text).toBe('topDef=Mdef');
  });

  it('topMid tie broken by ascending id (isolated)', () => {
    const xi = [
      mk('GK', 60, 'g'),
      mk('MID', 80, 'z-mid', 'Zmid'),
      mk('MID', 80, 'a-mid', 'Amid'),
    ];
    const s = buildCommentary(BAND, xi, cfg([{ text: 'topMid={topMid}' }]));
    expect(s.beats[0].text).toBe('topMid=Amid');
  });

  it('gk tie broken by ascending id (isolated)', () => {
    const xi = [
      mk('GK', 85, 'k2'),
      mk('GK', 85, 'k1'),
      mk('DEF', 50, 'd'),
    ];
    const s = buildCommentary(BAND, xi, cfg([{ text: 'gk={gk}' }]));
    expect(s.beats[0].text).toBe('gk=k1');
  });

  it('weakest tie broken by ascending id (min mode)', () => {
    // Two players tied for the lowest rating 40; ascending id wins.
    const xi = [
      mk('GK', 90, 'g'),
      mk('DEF', 40, 'y-weak', 'Yweak'),
      mk('MID', 40, 'x-weak', 'Xweak'),
    ];
    const s = buildCommentary(BAND, xi, cfg([{ text: 'weakest={weakest}' }]));
    expect(s.beats[0].text).toBe('weakest=Xweak');
  });

  it('captain and weakest can be the same player (XI of one)', () => {
    const xi = [mk('GK', 75, 'solo')];
    const s = buildCommentary(BAND, xi, cfg([
      { text: 'captain={captain}; weakest={weakest}' },
    ]));
    expect(s.beats[0].text).toBe('captain=solo; weakest=solo');
  });
});

describe('audit: empty bucket fallback to captain', () => {
  it('no ATT players → topAtt falls back to captain', () => {
    const xi = buildXI({ GK: [80], DEF: [85, 84], MID: [90, 88] }, 'noatt');
    const captain = xi.find((p) => p.rating === 90)!;
    const s = buildCommentary(BAND, xi, cfg([{ text: 'topAtt={topAtt}; captain={captain}' }]));
    expect(s.beats[0].text).toBe(`topAtt=${captain.name}; captain=${captain.name}`);
  });

  it('no DEF/MID/GK → every missing slot falls back to captain (separately)', () => {
    const xi = [mk('ATT', 95, 'cap', 'Cap')]; // captain, others empty
    const s = buildCommentary(BAND, xi, cfg([
      { text: '{topDef}/{topMid}/{gk}/{weakest}/{captain}' },
    ]));
    expect(s.beats[0].text).toBe('Cap/Cap/Cap/Cap/Cap');
  });

  it('a bucket with players all LOWER than captain still uses its own max, not captain', () => {
    // MID present (max 70) but captain is ATT 95 → topMid must be the 70 MID, not 95.
    const xi = [mk('ATT', 95, 'a'), mk('MID', 70, 'm')];
    const s = buildCommentary(BAND, xi, cfg([{ text: 'topMid={topMid}; captain={captain}' }]));
    expect(s.beats[0].text).toBe('topMid=m; captain=a');
  });
});

describe('audit: missing / no slots in beat text', () => {
  it('beat text with no slots is returned verbatim', () => {
    const xi = buildXI({ GK: [80], DEF: [80], MID: [80], ATT: [80] }, 'plain');
    const s = buildCommentary(BAND, xi, cfg([{ text: 'A perfectly ordinary match begins.' }]));
    expect(s.beats[0].text).toBe('A perfectly ordinary match begins.');
    expect(s.beats[0].minute).toBe(1);
  });

  it('multiple slots across multiple beats all resolve', () => {
    const xi = [
      mk('GK', 88, 'gk'),
      mk('DEF', 82, 'def'),
      mk('MID', 90, 'mid'),
      mk('ATT', 92, 'att'),
    ];
    const c = cfg([
      { minute: 1, type: 'kickoff', text: '{captain} leads out.' },
      { minute: 30, type: 'goal', text: '{topAtt} scores! {gk} beaten.' },
      { minute: 90, type: 'fulltime', text: 'Whistle. {weakest} exhausted.' },
    ]);
    const s = buildCommentary(BAND, xi, c);
    expect(s.beats).toHaveLength(3);
    expect(s.beats[0].text).toBe('att leads out.');
    expect(s.beats[1].text).toBe('att scores! gk beaten.');
    expect(s.beats[2].text).toBe('Whistle. def exhausted.'); // weakest = def 82
  });

  it('no lingering braces remain after resolution', () => {
    const xi = buildXI({ GK: [80], DEF: [82], MID: [88], ATT: [90] }, 'braces');
    const s = buildCommentary(BAND, xi, cfg([
      { text: '{captain}|{topAtt}|{topMid}|{topDef}|{gk}|{weakest}' },
    ]));
    expect(s.beats[0].text).not.toContain('{');
    expect(s.beats[0].text).not.toContain('}');
  });
});

describe('audit: band with no script throws', () => {
  it('buildCommentary throws when the band id has no entry in config.scripts', () => {
    const xi = buildXI({ GK: [80], DEF: [80], MID: [80], ATT: [80] }, 'noscript');
    const badBand: ScoreBand = { bandId: 'NO-SUCH-BAND', label: 'x' };
    expect(() => buildCommentary(badBand, xi, cfg([{ text: '{captain}' }]))).toThrow(
      /No commentary script defined for band "NO-SUCH-BAND"/,
    );
  });

  it('an empty beats array yields an empty script (no throw), bandId/label preserved', () => {
    const xi = buildXI({ GK: [80] }, 'empty');
    const c: CommentaryConfig = { version: 1, scripts: { B: { beats: [] } } };
    const s = buildCommentary(BAND, xi, c);
    expect(s).toEqual({ bandId: 'B', label: 'Test Band', beats: [] });
  });
});

describe('audit: determinism + purity', () => {
  it('two calls with identical inputs produce deep-equal output', () => {
    const xi = buildXI({ GK: [80], DEF: [85], MID: [90], ATT: [88] }, 'det');
    const c = cfg([{ text: '{captain} and {weakest} walk out together.' }]);
    expect(buildCommentary(BAND, xi, c)).toEqual(buildCommentary(BAND, xi, c));
  });

  it('does not mutate the input xi, band, or config', () => {
    const xi = buildXI({ GK: [80], DEF: [85], MID: [90], ATT: [88] }, 'mut');
    const c = cfg([{ text: '{captain} is the captain.' }]);
    const xiJson = JSON.stringify(xi);
    const bandJson = JSON.stringify(BAND);
    const cJson = JSON.stringify(c);
    buildCommentary(BAND, xi, c);
    expect(JSON.stringify(xi)).toBe(xiJson);
    expect(JSON.stringify(BAND)).toBe(bandJson);
    expect(JSON.stringify(c)).toBe(cJson);
  });

  it('bandId and label pass through unchanged', () => {
    const xi = buildXI({ GK: [80] }, 'passthrough');
    const band: ScoreBand = { bandId: 'XYZ', label: 'Lab' };
    const s = buildCommentary(band, xi, cfg([{ text: 'go' }], 'XYZ'));
    expect(s.bandId).toBe('XYZ');
    expect(s.label).toBe('Lab');
  });
});
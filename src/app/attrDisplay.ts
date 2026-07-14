import type { Player } from '../domain/types';

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export interface DisplayAttr {
  key: string;
  label: string;
  value: number;
}

const clamp = (min: number, max: number, n: number): number =>
  Math.max(min, Math.min(max, n));

function gkDisplayAttrs(player: Player): DisplayAttr[] {
  const r = player.rating;
  const id = player.id;
  const tilt = (axis: string): number => (fnv1a(id + axis) % 5) - 2;
  return [
    { key: 'ref', label: 'REF', value: clamp(1, 99, r + 1 + tilt('ref')) },
    { key: 'han', label: 'HAN', value: clamp(1, 99, r - 1 + tilt('han')) },
    { key: 'dis', label: 'DIS', value: clamp(1, 99, r - 3 + tilt('dis')) },
  ];
}

export function displayAttrs(player: Player): DisplayAttr[] {
  const { pace, strength, accuracy } = player;
  if (pace !== undefined && strength !== undefined && accuracy !== undefined) {
    return [
      { key: 'pace', label: 'PAC', value: pace },
      { key: 'strength', label: 'STR', value: strength },
      { key: 'accuracy', label: 'ACC', value: accuracy },
    ];
  }
  return gkDisplayAttrs(player);
}

export function dominantDisplayAttr(player: Player): string {
  const attrs = displayAttrs(player);
  let best = attrs[0].key;
  for (const a of attrs) {
    if (a.value > attrs.find((x) => x.key === best)!.value) {
      best = a.key;
    }
  }
  return best;
}

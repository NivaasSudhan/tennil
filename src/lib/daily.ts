/**
 * Daily matchday numbering (ADR-014-lite). Matchday #1 is World Cup 2026's
 * opening day (2026-06-11, UTC); every subsequent UTC calendar date adds one.
 * Pure function of the date — no persistence, no clock reads here.
 */

const WC2026_OPENING_UTC = Date.UTC(2026, 5, 11); // month is 0-indexed: June === 5
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function matchdayNumber(date: Date): number {
  const dayUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diffDays = Math.floor((dayUTC - WC2026_OPENING_UTC) / MS_PER_DAY);
  return diffDays + 1;
}

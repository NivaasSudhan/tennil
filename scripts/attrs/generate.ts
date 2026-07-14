/**
 * scripts/attrs/generate.ts — ADR-020 Wave B: authoring-time attr generator.
 *
 * Reads squads.json, for every OUTFIELD player computes pace/strength/accuracy =
 * clamp(1..99, round(OVR * archetype.mult + fnv1a jitter)). GK unchanged.
 * Applies attrs-overrides.json on top. Writes squads.json as version 2.
 *
 * Deterministic (fnv1a, no Math.random). Re-running is byte-identical.
 * Usage: npx tsx scripts/attrs/generate.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

// ---- fnv1a 32-bit (inline, deterministic) ----
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function clamp(lo: number, hi: number, v: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- specialization table (Wave B-PRIME: ADR-020 R-13 fix) ----
interface Archetype {
  pace: number;
  strength: number;
  accuracy: number;
}

const SPLIT_POSITIONS = new Set(['ST', 'CF', 'FW']);

function splitArchetype(playerId: string): Archetype {
  return (fnv1a(playerId) % 2 === 0)
    ? { pace: 0.85, strength: 1.08, accuracy: 0.80 }  // TARGET MAN
    : { pace: 1.08, strength: 0.85, accuracy: 0.80 };  // RUNNER
}

const ARCHETYPE_TABLE: Record<string, Archetype> = {
  // CB / sweeper — slow & steel
  CB:  { pace: 0.72, strength: 1.08, accuracy: 0.85 },
  SW:  { pace: 0.72, strength: 1.08, accuracy: 0.85 },
  DF:  { pace: 0.72, strength: 1.08, accuracy: 0.85 },
  // Full-backs / wing-backs — pacey, soft
  RB:  { pace: 1.05, strength: 0.80, accuracy: 0.88 },
  LB:  { pace: 1.05, strength: 0.80, accuracy: 0.88 },
  RWB: { pace: 1.05, strength: 0.80, accuracy: 0.88 },
  LWB: { pace: 1.05, strength: 0.80, accuracy: 0.88 },
  WB:  { pace: 1.05, strength: 0.80, accuracy: 0.88 },
  // Defensive midfield — slowish, steel, moderate accuracy
  DM:  { pace: 0.75, strength: 1.02, accuracy: 0.95 },
  // Central midfield — balanced, slight accuracy lean
  CM:  { pace: 0.85, strength: 0.85, accuracy: 1.05 },
  MF:  { pace: 0.85, strength: 0.85, accuracy: 1.05 },
  // Attacking midfield / second striker — craft, no steel
  AM:  { pace: 0.90, strength: 0.70, accuracy: 1.08 },
  SS:  { pace: 0.90, strength: 0.70, accuracy: 1.08 },
  // Wide midfield / wingers — pure pace, frail, decent accuracy
  RM:  { pace: 1.10, strength: 0.68, accuracy: 0.90 },
  LM:  { pace: 1.10, strength: 0.68, accuracy: 0.90 },
  RW:  { pace: 1.10, strength: 0.68, accuracy: 0.90 },
  LW:  { pace: 1.10, strength: 0.68, accuracy: 0.90 },
  // Strikers / centre-forwards — SPLIT at runtime
};

/** Resolve archetype for a player, handling split positions (ST/CF/FW). */
function getArchetype(positionRaw: string, playerId: string): Archetype {
  if (SPLIT_POSITIONS.has(positionRaw)) return splitArchetype(playerId);
  const a = ARCHETYPE_TABLE[positionRaw];
  if (!a) throw new Error(`Unknown positionRaw '${positionRaw}' for player ${playerId}`);
  return a;
}

function generateOne(ovr: number, mult: number, playerId: string, attrName: string): number {
  const jitter = (fnv1a(playerId + attrName) % 11) - 5;
  return clamp(1, 99, Math.round(ovr * mult + jitter));
}

/** Core generation logic — exported for test import (idempotence verification). */
export function generateAttrs(
  squads: { version: number; squads: { id: string; players: { id: string; rating: number; positionBucket: string; positionRaw: string }[] }[] },
  overrides: Record<string, Partial<{ pace: number; strength: number; accuracy: number }>>,
): void {
  for (const squad of squads.squads) {
    for (const player of squad.players) {
      if (player.positionBucket === 'GK') {
        delete (player as Record<string, unknown>).pace;
        delete (player as Record<string, unknown>).strength;
        delete (player as Record<string, unknown>).accuracy;
        continue;
      }

      const arch = getArchetype(player.positionRaw, player.id);
      const ovr = player.rating;
      const p = player as Record<string, unknown>;
      p.pace = generateOne(ovr, arch.pace, player.id, 'pace');
      p.strength = generateOne(ovr, arch.strength, player.id, 'strength');
      p.accuracy = generateOne(ovr, arch.accuracy, player.id, 'accuracy');

      const override = overrides[player.id];
      if (override) {
        if (typeof override.pace === 'number') p.pace = override.pace;
        if (typeof override.strength === 'number') p.strength = override.strength;
        if (typeof override.accuracy === 'number') p.accuracy = override.accuracy;
      }
    }
  }
  squads.version = 2;
}

// ---- CLI entry ----
function main(): void {
  const squadsPath = path.join(ROOT, 'src', 'data', 'squads', 'squads.json');
  const overridesPath = path.join(ROOT, 'src', 'data', 'attrs-overrides.json');

  const squads = JSON.parse(fs.readFileSync(squadsPath, 'utf-8'));
  const overrides: Record<string, unknown> = {};
  if (fs.existsSync(overridesPath)) {
    Object.assign(overrides, JSON.parse(fs.readFileSync(overridesPath, 'utf-8')));
  }

  generateAttrs(squads, overrides as Record<string, Partial<{ pace: number; strength: number; accuracy: number }>>);

  fs.writeFileSync(squadsPath, JSON.stringify(squads, null, 2) + '\n', 'utf-8');
  console.log(`squads.json written as version 2 (${squads.squads.reduce((n: number, s: { players: unknown[] }) => n + s.players.length, 0)} players)`);
}

main();

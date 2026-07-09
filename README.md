# fifaTenZero — World Cup Draft-XI Game

Build a Dream XI from iconic World Cup squads. Your final XI maps to a deterministic score band (e.g. `10-0`, `5-0`, `2-2`) with scripted commentary. Sessions are <5 min, no account or backend.

[![Tech Stack](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)]()
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)]()

## Quick start

```bash
npm install
npm run dev       # dev server (Vite)
npm test          # 54 unit tests (Vitest)
npm run build     # tsc + production build → dist/
```

## How it plays

1. **Reveal** — a full starting XI (11 players) from a random World Cup champion squad is shown
2. **Pick** — choose exactly one player per reveal to add to your squad
3. **Skip** — one skip token per draft (discard current reveal, draw a replacement)
4. **Score** — after 11 picks, your XI is evaluated against configurable thresholds
5. **Result** — a score band drives dramatized commentary with sequential timed reveal

**Goal**: assemble a squad good enough to unlock `10-0` (≈5% of skilled drafts — rare by design).

## Scoring

Outcomes are deterministic from your XI composition. Seven squads × configurable band thresholds produce six bands:

| Band | Frequency (skilled) | Frequency (random) |
|------|--------------------:|-------------------:|
| 10-0 | 5.0%                | 0.0%               |
| 5-0  | 43.8%               | 0.0%               |
| 3-1  | 36.4%               | 0.0%               |
| 2-2  | 14.8%               | 1.8%               |
| 1-2  | 0.0%                | 55.0%              |
| 0-4  | 0.0%                | 43.2%              |

No RNG on the outcome path — same XI + same config = same band, forever.

## Squad corpus (7 champion squads)

| Squad | Year | Era |
|-------|------|-----|
| Brazil | 1970 | Pelé, Jairzinho, Rivelino |
| Italy | 1982 | Zoff, Rossi, Tardelli |
| Argentina | 1986 | Maradona, Batista, Valdano |
| France | 1998 | Zidane, Thuram, Blanc |
| Brazil | 2002 | Ronaldo, Rivaldo, Ronaldinho |
| Spain | 2010 | Iniesta, Xavi, Villa |
| Germany | 2014 | Neuer, Müller, Klose |

## Tech stack

- **Framework**: React 18 + TypeScript (strict)
- **Build**: Vite 5 (static SPA, no SSR)
- **Testing**: Vitest (54 tests, domain-first)
- **Runtime**: zero external deps (no router, state lib, CSS framework)
- **Data**: vendored JSON (loaded at build time, playable offline)
- **Deploy**: GitHub Pages via Actions (`vite build` → `dist/`)

## Project structure

```
src/
  app/          React components (DraftScreen, ResultScreen)
  domain/       Pure game logic (draft state machine, scoring, commentary)
  data/         Vendored JSON (squads, thresholds, commentary, position map)
  lib/          Utilities (RNG, assertions)
scripts/        Simulation harness (rarity tuning)
tests/          Vitest suite + fixtures
```

Domain modules (`src/domain/`) never import React or RNG — all game rules are pure functions with explicit dependencies.

## Key docs (for contributors)

| Doc | Content |
|-----|---------|
| [PROJECT.md](PROJECT.md) | Goals, invariants, core loop |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data flow, interfaces, state machine, schemas |
| [DECISIONS.md](DECISIONS.md) | Architecture Decision Records (ADR-001–010) |
| [TASKS.md](TASKS.md) | All 16 implementation tasks, completed |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Day-by-day build order with gates |
| [RISKS_AND_UNKNOWNS.md](RISKS_AND_UNKNOWNS.md) | Open items, experiment log, rarity tuning |

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with HMR |
| `npm test` | Run all 54 unit tests |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build locally |
| `npx tsx scripts/simulate.ts` | Rarity histogram (500 seeded drafts) |

## Deploy

Pushed to `main` → GitHub Actions builds and deploys to GitHub Pages. Live URL: _TBD (enable Pages → GitHub Actions in repo settings after first push)._

## License

MIT — see [LICENSE](LICENSE) (if present).

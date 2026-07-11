# Product

## Register

brand

## Users

Football fans who remember (or romanticize) World Cups 1986-2026. Solo players in a 3-minute session — a lunch break, a commute. They know who Baggio is; they will argue about whether Romário deserves a 94. Their context: quick dopamine loop, replay driven by "one more draft to fix the weak link."

## Product Purpose

A single-player World Cup Draft-XI game: draft one player per revealed historical squad, lock an XI, and receive a deterministic scoreline verdict (10-0 … 0-4) delivered as a simulated final with commentary. Success = the result feels *earned and legible* (margins shown, no RNG in the verdict) and the player immediately starts another draft.

## Brand Personality

**Inked, floodlit, ceremonial.** The physical ritual of football management: a paper team sheet authored under quiet pressure, then judged by a roaring stadium. Voice = matchday programme meets broadcast gantry. Reverent about the players (they are icons), playful about the player's own hubris.

## Anti-references

- Generic SaaS-clean UI (the current shipped state — explicitly what we're leaving).
- FIFA/EA Ultimate Team glossy card-pack chrome — no foil cards, no pack-opening slot-machine energy, no currencies.
- Flat "quiz app" minimalism — this is a place (a pitch at night), not a form.
- Editorial-magazine typographic affectation (display italic serifs, drop caps) — this is a team sheet, not a broadsheet.

## Design Principles

1. **Two material worlds, one arc.** Paper (draft: tactile, printed, quiet tension) → Broadcast (finals: floodlights, scoreboard, release). The register shift IS the dopamine design. Art direction differs per world; voice stays constant.
2. **The pitch is the ground truth.** The grass field is the body surface of the entire app (drenched green), never a decoration behind a white card.
3. **Physical verbs.** Picks stamp, sheets clip and whip away, scoreboards flip, floodlights flare. No abstract fades where a physical action reads better.
4. **Margins over mystery.** The result screen leads with how close you were ("2 points from a 5-0"), never a bare verdict. Deterministic and proud of it.
5. **Dopamine peaks are earned and never block input.** Full-screen goal moments and full-time slams — but skip/speed controls stay live through all of it.

## Accessibility & Inclusion

- `prefers-reduced-motion: reduce` honored on every animation: crossfade or instant swap alternatives, no shake/flash.
- Body/roster text ≥4.5:1 against paper; scoreboard/overlay text ≥4.5:1 against pitch/broadcast surfaces.
- Audio stings muted by default with a visible toggle; nothing gameplay-relevant is audio-only.
- All interactive elements keyboard-reachable; goal-moment overlays are aria-live polite, not focus traps.

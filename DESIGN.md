# Design

Matchday design system — two material worlds (Paper / Broadcast) over one drenched pitch. Register: brand. See PRODUCT.md for principles.

## Theme

Night match. The entire app body is the pitch under floodlights — saturated green, never neutral. Paper artifacts float above it; the finals sim trades paper for broadcast overlay chrome. Single theme (no light/dark toggle): the stadium at night IS the theme.

## Color

Strategy: **drenched** — the surface is the pitch. All values OKLCH.

```css
:root {
  /* Pitch (body surface) */
  --pitch:            oklch(0.52 0.11 145);   /* floodlit turf */
  --pitch-stripe:     oklch(0.55 0.11 145);   /* mowing band alternate */
  --pitch-shadow:     oklch(0.38 0.09 148);   /* vignette edge / stand shadow */
  --pitch-line:       oklch(0.92 0.02 140 / 0.55); /* chalk markings */

  /* Paper world */
  --paper:            oklch(0.955 0.01 95);   /* team-sheet stock (literal paper object, not body bg) */
  --paper-shade:      oklch(0.90 0.015 95);   /* fold/edge shading */
  --ink:              oklch(0.27 0.02 260);   /* typewriter ink */
  --ink-faded:        oklch(0.42 0.02 260);   /* carbon-copy secondary text */
  --stamp:            oklch(0.52 0.19 27);    /* SELECTED stamp red */

  /* Broadcast world */
  --broadcast-bg:     oklch(0.22 0.03 260 / 0.92); /* scoreboard/ticker chrome */
  --broadcast-text:   oklch(0.97 0.005 260);
  --gold:             oklch(0.82 0.14 88);    /* score digits, band slam, 10-0 confetti */
  --flash:            oklch(0.99 0.01 100);   /* goal flash overlay */

  /* Ratings (on paper) */
  --rating-icon:      oklch(0.52 0.19 27);    /* 93+ : red ink circle */
  --rating-strong:    oklch(0.40 0.10 260);   /* 86-92: blue ink */
  --rating-solid:     var(--ink);             /* <=85 : plain ink */
}
```

Contrast gates: `--ink` on `--paper` ≈ 12:1; `--broadcast-text` on `--broadcast-bg` ≈ 13:1; `--pitch-line` labels never carry reading text.

## Typography

Voice words: inked, floodlit, ceremonial. All fonts vendored as woff2 in `src/assets/fonts/` (`@font-face`, `font-display: swap`) — no runtime fetch from font CDNs.

| Role | Family | Use |
|---|---|---|
| Paper body / roster | **Courier Prime** | Team-sheet rows, typed annotations. The club-office typewriter. Tabular by nature. |
| Paper masthead | **Anton** | Programme headline ("TEAM SHEET", squad name/year), uppercase, wood-type poster condensed. |
| Broadcast UI | **Archivo** (incl. tabular numerals) | Scoreboard digits, ticker, band slam, buttons in the broadcast world. |

Scale: modular 1.333 from 1rem body; masthead `clamp(2rem, 6vw, 4.5rem)`; scoreboard digits `clamp(2.5rem, 8vw, 5rem)` with `font-variant-numeric: tabular-nums`. `text-wrap: balance` on headings.

## Texture & Materials

- **Grass**: procedural only. Layered: (1) vertical mowing stripes via `repeating-linear-gradient` (`--pitch`/`--pitch-stripe`, band ≈ 7vw); (2) grain via inline SVG `<feTurbulence baseFrequency≈0.8 numOctaves=2>` as a low-opacity overlay; (3) chalk pitch markings as one SVG (center circle, halfway line, penalty boxes) at `--pitch-line`, subtly off-center/cropped like a broadcast camera frame; (4) radial vignette to `--pitch-shadow`.
- **Paper**: `--paper` base + SVG turbulence grain (baseFrequency≈0.15, opacity≈0.05) + 1px deckled edge treatment + slight rotation (−0.7° to 1° via `--sheet-tilt`) + layered box-shadow (contact + ambient). Perforation dots on the clipboard edge.
- **Stamp**: red ink, slight overprint texture (mask with turbulence), rotated ≈ −8°, applied with a 120ms scale-punch.

## Components

- **TeamSheet** — the paper artifact. Masthead (country + year in Anton), typed player rows (Courier Prime): `NAME ……… POS · RATING`, rating as inked circle badge colored by tier. Variants: `reveal` (opponent squad, pickable rows) and `mine` (your XI building up, grouped GK/DEF/MID/ATT).
- **PlayerRow** — one typed line; hover = ballpoint underline; picked = stamped + carbon-copied to `mine` sheet; disabled = struck through with a typed `— TAKEN —`.
- **Scoreboard** — broadcast chrome, top center: `HOME 0-0 DRAFT XI`, Archivo tabular digits, flip-tick animation per goal (progressive-live-score feature feeds it).
- **Ticker** — commentary beats as broadcast lower-third lines sliding in; minute stamp in gold.
- **BandSlam** — full-time verdict: band label slams (scale 1.15→1, 250ms ease-out-quint) with gold underline; near-miss margin line beneath in Courier ("2 POINTS FROM A 5-0").
- **StadiumButton** — primary CTA as floodlit signage; paper-world buttons are typed-and-circled instead.

## Motion

Grammar: physical verbs, ease-out-quart/quint everywhere, no bounce. All effects have `prefers-reduced-motion` crossfade fallbacks.

| Moment | Animation |
|---|---|
| App start → draft | Floodlights flare (vignette brightens), pitch pans subtly, first team sheet clips onto screen from top (translateY + slight rotation settle, 450ms). |
| Each pick | Stamp punch on row (120ms) → row carbon-copies to your sheet → old sheet whips off (rotate + translateX, 300ms) → next sheet clips on (staggered 80ms). |
| Draft complete → finals | Your finished sheet folds down and slides to bottom-left corner (kept visible, miniature); floodlight sweep crosses the pitch; scoreboard drops in from top; whistle sting. |
| Goal beat | Screen-edge flash (`--flash` overlay, 90ms), scoreboard digit flip, 1.5° camera shake (240ms), crowd-roar swell. Never blocks skip/speed controls. |
| Full time | BandSlam + (10-0 only) gold confetti burst; near-miss line types itself in (per-character, 20ms/char). |

## Audio

WebAudio-synthesized only (zero binary assets, zero licensing): kickoff/full-time whistle (two square-wave chirps), stamp thunk (filtered noise burst), goal roar (shaped pink-noise swell, 600ms). Muted by default; visible toggle in broadcast chrome; state in `localStorage` is NOT used (no persistence per ADR-010) — toggle is per-session React state.

## Layout

- Body = pitch, full viewport, no scroll during draft (sheet scrolls internally if needed).
- Draft: reveal sheet left-of-center (~min(46rem, 92vw)), your sheet docked right/below on mobile; single column stack < 720px.
- Finals: scoreboard top center, ticker lower third, mini team sheet bottom-left, controls bottom-right.
- z-scale: `--z-sheet:10; --z-overlay:20; --z-scoreboard:30; --z-flash:40; --z-slam:50`.

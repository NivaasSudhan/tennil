# TenNil v2 — Attributes, Profile Fit & Daily Opposition (design spec, ADR-020)

**Status:** user-approved design, 2026-07-12. Implementation plan follows this spec.
**Branch discipline:** ALL v2 work on branch `v2/attrs`. Main stays marketing-live. Canary via separate beta Pages deployment before merge (§8).
**Governing law:** Reveal-Luck Law (ROADMAP §3.8 / PRODUCT p6 / ADR-019 amendment) — fit gates are small (~one rung), never match-deciding. Players always win the session they were dealt.

## 1. Goal

Make 10-0 harder and more rewarding by adding a second skill axis — reading attributes against a formation profile and a rotating daily opponent — without touching the OVR/efficiency core that works. Target difficulty: attr-blind skilled play ~3-4% 10-0; fit-aware skilled play ~6-7%. The gap is the new skill expression.

## 2. Data — squads schema v2

- Outfield `Player` gains `pace`, `strength`, `accuracy` (integers 1-99). GK keeps single `rating` ONLY — loadData validation: GK with any attr field, or outfield missing any, is a boot error. `rating` (OVR) remains authored canon for every player.
- `squads.json` version 1 → 2.
- Generation (authoring-time only): `scripts/attrs/generate.ts` derives initial attrs = archetype base table (per positionRaw: e.g. ST str-high/pace-mid, CB str-high/pace-low, RW/LW pace-high/acc-mid, CM acc-high…) scaled by OVR, plus deterministic hash-jitter (±3, seeded by player id — reproducible, no runtime RNG). Output diffable.
- `src/data/attrs-overrides.json`: editorial canon per ADR-012 — regeneration never overwrites an override. Icon pass (Haaland-strength cases) is human-reviewed content.

## 3. Scoring — ADR-020 (pure, config-driven, evaluator-extended)

- **ProfileFit (0-100, pure fn `computeProfileFit`)**: thresholds v4 gains `profiles`: per formation, per bucket, attr weights + target values. Fit = 100 − weighted normalized shortfall of the XI's per-bucket attr means vs targets (overshoot never penalized). GK excluded (no attrs).
- **DailyOpposition**: thresholds v4 gains `oppositions` catalog: `{ id, label, tagline, weightMods }` (≈6 at launch: PRESSING MACHINE/pace↑, LOW BLOCK/accuracy↑, AERIAL BOMBARDMENT/strength↑, COUNTER KINGS/pace+strength↑, POSSESSION CULT/accuracy↑↑, NEUTRAL). Selection: `dailySeed % catalog` for daily mode; NEUTRAL in free play. Same opponent for everyone on a Matchday. `weightMods` multiply profile weights before fit is computed → `effectiveFit`.
- **Band integration:** `BandDef.minFit` (integer 0-100) on the top three bands only. Evaluator (`evaluateBandPredicates`) gains predicate `minFit` (required/actual integers — margins free). Efficiency remains the primary axis; ceiling stays OVR-only (documented: fit gates are Law-bounded small, so no relative-fit ceiling).
- ScoreInput v3 carries `fit` + the opposition id (computed once at the call sites; sim + ResultScreen).
- New near-miss/mock lines (dictated at plan time): e.g. "TOO SOFT FOR THE PRESS — 10-0 WANTED STEEL", "ALL LEGS, NO CRAFT — THE LOW BLOCK HELD".

## 4. Simulation & tuning

- New `fitaware` bot: greedy on OVR, tie-breaks and near-tie swaps (Δ OVR ≤ 2) toward today's weighted attrs. Existing greedy = attr-blind baseline; random = floor.
- Diagnostics gain fit distributions per bot per opposition archetype.
- Tune gates (numbers-only) until: fit-aware 10-0 6-7%, attr-blind 3-4%, random unchanged floor, no dead bands, near-miss (efficiency or fit) 12-20% for top band, seed-stable across ≥3 seeds AND across all opposition archetypes (no archetype makes 10-0 impossible — Law check in sim).

## 5. UI

- Draft rows: three micro-attr digits (P/S/A) after the rating circle, ≥0.8rem, tier-tinted; GK rows unchanged. Legibility rule from P-023 applies.
- Landing (daily): opposition banner under the Matchday badge — "vs THE PRESSING MACHINE — pace is at a premium today".
- Broadcast chrome: "vs {OPPONENT}" beside FULL TIME/LIVE.
- **Stats screen** (post-match, below BandSlam): team profile bars (pace/strength/accuracy per bucket) vs formation ideal, today's emphasized attr highlighted; fit number with its margin line.
- Share text/card gain opponent: "TenNil Matchday #33 vs THE PRESSING MACHINE: 7-1…".

## 6. Rules Programme (in-game help)

- "RULES" typed mark in draft topline, landing sheet, broadcast chrome. Native `<dialog>` styled as a matchday programme spread (paper world). Opens over the game; `DraftSession` untouched; Esc/outside-click closes back to exact state.
- Pages: How it works (11 picks, one skip, person rule) · Your target (formation buckets) · Today's opponent (daily only) · How you're judged (plain language: scored against the best XI your reveals allowed; weak link; near-miss). Copy in a config block, not JSX literals.
- Focus-trapped, keyboard-complete, reduced-motion safe.

## 7. Explicitly out of scope (stack-3 roadmap, sequenced AFTER v2 ships, one increment + one retune each)

1. Role archetypes (target man, ball-playing CB) — reads attrs+positionRaw.
2. Squad balance variance measure.
3. Chemistry links (nation/squad pairs) — garnish ≤ ~1-2% impact per the Law.
Each gets its own ADR-lite + sim gate. Nothing from this list ships inside v2.

## 8. Process & canary

- Branch `v2/attrs`; commits terse; every task verified (tests+build+purity) on branch.
- Beta canary: `tennil-beta` repo, same Pages workflow, base `/tennil-beta/`, deployed from the branch for the user's A/B circle. Merge to main only on user sign-off.
- ADR-020 written before domain code; squads v2 + thresholds v4 version bumps follow schema-change rules (CLAUDE.md).

## 9. Acceptance (v2 ships when)

- [ ] 660-player corpus carries attrs; overrides file respected; loadData v2 validation fail-closed.
- [ ] Fit + opposition scoring pure, evaluator-extended, Law-bounded (sim proves 10-0 attainable under every archetype).
- [ ] Difficulty targets hit (§4) and logged in RISKS.
- [ ] Stats screen, opposition banners, attr digits, rules programme shipped; browser-verified.
- [ ] Share card/text carry opponent; card layout budget respected (P-034 lesson).
- [ ] Canary sign-off from user on beta URL; then merge.

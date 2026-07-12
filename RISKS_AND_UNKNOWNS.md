# RISKS_AND_UNKNOWNS.md

Stable ids R-0x (risks/open items), A-x (assumptions — table lives in PROJECT.md). Update this file whenever a placeholder is resolved or an experiment runs.

## Open items (Day-1 owners)

| ID | Item | Status | Resolution path |
|----|------|--------|-----------------|
| R-01 | **Ratings authored** — rubric applied (ADR-006), calibrated against all six anchors, frozen in `squads.json` (77 players). arg-1986 fixture numbers reused verbatim. Deviation notes below. | RESOLVED (T-003) | Revisit only if T-015 histograms demand; numbers-only. |
| R-02 | **Corpus overlap check** — verified: NO human starts in two ADR-007 finals XIs. Era spread (1970/82/86/98/02/10/14) precludes it; Cafu's other final (1994) is outside the corpus, only bra-2002 included. | VERIFIED (T-003) | None — no overlap to accept. |
| R-04 | **Band table numbers** — tuned from simulation data (T-015). Final 10-0 gates GK92/DEF352/MID286/ATT284/WL88 sit just under best-possible; greedy top band = 5.0% (≈1/20), spread across top 4 bands, no dead bands. See Experiment log 2026-07-09. | RESOLVED (T-015) | Revisit only if corpus grows (R-03); numbers-only. |
| R-05 | **Weak-link floors** — tested via histogram. weakLink is one of only two greedy-discriminating axes (with DEF); final floors 88/86/84/76 across the top four bands drive the greedy spread. weakLink=88 is the binding rare condition for 10-0 (~5%). | RESOLVED (T-015) | Numbers-only if corpus changes. |
| R-06 | **Exact band list** — six bands seeded (10-0, 5-0, 3-1, 2-2, 1-2, 0-4). Count/ids may change during Day 6 writing or Day 7 tuning. | SOFT-LOCKED | Band add/remove = config + commentary edit only; no code change permitted. |

### R-01 rating deviations from tier expectations (noted per T-003)

- **Zoff (ita-1982) = 88**: an all-time-great keeper placed at the *world-class floor* rather than the great tier, reflecting his age-40 anchoring-veteran role in 1982 rather than career peak.
- **Guivarc'h (fra-1998) = 76** and **Kramer (ger-2014) = 75**: both parked at the squad-role floor to serve as realistic corpus weak links (Guivarc'h scoreless as the '98 lone striker; Kramer a stand-in for the warm-up-injured Khedira, concussed early). Kramer is the lowest-rated starter in the corpus by design — the weakLink pressure-test.
- **Klose (ger-2014) = 84**: WC all-time top scorer held at established-international, not great tier, to reflect his 2014 veteran-focal-point role over peak output.

### R-04 calibration sanity pass (T-005) — thresholds NOT changed

Cross-corpus **best-possible XI** (top GK + top 4 DEF + top 3 MID + top 3 ATT): GK 92, DEF 353, MID 286, ATT 284, weakLink 88. Clears the seed 10-0 band (GK 88 / DEF 348 / MID 264 / ATT 270 / weakLink 84) with headroom +4 / +5 / +22 / +14 / +4. A **bucket-average XI** fails all four sum gates (GK 86.0, DEF 336.7, MID 257.3, ATT 262.3). Seed numbers are sane against real data — no threshold numbers edited. Precise rarity tuning deferred to T-015.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-03 | 7-squad corpus < 11–12 rounds ⇒ guaranteed repeats from ~round 8; feels stale | High (certain) | Medium | Picked players disabled on repeats; `breachLog` observability; corpus growth is data-only. If < 2 squads ever, repeat rule relaxes immediately — still playable. |
| R-07 | Rating fairness: cross-era comparisons are subjective; users argue | Medium | Low (flavor product) | Anchored rubric (ADR-006); only sums matter to outcome. |
| R-08 | UI/domain leakage (components re-implementing rules) | Medium | High (invariant break) | ADR-002 import bans; T-010 acceptance includes a leakage checklist; greps in Day gates. |
| R-09 | State-machine off-by-one (rounds/skip math) | Medium | High | Arithmetic invariant asserted after EVERY transition in tests (ARCHITECTURE §4). |
| R-10 | Config schema drift between docs, JSON, and validator | Medium | Medium | `loadData.ts` is single validation truth; version fields; loadData tests per failure mode. |
| R-11 | Top band trivially reachable (or unreachable) at ship | ~~Medium~~ RESOLVED (T-015) | High (core promise) | Tuned against sim: greedy 10-0 = 5.0% (skip84), 4.4/3.8% at skip70/90, 0% for random; stable across seeds 42/7/1337. Gate, not vibes — see Experiment log 2026-07-09. |
| R-12 | Position map disputes (AM=MID) skew bucket sums | Low | Medium | Locked in ADR-006; tune thresholds, not the map. |
| R-13 | **Wave D fit-aware bot cannot beat attr-blind greedy on 10-0** — fitaware sacrifices ≤2 OVR for attrs ⇒ OVR-gate ceiling ~1.7% (n=300) / 1.8% (n=500) vs greedy 6.3%; attrs ≈ OVR×mult+jitter (Wave B) ⇒ fitaware fit ≤ greedy fit ⇒ every minFit cuts fitaware ≥ greedy. Separation fitaware−greedy = −4.7 to −5.0pp across 4 iterations, never positive. Acceptance (fitaware 6-7% > greedy 3-4%) structurally unreachable under flat multipliers. | ~~High (certain)~~ **RESOLVED (2026-07-12)** | High (Wave D goal blocked) | **RESOLVED via Wave B-PRIME:** SPECIALIZATION table in `scripts/attrs/generate.ts` replaced flat multipliers (0.80–1.02) with aggressive axis-specific coefficients (0.68–1.10, ±5 jitter). Post-generation correlations: r(OVR,pace)=0.26, r(OVR,str)=0.12, r(OVR,acc)=0.50. Attrs now carry independent variance from OVR — the fundamental precondition for attr fit to discriminate skilled play. D4 re-opens with fitaware bot retuned (ΔOVR ≤ 1 tie-break-first) against new attrs. |

## Edge cases (must stay covered by tests)

- Skip on round 1; skip on the reveal that would be the 11th pick (still legal — replacement revealed, draft ends at 12 rounds).
- Repeated reveal where some players already picked → those unpickable; picking them throws.
- XI with 0 in some bucket (e.g. no GK) → bands requiring non-empty buckets skipped; lands low band/fallback. Never crashes commentary (slot fallback to captain).
- All-one-squad XI (theoretically possible via repeats) → legal, scored normally.
- Tie ratings in slot resolution → ascending player-id tiebreak (deterministic).

## Experiment: 10-0 rarity protocol (Day 7, T-014/T-015)

1. `npx tsx scripts/simulate.ts --n 500 --seed 42 --bot greedy` and `--bot random`.
2. Greedy bot = skilled-player proxy: fills 1/4/3/3 needs, max rating within need, spends skip when reveal is weak for needs.
3. Success target: greedy top band 5–7% (≈ 1/15–20); random bot top band ≈ 0%; every band ≥ 2% for greedy (no dead bands).
4. Tune ONLY `thresholds.json` numbers between runs. Log each iteration below.
5. Finish with ≥ 5 human playtest drafts as qualitative check (fun, band felt earned).

## Experiment log

_(append: date, config diff summary, N, histogram, decision)_

### 2026-07-09 — T-015 Day-7 threshold tune (n=500, seed=42 unless noted)

**Key structural finding (drove the whole tune).** The greedy "skilled" bot is
near-deterministic on three of five score axes: it always assembles the
best-possible GK (**92**), MID (**286** = 98/95/93) and ATT (**284** = 98/96/90).
Only **DEF** (range 343–353) and **weakLink** (82–88) vary run-to-run. So GK/MID/ATT
sum gates cannot discriminate skilled play at all (they either pass 100% or 0%);
**all greedy rarity must come from the DEF + weakLink gates.** Measured greedy
survival at skip 84: DEF≥353 = 4.6%, ≥352 = 20.2%, ≥351 = 48.8%, ≥350 = 73%,
≥349 = 85%; weakLink≥88 = 5.0%, ≥87 = 65%, ≥86 = 85%, ≥84 = 99%. The distribution
is **lumpy**: the only achievable "rare" top-band rates are ~5% (DEF≥353, or
DEF≥352 ∧ WL≥88) then it jumps straight to ~20% (DEF≥352) — there is no config that
lands the top band at 6–7%. So the realistic on-target top-band rate is **~5% (≈1/20)**,
which sits inside the 5–7% protocol window at its floor.

Iterations:
- **Baseline (seed placeholder numbers)**: 10-0 gates GK88/DEF348/MID264/ATT270/WL84.
  Greedy 10-0 = **90.4%**, 5-0 = 9.6%, rest 0% — top band trivially reachable, four dead
  bands for greedy. Fail.
- **Final (one substantive iteration, informed by the survival tables above)**:
  raised the top three bands to sit just under best-possible and sliced DEF+WL across
  them; lowered 2-2 so weak greedy XIs land there (not below) and a few random XIs can
  reach it. Greedy 10-0 = **5.0%**, spread 5-0/3-1/2-2 = 43.8/36.4/14.8%, no greedy in
  1-2/0-4. Accept.

Final config (mins per band): **10-0** GK92 DEF352 MID286 ATT284 WL88 · **5-0** GK92
DEF351 MID286 ATT284 WL86 · **3-1** GK92 DEF349 MID286 ATT284 WL84 · **2-2** GK80
DEF300 MID250 ATT250 WL76 (minCounts off) · **1-2** all-0 · **0-4** fallback. Gates are
monotonic (every axis non-increasing down the ladder; minCounts T,T,T,F,F) so no band is
unreachable by construction.

Final histograms:

| band | greedy skip84 | greedy skip70 | greedy skip90 | random skip84 |
|------|--------------:|--------------:|--------------:|--------------:|
| 10-0 | 5.0%  | 4.4%  | 3.8%  | 0.0% |
| 5-0  | 43.8% | 38.4% | 38.8% | 0.0% |
| 3-1  | 36.4% | 33.6% | 31.6% | 0.0% |
| 2-2  | 14.8% | 23.6% | 25.8% | 1.8% |
| 1-2  | 0.0%  | 0.0%  | 0.0%  | 55.0% |
| 0-4  | 0.0%  | 0.0%  | 0.0%  | 43.2% |

Stability (greedy 10-0 / 5-0 / 3-1 / 2-2, default skip 84): seed 42 → 5.0/43.8/36.4/14.8;
seed 7 → 4.8/44.8/35.2/15.2; seed 1337 → 6.4/41.8/37.4/14.4. All within ±2% — stable.
Random 10-0 = 0.0% across all three seeds (0-4 40–44%, so it does not swallow everything).

**Decision.** Accept final config. Every band reachable by some bot (10-0/5-0/3-1 greedy;
2-2 greedy+random; 1-2/0-4 random), no dead bands, top band ≈1/20 skilled drafts and
does not collapse under skip-threshold 70/90. Top band cannot be pushed to 6–7% without
jumping to ~20% — a consequence of the lumpy 7-squad corpus, not a tuning miss; documented
here so a future corpus expansion (R-03) can revisit. Engine untouched (Invariant 6):
only `thresholds.json` numbers/booleans changed.

### 2026-07-11 — Sprint-1 T9 retune for 16-squad corpus (n=500, seed=42)

**Human-playtest motivation.** On the old 7-squad-era gates, real human drafts on
the 16-squad corpus landed almost always in 1-2 or 2-2 — 3-1/5-0/10-0 effectively
unreachable. New squads inject many 78–84 role players that drag achievable
weak-link and bucket sums down, so old 3-1 gates (DEF349/WL84) sat above
good-but-imperfect play. Band ladder is a difficulty curve, not a wall.

**Baseline (old 7-squad gates on 16-squad corpus):** greedy 10-0 **2.20%**, 5-0
1.00%, 3-1 0.80%, 2-2 **96.00%** (collapsed); random 10-0 0%, 2-2 2.40%, 1-2
52.40%, 0-4 45.20%. MID/ATT gates at 286/284 were best-possible ceilings from
the 7-squad era; greedy MID p10=273, ATT p10=278 — those gates failed most
skilled drafts and parked them in 2-2.

**Final:** greedy 10-0 **5.80%** → 5-0 27.20% / 3-1 67.00% / 2-2 0% (majority
in 5-0+3-1). Random 10-0 **0%**, 5-0 0%, 3-1 2.40%, 2-2 19.00%, 1-2 33.40%,
0-4 45.20% — mass spread 3-1/2-2/1-2, not collapsed into 1-2. Near-miss(3pts)
10-0 **18.40%** (sweet spot 10–20%). Percentile drivers: greedy DEF p90=363,
weakLink p90=88. Deviations from 5–7% window: **none** (5.80% in window).

Gates: **10-0** GK90/DEF362/MID280/ATT282/WL88; **5-0** GK90/DEF357/MID276/ATT279/WL86;
**3-1** GK84/DEF325/MID245/ATT230/WL78; **2-2** GK70/DEF240/MID190/ATT150/WL74
(minCounts off); **1-2** all-0; **0-4** fallback. Numbers-only; engine untouched.
Report snapshot: `docs/sim/sim-report.json`.

- **2026-07-11 (Sprint-1 T9, corpus 16):** baseline 2.20% → final 5.80%
  (greedy, n=500, seed=42). Gates: 10-0 GK90/DEF362/MID280/ATT282/WL88; 5-0
  GK90/DEF357/MID276/ATT279/WL86; 3-1 GK84/DEF325/MID245/ATT230/WL78; 2-2
  GK70/DEF240/MID190/ATT150/WL74. Near-miss(3pts): 10-0 18.40%, 5-0 40.40%.
  Random top band: 0.00%. Percentile drivers: greedy DEF p90 363, weakLink
  p90 88. Deviations from 5-7% window: none.

### 2026-07-11 — Corpus-60 retune (1986–2022 SF+QF; n=500, seed=42)

**Motivation.** Corpus grew 16 → 60 (ADR-011 amendment). Old 16-squad gates
sat above the new distribution: greedy collapsed into 3-1 (**99.60%**), 10-0/5-0
dead at 0%. Greedy p50 sums (DEF 349 / MID 275 / ATT 273 / WL 84) no longer
clear 5-0/10-0; retune numbers-only so skilled drafts land majority 5-0+3-1
and 10-0 is rare-but-reachable.

**Baseline (stale 16-squad gates on 60-squad corpus):** greedy 10-0 **0%**,
5-0 0%, 3-1 **99.60%**, 2-2 0.40%; random 10-0 0%, 5-0 0%, 3-1 1.60%, 2-2
17.60%, 1-2 35.40%, 0-4 45.40%. Near-miss 5-0 only 3.80% (top band unreachable).

**Final:** greedy 10-0 **6.40%** → 5-0 31.20% / 3-1 62.40% / 2-2 0% (majority
in 5-0+3-1 = 93.60%). Random 10-0 **0%**, 5-0 0%, 3-1 1.40%, 2-2 18.40%,
1-2 34.80%, 0-4 45.40% — mass spread 2-2/1-2/0-4, not collapsed into 1-2.
Near-miss(3pts) 10-0 **15.80%** (sweet spot 10–20%). Percentile drivers:
greedy DEF p90=355, weakLink p90=86, MID p10=268, ATT p10=266. Deviations
from 5–7% window: **none** (6.40% in window). Dead-band note: greedy 2-2/1-2/0-4
= 0% (skilled bot never fails formation/weak-link floors); random supplies
≥1% for 3-1/2-2/1-2/0-4 — every band live in ≥1 bot histogram.

Gates: **10-0** GK85/DEF355/MID270/ATT268/WL86; **5-0** GK85/DEF349/MID270/ATT268/WL84;
**3-1** GK80/DEF320/MID250/ATT230/WL78; **2-2** GK70/DEF240/MID180/ATT150/WL74
(minCounts off); **1-2** all-0; **0-4** fallback. Numbers-only; engine untouched.
Report snapshot: `docs/sim/sim-report.json`.

- **2026-07-11 (corpus 60 retune):** baseline 0.00% → final 6.40%
  (greedy, n=500, seed=42). Gates: 10-0 GK85/DEF355/MID270/ATT268/WL86; 5-0
  GK85/DEF349/MID270/ATT268/WL84; 3-1 GK80/DEF320/MID250/ATT230/WL78; 2-2
  GK70/DEF240/MID180/ATT150/WL74. Near-miss(3pts): 10-0 15.80%, 5-0 31.20%.
  Random top band: 0.00%. Percentile drivers: greedy DEF p90 355, weakLink
  p90 86. Deviations from 5-7% window: none.

### 2026-07-11 — W3 ADR-019 relative-scoring 9-band retune (n=500, seed=42)

**Motivation.** ADR-019 replaced absolute bucket-sum gates with
session-relative efficiency (userTotal/ceilingTotal). The placeholder
thresholds (W1) gave greedy 10-0 = 19.4% (too common), 5-0 = 48.8% (one band
swallowed half the drafts), and four dead rungs. Retune numbers-only so the
9-band ladder actually spreads inside the compressed efficiency range.

**Key finding: compressed efficiency.** Greedy total-efficiency is 96–100
(p50 99, p90 100) — only **5 integer values for 9 bands**. Total efficiency
alone cannot discriminate; the 269 drafts at eff=99 (53.8%) must be split
across 7-1/5-0/4-1/3-1 using **per-bucket efficiency** (MID/ATT cascade:
99→98→97→none), which the engine already supports via `minBucketEfficiency`.
Random total-efficiency is 90–98 (p50 94); random per-bucket efficiency is
meaningless (wrong formation counts → buckets over-stacked or empty), so
per-bucket gates only appear on bands with `requireMinCounts: true`.

**1-2 structural fix.** The old 1-2 required `requireAllBucketsNonEmpty` +
eff≥0.62. Random's efficiency floor is 90, so 1-2 caught nothing (dead rung)
— every structurally-broken draft (empty bucket) fell straight to 0-4.
Fix: drop `requireAllBucketsNonEmpty` from 1-2 and raise minEfficiency to
0.92. Now 1-2 catches "structurally broken but decent outfield" (empty GK,
strong MID/ATT) = 44.4% of random; 0-4 keeps only the truly broken (empty
bucket + eff<92) = 1.0%. Both bands alive, no dead rungs.

**Near-miss design.** 10-0 and 7-1 share minEfficiency (0.99→99) and
minWeakLink (86) — the discriminator is per-bucket (10-0 requires MID/ATT≥99,
7-1 does not). This makes 7-1 small (~57 drafts, 11.4%): only eff≥99 +
WL≥86 drafts that drop points in one position group. Because 7-1 is small,
the 10-0 near-miss pool (7-1 drafts within 3 integer-efficiency-points of
10-0 on all numeric predicates) is 54 (10.8%) — inside the 10–20% window.
When 7-1 had a lower WL floor (85) and per-bucket requirements close to
10-0's, all 7-1 drafts near-missed 10-0 (24–28%) — too high. The shared
WL=86 + per-bucket cascade solved it.

**Baseline (W1 placeholders):** greedy 10-0 **19.40%**, 5-0 48.80%, 7-1
24.20%, four dead rungs. Near-miss 10-0 24.20%.

**Final:** greedy 10-0 **6.00%** → 7-1 11.40% / 5-0 22.00% / 4-1 20.20% /
3-1 17.80% / 2-1 22.60% (majority spread across 7-1/5-0/4-1/3-1, no single
>40%). Random 10-0 **0%**, 7-1 0%, 5-0 0% (top-3 clean); 2-1 44.40%, 1-1
10.20%, 1-2 44.40%, 0-4 1.00% (no single >55%). Near-miss(3pts) 10-0
**10.80%** (in 10–20% window). Every band ≥1% in at least one bot
(10-0→3-1 greedy; 2-1 greedy+random; 1-1/1-2/0-4 random). WL floor has
teeth: 10-0 requires WL≥86, so a star-XI-with-one-62 cannot reach the top
band regardless of efficiency.

Gates (fractions; loadData rounds to integer pct): **10-0** eff 0.99, WL 86,
MID 0.99, ATT 0.99 · **7-1** eff 0.985, WL 86 · **5-0** eff 0.98, WL 84,
MID 0.99, ATT 0.99 · **4-1** eff 0.98, WL 82, MID 0.98, ATT 0.98 · **3-1**
eff 0.97, WL 80, MID 0.97, ATT 0.97 · **2-1** eff 0.93, WL 78 (minCounts
off) · **1-1** eff 0.90, WL 0 (minCounts off) · **1-2** eff 0.92, WL 0
(allBucketsNonEmpty OFF) · **0-4** fallback. Numbers-only; engine untouched
(Invariant 6). Report snapshot: `docs/sim/sim-report.json`.

Stability (greedy, default skip 84): seed 42 → 10-0 6.0 / 7-1 11.4 / 5-0 22.0
/ 4-1 20.2 / 3-1 17.8 / 2-1 22.6; seed 1000 → 6.2 / 8.6 / 20.2 / 22.2 / 19.6
/ 23.2; seed 5000 → 4.4 / 10.8 / 18.4 / 23.4 / 19.8 / 23.2. No single band
>40% across all three seeds. Random top-3 = 0% across all seeds; max band
51.2% (seed 5000) < 55%.

- **2026-07-11 (W3 ADR-019 9-band retune):** baseline 19.40% → final 6.00%
  (greedy, n=500, seed=42). Per-bucket MID/ATT cascade 99→98→97 splits the
  eff=99 majority (53.8%). 1-2 drops allBucketsNonEmpty → catches
  structurally-broken decent-eff. Near-miss(3pts): 10-0 10.80%. Random
  top-3: 0.00%. WL floor 86 has teeth. Deviations from 5-7% window: none.

### 2026-07-12 — Wave D fit-aware bot + minFit tuning (ADR-020; WAVED-STRUCTURAL)

**Goal.** ADR-020 Wave D: add a `fitaware` bot (greedy on OVR with ΔOVR≤2
swaps toward weighted attrs), tune `minFit` on the top 3 bands so fit-aware
10-0 = 6-7% neutral and attr-blind greedy = 3-4% (the second skill axis).

**Step zero (n=300, seed=42, neutral, minFit=0 — all top-3 bands):**

| bot | 10-0 | 7-1 | 5-0 | 4-1 | 3-1 | 2-1 | fit p10/p50/p90 |
|-----|------|-----|-----|-----|-----|-----|------------------|
| greedy | 6.33 | 11.00 | 20.33 | 20.67 | 20.33 | 21.33 | 99/100/100 |
| fitaware | 1.67 | 3.33 | 12.67 | 18.00 | 21.67 | 42.67 | 99/100/100 |
| random | 0 | 0 | 0 | 0 | 0 | 40.67 | 96/97/99 |

**Contradiction resolved.** Prior attempts reported conflicting greedy-vs-fitaware
10-0 order. Clean runs show definitively: **greedy 6.33% > fitaware 1.67%** —
backwards from the design (fitaware should beat greedy). Cause: the fitaware
bot sacrifices ≤2 OVR for weighted attrs ⇒ lower efficiency/weakLink ⇒ clears
the OVR gates for 10-0 LESS often than attr-blind greedy. The fit axis
(minFit=0) is inactive; fit is saturated at p50=100 for BOTH skilled bots
(Wave-B targets too low ⇒ attrs abundant).

**Iteration 1 (minFit=100 on 10-0, targets unchanged):** greedy 10-0 = 6.33%
(unchanged), fitaware = 1.67% (unchanged). Every OVR-clearing 10-0 candidate
already has fit=100 ⇒ **minFit is impotent at authored targets** (no value
0-100 moves 10-0). Proves levers 1a (minFit placement) and 2 (profile weights,
scale-invariant + zero-shortfall) are structurally powerless while fit is
saturated.

**Iteration 2 (raise 4-3-3 targets above top-XI attr means: DEF 84/90/84,
MID 89/84/93, ATT 93/88/90; minFit=0):** fit unsaturated — greedy fit 94/95/96,
fitaware fit 94/95/96. **fitaware fit ≈ greedy fit (greedy slightly HIGHER:
p75 96 vs 95, min 93 vs 92).** Raising targets created shortfall but did NOT
separate the bots: attrs ≈ OVR×mult+jitter (Wave B generator) ⇒ attrs ~95%
correlated with OVR ⇒ the ΔOVR≤2 swap gains negligible fit vs greedy's
pure-OVR picks (which get high attrs on ALL axes from high OVR). 10-0
unchanged (6.33/1.67) — band still OVR-gated; targets only move the fit scale.

**Iteration 3 (minFit=95 on top-3, raised targets):** greedy 10-0 = 6.33%
(unchanged — all 19 candidates fit≥95), fitaware = 1.33% (−0.34pp — one
candidate cut). **minFit cuts fitaware, NOT greedy.** Separation −4.67 → −5.0pp
(worse). Confirms: fitaware fit ≤ greedy fit ⇒ every minFit cuts fitaware ≥
greedy ⇒ separation can never invert.

**Iteration 4 (minFit=96 on top-3, raised targets):** greedy 10-0 = 5.67%
(−0.66pp, first cuts), fitaware = 1.00% (−0.67pp, 40% vs 10% proportional).
Separation = −4.67pp. Even where greedy finally drops, fitaware drops faster.

**Structural conclusion (3 independent proofs).**
1. **OVR-ceiling.** fitaware 10-0 ≤ ~1.7% (n=300) / 1.8% (n=500) — the OVR
   sacrifice caps how often it clears the fixed efficiency/WL/bucket-eff
   gates. minFit can only REDUCE 10-0, never raise the ceiling. For
   separation ≥2pp need fitaware ≥ greedy+2; with fitaware ≤1.8%, need
   greedy ≤ −0.2% ⇒ impossible. Holds for ALL minFit/targets/weights.
2. **Fit non-separation.** attrs ≈ OVR×mult+jitter ⇒ fitaware fit ≤ greedy
   fit ⇒ every minFit cuts fitaware ≥ greedy ⇒ separation ≤ 0 always.
3. **Empirical.** 4 iterations, separation −4.7 to −5.0pp, never positive,
   never near +2pp.

**Law cycle (n=300, fitaware, minFit=96, raised targets):** every archetype
>0% (aerial 1.67 / counter 0.67 / low-block 0.67 / possession 0.67 / pressing
0.33) — Law gate PASSES, but at trivially low rates (~1%) confirming the
OVR-ceiling dominates; weightMods barely move fit (attrs abundant/correlated).

**Decision. WAVED-STRUCTURAL.** thresholds.json reverted to HEAD (minFit=0,
authored targets) — shipping a gate that cuts the WRONG bot is worse than no
gate. What lands: the `fitaware` bot, `--opposition cycle`, and fit
diagnostics in `scripts/simulate.ts` (verified against the plan addendum's
exact rule — no drift). Orchestrator decides on the candidate fixes in R-13
before Wave D tuning can resume; the tooling is ready to re-run the moment the
structural blocker is lifted. `docs/sim/sim-report.json` = fitaware/neutral/
n=500/seed=42 baseline (10-0 = 1.80%, fit p50=100).

- **2026-07-12 (Wave D, ADR-020):** WAVED-STRUCTURAL. fitaware 10-0 ceiling
  1.80% (n=500) vs greedy 6.33% (n=300); minFit impotent (fit saturated) then
  cuts fitaware ≥ greedy (attrs ≈ OVR×mult ⇒ no fit separation). Separation
  −4.7 to −5.0pp across 4 iterations, never ≥2pp. Law cycle PASS (all
  archetypes >0%, rates ~1%). thresholds.json reverted; simulate.ts tooling
  lands. See R-13 for the orchestrator's fix decision.

## Open questions (answer before or during the named task)

1. Should skip replacement exclude only the skipped squad or all seen? **Answered in ADR-003**: excludes skipped squad id; normal seen-preference applies.
2. Do we show ratings during reveal? **Yes** — core draft information (PROJECT core loop step 1).
3. Commentary beat pacing (timed vs click-through)? Implementer's choice in T-013; determinism of content is the only hard rule.
4. Does band label or band id render as the final scoreline? Band **id** is the scoreline ("10-0"); label is the headline ("LEGENDARY ROUT"). Locked here to prevent drift.

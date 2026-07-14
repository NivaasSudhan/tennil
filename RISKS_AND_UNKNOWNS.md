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
| R-13 | **Wave D fit-aware bot cannot beat attr-blind greedy on 10-0** — fitaware sacrifices ≤2 OVR for attrs ⇒ OVR-gate ceiling ~1.7% (n=300) / 1.8% (n=500) vs greedy 6.3%; attrs ≈ OVR×mult+jitter (Wave B) ⇒ fitaware fit ≤ greedy fit ⇒ every minFit cuts fitaware ≥ greedy. Separation fitaware−greedy = −4.7 to −5.0pp across 4 iterations, never positive. Acceptance (fitaware 6-7% > greedy 3-4%) structurally unreachable under flat multipliers. | ~~High (certain)~~ ~~PARTIAL (D4)~~ ~~SHIPPED INFO-ONLY (D5)~~ **FIT-TEETH ON (P040, 2026-07-14 — reframed to human proxy, canary-justified starting calibration)** | High (Wave D goal blocked) | **Wave B-PRIME** SPECIALIZATION table (0.68–1.10, ±5 jitter) decoupled attrs from OVR (r=0.26/0.12/0.50). **D4** retuned bot to ΔOVR ≤ 1 attr-tie-break-first + reweighted 4-3-3 profile to the bite point (binding attrs high-weighted, targets raised) + minFit 92/90/88. Seed-42 (report): greedy 3.6% / fitaware 6.0% / separation +2.4pp / Law PASS / near-miss 12% — core reframing achieved. **Cross-seed fitaware 5.5-7 still structurally bounded** (6.0/3.4/2.8% seeds 42/1000/5000 — the ΔOVR ≤ 1 swap costs the eff-99% gate where attr-specialists are positionally rare in reveals; no-gate ceiling <5.5 at 2/3 seeds). **D5** (4-iteration budget, config-only): none of minFit 92-94 × minBucketEff 0.980-0.9875 × minEff 0.975-0.985 landed both bots in their target windows at all 3 seeds with fitaware >= greedy held everywhere; confirmed the no-gate ceiling itself (6.2/5.0/3.2% seeds 42/1000/5000 fitaware vs 6.0/6.2/4.4% greedy) already fails the invariant at 2/3 seeds — this is a bot-behavior gap (ΔOVR≤1 swap cost), not a gate-tuning problem. **Decision: minFit → 0 on all three bands (info-only), profile weights/targets unchanged.** Fix requires a corpus or bot change (ADR-worthy), out of config-only scope. See D5 experiment log. |

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

- **2026-07-12 (Wave D4, R-13 revision, SPECIALIZATION corpus):** PARTIAL-PASS.
  Bot retuned to ΔOVR ≤ 1 attr-tie-break-first (tighter than Wave D's ≤2).
  Step-zero (n=300 neutral, minFit=0): fit DESATURATED — greedy p50=98 (was
  100), fitaware p50=98, random p50=95. But greedy 10-0=6.33% vs fitaware 3.00%
  (fitaware sacrifices the eff-99% 10-0 ceiling), and 10-0 draft fit identical
  across bots (both p50=98) ⇒ minFit cannot discriminate at authored targets.

  **The R-13 bite-point fix (config numbers only).** Reweighted the 4-3-3
  profile so BINDING attrs (the real shortfalls — DEF pace, MID strength, ATT
  accuracy) carry high weights; overshooting attrs low-weighted (no fit value to
  optimize). Raised binding-axis targets to the bite point. This makes the
  fitaware bot's ΔOVR ≤ 1 swap optimize the attrs that actually need it ⇒ a fit
  gap opens (fitaware 10-0 fit p50 +2 over greedy). Final 4-3-3 profile:
  DEF w(0.70/0.20/0.55) t(86/85/72); MID w(0.20/0.85/0.40) t(76/83/88);
  ATT w(0.50/0.20/0.85) t(88/72/87). minFit ladder 92/90/88 on 10-0/7-1/5-0.

  **Seed 42 (n=500, report seed) — ALL reframed criteria PASS:**
  greedy 10-0 = 3.60% (✓ 3-4, fell from 6.33 via fit gate biting blind play);
  fitaware 10-0 = 6.00% (✓ 5.5-7, holds); separation +2.40pp (✓ ≥2);
  random 10-0 = 0% (✓ floor unchanged); top-band near-miss 12.00% (✓ 12-20,
  efficiency-or-fit delta 3); no dead bands introduced (1-1/1-2/0-4 were dead
  for greedy/fitaware pre-D4 — greedy too strong to reach them); greedy 10-0
  fit p50=92 vs fitaware 10-0 fit p50=93 (gate at 92 cuts greedy 12/30, cuts
  fitaware 1/31 — the discrimination works).

  **Law cycle (n=500 seed=42 fitaware): PASS** — every archetype 10-0 > 0%
  (aerial 4.40 / counter 5.00 / low-block 6.00 / possession 6.00 / pressing
  7.00). 10-0 attainable under every opposition.

  **Cross-seed stability — STRUCTURAL FAIL on fitaware, PASS on greedy.**
  greedy 10-0 stable 3-4 across seeds 42/1000/5000 (3.60/3.80/3.40% ✓).
  fitaware 10-0 seed-volatile: 6.00/3.40/2.80% — below 5.5 at 1000/5000 AND
  below greedy (separation negative). Root cause: the fitaware bot's ΔOVR ≤ 1
  attr-swap costs the eff-99% 10-0 gate at seeds where attr-specialists (RB/LB
  for pace, DM for strength, wingers for accuracy) are positionally rare in the
  reveal sequence. No-gate fitaware 10-0 ceiling is 6.2/5.0/3.2% (seeds
  42/1000/5000) — already below 5.5 at 2/3 seeds BEFORE any gate cuts. minFit
  can only reduce, never raise. Confirmed across 7 weight configs × 3 seeds
  (sweep): fitaware 10-0 < greedy at 2/3 seeds for EVERY config; the OVR-ceiling
  vs attr-fit tradeoff is decoupled (SPECIALIZATION r=0.26-0.50) but NOT
  eliminated for the tightest gate. This is a milder recurrence of R-13's
  OVR-ceiling blocker, now bounded to cross-seed stability rather than total
  non-separation. No minFit value passes all 3 seeds (92 needed for seed-42
  greedy 3-4; 93 flips seed-1000 separation but fails seed-42 both).

  **Decision. SHIP the bite-point config (not revert).** Unlike the prior
  WAVED-STRUCTURAL (where minFit cut the WRONG bot and nothing discriminated),
  D4 achieves the core reframing at the report seed: greedy falls 6.33→3.6%,
  fitaware holds 6.0%, the fit gate bites blind play, separation +2.4pp, Law
  passes, near-miss 12%. The remaining structural piece (cross-seed fitaware
  5.5-7) requires either a looser 10-0 OVR gate (out of D4's config-only scope —
  would need an ADR) or a corpus/bot change (more attr-specialists at high OVR,
  or a bot that foresees the eff gate). Documented here for the orchestrator.
  `docs/sim/sim-report.json` = fitaware/neutral/n=500/seed=42 (10-0=6.00%,
  fit p50=93). thresholds.json ships minFit 92/90/88 + bite-point profile.

- **2026-07-12 (Wave D5, finishing the interrupted D5 run):** picked up the
  dead agent's uncommitted mid-tune (working tree had 10-0 minEfficiency 0.98,
  minBucketEfficiency MID/ATT 0.985, minFit 93, missing the DEF key). Completed
  Iteration A (added `DEF: 0.985`) then ran the prescribed n=300 screening
  sweep (seeds 42/1000/5000, greedy+fitaware) across the sweep space (minFit
  92-94, minBucketEfficiency 0.980-0.9875, minEfficiency 0.975-0.985), 4
  iterations total:
  - **A** (minEff 0.98, minBucketEff DEF/MID/ATT 0.985, minFit 93): fitaware
    3.33/3.00/2.33%, greedy 1.33/2.00/2.00% (seeds 42/1000/5000). Hard
    constraint held (fitaware ≥ greedy all 3 seeds) but both bots far below
    target windows.
  - **B** (minFit 92, same bucket/eff): fitaware 5.33/3.67/3.00%, greedy
    3.67/3.33/2.67%. Greedy now inside 2.5-4.5% at all 3 seeds; fitaware still
    short of 4.5% at seeds 1000/5000.
  - **C** (minFit 92, minBucketEff loosened to 0.9825): fitaware
    9.33/8.67/8.00%, greedy 7.67/9.00/6.00%. Both overshot their windows AND
    the hard constraint broke at seed 1000 (greedy 9.00 > fitaware 8.67) —
    confirms the bucket-efficiency axis is the steep one (0.985→0.9825 is a
    huge jump, not a fine one).
  - **D** (minFit 93, minBucketEff 0.9825 — tight fit + loose bucket-eff, to
    use the fit gate's greedy-biased cut to counteract the bucket-eff
    overshoot): fitaware 5.67/6.67/6.67% — all inside 4.5-7.5%. Greedy
    3.67/**6.33**/4.33% — seed 1000 breaks the 2.5-4.5% window (6.33%), though
    the hard constraint (fitaware ≥ greedy) still barely held (6.67 ≥ 6.33).
    Closest of the 4, but does not meet acceptance at all 3 seeds.

  **4-iteration budget exhausted without an acceptance-passing config.**
  Executed the fallback exactly as dictated: `git checkout --
  src/data/config/thresholds.json` (back to D4's committed 92/90/88 +
  minEfficiency 0.99/minBucketEfficiency MID/ATT 0.99), then set minFit to 0
  on 10-0/7-1/5-0 only (profile weights/targets untouched). Measured n=500,
  seeds 42/1000/5000, greedy+fitaware, **with minFit=0 (no gate at all)**:
  fitaware 10-0 = 6.20/5.00/3.20%, greedy 10-0 = 6.00/6.20/4.40%. Hard
  constraint (fitaware ≥ greedy) holds only at seed 42 (6.20≥6.00); **fails at
  seed 1000 (5.00<6.20) and seed 5000 (3.20<4.40) even with zero gate** —
  matching D4's own no-gate-ceiling measurement (6.2/5.0/3.2% seeds
  42/1000/5000, documented above) exactly. This confirms the D4 diagnosis:
  the shortfall is intrinsic to the ΔOVR≤1 fitaware bot's behavior (it costs
  the eff-99% 10-0 ceiling at seeds where attr-specialists are positionally
  rare in the reveal order), not an artifact of any gate — no threshold
  combination can fix it because the ungated baseline already fails the
  invariant at 2/3 seeds.

  **Decision: ship D5-FALLBACK as specified.** `minFit` = 0 on 10-0/7-1/5-0
  (predicate not emitted per the exact rule — fit is informational only,
  surfaced to the player but never decides a band). All other D4 gates
  (minEfficiency, minBucketEfficiency, minWeakLink) and the 4-3-3 profile
  weights/targets are unchanged. Law gate re-verified with this config:
  `--opposition cycle` n=500 seed=42 fitaware — PASS, every archetype 10-0 > 0%
  (aerial 5.00 / counter 5.80 / low-block 6.20 / possession 6.20 / pressing
  7.60). `docs/sim/sim-report.json` refreshed = fitaware/neutral/n=500/seed=42
  (10-0=6.20%, fit p50=93 — fit distribution itself is healthy and
  well-separated from greedy's p50=92; it is the *band gate use* of fit that
  is unshippable at this bot/corpus, not the fit measure). **Open for the
  orchestrator:** closing this gap needs either a corpus change (more
  attr-specialists at high OVR, reducing positional scarcity in early
  reveals) or a smarter fitaware bot (one that anticipates the eff-99% cost
  before swapping) — both out of config-only scope, would need a new ADR.

- **2026-07-14 (P040 fit-teeth, parked-decision resolution):** the parked
  "fit-gate teeth" decision (CLAUDE.md NEXT; canary human playtest) is
  RESOLVED to **fit-teeth ON**. User playtested the canary: 10-0 stayed
  trivial for a HUMAN because minFit=0 (info-only, D5-FALLBACK) and minEff 0.99
  auto-cleared by best-OVR-per-bucket play. Key reframing vs D4/D5: the sim
  conclusion that fit can't separate the BOTS still holds (fitaware pays a fixed
  ΔOVR≤1 tax that costs the eff gate), but a HUMAN reads the opponent WITHOUT
  that tax, so fit can carry weight for humans it couldn't for the sim — the
  goal is no longer "fitaware beats greedy" (structurally impossible) but "set
  gates meaningfully above the auto-clear baseline, Reveal-Luck-Law-safe, no
  dead bands," validated by the fitaware-neutral proxy.

  **Config (thresholds.json numbers only):** minEfficiency raised 10-0
  0.99→**0.995**, 7-1 0.985→**0.99**, 5-0 0.98→**0.985**; minFit turned ON
  10-0=**92**, 7-1=**89**, 5-0=**89** (profile weights/targets UNCHANGED).
  Note the Math.round(minEff×100) integer gate: 0.995⇒100 (10-0 now needs
  PERFECT reveal-relative efficiency — Law-safe, ceiling is reveal-derived),
  0.99⇒99 (7-1 no-op at integer level, matches intent), 0.985⇒99 (5-0 real
  98→99). Under minEff=100 the eff==100 subset's fit floor is ~91, so
  minFit=92 is the smallest fit gate that still bites 10-0 in neutral (trims the
  fit=91 draft) while leaving seed-42 in the target window — the fit gate does
  the heavier lifting under non-neutral oppositions (weightMods raise the
  premium-attr shortfall ⇒ lower fit ⇒ the human must read the opponent).

  **Step-zero fit distribution (fitaware neutral n=500 seed=42, pre-change):**
  fit p10 91 / p25 92 / p50 93 / p75 94 / p90 95 (min 87 / max 97); 10-0-subset
  fit 91–96.

  **Acceptance (all PASS, n=500 seed=42 final):** fitaware-neutral 10-0 =
  **2.20%** (target 2–4%, down from 6.20%); greedy 2.20%; random 0%. Law cycle
  (fitaware `--opposition cycle`): **PASS** — aerial 2.00 / counter 2.20 /
  low-block 2.60 / possession 2.60 / pressing 3.60, every archetype >0. No dead
  bands — every band ≥1% in ≥1 of the three bots (10-0 2.2 / 7-1 11.8 / 5-0 13.4
  / 4-1 22.0 / 3-1 21.4 / 2-1 29.2 via fitaware+greedy; 1-1 10.2 / 1-2 44.4 /
  0-4 1.0 via random). Seed stability fitaware-neutral 10-0: 2.2 / 2.2 / 1.6%
  (seeds 42/1000/5000) — none >6% or =0%, tight. Solved in 1 tuning iteration
  (6-iteration budget). `docs/sim/sim-report.json` refreshed = fitaware/neutral/
  n=500/seed=42 (10-0=2.20%, fit p50=93).

  **Status: STARTING calibration, pending human playtest validation.** This is a
  first canary-justified fit-teeth config, not a final tune — the user validates
  by playtest. What a human must now DO to reach 10-0: pick the reveal-optimal
  XI (perfect efficiency, no OVR left on the table in any bucket) AND read the
  daily opponent so the shape's weighted attrs beat the fit floor (~92 neutral,
  higher effective bar under a demanding archetype). No profile/weight/target or
  bot change — those remain the ADR-worthy, out-of-config-scope levers if the
  human data says the gate is mis-set.

  **SHIP DECISION (2026-07-14, user pick — supersedes the first-commit config above):**
  shipped **FIT-DOMINANT** on 10-0 (minEfficiency **0.99** + minFit **94**) over
  the perfect-efficiency path (minEff 0.995⇒eff==100 + minFit 92) — fit carries
  the teeth and avoids perfect-efficiency reveal path-luck; canary calibration.
  7-1/5-0 unchanged (minFit 89, minEff 0.99/0.985). Re-verified n=500:
  fitaware-neutral 10-0 = 2.6/1.8/1.6% (seeds 42/1000/5000, seed-42 in the 2-4%
  window, none 0% or >6%); Law cycle PASS (aerial 2.0 / counter 2.0 / low-block
  2.8 / possession 2.8 / pressing 4.2, every archetype >0); no dead bands (all
  nine ≥1% in some bot). Ship note: a human now reaches 10-0 by reading the daily
  opponent so the shape clears the ~94 fit floor (higher effective bar under a
  demanding archetype) on top of a near-optimal, not necessarily perfect, XI —
  `docs/sim/sim-report.json` = fitaware/neutral/n=500/seed=42 (10-0=2.60%).

## Open questions (answer before or during the named task)

1. Should skip replacement exclude only the skipped squad or all seen? **Answered in ADR-003**: excludes skipped squad id; normal seen-preference applies.
2. Do we show ratings during reveal? **Yes** — core draft information (PROJECT core loop step 1).
3. Commentary beat pacing (timed vs click-through)? Implementer's choice in T-013; determinism of content is the only hard rule.
4. Does band label or band id render as the final scoreline? Band **id** is the scoreline ("10-0"); label is the headline ("LEGENDARY ROUT"). Locked here to prevent drift.

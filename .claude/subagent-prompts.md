# Subagent prompt cache

## DESIGN-BRIEF-v1 (paste VERBATIM into every UI-touching dispatch; orchestrator taste, binding)
```
MATCHDAY DESIGN BRIEF (binding; deviations need orchestrator sign-off):
- Two material worlds, never mixed on one surface: PAPER (draft/landing: team-sheet stock, typed Courier Prime, ink, stamps) and BROADCAST (finals: dark chrome, Archivo, gold). Anton = mastheads ONLY.
- Colors: existing CSS vars only (--pitch/--paper/--ink/--ink-faded/--stamp/--gold/--broadcast-bg/--broadcast-text). No new colors, no new fonts, no new npm deps, no router, no persistent global header.
- Physical verbs for motion: stamp, clip-on, whip-off, flip, flare. ease-out-quart/quint only, no bounce. EVERY animation gets a prefers-reduced-motion fallback. Content visible by default — never opacity:0 in a base state (animate FROM in keyframes only).
- Voice: dry pundit sarcasm; margins over mystery. Engine jargon (efficiency, ceiling, predicate, config) NEVER appears in player-facing copy.
- Hard bans: side-stripe accent borders >1px, gradient text, glassmorphism, identical card grids, uppercase eyebrow above every section.
- Legibility: digits ≥0.8rem, reading text contrast ≥4.5:1, player rows ≤2.8rem tall, sheets fit the viewport (internal scroll only <640px tall).
- Layout budgets enforced: overlays/effects NEVER cover playback/skip controls; canvas card respects the y-budget (verdict ends ≤y1270, footer y1310).
- Result surfaces lead with the nearest miss; verdict is a slam, not a table.
```

Post-UI-wave check (standing): orchestrator runs ONE consolidated browser pass per UI wave against this brief (2-3 screenshots max), fixes dispatched with cached prompts. No separate design-review agents (token rule).


Guardrail: EVERY prompt dispatched to a subagent (Claude Code Agent tool, opencode, any external model) is recorded here verbatim BEFORE/AT dispatch. On retry or re-dispatch, reuse the cached prompt verbatim — never regenerate it. Update `status` after the run; append lessons under the entry instead of rewriting the prompt (rewrites get a new id with a `supersedes:` note).

Entry format:

```
## P-NNN — <short title>
- date: YYYY-MM-DD
- target: <agent type / model>
- status: dispatched | succeeded | failed(<reason>) | superseded-by P-MMM
- task: <one line>
```
followed by the verbatim prompt in a fenced block.

---

## P-001 — opencode CLI orchestration debug
- date: 2026-07-10
- target: Claude Code general-purpose agent, model sonnet, background
- status: succeeded (all 3 models verified; doc written to docs/OPENCODE_ORCHESTRATION.md; root cause = orphaned `&` without redirect/wait, not TTY/auth)
- task: Debug non-interactive `opencode` invocation for Deepseek v4 Flash / Grok 4.5 / GLM 5.2; document in docs/OPENCODE_ORCHESTRATION.md

```
You are debugging how to reliably drive the `opencode` CLI non-interactively from Claude Code's Bash tool, on macOS (zsh), in repo /Users/nivaassudhan/Desktop/code/games/fifaTenZero.

CONTEXT / PRIOR FAILURE: In an earlier session we tried to orchestrate opencode as a subprocess. Background spawns (Bash run_in_background, also `&`-style detached shells) of `opencode` with Deepseek and Kimi models failed SILENTLY — no output, no completion, no error. Running the same prompt manually in the user's own terminal (foreground, interactive) worked. Hypotheses to test: TTY/stdin requirement, output buffering, auth/keychain access from non-interactive shells, wrong model IDs, wrong invocation subcommand.

GOAL: Find working, reproducible, non-interactive one-shot invocations for these three models, and prove each works end-to-end:
1. "Deepseek v4 Flash (Max reasoning)" — free tier, from Opencode Zen provider
2. "Grok 4.5 (high reasoning)" — Opencode Zen provider
3. "GLM 5.2 (high reasoning)" — provider unknown, discover it

The marketing names above may not match CLI model IDs — discover the real IDs.

INVESTIGATION STEPS (adapt as needed):
1. `which opencode && opencode --version`
2. `opencode --help` and help for subcommands (`opencode run --help` is the likely one-shot entry point).
3. List available models/providers: try `opencode models`, `opencode auth list`, inspect config: `~/.config/opencode/`, `~/.local/share/opencode/`, `~/Library/Application Support/opencode/` — look for opencode.json / auth.json / provider configs (DO NOT print API keys or auth token values; redact them; never write keys into any doc).
4. Find the exact model IDs matching the three targets (e.g. something like `opencode-zen/deepseek-...`, `opencode-zen/grok-...`, `.../glm-...`). If a target model genuinely doesn't exist in the installed catalog, say so and find the closest available id.
5. Test one-shot runs with a TRIVIAL prompt to avoid burning tokens/money, e.g.:
   `opencode run --model <provider/model> "Reply with exactly: OK-<modelname>"`
   Try variations to defeat the silent-failure mode:
   - foreground with a hard timeout (use `timeout` via `gtimeout` if present, or Bash tool's timeout param — keep each attempt under 120s)
   - stdin closed: append `< /dev/null`
   - output to file: `> /tmp/oc-test.log 2>&1` then read the file
   - non-interactive/print flags if they exist (look for `--print-logs`, `--format`, `-q`, `--no-tui` or similar in help)
6. Figure out how reasoning effort ("Max", "high") is specified — check help/config for `--reasoning`, model id variants (e.g. `-high` suffixes), or per-model config in opencode.json. Document what's actually supported; if reasoning effort cannot be set via CLI, document that clearly.
7. Diagnose WHY background spawns failed: once you have a working foreground invocation, test it via a detached/background pattern (e.g. `nohup ... > log 2>&1 &` then poll the log). Document whether background works with stdin closed + output redirected, or whether opencode hard-requires a TTY.

DELIVERABLE: Write /Users/nivaassudhan/Desktop/code/games/fifaTenZero/docs/OPENCODE_ORCHESTRATION.md containing:
- Exact working command for each of the three models (copy-pasteable), with proof snippet of each model's actual reply
- The discovered model catalog relevant to these providers (ids only)
- How to set reasoning effort (or statement that it isn't settable + what the default is)
- Root cause of the earlier silent background failure + the reliable pattern for background execution from Claude Code (redirect to log file, stdin from /dev/null, poll log; or "foreground only" if that's the truth)
- Timeouts/retry advice, and any auth prerequisites (redacted)
- A "recipe for orchestrators" section: exact Bash-tool invocation pattern a Claude Code orchestrator should use to dispatch a task to each model and collect the result

RULES: Keep test prompts trivial (few tokens). Never print or write API keys/tokens — redact. If a model errors (quota/auth), capture the exact error text in the doc. Do not modify anything else in the repo. If `opencode` is not installed or auth is missing entirely, document exactly what the human must do to fix it, and verify as far as you can without credentials.

FINAL REPLY: summarize findings (working commands, root cause, doc path) — the orchestrator will relay this to the user.
```

---

## P-002 — Sprint-1 Task 1 (landing screen)
- date: 2026-07-10
- target: opencode-go/glm-5.2 --variant high
- status: succeeded (TASK1-DONE, 61 tests green)
- task: Implement Task 1 from docs/plans/2026-07-10-sprint-1.md

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch roadmap/sprint-1. Open docs/plans/2026-07-10-sprint-1.md and implement Task 1 (Landing screen) EXACTLY as written — every step in order, code verbatim from the doc. EXCEPTION: skip Step 1 (npm install) — jsdom and @testing-library/react are already installed. Obey the plan's Global Constraints section. Touch ONLY the files in Task 1's Files list. Do NOT run git commit or git add — the orchestrator commits. When appending to src/app/app.css, add the Task 1 block at the end of the file without altering existing rules. Finish by running the full suite (npm test) and print, as your final output: TASK1-DONE followed by the vitest summary lines (Test Files / Tests). If any test fails, print TASK1-FAILED plus the failing output instead.
```

---

## P-003 — Sprint-1 Task 4 (predicate evaluator refactor)
- date: 2026-07-10
- target: opencode/grok-4.5 --variant high
- status: succeeded (TASK4-DONE, 61 tests green; caught plan-doc test-fixture math error — DEF 314 also fails minBucketSum 320 — fixed in new test only)
- task: Implement Task 4 from docs/plans/2026-07-10-sprint-1.md

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch roadmap/sprint-1. Open docs/plans/2026-07-10-sprint-1.md and implement Task 4 (Extract evaluateBandPredicates — behavior-preserving refactor) EXACTLY as written — every step in order, code verbatim from the doc. Also read DECISIONS.md ADR-013 (the contract you are implementing). Obey the plan's Global Constraints section. Touch ONLY: src/domain/types.ts, src/domain/scoring/scoreBand.ts, tests/scoring.test.ts. Do NOT run git commit or git add. HARD GATE: every pre-existing test in tests/scoring.test.ts must pass byte-unchanged — if you find yourself editing an existing test to make it pass, STOP and report failure instead. Finish by running npm test and the purity grep (grep -rn "Math.random\|rng" src/domain/scoring src/domain/commentary — must be empty) and print, as your final output: TASK4-DONE followed by the vitest summary lines. If anything fails, print TASK4-FAILED plus the failing output instead.
```

---

## P-004 — Sprint-1 Task 2 (playback speed hook)
- date: 2026-07-10
- target: opencode/deepseek-v4-flash-free --variant max
- status: succeeded (TASK2-DONE, 70 tests green; compute-once invariant verified — useMemo untouched, hook consumes beat count only)
- task: Implement Task 2 from docs/plans/2026-07-10-sprint-1.md

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch roadmap/sprint-1. Open docs/plans/2026-07-10-sprint-1.md and implement Task 2 (Playback speed — usePlaythrough hook) EXACTLY as written — every step in order, code verbatim from the doc. jsdom and @testing-library/react are already installed. Obey the plan's Global Constraints section. Touch ONLY: src/app/usePlaythrough.ts (create), tests/usePlaythrough.test.tsx (create), src/app/ResultScreen.tsx (modify per the doc's exact replacement instructions), src/app/app.css (append the Task 2 block at the end without altering existing rules). The useMemo in ResultScreen computing band/groups/commentary must remain byte-identical. Do NOT run git commit or git add. Finish by running npm test and print, as your final output: TASK2-DONE followed by the vitest summary lines. If any test fails, print TASK2-FAILED plus the failing output instead.
```

---

## P-005 — Sprint-1 Task 5 (explainScoreBand)
- date: 2026-07-10
- target: opencode/grok-4.5 --variant high
- status: succeeded (TASK5 files green 5/5, purity clean; concurrent T2 test failure observed was not T5's scope)
- task: Implement Task 5 from docs/plans/2026-07-10-sprint-1.md

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch roadmap/sprint-1. Task 4 (evaluateBandPredicates) is already merged. Open docs/plans/2026-07-10-sprint-1.md and implement Task 5 (explainScoreBand) EXACTLY as written — every step in order, code verbatim from the doc. Also read DECISIONS.md ADR-013. Obey the plan's Global Constraints section. Touch ONLY: src/domain/scoring/explainScoreBand.ts (create), tests/explainScoreBand.test.ts (create). NOTE on the plan's second test: verify the fixture math yourself — DEF [80,80,80,74] sums to 314, failing BOTH minBucketSum (320) and minWeakLink (75); the plan's expected failing array already lists both, in evaluator emission order. Do NOT run git commit or git add. Finish by running npm test plus both purity greps from Global Constraints (must be empty) and print, as your final output: TASK5-DONE followed by the vitest summary lines. If anything fails, print TASK5-FAILED plus the failing output instead.
```

---

## P-006 — Sprint-1 Task 6 (sim diagnostics)
- date: 2026-07-10
- target: opencode-go/glm-5.2 --variant high
- status: succeeded (TASK6-DONE, 74 tests green, histogram identical to baseline; one sane deviation — dropped unused computeDiagnostics import that would trip noUnusedLocals)
- task: Implement Task 6 from docs/plans/2026-07-10-sprint-1.md

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch roadmap/sprint-1. Tasks 4 and 5 (evaluateBandPredicates, explainScoreBand) are merged. Open docs/plans/2026-07-10-sprint-1.md and implement Task 6 (Simulator diagnostics) EXACTLY as written — every step in order, code verbatim from the doc. Obey the plan's Global Constraints section. Touch ONLY: scripts/simulate.ts, tests/simulate.test.ts. Predicate logic must never be re-implemented in scripts/ — near-miss goes through explainScoreBand (ADR-013). Do NOT run git commit or git add. After tests pass, also run: npx tsx scripts/simulate.ts --n 500 --seed 42 --bot greedy — the band histogram MUST match the tuned baseline (10-0 ≈ 5.0%, 5-0 ≈ 43.8%, 3-1 ≈ 36.4%, 2-2 ≈ 14.8%); diagnostics must not change results. Print, as your final output: TASK6-DONE, the vitest summary lines, and the histogram lines from that simulate run. If anything fails or the histogram deviates, print TASK6-FAILED plus the output instead.
```

---

## P-007 — Sprint-1 Task 8 (corpus 7→16, content authoring)
- date: 2026-07-10
- target: opencode/grok-4.5 --variant high
- status: succeeded (TASK8-DONE, 80 tests green; justified out-of-scope edit: loadData.test.ts corpus-size assertions 7/77 → 16/176 — forced by corpus growth, plan gap; REVIEW-NOTES in oc-t8-grok.log; ratings/rosters PENDING HUMAN REVIEW)
- task: Implement Task 8 from docs/plans/2026-07-10-sprint-1.md (rosters/ratings flagged for human review)

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch roadmap/sprint-1. Open docs/plans/2026-07-10-sprint-1.md and implement Task 8 (Corpus 7 -> 16) EXACTLY as written. Also read DECISIONS.md ADR-011 (selection criteria, XI rule, id format) and ADR-006 (rating rubric), and tests/fixtures/squad-arg-1986.json (the exact JSON shape). Steps: (1) create tests/corpus.test.ts verbatim from the plan; (2) run it — must fail ONLY on squad count 7 != 16; (3) author the 9 squads listed in the plan's table (hun-1954, eng-1966, ned-1974, ger-1974, arg-1978, ger-1990, bra-1994, ita-2006, fra-2018), each the starting XI of that tournament's final, appended to src/data/squads/squads.json; (4) if a positionRaw key is missing from src/data/position-map.json, ADD the key with the correct bucket — never change existing mappings; (5) rate every player per the ADR-006 rubric; (6) npm test must be fully green. Touch ONLY: src/data/squads/squads.json, src/data/position-map.json (additive keys only), tests/corpus.test.ts. Do NOT run git commit or git add. ACCURACY RULES: use historically correct starting XIs of the finals — if unsure of a lineup detail, choose the most widely documented XI and note the uncertainty; never invent players. Print, as your final output: TASK8-DONE, the vitest summary, then a REVIEW-NOTES section listing per squad: any lineup uncertainties and your 3 highest/lowest rating opinions with one-line rationale — a human will review before merge. If anything fails, print TASK8-FAILED plus output.
```

---

## P-008 — T8 human-review proxy: corpus fact-check pass
- date: 2026-07-10
- target: opencode/grok-4.5 --variant high
- status: succeeded (CORPUS-REVIEW-DONE, 80 green; 7 factual fixes incl. hun-1954 Budai→Tóth; zero rating/bucket changes → no impact on parallel T9 tune)
- task: Verify/fix rosters, spellings, positions of the 16-squad corpus; factual corrections only

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. src/data/squads/squads.json holds 16 squads; the 9 newest (hun-1954, eng-1966, ned-1974, ger-1974, arg-1978, ger-1990, bra-1994, ita-2006, fra-2018) were authored in one pass and need a rigorous second-opinion fact-check; docs/plans/t8-corpus-review-notes.md lists the original author's own uncertainty flags — start there. TASK: verify every squad is the historically correct STARTING XI of that World Cup final (right players, correct name spellings incl. diacritics, plausible positionRaw). Fix FACTUAL errors only: wrong player, misspelling, wrong position. Do NOT redesign ratings; only adjust a rating if it clearly violates the DECISIONS.md ADR-006 rubric (e.g. above the Pele/Maradona 98 ceiling, or a scale-breaking outlier), and log why. Keep player ids stable unless the player himself was wrong. Touch ONLY src/data/squads/squads.json (and src/data/position-map.json additive keys if a corrected position needs one). Do NOT touch src/data/config/thresholds.json — another agent is retuning it in parallel. Do NOT run git commit or git add. Finish with npm test (must be green) and print: CORPUS-REVIEW-DONE, the vitest summary, then a CHANGES section listing every correction made (or 'none') with one-line justification each.
```

---

## P-009 — Sprint-1 Task 9: retune thresholds for 16-squad corpus
- date: 2026-07-10
- target: opencode/grok-4.5 --variant high
- status: succeeded (TASK9-DONE; greedy 5.8/27.2/67/0/0/0, random 0/0/2.4/19/33.4/45.2; near-miss 10-0 = 18.4% — sweet spot; all six acceptance gates met)
- task: Numbers-only thresholds.json retune using T6 diagnostics; fix human playtest problem (stuck in 1-2/2-2)

---

## P-010 — Logic audit + extensive edge-case tests
- date: 2026-07-11
- target: opencode-go/glm-5.2 --variant high
- status: succeeded (AUDIT-DONE; 84 new tests green, 0 functional bugs, 4 LOW defensive findings; 2-GK = design not bug, recommends formation advisory per ADR-017, hard block rejected)
- task: Hunt logical errors (incl. 2-goalkeepers question); new audit test files + report; no src changes

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. Read ARCHITECTURE.md, DECISIONS.md (esp. ADR-003/004/005), and ALL of src/domain/** and src/lib/**. JOB: hunt logical errors via extensive edge-case testing.

WRITE new test files ONLY (do not modify src/ or any existing test): tests/audit-draft.test.ts, tests/audit-scoring.test.ts, tests/audit-commentary.test.ts, tests/audit-loaddata.test.ts. Use SYNTHETIC fixtures built inline (like tests/scoring.test.ts does), never the vendored squads.json. Coverage targets: draft — picking the same player twice across reveals, picking a player not in the current reveal, pick/skip after COMPLETE, 11th-pick completion exactness, roundsPlayed accounting with and without skip, breachLog correctness, rng determinism with fixed seed; scoring — empty XI, single-bucket XI, exact boundary values (actual == required), fallback selection, config with duplicate priorities; commentary — slot resolution ties, missing slots, band with no script; loadData — malformed entries collected (not fail-fast on first), boundary ratings, duplicate ids. EXCLUDE skip re-reveal/exclusion semantics entirely — that behavior is being changed by another agent right now.

RULE: the suite must stay green. Where current behavior is CORRECT, the test locks it in. Where you find a GENUINE BUG, do NOT add a failing test — document it in the report with exact repro, severity, and the test you would add post-fix.

REPORT: write docs/audits/2026-07-11-logic-audit.md — findings table (severity/file:line/repro/proposed fix), plus a REQUIRED section 'The two-goalkeepers question': current design allows any XI composition (11 picks, any positions; scoring punishes via minCounts gates). Analyze bug-vs-design honestly. Options to evaluate: (a) hard block in pick() (draft-level position caps), (b) UI-only warning, (c) formation advisory pre-lock (note: a Formation feature per docs/plans/2026-07-11-formation-choice.md and ADR-017 is planned). Recommend one with rationale grounded in game feel: does blocking bad picks remove meaningful consequence? Any draft-legality change needs an ADR — say so.

Do NOT run git commit or git add. Finish: npm test green (existing + new), purity greps clean. Print AUDIT-DONE, vitest summary, count of new tests, and your top-5 findings one line each.
```

---

## P-011 — Feature 1: skip permanent exclude
- date: 2026-07-11
- target: opencode/grok-4.5 --variant high
- status: succeeded (SKIP-DONE, 85 tests green; degenerate rule: exclude honored while alternatives remain, last-resort re-include on empty pool)
- task: Implement docs/plans/2026-07-11-skip-permanent-exclude.md; ADR-003 amendment

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. Implement the feature planned in docs/plans/2026-07-11-skip-permanent-exclude.md IN FULL. First read docs/plans/2026-07-11-three-features-index.md — especially cross-cutting challenge C1 (degenerate corpus: exclude holds while any non-excluded squad remains; empty pool = last-resort re-reveal + breachLog entry; corpus(1)+skip test REQUIRED). Follow the plan file's tasks/steps; where the plan and current source disagree, trust source and note the deviation. Amend ADR-003 in DECISIONS.md as the plan directs. Allowed files: src/domain/types.ts, src/domain/draft/session.ts, tests/draft.test.ts and/or new test files, DECISIONS.md, ARCHITECTURE.md (only if the plan updates signatures). Do NOT touch scoring, commentary, UI, squads.json, thresholds.json — other agents own those right now. Do NOT run git commit or git add. Finish: npm test green, purity greps clean. Print SKIP-DONE, vitest summary, and one line stating the degenerate-corpus rule as implemented. On failure print SKIP-FAILED + output.
```

---

## P-012 — Corpus 68: 1986-2026, trim + rate
- date: 2026-07-11
- target: opencode/grok-4.5 --variant high
- status: failed(agent stalled after recon: found 2026 research missing → 60 squads; died on out-of-repo permission poke; no files written) → retried as P-012r
- task: Build 68-squad squads.json from squads/*.md research; drop pre-1986; update data tests; NO retune

### P-012r retry addendum (appended to the verbatim P-012 prompt):
```
KNOWN FROM PRIOR RUN: the research files cover 1986-2022 only — 2026 is MISSING. Do not search for 2026 data; build the 60-squad corpus (4x5 + 8x5) now and list the eight 2026 quarterfinalist slots as the documented gap for the human to fill. Set test counts to 60/660. STAY INSIDE THE REPO: never touch paths outside /Users/nivaassudhan/Desktop/code/games/fifaTenZero; do not use todo tools; just read, write the JSON and the two test files, append the ADR-011 note, run npm test, and print the final output.
```
P-012r status: succeeded (CORPUS68-DONE as 60 squads/660 players, 85 tests green; 2026 gap documented; uncertainties: ukr-2006 Rusol, por-2022 Dalot/Cancelo, ned-2022 XI, arg-1990 Dezotti/Caniggia)

---

## P-013 — Retune thresholds for 60-squad corpus
- date: 2026-07-11
- target: opencode/grok-4.5 --variant high
- status: succeeded (TASK9R-DONE; greedy 6.4/31.2/62.4, random 0/0/1.4/18.4/34.8/45.4; near-miss 10-0 = 15.8%; all six gates met)
- task: Reuse of P-009 method verbatim with corpus context updated: "the corpus just grew 16 -> 60 squads (WC 1986-2022); thresholds are stale for it". Same hard rules (numbers-only; only thresholds.json + RISKS log + docs/sim/sim-report.json), same six acceptance gates (greedy 10-0 5-7%, greedy majority 5-0/3-1, random floor spread not collapsed, no dead bands, 10-0 near-miss 10-20% at delta 3, random-p50 reaches 3-1), same finish protocol. Do not touch squads.json or src/app (other agents own them).

---

## P-014 — Matchday UI wave U1: foundation + paper world
- date: 2026-07-11
- target: opencode-go/glm-5.2 --variant high
- status: failed(agent used /tmp for font downloads → permission auto-reject → died before writing any src/app changes) → retried as P-014r with repo-internal download dir
- task: Fonts vendoring, pitch+paper tokens/app.css, StartScreen + DraftScreen redesign per DESIGN.md

### P-014r retry addendum (appended to the verbatim P-014 prompt):
```
PRIOR RUN DIED using /tmp — paths outside the repo are permission-blocked. Do ALL font download/extraction inside the repo: use ./.fontdl/ as the working dir (curl the gwfh zips there, unzip there, copy woff2 into src/assets/fonts/, then rm -rf ./.fontdl). The gwfh API is confirmed working (HTTP 200). Everything else identical.
```
P-014r status: failed(downloads OK but `cd .fontdl && cp ../…` compound tripped sandbox path resolution → copy rejected → died; no app code written). Orchestrator copied fonts into src/assets/fonts/ manually. → retried as P-014r2.
P-014r2 status: succeeded (U1-DONE; 169 tests green; paper world complete — TeamSheet/PlayerRow/StadiumButton components, procedural pitch, stamp/whip/clip-on motion, reduced-motion fallbacks; CTA copy now "Kick off")

---

## P-015 — tsc fix in audit-loaddata test
- date: 2026-07-11
- target: opencode/deepseek-v4-flash-free --variant max
- status: succeeded (FIX-DONE; build green, 169 tests green; RawBundle derived via Parameters<typeof loadGameData>[0], no assertion changes)
- task: tests/audit-loaddata.test.ts AnyObj → RawBundle (Parameters<typeof loadGameData>[0]) so npm run build passes; no assertion changes; single-helper fix preferred. (Audit agent's file passed vitest but broke tsc — orchestrator's commit gate now includes npm run build.)

---

## P-016 — Matchday UI wave U2: broadcast world + progressive live score
- date: 2026-07-11
- target: opencode-go/glm-5.2 --variant high
- status: succeeded (U2-DONE; 188 tests + build green; hook stayed count-only, progress derived from memoized beats; controls never covered; confetti on 10-0)
- task: ResultScreen broadcast redesign per DESIGN.md + docs/plans/2026-07-11-progressive-live-score.md + WebAudio stings

---

## P-017 — Feature 2: formation choice
- date: 2026-07-11
- target: opencode/deepseek-v4-flash-free --variant max
- status: succeeded (FORMATION-DONE; 197 tests + build green; thresholds v2 w/ 4 formations; withFormationMinCounts view keeps scoring two-arg; ResultScreen touched as plan required — call-site resolution; no plan deviations)
- task: Implement docs/plans/2026-07-11-formation-choice.md in full (ADR-017; config-view pattern C2; formation gate C3/C6; Matchday paper styling)

---

## P-018 — Matchday UI wave U3: visual defect fixes (browser-verified)
- date: 2026-07-11
- target: opencode-go/glm-5.2 --variant high
- status: succeeded (U3-DONE; 197 tests + build green; D1 fixed-layer pitch, D2 grid→flex row w/ fixed 1.8rem rating circle, D3 masthead added but shipped opacity:0 — see P-019, D4 landing fits 720p; browser-verified except D3)
- task: Fix 4 defects found by orchestrator driving the live app at 1280x720

---

## P-019 — Masthead opacity:0 anti-pattern fix
- date: 2026-07-11
- target: opencode/deepseek-v4-flash-free --variant max
- status: succeeded (MASTHEAD-FIX-DONE; masthead + stamp + confetti all de-gated to visible-base/from{}-only pattern; browser-verified)
- task: app.css only — masthead base state visible, entrance animates from{} only; audit whole file for opacity:0-base + animation-gated visibility; reduced-motion keeps full visibility

---

## P-020 — Person-identity pick rule (domain, ADR-018)
- date: 2026-07-11
- target: Claude Code Agent tool, general-purpose, model sonnet, background
- status: dispatched
- task: ADR-018; src/domain/draft/person.ts (personKey normalize name / pickedPersonKeys / isPersonTaken); pick() throws on era-duplicate person; simulate.ts bots filter pickable via isPersonTaken (else they crash); tests incl. cross-era block + diacritics collide + sim completes n=200 both bots; report greedy 10-0 drift vs 6.4%. Full prompt in Agent dispatch 2026-07-11 (Claude subagent — user requested sonnet for this pair).

## P-021 — Taken-state UI fix (reveal-only)
- date: 2026-07-11
- target: Claude Code Agent tool, general-purpose, model sonnet, background
- status: succeeded (212 tests + build green; root cause = TeamSheet gave non-newest mine rows state='taken'; new 'owned' state; reveal rows flag id- OR person-taken via domain helper)

---

## P-022 — Scoreboard side inversion fix
- date: 2026-07-11
- target: opencode/deepseek-v4-flash-free --variant max
- status: dispatched
- task: Band first digit = player's goals, but Scoreboard rendered home digits under 'HOME' and away under 'DRAFT XI' → 10-0 win displayed as a loss. Swap labels: ['DRAFT XI','OPPONENTS'], DRAFT XI on home/first digits; fix aria + ResultScreen caller + scoreboard tests only.
- P-022 status: succeeded; P-023 legibility (Deepseek): succeeded, committed.

---

## P-024 — Formation-gate scaling hotfix (ADR-017 amend)
- date: 2026-07-11
- target: opencode/deepseek-v4-flash-free --variant max
- status: dispatched
- task: withFormationMinCounts also scales band minBucketSums by formation.minCounts/reference.minCounts (3-5-2 DEF 320→240); reachability property test all formations × bands; 4-3-3 identity; sim histogram unchanged.

## P-025 — Relative scoring W1: domain (ADR-019) [QUEUED behind P-024 — same scoring dir]
- date: 2026-07-11
- target: Claude Code Agent tool, general-purpose, model sonnet
- status: queued
- task: Per docs/plans/2026-07-11-relative-scoring.md W1 row: revealLog on DraftSession; sessionCeiling.ts DP; ScoreInput v2 (+ceiling); evaluator gains minEfficiency/minBucketEfficiency (integer % points for margins); thresholds v3 + 9-band ladder placeholders; loadData validation; PROJECT/CLAUDE/ARCHITECTURE invariant wording; ceiling-property tests. W2/W3/W4 (P-026/027/028) dispatch after per plan table.
- P-025 status: succeeded (237 tests + build green; gates authored as fractions, loaded as integer %; efficiency compressed: random p50=94, greedy p50=99 — W3 must tune inside that narrow window; committed)

---

## P-026 — Relative scoring W2: commentary v2 (9 bands)
- date: 2026-07-11
- target: opencode/deepseek-v4-flash-free --variant max
- status: dispatched
- task: Replace _placeholder scripts for 7-1/4-1/2-1/1-1 with full house-tone scripts; user tone review after.

## P-027 — Relative scoring W3: efficiency retune
- date: 2026-07-11
- target: opencode/grok-4.5 --variant high → FAILED: workspace $20/mo spend cap reached → rerouted to opencode-go/glm-5.2 --variant max (same prompt verbatim). GROK UNAVAILABLE until billing reset/raise.
- status: succeeded on GLM retry (all six gates: greedy 10-0 6.0%, near-miss 10.8%, per-bucket MID/ATT cascade discriminates compressed efficiency; seed-stable 42/1000/5000; committed)

---

## P-028 — Relative scoring W4: efficiency margins UI
- date: 2026-07-11
- target: opencode-go/glm-5.2 --variant high
- status: dispatched
- task: nearMiss.ts + BandSlam copy → efficiency-points margins ("2 EFFICIENCY POINTS FROM A 5-0" / bucket callout "LEFT N POINTS IN MID"); handle minEfficiency/minBucketEfficiency predicate names; tests updated.
- status: succeeded, committed, pushed (aa0a3e0).

---

## USER FEEDBACK ROUND (2026-07-12) — decisions: formation = keep pre-draft + post-match fit-insight; FULL rename TenNil (orchestrator runs gh repo rename); daily seed + share card together (ADR-014-lite); mock tone = dry pundit sarcasm. Model tiers updated (see memory): Deepseek free/max = menial+planned; Luna high / Sonnet 4.6 = medium; Opus 4.8 / Grok / GLM / Terra medium = hardest sparingly; Fable 5 / Sonnet 5 / Sol BANNED as subagents.

## P-029 — V1 quick wins (skip topline, jargon purge, marginalia)
- date: 2026-07-12
- target: opencode/deepseek-v4-flash-free --variant max
- status: dispatched
- task: Skip button → draft topline; near-miss templates → football voice (dictated copy: 'N SHY OF A {BAND} SQUAD', 'PASSENGER AT {actual}…', structural mocks 'NO KEEPER. BOLD. WRONG.' etc. — structural REPLACES the line); YOUR-XI marginalia after pick 6 for zero-buckets (dry sarcasm, GK>DEF>ATT>MID priority, one note).

## P-030 — V2 TenNil rebrand (pre-repo-rename)
- date: 2026-07-12
- target: opencode/deepseek-v4-flash-free --variant max
- status: dispatched
- task: base '/tennil/', title/masthead/BootError → TenNil, favicon SVG (pitch green, '10–0'), docs headers, package name, full grep sweep excluding historical logs. Orchestrator then: gh repo rename tennil → remote update → push → verify Pages at /tennil/.

## P-031 — V3 formation fit-insight [QUEUED after V1]
- target: Claude Code Agent, sonnet (4.6 tier)
- task: pure detectFormationFit(xi bucket counts vs formations); when fitted ≠ declared, ResultScreen insight line 'YOUR SHAPE WAS {F} — UNDER IT: {BAND}' via re-score (withFormationMinCounts + ceiling recomputed under fitted formation); tests incl. exploit-check (insight never改变 awarded band).

## P-032 — V4a daily seed + ADR-014-lite [QUEUED after V2]
- target: Claude Code Agent, sonnet high
- task: seeded daily mode (date-derived seed via mulberry32 through existing Rng seam), free-play records its random seed; session carries seed + mode; ADR-014-lite in DECISIONS.md; replay determinism test (seed+actions → identical band).

## P-033 — V4b Matchday share card [QUEUED after V4a]
- target: opencode-go/glm-5.2 --variant high
- task: hand-drawn <canvas> team-sheet card (paper texture, XI, band, near-miss line, 'Matchday #N' when daily) → PNG download; navigator.share + X/WhatsApp intents + clipboard; share row on ResultScreen (post-match, no global header per taste ruling).

FEEDBACK-ROUND CLOSEOUT (2026-07-12): P-029/030/031/032/033 all succeeded and committed (b80b456 pushed). Browser-verified: MATCHDAY #32 badge, About + tennil/issues links, daily draft → 2-1 HARD-FOUGHT WIN, X-intent text exact template w/ /tennil/ URL, WhatsApp + download present, fit-insight null-case correct. Stale agent worktree (.claude/worktrees/nifty-murdock) was double-globbing vitest (49 files/567) — removed; true suite 25 files/289 tests. NOTE: agents in Claude-Code worktree isolation can leave worktrees behind — check `git worktree list` when test counts look inflated.
- task: Tune 9 efficiency gates inside the compressed window (random p50=94, greedy p50=99, p90=100); consider enabling minBucketEfficiency if total-efficiency alone can't discriminate; six-gate protocol; RISKS log + sim-report.
- task: PlayerRow mine-variant never renders taken state (bug: YOUR XI shows mangled overlapping Taken graphics); reveal rows disabled when id-taken OR isPersonTaken (call domain helper — zero rules logic in components); clean taken treatment: single strikethrough + small red TAKEN tag right-aligned, leader hidden, no overlap with POS chip/rating circle; RTL tests for both variants.

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. The orchestrator drove the live app (vite dev, 1280x720) and found these VISUAL DEFECTS in the Matchday UI. Read PRODUCT.md + DESIGN.md first (binding spec), then fix all four. Allowed files: src/app/app.css, src/app/TeamSheet.tsx, src/app/PlayerRow.tsx, src/app/DraftScreen.tsx, src/app/StartScreen.tsx only. Do NOT touch ResultScreen/broadcast components, domain, tests (unless a matcher breaks from copy you change — then update that matcher in the same pass).

D1 (P0) PITCH VOID ON SCROLL: the procedural pitch (stripes/markings/vignette) covers only the first viewport; scrolling reveals a flat dark-green band above/below it. Landing page is 1075px tall at 720px viewport so the break is immediately visible. FIX: make the pitch a position: fixed inset-0 background layer (z-index below all content, pointer-events: none) so it fills the viewport regardless of scroll — or body background-attachment: fixed if gradients allow. Verify: no flat band at any scroll position.

D2 (P0) PLAYER ROWS BLOWN UP: on the draft screen each player renders ~90-110px tall: the rating appears as a FULL-WIDTH pill outline (rounded-rectangle border spanning the whole sheet) with the number centered inside it, the name sits on its own line above, and the dotted leader + POS chip float detached at the far right. The sheet overflows the viewport; its masthead is not even visible. Root cause is almost certainly the rating-circle CSS (border-radius + flex-grow/width on the rating element) and row flex wrap. REQUIRED RESULT per DESIGN.md: ONE compact typed line per player, ~2-2.5rem tall: NAME (Courier Prime), dotted leader filling the middle, POS abbrev, then a SMALL inked rating circle (~1.8rem diameter, fixed width/height, tier-colored border + number inside). Eleven rows + masthead must fit comfortably inside the sheet; the reveal sheet must fit the viewport (internal scroll only if viewport < ~640px tall).

D3 (P1) LANDING HIERARCHY: no big Anton masthead visible — only a small gold letter-spaced eyebrow 'WORLD CUP DRAFT-XI'. DESIGN.md requires an Anton masthead (clamp(2rem,6vw,4.5rem)). Make the title unmistakable at first paint.

D4 (P1) LANDING DOES NOT FIT 720p: CTA sits below the fold (~1075px doc height). Compress vertical rhythm (blurb + rules + formation picker + CTA) so the whole landing fits within ~700px height at 1280x720 with the Kick off CTA visible without scrolling. Formation cards may go smaller/tighter (2x2 grid is fine).

MOTION/QUALITY RULES unchanged: ease-out-quart/quint, prefers-reduced-motion fallbacks, content visible by default, contrast >= 4.5:1 for reading text. SHELL DISCIPLINE: never cd; absolute paths only, inside repo. Do NOT run git commit or git add.

FINISH: npm test green AND npm run build green. Print U3-DONE, vitest summary, and per-defect one-line fix descriptions. On failure print U3-FAILED + output.
```

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. Implement the feature planned in docs/plans/2026-07-11-formation-choice.md IN FULL, step by step, exactly as the plan file specifies. Before writing anything, read IN THIS ORDER: (1) the plan file, (2) docs/plans/2026-07-11-three-features-index.md cross-cutting challenges C2/C3/C5/C6 — these are BINDING, (3) DECISIONS.md ADR-004/ADR-013 and the tail (ADR-011 amendments), (4) docs/audits/2026-07-11-logic-audit.md section 'The two-goalkeepers question', (5) PRODUCT.md + DESIGN.md (Matchday paper world — any new formation-picker UI must be paper-world styled: typed Courier Prime options on the team-sheet paper, circled-in-ballpoint selection, NOT generic buttons), (6) current src/app/App.tsx, src/app/StartScreen.tsx, src/domain/scoring/scoreBand.ts, src/domain/loadData.ts, scripts/simulate.ts loadGameDataFromDisk, tests/startScreen.test.tsx + tests/appGate.test.tsx.

NON-NEGOTIABLE RULES FROM THE INDEX:
- C2: scoreBand(input, config) and explainScoreBand(input, config) STAY two-argument. Formation resolves into a ThresholdConfig view ONCE at the call site via a pure helper (withFormationMinCounts or as the plan names it). Do not widen any scoring signature.
- C3: Draft Again returns to a formation-only gate (pre-selects last formation, one click starts), NOT the full landing blurb. First visit = full StartScreen. Landing/formation gate stays UI state — never a DraftSession phase.
- C5: if GameData grows a formations shape, prefer embedding formations INSIDE thresholds.json (it already has referenceFormation + minCounts) unless the plan file explicitly decided otherwise; update every GameData constructor the index lists (main.tsx load path, scripts/simulate.ts loadGameDataFromDisk, tests makeData/fixtures) in the same pass.
- C6: handleStart AND handleRestart gain the formation id; update startScreen/appGate tests for any signature/copy change in the same pass.
- Write ADR-017 into DECISIONS.md as the plan directs, including the audit's verdict: formation advisory is the chosen surface for composition guidance (2-GK stays pickable; scoring + advisory punish it — no hard block).
- The formation advisory (if the plan includes the pre-lock advisory surface) is read-only guidance derived from domain data — zero rules logic in components (R-08).

CONSTRAINTS: this is domain + config + UI work; allowed files are exactly those the plan file lists plus the C5/C6 constructor/test touch-list. Do NOT touch ResultScreen/Scoreboard/Ticker/BandSlam/useAudio/usePlaythrough (broadcast world just landed), thresholds band NUMBERS (retuned yesterday — structure additions like a formations block are fine, gate numbers are not yours), squads.json. SHELL DISCIPLINE: never cd; absolute paths only, inside the repo. Do NOT run git commit or git add. If the plan file contradicts current source, trust source and log the deviation in your final output.

FINISH: npm test green AND npm run build green (both mandatory), purity greps clean (grep -rn \"Math.random|rng\" src/domain/scoring src/domain/commentary; grep -rn \"from 'react'\" src/domain src/lib). Also run: npx tsx scripts/simulate.ts --n 100 --seed 42 --bot greedy — must complete and print a histogram (proves loadGameDataFromDisk survived any GameData change). Print FORMATION-DONE, vitest summary, files touched, chosen formations list, and any plan deviations. On failure print FORMATION-FAILED + the failing output.
```

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. Read PRODUCT.md and DESIGN.md FIRST (binding spec — Broadcast world sections: Components Scoreboard/Ticker/BandSlam, Motion table rows for draft-complete/goal/full-time, Audio section, z-scale). Then read docs/plans/2026-07-11-progressive-live-score.md and docs/plans/2026-07-11-three-features-index.md challenge C4 (commentary goal beats do not equal scoreline goals — proportional fill toward parsed bandId, snap exact on showScoreline). Implement WAVE U2: the broadcast world.

Scope:
1. TRANSITION draft->finals per DESIGN.md Motion: finished team sheet folds/slides to bottom-left as miniature; floodlight sweep; scoreboard drops in; (whistle sting if audio on).
2. SCOREBOARD component: broadcast chrome top center, Archivo tabular digits, HOME vs DRAFT XI, flip-tick per goal progression. Progressive live score EXACTLY per the plan file + C4: score state derived from visibleBeatCount over goal-type beats, proportional fill toward the fixed bandId score, snap to exact H-A when showScoreline. The band/commentary computation stays compute-once in the existing useMemo — the progressive score is pure presentation derived from already-computed data. Never re-derive scoring in a timer.
3. TICKER: beats as broadcast lower-third lines sliding in (minute stamp in gold), replacing the current list rendering. Keep skip-to-result + 1x/2x/4x speed controls working and visible through everything.
4. GOAL MOMENT (full takeover per PRODUCT.md principle 5): screen-edge flash overlay (90ms), scoreboard digit flip, 1.5deg camera shake (240ms), roar swell if audio on. Must NEVER block or cover the skip/speed controls.
5. BANDSLAM full time: band label slam (scale 1.15->1, 250ms ease-out-quint, gold underline); near-miss margin line beneath in Courier typed per-character (use explainScoreBand from src/domain/scoring/explainScoreBand.ts — nextBetter failing predicates give required-actual margins; e.g. '2 POINTS FROM A 5-0'); 10-0 only: gold confetti burst. aria-live polite, no focus trap.
6. AUDIO: WebAudio-synthesized ONLY per DESIGN.md Audio (no binary assets): whistle chirps (kickoff/FT), goal roar (shaped noise swell 600ms). Muted by default; visible toggle in broadcast chrome; per-session React state only (NO localStorage — ADR-010). Create src/app/useAudio.ts hook.
7. MOTION RULES: ease-out-quart/quint only; every animation has prefers-reduced-motion: reduce fallback (crossfade/instant; no shake/flash under reduced motion); content visible by default.

HARD CONSTRAINTS: touch ONLY src/app/ResultScreen.tsx, src/app/usePlaythrough.ts (extend outputs if the plan needs e.g. per-beat indices — keep existing API surface backward compatible), new components under src/app/ (Scoreboard.tsx, Ticker.tsx, BandSlam.tsx, useAudio.ts), src/app/app.css (append a clearly-marked U2 section; do not rewrite existing sections), tests/usePlaythrough.test.tsx and new test files for the score-progression logic (pure function tests for the proportional fill: given beats + bandId, assert monotonic non-decreasing scores snapping exact at end). Do NOT touch DraftScreen/StartScreen/TeamSheet/PlayerRow/StadiumButton, src/domain/**, scripts/**, data JSON. The useMemo computing band/groups/commentary in ResultScreen stays byte-identical in meaning: score+script computed once before timers (you may add explainScoreBand to the same useMemo). SHELL DISCIPLINE: never cd; absolute paths only, inside the repo. Do NOT run git commit or git add.

FINISH: npm test green AND npm run build green (both mandatory), purity greps clean. Print U2-DONE, vitest summary, files touched, and one line stating where the progressive score derives from. On failure print U2-FAILED + output.
```

### P-014r2 retry addendum (replaces item 1 of the verbatim P-014 prompt):
```
FONTS ARE ALREADY IN PLACE at src/assets/fonts/ (courier-prime-400/700.woff2, anton-400.woff2, archivo-400/600/800.woff2) — do NOT download anything; just write the @font-face blocks referencing them (relative url from app.css). SHELL DISCIPLINE: never cd; always use absolute paths inside /Users/nivaassudhan/Desktop/code/games/fifaTenZero; no compound cd-&&-relative-path commands (they trip the sandbox and kill the run). Known unrelated failures owned by another agent: tests/audit-*.test.ts (2 failing + a type error) — ignore those files entirely; your gate is startScreen/appGate/usePlaythrough green + npm run build green for src/app (if the build fails ONLY inside tests/audit-*, state that explicitly). Everything else identical to P-014.
```

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. Read PRODUCT.md and DESIGN.md FIRST — they are the binding design spec (Matchday system). Implement WAVE U1: the foundation and the PAPER world. Scope:

1. FONTS: vendor Courier Prime (400/700), Anton (400), Archivo (400/600/800) as woff2 into src/assets/fonts/ (download from Google Fonts at build/authoring time — e.g. google-webfonts-helper API https://gwfh.mranftl.com/api/fonts/<name>?download=zip&subsets=latin&variants=... — commit the files; runtime must never fetch fonts). @font-face with font-display: swap in app.css.
2. TOKENS + PITCH: rewrite src/app/app.css around the DESIGN.md token block (OKLCH). Body = full-viewport procedural pitch exactly per DESIGN.md Texture spec: mowing stripes + SVG feTurbulence grain overlay + chalk markings SVG (subtle, off-center) + radial vignette. Semantic z-scale per DESIGN.md.
3. STARTSCREEN: night-stadium landing per DESIGN.md/PRODUCT.md — floodlit signage CTA (StadiumButton), masthead in Anton. Keep the onStart prop contract; update tests/startScreen.test.tsx text-matchers if copy changes but keep the 11-rounds/one-skip rules content present in some form.
4. DRAFTSCREEN: rebuild as the TeamSheet paper world per DESIGN.md Components: reveal sheet (paper texture, tilt, masthead country+year in Anton, typed Courier Prime player rows NAME....POS.RATING with inked rating circle tiers) + your-XI sheet (grouped GK/DEF/MID/ATT). PlayerRow states: hover ballpoint underline, picked = red SELECTED stamp punch (120ms) then row appears on your sheet, disabled = typed strikethrough -- TAKEN --. Sheet transitions: whip-off + clip-on per DESIGN.md Motion. Floodlight flare entrance on draft start.
5. MOTION RULES: ease-out-quart/quint only, no bounce; EVERY animation gets a prefers-reduced-motion: reduce fallback (crossfade/instant). Content must be visible by default — never gate visibility on a class-triggered transition.

HARD CONSTRAINTS: touch ONLY src/app/** (App.tsx, StartScreen.tsx, DraftScreen.tsx, app.css, new components under src/app/), src/assets/fonts/**, tests/startScreen.test.tsx and tests/appGate.test.tsx (matcher updates only if copy changed). Do NOT touch ResultScreen.tsx or usePlaythrough.ts (broadcast world = next wave), src/domain/**, scripts/**, data JSON. UI reads session and calls onPick/onSkip only — zero rules logic in components (R-08). Do NOT run git commit or git add. STAY INSIDE THE REPO except the font downloads.

FINISH: npm test green, npm run build green, purity greps clean. Print U1-DONE, vitest summary, list of files touched, and font file sizes. On failure print U1-FAILED + output.
```

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. PRODUCT DIRECTIVE (user, 2026-07-11, supersedes ADR-011 stage sizes): corpus becomes World Cups 1986-2026 only — semifinalists (4) of 1986/1990/1994/1998/2002 + quarterfinalists (8) of 2006/2010/2014/2018/2022/2026 = 68 squads. Research data: squads/*.md (3 files, full member squads gathered from the web). VERIFY the research actually covers all 11 tournaments incl. 2026; if any squad/tournament is missing, list it and proceed with what exists.

BUILD a new src/data/squads/squads.json (version stays 1): every squad trimmed from full roster to its best STARTING XI for that tournament (prefer the actual final/semifinal XI; legal shape: exactly 1 GK, 3-5 DEF, 2-5 MID, 1-4 ATT), squad id <iso3-lowercase>-<year>, player id <squadId>-<lastname> lowercase ASCII, exactly 11 players each. DROP all pre-1986 squads (bra-1970, ita-1982, hun-1954, eng-1966, ned-1974, ger-1974, arg-1978). Existing 1986-2018 squads may be kept/adjusted to match the semifinalist/quarterfinalist XI standard. RATE per DECISIONS.md ADR-006 rubric: 98 ceiling (Maradona 86 tier), icons 90-97, world-class 86-92, established 80-88, role players 76-84; every squad should have a plausible weak link. positionRaw keys must exist in src/data/position-map.json — ADD missing keys additively, never change existing mappings.

UPDATE data-coupled tests only: tests/corpus.test.ts (EXPECTED_SQUAD_COUNT = final count; keep all other invariant assertions) and tests/loadData.test.ts (squad/player count assertions). Do NOT touch thresholds.json (retune is a separate dispatch), scoring/draft/UI code, or other tests. Append a one-paragraph amendment note under ADR-011 in DECISIONS.md recording the user directive (1986-2026 window, 68-squad target, per-stage criteria superseded).

Do NOT run git commit or git add. Finish: npm test green. Print CORPUS68-DONE, vitest summary, per-tournament squad list (year: countries), any research gaps, and top uncertainties for human review. On failure print CORPUS68-FAILED + output.
```

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. Implement Sprint-1 Task 9 from docs/plans/2026-07-10-sprint-1.md: retune src/data/config/thresholds.json for the new 16-squad corpus. HARD RULES: numbers-only edits — never touch engine code, band ids, labels, priorities, predicate structure, or any file except thresholds.json, RISKS_AND_UNKNOWNS.md (append experiment-log entry), and docs/sim/sim-report.json. Do NOT touch src/data/squads/squads.json — another agent is fact-checking it in parallel. Do NOT run git commit or git add.

CRITICAL PLAYTEST SIGNAL from the human owner on the current (7-squad-era) tune: real human drafts on the 16-squad corpus land almost always in 1-2 or 2-2 — the 3-1/5-0/10-0 bands are effectively unreachable for humans. Diagnosis to verify with the diagnostics: the new squads add many 78-84-rated role players, dragging achievable weak-link and bucket sums down, so the old gates (3-1 needs DEF349/WL84) sit above what good-but-imperfect play produces. The band ladder is a difficulty curve, not a wall.

METHOD: use the T6 diagnostics (npx tsx scripts/simulate.ts --n 500 --seed 42 --bot greedy, and --bot random; percentiles + near-miss + seed quartiles). Greedy bot = skilled-play ceiling; random bot = floor; real humans sit between. Set gates from percentiles, iterating until ALL of: (a) greedy 10-0 in 5-7% (if provably unreachable take closest >=4% and document); (b) greedy lands majority of drafts in 5-0/3-1 combined; (c) random bot ~0% in 10-0 and <=5% in 5-0, with its mass spread across 3-1/2-2/1-2 — NOT collapsed into 1-2; (d) no dead bands (every band >=1% in at least one bot's histogram); (e) near-miss rate for 10-0 at delta 3 lands in 10-20% (the 'one more draft' sweet spot per ROADMAP.md section 3.2 — 0% reads unreachable, >30% reads coin-flip); (f) the 2-2 -> 3-1 boundary must be generous enough that mid-quality XIs (random-bot p50 sums) reach 3-1 — that is where the human playtest complaint lives.

FINISH: write final docs/sim/sim-report.json via --report on the last greedy run; append the RISKS_AND_UNKNOWNS.md experiment-log entry per the plan's template (include the human-playtest motivation); npm test must be green. Print as final output: TASK9-DONE, both final histograms (greedy + random), near-miss lines, the final gate numbers per band, and one paragraph explaining the tuning rationale.
```

## P-038 — Wave G: attr digit labels + GK display attrs (UI-only)
- date: 2026-07-13
- target: opencode/deepseek-v4-flash-free --variant max
- status: dispatched
- task: Per-digit PAC/STR/ACC (outfield) + REF/HAN/DIS (GK, display-only derived) labels on PlayerRow; new pure src/app/attrDisplay.ts; no domain touch. Full spec in docs/plans/2026-07-12-attrs-v2-plan.md Wave G. DESIGN-BRIEF-v1 embedded.

## P-039 — Rules glossary: attr abbreviation full-forms [QUEUED after P-038 Wave G commits]
- date: 2026-07-13
- target: opencode/deepseek-v4-flash-free --variant max
- status: queued (fire AFTER Wave G commits — avoid concurrent-commit index.lock race)
- task: Add attr abbreviation glossary to Rules Programme 'Your target' page (src/app/rulesCopy.ts only). Dictated copy, dry-pundit voice:
  "Every player carries three marks. Outfield: PAC pace, STR strength, ACC accuracy. Keepers read differently — REF reflexes, HAN handling, DIS distribution. The dominant mark sits in bold ink. Today's opponent prizes one of them — draft to match."
  Append as a new short paragraph on the existing 'Your target' page (keep the page's existing formation paragraph). Update tests/rulesProgramme.test.tsx: assert the glossary text (PAC/STR/ACC + REF/HAN/DIS full forms) renders; keep jargon-ban test green. Touch ONLY src/app/rulesCopy.ts + tests/rulesProgramme.test.tsx. npm test + build green; commit terse on v2/attrs; no push.

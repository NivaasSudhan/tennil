# Subagent prompt cache

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

```
You are in /Users/nivaassudhan/Desktop/code/games/fifaTenZero on branch main. Implement Sprint-1 Task 9 from docs/plans/2026-07-10-sprint-1.md: retune src/data/config/thresholds.json for the new 16-squad corpus. HARD RULES: numbers-only edits — never touch engine code, band ids, labels, priorities, predicate structure, or any file except thresholds.json, RISKS_AND_UNKNOWNS.md (append experiment-log entry), and docs/sim/sim-report.json. Do NOT touch src/data/squads/squads.json — another agent is fact-checking it in parallel. Do NOT run git commit or git add.

CRITICAL PLAYTEST SIGNAL from the human owner on the current (7-squad-era) tune: real human drafts on the 16-squad corpus land almost always in 1-2 or 2-2 — the 3-1/5-0/10-0 bands are effectively unreachable for humans. Diagnosis to verify with the diagnostics: the new squads add many 78-84-rated role players, dragging achievable weak-link and bucket sums down, so the old gates (3-1 needs DEF349/WL84) sit above what good-but-imperfect play produces. The band ladder is a difficulty curve, not a wall.

METHOD: use the T6 diagnostics (npx tsx scripts/simulate.ts --n 500 --seed 42 --bot greedy, and --bot random; percentiles + near-miss + seed quartiles). Greedy bot = skilled-play ceiling; random bot = floor; real humans sit between. Set gates from percentiles, iterating until ALL of: (a) greedy 10-0 in 5-7% (if provably unreachable take closest >=4% and document); (b) greedy lands majority of drafts in 5-0/3-1 combined; (c) random bot ~0% in 10-0 and <=5% in 5-0, with its mass spread across 3-1/2-2/1-2 — NOT collapsed into 1-2; (d) no dead bands (every band >=1% in at least one bot's histogram); (e) near-miss rate for 10-0 at delta 3 lands in 10-20% (the 'one more draft' sweet spot per ROADMAP.md section 3.2 — 0% reads unreachable, >30% reads coin-flip); (f) the 2-2 -> 3-1 boundary must be generous enough that mid-quality XIs (random-bot p50 sums) reach 3-1 — that is where the human playtest complaint lives.

FINISH: write final docs/sim/sim-report.json via --report on the last greedy run; append the RISKS_AND_UNKNOWNS.md experiment-log entry per the plan's template (include the human-playtest motivation); npm test must be green. Print as final output: TASK9-DONE, both final histograms (greedy + random), near-miss lines, the final gate numbers per band, and one paragraph explaining the tuning rationale.
```

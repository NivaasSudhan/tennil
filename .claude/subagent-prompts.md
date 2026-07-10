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

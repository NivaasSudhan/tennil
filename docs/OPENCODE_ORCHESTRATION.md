# Orchestrating `opencode` non-interactively from Claude Code

Environment: macOS (zsh), `opencode` 1.17.17 installed at `/opt/homebrew/bin/opencode`.
Investigated 2026-07-10.

## TL;DR — working commands

```bash
# 1. Deepseek V4 Flash, Max reasoning, free tier
opencode run --model opencode/deepseek-v4-flash-free --variant max \
  "Reply with exactly: OK-deepseek" < /dev/null

# 2. Grok 4.5, high reasoning
opencode run --model opencode/grok-4.5 --variant high \
  "Reply with exactly: OK-grok" < /dev/null

# 3. GLM 5.2, high reasoning
opencode run --model opencode/glm-5.2 --variant high \
  "Reply with exactly: OK-glm" < /dev/null
```

All three ran foreground, non-interactively, with stdin closed, and returned exit code 0.

Proof (captured stdout, log banner + reply):

```
> build · deepseek-v4-flash-free
OK-deepseek

> build · grok-4.5
OK-grok

> build · glm-5.2
OK-glm
```

## Model catalog — discovered IDs

Provider prefix `opencode/` = **OpenCode Zen** (`https://opencode.ai/zen/v1`), the provider all three
target models live under. `opencode-go/` is a separate provider (Zen's "Go" tier) — none of the three
targets are exclusive to it; GLM 5.2 is available on **both** `opencode/glm-5.2` and `opencode-go/glm-5.2`,
but Zen (`opencode/`) is the one matching "Opencode Zen provider" in the request.

Relevant subset of `opencode models` output:

```
opencode/deepseek-v4-flash
opencode/deepseek-v4-flash-free      <- target 1 (free tier)
opencode/deepseek-v4-pro
opencode/glm-5
opencode/glm-5.1
opencode/glm-5.2                     <- target 3
opencode/grok-4.5                    <- target 2
opencode/grok-build-0.1
opencode-go/glm-5.2                  (alt provider, not used here)
```

Marketing names → CLI IDs:

| Marketing name | CLI model ID | Provider |
|---|---|---|
| Deepseek v4 Flash (Max reasoning) | `deepseek-v4-flash-free` | `opencode` (Zen) |
| Grok 4.5 (high reasoning) | `grok-4.5` | `opencode` (Zen) |
| GLM 5.2 (high reasoning) | `glm-5.2` | `opencode` (Zen) — provider was ambiguous in the request; confirmed via `opencode models` and the Zen model-metadata cache |

Full catalog: `opencode models` (no args) lists every provider/model pair currently configured
(providers: `opencode`, `opencode-go`, `ollama`; plus any credentialed provider in `~/.local/share/opencode/auth.json`).

## Setting reasoning effort

`opencode run` has a dedicated flag: `--variant <name>` — "model variant (provider-specific reasoning
effort, e.g. high, max, minimal)". It is **not** a model-ID suffix; it's a separate CLI parameter sent
with the request.

Each model's supported variant values live in Zen's model metadata (cached locally at
`~/.cache/opencode/models.json`, provider key `opencode` → `models.<id>.reasoning_options`). Confirmed by
direct inspection:

| Model | `reasoning_options` | Effort value used |
|---|---|---|
| `grok-4.5` | `effort`: `["low", "medium", "high"]` | `high` |
| `deepseek-v4-flash-free` | `toggle` + `effort`: `["high", "max"]` | `max` |
| `glm-5.2` | `effort`: `["high", "max"]` | `high` |

So: "Max reasoning" for Deepseek Flash maps to `--variant max` (its ceiling), and "high reasoning" for
Grok 4.5 / GLM 5.2 maps to `--variant high` (Grok's ceiling is `high`; GLM's ceiling is `max`, so if the
user ever wants GLM's absolute max, use `--variant max` — the request said "high" so that's what's used
above).

If `--variant` is omitted, the provider's default effort for that model is used (not independently
overridable via any other flag — no `--reasoning` flag exists in this opencode build; `--thinking` only
toggles whether thinking blocks are *displayed*, not how much reasoning is spent).

## Root cause of the earlier silent background failure — reproduced

Reproduced the exact failure mode. Running an unredirected, unwaited background job from a Bash-tool
shell call:

```bash
opencode run --model opencode/deepseek-v4-flash-free --variant max "..." &
echo "spawned $!, returning immediately"
```

returns immediately with only the `echo`, and control returns to the orchestrator before the child
process has produced any output. The Bash tool has no way to attribute anything the child writes to its
inherited stdout/stderr *after* the invoking shell has exited — there is nothing polling or waiting for
it, and nothing captured it into a file. From the orchestrator's point of view this is indistinguishable
from a hang: no stdout, no stderr, no exit code, no error, ever. (Confirmed: the process itself keeps
running and does complete on its own ~8-13s later — it is not stuck on a TTY read, an auth prompt, or a
model bug. It is purely a "nobody was listening" problem.)

This is **not** a TTY requirement, not an auth/keychain requirement, and not a wrong-model-ID problem —
those all produce either a working reply or a visible, non-empty error (see below) as long as
stdout/stderr are captured. It is specifically: *backgrounding without redirecting output to a file (and
without a wait/poll step) discards the result*.

### The reliable pattern

Two patterns were tested and both work end-to-end:

**A. Claude Code Bash tool's native `run_in_background: true`** (preferred from Claude Code):
```bash
opencode run --model opencode/glm-5.2 --variant high "..." \
  < /dev/null > /path/to/oc-glm.log 2>&1
```
Called with `run_in_background: true`. Completed with exit code 0; log file contained the full banner +
reply. No polling needed — the harness sends a completion notification.

**B. Manual detached shell (`&` + `disown`) + poll loop**, for parity with a plain zsh session:
```bash
opencode run --model opencode/deepseek-v4-flash-free --variant max "..." \
  < /dev/null > /path/to/oc-deepseek.log 2>&1 &
disown
# later:
until ! ps -p <pid> > /dev/null 2>&1; do sleep 1; done
cat /path/to/oc-deepseek.log
```
Also completed successfully; log file had the full reply.

The load-bearing parts of both patterns are:
1. `< /dev/null` — closes stdin defensively (not strictly required in testing here, since the process
   completed fine either way, but cheap insurance against any future interactive prompt hanging the job).
2. `> file 2>&1` — captures stdout **and** stderr to a real file so results survive after the invoking
   shell returns.
3. Something that actually waits for/polls that file or the process — a Bash-tool `run_in_background`
   notification, or an explicit poll loop. Backgrounding without any of these three is what silently
   swallowed the earlier attempts.

## Auth prerequisites

`opencode providers list` shows two configured credential entries:

```
Credentials ~/.local/share/opencode/auth.json
● OpenCode Zen   api
● OpenCode Go    api
```

Both are `type: api` (a stored API key), not OAuth — confirmed by inspecting the structure of
`~/.local/share/opencode/auth.json` (keys/types only; values not printed here). This is why non-interactive,
headless invocation works at all: there is no browser/keychain OAuth dance to complete per-call. If a
fresh machine has no credentials, the human must run `opencode providers login` (or `opencode auth login`)
interactively once; after that, background/non-interactive calls need no further auth step.

The resolved Zen provider config itself uses a public placeholder for the base request (`"apiKey": "public"`
in `opencode debug config` — the OpenAI-compatible endpoint at `https://opencode.ai/zen/v1`), with the real
credential injected from `auth.json` at request time. No key material is reproduced in this document.

## Error handling — exact text captured

Using a bad/marketing-style model string surfaces a clean, non-empty error (not a silent hang), as long
as output is captured to a file per the pattern above:

```
Error: {
  "name": "UnknownError",
  "data": {
    "message": "Unexpected server error. Check server logs for details.",
    "ref": "err_26543d7e"
  }
}
```
(exit code 1). A `Provider not found: <id>` error appears instead if the provider prefix itself is wrong
(e.g. `opencode models opencode/grok-4.5` used as a lookup, rather than `run`, since `models <provider>`
expects a bare provider id, not `provider/model`).

## Output formats

`opencode run` supports `--format json` for machine-parseable streamed events (`step_start`, `text`,
`step_finish`, with token/cost accounting) instead of the default human-formatted banner + reply. Useful
for an orchestrator that wants to parse the reply programmatically rather than scrape banner text:

```bash
opencode run --model opencode/deepseek-v4-flash-free --variant max --format json \
  "..." < /dev/null
```
Confirmed working; final `text` part's `part.text` field carries the model's actual reply.

## Timeouts / retry advice

- Each of the three trivial test prompts completed in roughly 3-13 seconds. Budget at least 60-120s per
  call for real (non-trivial) prompts before considering it hung, especially for `max`/`high` reasoning
  variants which spend extra hidden reasoning tokens (visible in `--format json`'s
  `step_finish.part.tokens.reasoning`).
- Wrap foreground calls in the Bash tool's own `timeout` parameter (or `/usr/bin/timeout` if present —
  note macOS ships no `timeout` by default; Homebrew's `coreutils` provides `gtimeout`. Neither was needed
  in testing here because the Bash tool's own timeout param sufficed).
- On `UnknownError` / "Unexpected server error", retry once — it's plausibly transient upstream — but if
  it repeats, verify the model ID against `opencode models` rather than retrying blindly (a bad ID can also
  surface this generic error rather than a specific "not found").

## Recipe for orchestrators (exact Bash-tool pattern)

For each model, dispatch like this from Claude Code's Bash tool:

```bash
LOG=/path/to/scratchpad/oc-<task>.log
opencode run --model opencode/<model-id> --variant <effort> "<prompt>" \
  < /dev/null > "$LOG" 2>&1
```
Call with `run_in_background: true` on the Bash tool. Wait for the completion notification, then `Read`
the `$LOG` file. Extract the reply as everything after the `> build · <model>` banner line (or use
`--format json` and parse the last `"type":"text"` event's `part.text` for a clean programmatic result).

Concrete per-model invocations to hand to the Bash tool (swap `<prompt>` and `<log-path>`):

```bash
# Deepseek V4 Flash, Max reasoning, free
opencode run --model opencode/deepseek-v4-flash-free --variant max "<prompt>" < /dev/null > <log> 2>&1

# Grok 4.5, high reasoning
opencode run --model opencode/grok-4.5 --variant high "<prompt>" < /dev/null > <log> 2>&1

# GLM 5.2, high reasoning
opencode run --model opencode/glm-5.2 --variant high "<prompt>" < /dev/null > <log> 2>&1
```

Do not use bare `&` without redirection and without `run_in_background: true` (or an explicit poll) — that
is the exact pattern that produced the earlier silent failures.

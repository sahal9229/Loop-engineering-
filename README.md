# Loop Engineering Demo

An automated **build → review → iterate** pipeline that pairs two AI CLIs in a loop:

- **Claude Code** (`claude`) acts as the **builder** — it reads a free-form prompt and builds (or revises) a real project.
- **Antigravity** (`agy`) acts as the **reviewer** — it checks the actual result against the prompt and issues a verdict.

The loop repeats until Antigravity approves the output or the iteration cap is hit. A human presenter can pause, intervene, extend, or abort at any point.

## How it works

```
┌────────────────────────────────────────────────────────┐
│                     build-loop.sh                      │
│                                                        │
│  prompt.md ──► [Claude Code: build into output/]       │
│                        │                               │
│                        ▼                               │
│              [Antigravity: review output/              │
│               against prompt.md]                       │
│                        │                               │
│         ┌── APPROVED ──┴── CHANGES_SUGGESTED ──┐       │
│         ▼                                      ▼       │
│       done ✅                       next iteration 🔁   │
│                                                        │
│  state.md = shared memory both agents read & append to │
└────────────────────────────────────────────────────────┘
```

Each iteration:

1. **Build** — Claude Code reads [prompt.md](prompt.md) (what to build) and [state.md](state.md) (history and prior review feedback), then creates or revises the project inside [output/](output/). It's encouraged to write and run its own sanity checks before finishing, and it appends a builder's note to `state.md`.
2. **Review** — Antigravity reviews everything in `output/` against `prompt.md`, actually running the result where practical, appends its findings to `state.md`, and must end its reply with exactly one word on the last line: `APPROVED` or `CHANGES_SUGGESTED`.
3. **Decide** — the script parses only that strict last line (so a stray "approved" in prose can never end the loop). Approval stops the loop; anything else — including an ambiguous reply — triggers another iteration, with a human checkpoint in between.

## Files

| File | Role |
|---|---|
| [build-loop.sh](build-loop.sh) | The pipeline script — orchestrates the build/review loop. |
| [prompt.md](prompt.md) | **You edit this.** Plain-English description of what to build (currently: a Snake game). |
| [state.md](state.md) | Persistent shared memory. Both agents read it for context and append their notes each iteration. |
| [output/](output/) | Where the built project lives. Currently contains the approved result: [output/index.html](output/index.html). |

## Usage

```bash
./build-loop.sh                       # default cap of 5 iterations, pauses at checkpoints
./build-loop.sh 3                     # cap of 3 instead
AUTO_CONTINUE=1 ./build-loop.sh       # no pauses, run straight through
CALL_TIMEOUT_SECS=240 ./build-loop.sh # longer per-call timeout (default 180s)
```

To build something new, replace the description in `prompt.md` with whatever you want built — any project, any language, free text. Nothing else needs to change; the script only ever reads `prompt.md` and writes to `output/` and `state.md`.

### Prerequisites

- `bash` (on Windows: Git Bash works)
- The `claude` CLI (Claude Code), authenticated — the builder runs with `--model claude-sonnet-5`
- The `agy` CLI (Antigravity), authenticated
- Optional: GNU `timeout` for per-call timeouts (on macOS: `brew install coreutils` for `gtimeout`; the script degrades gracefully without it)

## Robustness features

- **Hard iteration cap with live extension** — when the cap is hit, you're offered the chance to add more iterations instead of losing progress.
- **Human checkpoints** — after every unfinished round you can continue (Enter), abort (`a`), or pause and manually edit `output/` / `state.md` yourself (`i`). Set `AUTO_CONTINUE=1` to skip all pauses.
- **Per-call timeout** — a network or API hang can't stall the loop (default 180 s per CLI call).
- **Exit-code checking** — a failed or timed-out tool call is reported as an infrastructure failure, never mistaken for a bad answer or a review verdict.
- **Strict verdict parsing** — only the last non-blank line of Antigravity's reply counts, and an ambiguous reply is treated as `CHANGES_SUGGESTED`, never auto-approved.
- **Heartbeat ticker** — a lightweight "still working (Ns elapsed)" ping every 10 s so a slow-but-alive call doesn't look frozen. Only the trivial ticker is backgrounded; the actual CLI calls always run in the foreground (backgrounding them broke on Windows/Git Bash).
- **Ctrl+C safe** — interrupting prints where progress lives (`state.md` and `output/`) and exits cleanly.

## The honest trade-off

This kit's companion script, `loop.sh` (not included in this directory), uses a **fixed toy task with a deterministic test suite** — correctness there is decided by running code, not by a model's opinion.

`build-loop.sh` is fully generic — any prompt, any project — but that means there is **no way to auto-generate deterministic tests** for an arbitrary free-form task. The only gate is Antigravity's judgment, which is a weaker guarantee. Mitigation: if your task is testable, ask Claude *in the prompt itself* to write and run its own tests before finishing (it has Bash access). That helps, but it's still Claude grading its own homework, not an independent gate.

## Current demo result

The current `prompt.md` asks for a modern **Snake game** as a single self-contained HTML file (vanilla JS, canvas rendering, dark theme, Web Audio sound effects, no dependencies). The loop produced [output/index.html](output/index.html), which Antigravity **approved** — see the full build/review trail in [state.md](state.md). Features include:

- Arrow-key controls with 180°-reversal prevention, plus touch-swipe support on mobile
- Fixed-timestep game loop with interpolated rendering for smooth motion
- Score + session-only high score, Start / Pause (Space) / Game Over screens
- Synthesized eat and game-over sounds via the Web Audio API (no audio files)

Open `output/index.html` directly in any browser to play.

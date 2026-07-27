#!/usr/bin/env bash
#
# build-loop.sh — a fully generic "loop engineering" pipeline.
#
# You write what you want built in prompt.md (any project, any language,
# free text — no fixed task, no pre-written stub). Claude Code reads it and
# builds/iterates on the actual project inside output/. Antigravity reviews
# the real result against prompt.md. Repeats until Antigravity approves or
# the iteration cap is hit.
#
# THE REAL TRADE-OFF, worth saying out loud to students: loop.sh (the other
# script in this kit) has a fixed toy task with a deterministic test suite
# as an objective gate — correctness is decided by running code, not by a
# model's opinion. This script has NO fixed task, so there's no way to
# auto-generate deterministic tests for an arbitrary free-form prompt. That
# means the ONLY gate here is Antigravity's judgment. It's fully generic,
# but it's a weaker guarantee than loop.sh's version. If a task in prompt.md
# lends itself to testing, ask Claude in the prompt itself to write and run
# its own tests before finishing (it has Bash access here) — that's better
# than nothing, but it's still Claude grading its own homework, not an
# independent gate.
#
# HUMAN INTERVENTION / ROBUSTNESS: same design as loop.sh — hard iteration
# cap with live extension when hit, a checkpoint after every unfinished
# round (continue / abort / intervene manually), per-call timeout so a
# network hang can't stall things, exit-code checking so a failed tool call
# is never confused with a bad answer, and strict last-line verdict parsing
# so Antigravity can't accidentally "approve" via a stray word in its prose.
#
# PROJECTS DON'T MIX: each run gets its own folder under output/, named
# automatically from the first line of prompt.md (e.g. output/build-a-
# simple-to-do-list/). Re-running with the SAME prompt.md reuses that same
# folder, so revising across iterations still works. Change prompt.md to a
# different task and it gets a fresh folder automatically -- old projects
# are never touched or overwritten. Override the name explicitly with:
#   PROJECT_NAME=my-project ./build-loop.sh
#
# Usage:
#   ./build-loop.sh                        # default cap of 5, pauses for you
#   ./build-loop.sh 3                      # cap of 3 instead
#   AUTO_CONTINUE=1 ./build-loop.sh         # no pauses, run straight through
#   CALL_TIMEOUT_SECS=280 ./build-loop.sh   # longer timeout (building > fixing)
#   PROJECT_NAME=snake-game ./build-loop.sh # explicit folder name

set -uo pipefail
cd "$(dirname "$0")"

MAX_ITERS="${1:-5}"
CALL_TIMEOUT_SECS="${CALL_TIMEOUT_SECS:-280}"
PROMPT_FILE="prompt.md"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

if [ ! -f "$PROMPT_FILE" ]; then
  bold "ERROR: $PROMPT_FILE not found."
  echo "Write what you want built in $PROMPT_FILE (free text: what to build, language, requirements), then re-run."
  exit 1
fi

# Derive a short, filesystem-safe project name from prompt.md's first real
# line of content (the line right after the "---" separator in the
# template), so each distinct task automatically lands in its own folder.
PROJECT_NAME="${PROJECT_NAME:-}"
if [ -z "$PROJECT_NAME" ]; then
  FIRST_LINE=$(awk '/^---$/{found=1; next} found && NF {print; exit}' "$PROMPT_FILE" 2>/dev/null)
  PROJECT_NAME=$(printf '%s\n' "$FIRST_LINE" \
    | tr '[:upper:]' '[:lower:]' \
    | awk '{n=(NF<6)?NF:6; s=""; for(i=1;i<=n;i++){s=s $i; if(i<n) s=s" "}; print s}' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
fi
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME="project-$(date +%Y%m%d-%H%M%S)"
fi

OUTPUT_DIR="output/$PROJECT_NAME"
STATE_FILE="$OUTPUT_DIR/state.md"

mkdir -p "$OUTPUT_DIR"

if [ ! -f "$STATE_FILE" ]; then
  cat > "$STATE_FILE" <<EOF
# Loop State Log (persistent memory) — project: $PROJECT_NAME

This file is THIS PROJECT's own memory, isolated from any other project
under output/. Claude (builder) and Antigravity (reviewer) both read it
for context and append their own notes before finishing.

## Task
See $PROMPT_FILE for what's being built. This loop runs until Antigravity
approves the contents of $OUTPUT_DIR/ or the iteration cap is hit.

## Iteration history
(appended automatically as the loop runs)
EOF
fi

trap 'echo; bold ">>> Interrupted by presenter. Progress so far is in '"$STATE_FILE"' and '"$OUTPUT_DIR"'/."; exit 130' INT TERM

# macOS doesn't ship GNU `timeout` by default. Degrade gracefully.
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
else
  echo "(note: no 'timeout'/'gtimeout' found — per-call timeout is disabled on this machine;"
  echo " on macOS: brew install coreutils to get gtimeout. Ctrl+C still works if a call hangs.)"
fi

run_timed() {
  local secs="$1"; shift
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" "$secs" "$@"
  else
    "$@"
  fi
}

# Returns via exit code: 0 = continue, or exits the whole script (abort).
human_checkpoint() {
  if [ -n "${AUTO_CONTINUE:-}" ] || [ ! -t 0 ]; then
    echo "(auto-continuing — AUTO_CONTINUE set or non-interactive shell)"
    return 0
  fi
  echo
  read -r -p "$1  [Enter=continue / a=abort / i=intervene manually] " choice
  case "$choice" in
    a|A)
      bold ">>> Stopped by presenter after iteration $i. See $STATE_FILE and $OUTPUT_DIR/ for progress so far."
      exit 2
      ;;
    i|I)
      echo "Paused for manual intervention."
      echo "Edit anything in $OUTPUT_DIR/ or $STATE_FILE yourself now."
      read -r -p "Press Enter when you're ready to resume the loop... " _
      return 0
      ;;
    *)
      return 0
      ;;
  esac
}

last_nonblank_line() {
  printf '%s\n' "$1" | grep -v '^[[:space:]]*$' | tail -1 | tr -d '[:space:]'
}

# A lightweight heartbeat: prints a "still working" ping every
# HEARTBEAT_SECS while some other foreground command runs, so a slow (but
# genuinely still working) call doesn't look frozen. This backgrounds ONLY
# a trivial pure-bash sleep loop -- NEVER the actual claude/agy process
# itself. (An earlier version of this script backgrounded the real CLI
# call directly to poll it for liveness, and that broke completely on
# Windows/Git Bash -- the call hung for the full timeout every time,
# because a background-liveness-check like `kill -0 $pid` on a backgrounded
# native Windows process isn't reliable there. claude/agy now always run
# in the foreground exactly as they did in the version that was proven
# to work; only this trivial ticker is backgrounded.)
HEARTBEAT_SECS=10

start_heartbeat() {
  local label="$1"
  (
    local n=0
    while :; do
      sleep "$HEARTBEAT_SECS"
      n=$((n + HEARTBEAT_SECS))
      echo "   ...[$label] still working (${n}s elapsed)"
    done
  ) &
  HEARTBEAT_PID=$!
}

stop_heartbeat() {
  if [ -n "${HEARTBEAT_PID:-}" ]; then
    kill "$HEARTBEAT_PID" 2>/dev/null
    wait "$HEARTBEAT_PID" 2>/dev/null
    HEARTBEAT_PID=""
  fi
}

bold "=== LOOP ENGINEERING DEMO: Claude (build from prompt.md) -> Antigravity (review) ==="
bold "Project: $PROJECT_NAME  ->  $OUTPUT_DIR/"
echo "Prompt: $PROMPT_FILE   Memory: $STATE_FILE"
echo "Cap: $MAX_ITERS iterations (human can extend when it's hit; Ctrl+C to stop anytime)"
echo "Per-call timeout: ${CALL_TIMEOUT_SECS}s   |   Claude model: claude-sonnet-5"
echo

i=1
while :; do
  if [ "$i" -gt "$MAX_ITERS" ]; then
    bold ">>> Reached the iteration cap ($MAX_ITERS) without full sign-off."
    if [ -z "${AUTO_CONTINUE:-}" ] && [ -t 0 ]; then
      read -r -p "Extend the cap? Enter a number of extra iterations, or 0 to stop: " extra
      if [[ "$extra" =~ ^[0-9]+$ ]] && [ "$extra" -gt 0 ]; then
        MAX_ITERS=$((MAX_ITERS + extra))
        bold ">>> Extending — new cap is $MAX_ITERS iterations."
        continue
      fi
    fi
    echo "See $STATE_FILE and $OUTPUT_DIR/ for what got built."
    exit 1
  fi

  bold "########## ITERATION $i / $MAX_ITERS ##########"

  # ---- 1. BUILD: Claude Code, from the free-form prompt -----------------
  bold "--- [Claude Code] building/iterating from $PROMPT_FILE ---"
  start_heartbeat "Claude"
  run_timed "$CALL_TIMEOUT_SECS" claude -p "You are the BUILDER in an automated loop-engineering pipeline.
Read $PROMPT_FILE for what to build -- follow it exactly, including any
language, framework, or format it specifies.
Read $STATE_FILE for history: what you built in prior iterations and any
Antigravity review feedback.
Build (or, if $OUTPUT_DIR/ already has files from a prior iteration, revise)
the project inside the $OUTPUT_DIR/ directory. Create whatever files the
project actually needs. If you're addressing reviewer feedback, make
targeted changes rather than rewriting everything from scratch.
If it's practical for this task, write and run a quick sanity check
yourself (you have Bash access) before finishing, so obvious bugs get
caught before review -- but don't block on this if the task doesn't lend
itself to a quick check.
When done, append a short note to $STATE_FILE under a new
'## Iteration $i - Claude (builder)' heading: what you built or changed, and why." \
    --permission-mode acceptEdits \
    --allowedTools "Read,Write,Edit,Bash" \
    --model claude-sonnet-5
  CLAUDE_EXIT=$?
  stop_heartbeat

  if [ "$CLAUDE_EXIT" -ne 0 ]; then
    if [ "$CLAUDE_EXIT" -eq 124 ]; then
      bold ">>> Claude Code call TIMED OUT after ${CALL_TIMEOUT_SECS}s (network/API hang) — not a bad answer, the call itself didn't finish."
    else
      bold ">>> Claude Code call FAILED (exit $CLAUDE_EXIT) — likely auth/rate-limit/network, not a bad answer."
    fi
    human_checkpoint "Claude call failed on iteration $i."
    i=$((i + 1))
    continue
  fi

  # ---- 2. REVIEW: Antigravity CLI, the only gate in this version --------
  echo
  bold "--- [Antigravity] reviewing $OUTPUT_DIR/ against $PROMPT_FILE ---"
  AGY_LOG=$(mktemp)
  start_heartbeat "Antigravity"
  run_timed "$CALL_TIMEOUT_SECS" agy -p "Review everything in $OUTPUT_DIR/ against the requirements in
$PROMPT_FILE. Actually check whether it does what was asked, not just
whether the code looks clean -- run it yourself if that's practical (you
have shell access). You are the REVIEWER only, not the builder: do NOT
edit, fix, or create any files in $OUTPUT_DIR/ yourself, even if you spot
something trivial to fix -- write it down as feedback instead and let
Claude make the change next iteration. The only file you may write to is
$STATE_FILE, to append your verdict below. Note anything missing, broken,
or that deviates from the prompt -- be specific and concrete (name the
exact element, behavior, or requirement, not a vague quality judgment) so
the builder has a clear, actionable target instead of having to guess.
Append your verdict to $STATE_FILE under a new
'## Iteration $i - Antigravity (reviewer)' heading. Your reply MUST end with
exactly one word alone on the very last line: APPROVED or CHANGES_SUGGESTED.
No punctuation, no other text on that last line." \
    --dangerously-skip-permissions 2>&1 | tee "$AGY_LOG"
  AGY_EXIT=${PIPESTATUS[0]}
  stop_heartbeat
  AGY_OUTPUT=$(cat "$AGY_LOG")
  rm -f "$AGY_LOG"

  if [ "$AGY_EXIT" -ne 0 ]; then
    if [ "$AGY_EXIT" -eq 124 ]; then
      bold ">>> Antigravity call TIMED OUT after ${CALL_TIMEOUT_SECS}s (network/API hang) — not a review verdict, the call itself didn't finish."
    else
      bold ">>> Antigravity call FAILED (exit $AGY_EXIT) — likely auth/rate-limit/network, not a review verdict."
    fi
    human_checkpoint "Antigravity call failed on iteration $i."
    i=$((i + 1))
    continue
  fi

  VERDICT=$(last_nonblank_line "$AGY_OUTPUT")

  if [ "$VERDICT" = "APPROVED" ]; then
    echo
    bold ">>> Loop complete: Antigravity approved. Stopped after $i iteration(s). See $OUTPUT_DIR/ for the result."
    exit 0
  elif [ "$VERDICT" = "CHANGES_SUGGESTED" ]; then
    echo
    echo "Antigravity suggested changes."
    human_checkpoint "Antigravity requested changes on iteration $i."
    i=$((i + 1))
    continue
  else
    echo
    bold ">>> Antigravity's reply didn't end with a clean verdict — treating as CHANGES_SUGGESTED to be safe (never auto-approving on an ambiguous reply)."
    human_checkpoint "Antigravity's verdict on iteration $i was ambiguous."
    i=$((i + 1))
    continue
  fi
done

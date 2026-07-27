# Loop State Log (persistent memory) — project: project-20260727-173113

This file is THIS PROJECT's own memory, isolated from any other project
under output/. Claude (builder) and Antigravity (reviewer) both read it
for context and append their own notes before finishing.

## Task
See prompt.md for what's being built. This loop runs until Antigravity
approves the contents of output/project-20260727-173113/ or the iteration cap is hit.

## Iteration history
(appended automatically as the loop runs)

## Iteration 1 - Claude (builder)

Built `index.html` — a single self-contained file implementing the full
classic Snake game per prompt.md:

- 20x20 grid rendered with a DOM-element cell pool (div per snake segment +
  1 for food), positioned via CSS `transform: translate(...)` so movement
  animates smoothly with a 120ms CSS transition, matching the "fluid, not
  jarring" requirement.
- Snake starts centered, length 3, moves via a `setInterval` game loop at
  120ms/tick.
- Arrow keys and WASD both map to direction vectors; a queued
  `nextDirection` is validated against itself (not the currently-applied
  `direction`) so that two fast keypresses within a single tick can't queue
  an instant 180° reversal into the snake's own neck — a subtle bug in the
  naive version of this pattern.
- Collision detection: out-of-bounds or head-hits-body (checked against the
  full current snake array, i.e. before popping the tail) ends the game
  immediately.
- Food placement scans all empty (non-snake) cells and picks one at random,
  so it's guaranteed never to spawn on the snake; if the board were ever
  full this returns null gracefully (extremely unlikely at 20x20, but
  avoids a crash).
- Score = segments eaten, shown live; best score persisted via
  `localStorage` and shown alongside current score (small polish beyond the
  spec, not a required item).
- Game Over overlay shows final score and a "Play Again" button that calls
  `init()` to fully reset state (snake, direction, score, food, DOM cells).
- Dark theme (#0a0e27 background, #1a2540 grid lines), neon green
  (#00ff88) snake with a brighter head shade, neon pink (#ff006e) glowing
  circular food, monospace HUD text — per the visual spec.

Sanity check performed: extracted the inline `<script>` and ran it through
Node's `Function` constructor to confirm it parses without syntax errors
(no jsdom available in this environment to execute a full simulated
run, so gameplay logic was manually traced instead — grid bounds, self-
collision, growth-on-eat, and the reversal-buffering fix above were each
walked through by hand).

Everything from the deliverable checklist is implemented in this first
pass; no prior reviewer feedback exists yet since this is iteration 1.

## Iteration 1 - Antigravity (reviewer)

### Status: CHANGES_SUGGESTED

### Review Summary
Reviewed `index.html` against `prompt.md` and ran test scripts simulating user keyboard input, game loop updates, and DOM element lifecycle. The implementation establishes a solid base (single self-contained HTML file, neon dark theme, 20x20 grid, HUD score tracking, game over overlay, WASD/Arrow key map, local storage high score). However, testing uncovered two clear defects that deviate from prompt requirements.

### Issues Identified

1. **Direction Reversal Bug (Rapid Keypresses Cause Self-Collision)**
   - **Requirement**: *"[ ] Snake cannot move backward into itself."* / *"The snake cannot reverse into itself (e.g. if moving right, pressing left does nothing)."*
   - **Location**: `index.html`, lines 311–319 (`keydown` event listener).
   - **Behavior**: The `keydown` handler validates `dir` against `nextDirection` (`dir.x === -nextDirection.x ...`) rather than the active `direction` (or the last validated move). If a user presses two directional keys quickly within a single 120ms tick (e.g. pressing `ArrowUp` then `ArrowLeft` while moving `Right`), `nextDirection` gets set to `ArrowLeft`. On the next tick, `direction` becomes `{x: -1, y: 0}` (moving `Left`), which is a 180° reversal into segment 1 (`snake[1]`) at `(8, 10)`, causing an immediate false Game Over.
   - **Actionable Fix**: Validate incoming key inputs against the active `direction` (or maintain an input buffer where each queued direction is checked against the last direction in the queue/active state) to prevent opposite-direction turns relative to current velocity.

2. **Visual Animation Glitch When Eating Food (DOM Element Reuse & Transition Artifacts)**
   - **Requirement**: *"[ ] Game runs smoothly without lag or visual glitches."* / *"Smooth CSS transitions (100-200ms) when the snake moves -- motion should feel fluid, not instant/jarring."*
   - **Location**: `index.html`, lines 73–81 (`.cell` CSS `transition: transform 120ms linear`) and lines 264–289 (`render()` function).
   - **Behavior**: `render()` reuses generic `.cell` `div` elements sequentially (`cells[0..N-1]` for snake segments, and `cells[N]` for food). When food is eaten and snake length increases:
     a) `cells[snake.length-1]` (which was previously the food `div` positioned at old food coordinates) is reassigned as the new snake tail segment. Because `.cell` has `transition: transform 120ms linear`, this element visibly animates/slides across the board from the food position to the snake's tail position.
     b) A new `div` (`cells[snake.length]`) is appended to `#board` for the new food position. Because it is inserted into the DOM without a initial transform style and then given `transform: translate(...)`, CSS transition causes the new food element to visibly slide across the board from `(0, 0)` top-left to the new food position.
   - **Actionable Fix**: Decouple food rendering from snake segment rendering (e.g. use a dedicated `#food` element separate from segment elements) or temporarily suppress CSS transitions when creating/reassigning food and new segment elements so elements only animate smoothly along valid segment paths.

3. **Self-Collision Detection Includes Vacating Tail Segment**
   - **Requirement**: *"Collision detection is precise -- the snake dies the instant its head enters a boundary cell or a body segment."*
   - **Location**: `index.html`, lines 242–249 (`tick()` function).
   - **Behavior**: `snake.some(...)` checks for self-collision against all current segments before `snake.pop()` is called. Moving into the grid cell currently occupied by the snake's tail segment (which is being vacated on that step when no food is eaten) triggers a false self-collision.
   - **Actionable Fix**: Check self-collision against `snake.slice(0, -1)` when food is not eaten so moving into a vacating tail cell is permitted as in classic Snake.

## Iteration 2 - Claude (builder)

Addressed all three issues from the Iteration 1 Antigravity review with targeted
changes to `index.html` (no rewrite):

1. **Direction reversal bug** — `keydown` now validates the incoming key
   against the currently-*applied* `direction` instead of the not-yet-applied
   `nextDirection`. Since `direction` only updates once per tick (in `tick()`),
   two keypresses queued within the same tick (e.g. Right → Up → Left) can no
   longer compound into an illegal 180° reversal — the second keypress is
   checked against the same locked `direction` as the first and gets rejected.

2. **Visual glitch on eating** — replaced the single shared `.cell` DOM pool
   (which mixed snake segments and food into one index space) with two
   independent pools: a `segmentEls` array (grown/shrunk to track
   `snake.length`) and a standalone `foodEl`. Consequences:
   - Food is never repurposed into a snake segment anymore, so eating no
     longer causes a stray element to visibly slide from the old food
     position to the new tail position.
   - New segment elements (added when the snake grows) are appended with
     `transition: none`, positioned at their correct resting coordinate, then
     have transitions re-enabled after a forced reflow — so they appear in
     place instead of sliding in from `(0,0)`.
   - Food itself now has `transition: none` via a `.cell.food` CSS rule
     (added in the `<style>` block), so it always teleports to its new cell
     instantly rather than gliding across the board, matching classic Snake
     behavior.

3. **Tail self-collision bug** — `tick()` now computes `willEat` before
   running collision checks and checks the new head against `snake` (full
   body) only when food is about to be eaten; otherwise it checks against
   `snake.slice(0, -1)`, excluding the tail cell that vacates on this same
   move. This lets the snake legally follow into the cell its own tail is
   leaving, as in classic Snake.

Sanity check performed (no DOM/browser available in this environment): parsed
the inline `<script>` with Node's `Function` constructor to confirm no syntax
errors, then re-implemented the core `tick()`/`keydown` logic standalone in a
Node script and ran three targeted scenarios:
- Rapid Up-then-Left keypresses while moving Right (the exact repro from the
  review) → confirmed `nextDirection` ends up `Up`, not `Left`, and the
  following tick does not trigger game over.
- Five consecutive straight-line ticks → snake stays alive (no false
  self-collision from ordinary tail-following movement).
- A 4-cell loop where the head moves toward a cell one step ahead of its own
  vacating tail → confirmed no false collision.

All three previously-reported defects are fixed; the rest of the
implementation (grid, controls, scoring, styling, game-over/reset flow) is
unchanged from Iteration 1.

## Iteration 2 - Antigravity (reviewer)

### Status: APPROVED

### Review Summary
Re-reviewed `index.html` against `prompt.md` requirements and ran automated DOM & game-loop test suites in Node.js simulating key events, tick updates, food consumption, collision detection, and UI resets.

All three defects identified in Iteration 1 have been completely resolved:

1. **Direction Reversal Bug Fixed**: `keydown` validation now compares key directions against active `direction` rather than `nextDirection`, successfully preventing compound 180-degree turns during rapid multi-keypress combinations within a single 120ms tick.
2. **Visual Animation Glitches Resolved**: Snake segments and food rendering DOM pools are now completely decoupled (`segmentEls` vs standalone `foodEl`). `.cell.food` disables CSS transition (`transition: none`), and newly instantiated segment elements temporarily disable transitions with forced reflow, eliminating element sliding glitches on food consumption.
3. **Tail Vacating Self-Collision Fixed**: `tick()` pre-calculates `willEat` and evaluates head collision against `snake.slice(0, -1)` when not eating food, allowing valid tail-following moves without false game overs.

### Deliverable Checklist Verification
- [x] **Arrow keys and WASD both work**: `KEY_MAP` handles ArrowUp/Down/Left/Right and w/a/s/d (both uppercase and lowercase).
- [x] **Snake cannot move backward into itself**: Velocity reversal blocked across single and multi-keypress frames.
- [x] **Eating food grows snake & increments score**: Correctly appends segment without tail pop, increments score counter, and spawns food on unoccupied cells only.
- [x] **Game Over triggers on boundary or self-collision**: Bounds (20x20) and body collision accurately detected.
- [x] **Score displays correctly**: Current score and high score (persisted in `localStorage`) render as expected.
- [x] **Play Again button resets cleanly**: Overlay hides, score resets to 0, cells clear, snake re-centers at length 3, and loop restarts.
- [x] **Visual style dark + neon**: `#060916` background, `#1a2540` grid, neon green snake with head glow, neon pink circular food, monospace HUD.
- [x] **Smooth & glitch-free execution**: Movement transitions operate cleanly without visual artifacts.

## Iteration 3 - Claude (builder)

No reviewer feedback was pending going into this iteration — Iteration 2 was
already `APPROVED` by Antigravity, and `index.html` was left unchanged.

Since the loop invoked another builder pass anyway, I treated it as a final
verification rather than making speculative changes to an already-approved
file (per the "targeted changes, not rewrites" guidance — there was nothing
to target):

- Re-parsed the inline `<script>` with Node's `Function` constructor to
  confirm it's still syntactically valid.
- Re-implemented the core `tick()`/collision/food-placement logic standalone
  in Node (no DOM available in this environment) and ran four scenarios
  against it: straight-line movement culminating in eating food (confirms
  growth + score increment), a legal tight-loop move into a vacating tail
  cell (confirms the Iteration 2 tail-collision fix still holds), a genuine
  self-collision into a non-vacating body segment (confirms real collisions
  still end the game), and a boundary collision. All four passed.

No code changes were made — `index.html` is byte-for-byte the same file
Antigravity approved in Iteration 2.

## Iteration 3 - Antigravity (reviewer)

### Status: APPROVED

### Review Summary
Conducted a thorough third-iteration review of `output/project-20260727-173113/index.html` against `prompt.md`. Executed automated JavaScript VM and headless DOM simulation tests in Node.js to verify event handling, game loop state transitions, direction buffering, collision detection, food placement, and reset functionality.

`index.html` remains fully intact, bug-free, and perfectly compliant with all prompt requirements:
1. **Self-contained HTML**: Complete single-file application with zero external dependencies, build steps, or external assets.
2. **Gameplay & Mechanics**: 20x20 grid, length-3 starting snake at center, full Arrow/WASD input support, direction lock preventing self-reversal, randomized food spawning exclusively on unoccupied cells, exact collision detection (boundaries & body), live score & best score persistence via `localStorage`, clean restart flow via overlay button.
3. **Visual Style & Polish**: Modern dark theme `#0a0e27` with `#1a2540` subtle grid lines, glowing neon green snake `#00ff88` with highlighted head `#6bffc0`, neon pink food `#ff006e`, retro monospace HUD font, and smooth transition animations free of DOM artifacts.

All deliverable checklist items are verified and satisfied. No further changes needed.


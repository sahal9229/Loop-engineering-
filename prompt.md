Build a Snake game as a single self-contained HTML file (inline CSS and
JavaScript, no frameworks, no build step, no external files or server).

This is a fully playable, classic Snake game — not just a UI mockup.

Gameplay mechanics:
- A grid-based game board (16x16 or 20x20 grid cells on screen).
- The snake starts at the center with a length of 3 segments.
- Arrow keys (or WASD) control the snake's direction: up, down, left, right.
  The snake cannot reverse into itself (e.g. if moving right, pressing left
  does nothing).
- Food appears at a random empty grid cell. When the snake's head reaches
  the food, the snake grows by one segment and the food moves to a new
  random location.
- The game ends when the snake collides with itself or with the boundary
  walls.
- A score counter shows the current length minus 3 (or number of food items
  eaten).
- A "Game Over" message appears when the game ends, with the final score
  and a "Play Again" button that resets the game.

Visual style -- modern dark theme with neon accents:
- Dark background (near-black or very dark gray, e.g. #0a0e27).
- Grid lines visible but subtle (e.g. #1a2540, 1px).
- Snake rendered as connected square segments in a bright neon color
  (e.g. lime green #00ff88 or cyan #00ffff), with each segment clearly
  distinct or with a glow effect for visual appeal.
- Food rendered as a small bright square or circle in a contrasting neon
  color (e.g. hot pink #ff006e or bright orange #ffaa00).
- The head of the snake can be slightly brighter or a different shade
  (optional but nice for clarity).
- Score and "Game Over" text in white or light gray, positioned clearly
  above or below the grid, with a monospace font for a retro feel.
- Smooth CSS transitions (100-200ms) when the snake moves -- motion should
  feel fluid, not instant/jarring.
- Optional: a small glow or shadow around the snake and food for depth.

Controls and accessibility:
- Arrow keys (↑↓←→) move the snake; WASD keys also work as an alternative.
- The game starts automatically (or with a "Start" button; either is fine).
- Keyboard-only control; no mouse clicks needed (except the Play Again
  button after Game Over).

Polish:
- Game loop runs at a reasonable speed (e.g. one snake move per 100-150ms,
  adjustable if you want it faster or slower).
- Collision detection is precise -- the snake dies the instant its head
  enters a boundary cell or a body segment.
- Food never spawns on the snake.
- Keep everything in one index.html file. No external files, no backend.

Deliverable checklist:
- [ ] Arrow keys and WASD both work to control direction.
- [ ] Snake cannot move backward into itself.
- [ ] Eating food grows the snake and increments the score.
- [ ] Game Over triggers on boundary collision or self-collision.
- [ ] Score displays correctly.
- [ ] "Play Again" button resets the game cleanly.
- [ ] Visual style is dark + neon, grid is visible, snake and food stand out.
- [ ] Game runs smoothly without lag or visual glitches.
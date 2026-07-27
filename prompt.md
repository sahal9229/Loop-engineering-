# What to build

Replace everything below with a plain-English description of what you want
built. Be as specific or as loose as you like — Claude will make reasonable
choices for anything you leave unstated, and Antigravity will judge the
result against whatever you wrote here. Nothing else in this kit needs to
change; build-loop.sh only ever reads this file and writes to output/.

---

Build a modern Snake Game as a single self-contained HTML file
(inline CSS and JavaScript, plain vanilla JS — no frameworks, no
libraries, no build step).

Requirements:
- Display the game inside a centered responsive game board.
- Use the arrow keys (↑ ↓ ← →) to control the snake.
- The snake should move smoothly at a consistent speed.
- Randomly generate food on empty cells.
- When the snake eats food:
  - Increase the score by 1.
  - Grow the snake by one segment.
  - Generate new food in a valid empty location.
- The game ends if the snake collides with the wall or with itself.
- Show a "Game Over" screen with the final score and a "Play Again" button.
- Display the current score at the top of the screen.
- Keep track of the highest score during the current session (in memory only; no localStorage).
- Add a Start button before the game begins.
- Include Pause and Resume functionality using the Space key.
- Prevent reversing direction directly (e.g. moving left cannot immediately move right).
- Use smooth animations and a clean modern UI with rounded corners, subtle shadows, and a dark theme with colourful snake and food.
- Make the game responsive so it works well on desktop and mobile browsers.
- Include simple sound effects for eating food and game over using the Web Audio API (no external audio files).
- Keep everything inside a single index.html file with no external assets or dependencies.
- Organize the JavaScript into clear functions with descriptive variable names and comments for readability.
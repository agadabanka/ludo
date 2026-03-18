# Ludo

Classic 4-player Ludo board game with AI opponents. Watch Red (aggressive), Green (balanced), Yellow (defensive), and Blue (random) compete to get their tokens home first.

Built with [ECS Game Factory](https://github.com/agadabanka/game-factory) using the **TypeScript Intermediate Language** pipeline.

## Architecture

```
game.js (TypeScript IL)  →  esbuild-wasm  →  dist/game.bundle.js (standalone)
```

- `game.js` — Game spec using the `@engine` SDK (26KB source)
- `dist/game.bundle.js` — Standalone bundle (~28KB) with zero external dependencies

## Controls

| Key | Action |
|-----|--------|
| S | Toggle speed (1x / 5x) |
| R | Restart |

## Features

- 4 AI players with distinct strategies
- Full Ludo rules: dice rolling, entering on 6, captures, safe spots
- Triple-6 penalty (turn skipped)
- Home column and exact-landing finish
- Move log and per-player scoreboard
- Visual Ludo board with colored corners and center triangles

## AI Strategies

| Player | Color | Strategy |
|--------|-------|----------|
| Red | Red | Aggressive — prioritizes captures |
| Green | Green | Balanced — weighted mix of attack and safety |
| Yellow | Yellow | Defensive — prioritizes safe spots and home column |
| Blue | Blue | Random — chaotic wildcard |

## New @engine Modules Used

- `@engine/ai` — AI decision-making (pickBestMove, pickWeightedMove, compositeEvaluator)
- `@engine/render` — drawToken, drawDice, drawSquare (new non-grid primitives)

/**
 * Ludo — TypeScript IL game spec using @engine SDK.
 *
 * Classic Ludo board game with 4 AI players. Each player has 4 tokens
 * that race around the board. Roll 6 to enter, capture opponents by
 * landing on them, and be first to get all tokens home.
 *
 * AI strategies:
 *   - Red:    Aggressive (prioritize captures)
 *   - Green:  Balanced (weighted mix)
 *   - Yellow: Defensive (prioritize safe spots and advancing)
 *   - Blue:   Random (chaotic wildcard)
 */

import { defineGame } from '@engine/core';
import { pickBestMove, pickWeightedMove, pickRandomMove, compositeEvaluator } from '@engine/ai';
import {
  clearCanvas, drawBorder, drawToken, drawDice, drawSquare,
  drawHUD, drawGameOver,
} from '@engine/render';

// ── Board Constants ─────────────────────────────────────────────────

const BOARD_PX = 520;       // Board pixel size
const CELL = 34;             // Cell size in pixels
const TOKEN_R = 12;          // Token radius
const TRACK_LEN = 52;        // Main track length
const HOME_COL_LEN = 5;     // Home column length
const TOKENS_PER_PLAYER = 4;

// Players
const PLAYERS = [
  { id: 0, name: 'Red',    color: '#E53935', light: '#FFCDD2', entry: 0,  homeEntry: 50, homeBase: { x: 40,  y: 40 } },
  { id: 1, name: 'Green',  color: '#43A047', light: '#C8E6C9', entry: 13, homeEntry: 11, homeBase: { x: 320, y: 40 } },
  { id: 2, name: 'Yellow', color: '#FDD835', light: '#FFF9C4', entry: 26, homeEntry: 24, homeBase: { x: 320, y: 320 } },
  { id: 3, name: 'Blue',   color: '#1E88E5', light: '#BBDEFB', entry: 39, homeEntry: 37, homeBase: { x: 40,  y: 320 } },
];

// Safe spots (star positions) — tokens can't be captured here
const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];

// ── Track Coordinates ───────────────────────────────────────────────
// Map track position (0-51) to pixel center (cx, cy) on the board.

const MARGIN = 30;

function buildTrackCoords() {
  const coords = [];
  const m = MARGIN;
  const s = CELL;

  // The Ludo track goes around the cross-shaped board.
  // We define 52 positions clockwise starting from Red's entry (top of left column).

  // Segment 0-4: Left column going up (x=6, y from 12 down to 8)
  for (let i = 0; i < 5; i++) coords.push({ x: m + 6 * s, y: m + (12 - i) * s });
  // 5: Turn right at top-left
  coords.push({ x: m + 6 * s, y: m + 7 * s });
  // 6-10: Top row going left (y=6, x from 5 down to 1)
  for (let i = 0; i < 5; i++) coords.push({ x: m + (5 - i) * s, y: m + 6 * s });
  // 11: Top-left corner turn up
  coords.push({ x: m + 0 * s, y: m + 6 * s });
  // 12: Entry turn (y from 6 to 5)
  coords.push({ x: m + 0 * s, y: m + 5 * s });
  // 13: Green entry
  coords.push({ x: m + 1 * s, y: m + 5 * s });
  // 14-18: Top row going right (y=5 => no, going across top, x from 1 to 5)
  // Actually let me simplify. Standard Ludo 15x15:
  // I'll place coordinates more systematically.

  // Let me restart with a cleaner approach.
  coords.length = 0;
  return coords;
}

// Simplified track: 52 positions as (col, row) on a 15x15 conceptual grid.
// Each cell maps to pixel coordinates.
const TRACK_GRID = [
  // 0-5: Bottom section, left of center, going up
  [6,13], [6,12], [6,11], [6,10], [6,9], [6,8],
  // 6-11: Left section, below center, going left then up
  [5,7], [4,7], [3,7], [2,7], [1,7], [0,7],
  // 12: Top-left corner
  [0,6],
  // 13-18: Top section, left of center, going right
  [1,6], [2,6], [3,6], [4,6], [5,6],
  // 19-24: Top section, above center, going up then right
  [6,5], [6,4], [6,3], [6,2], [6,1], [6,0],
  // 25: Top-right corner
  [7,0],
  // 26-31: Right section, above center, going down
  [8,1], [8,2], [8,3], [8,4], [8,5],
  // 31: entering right arm
  [8,6],
  // 32-37: Right section, right of center, going right
  [9,6], [10,6], [11,6], [12,6], [13,6], [14,6],
  // 38: Bottom-right corner
  [14,7],
  // 39-44: Bottom section, right of center, going left
  [13,7], [12,7], [11,7], [10,7], [9,7],
  // 44: entering bottom arm
  [8,7],
  // Fix: we need exactly 52 positions. Let me recount.
];

// Actually, let me use a more standard Ludo coordinate mapping.
// Standard Ludo board is 15x15 with a cross pattern.
// I'll define the 52 track positions explicitly.

const TRACK = [
  // Red entry zone: positions 0-12 (bottom-left, going up then across top)
  [6,13],[6,12],[6,11],[6,10],[6,9],[6,8],  // 0-5: up left column
  [5,7],[4,7],[3,7],[2,7],[1,7],[0,7],       // 6-11: left across top
  [0,6],                                      // 12: corner
  // Green entry zone: positions 13-25 (top-left, going right then down)
  [1,6],[2,6],[3,6],[4,6],[5,6],              // 13-17: right across
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],        // 18-23: up
  [7,0],                                      // 24: corner (was 25 in my old mapping)
  [8,0],                                      // 25: corner
  // Yellow entry zone: positions 26-38
  [8,1],[8,2],[8,3],[8,4],[8,5],              // 26-30: down
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],   // 31-36: right
  [14,7],                                     // 37: corner
  [14,8],                                     // 38: corner
  // Blue entry zone: positions 39-51
  [13,8],[12,8],[11,8],[10,8],[9,8],          // 39-43: left
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],   // 44-49: down
  [7,14],                                     // 50: corner
  [6,14],                                     // 51: corner
];

// Home columns: 5 positions each, leading to center (7,7)
const HOME_COLUMNS = [
  // Red: enters at position 51 → goes up column 7
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  // Green: enters at position 12 → goes right column 7 row
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  // Hmm this conflicts. Let me think...
];

// OK let me use a completely different, cleaner approach.
// Each player has their own absolute track mapping.
// Position -1 = home base, 0-51 = main track, 52-56 = home column, 57 = finished.
// The main track is shared but each player starts at a different offset.

// I'll define pixel coordinates directly for a clean visual board.

const CS = CELL; // cell size
const MX = 55;   // margin X
const MY = 30;   // margin Y

// Grid cell to pixel center
function gc(col, row) {
  return { cx: MX + col * CS + CS / 2, cy: MY + row * CS + CS / 2 };
}

// Main track: 52 squares, defined as [col, row] on 15x15 grid
const MAIN_TRACK = [
  // 0-4: Red start area, going up along column 6
  [6,13],[6,12],[6,11],[6,10],[6,9],
  // 5: turn left
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  // 11-12: turn up
  [0,7],[0,6],
  // 13-17: Green start area, going right along row 6
  [1,6],[2,6],[3,6],[4,6],[5,6],
  // 18: turn up
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
  // 24-25: turn right
  [7,0],[8,0],
  // 26-30: Yellow approach, going down along column 8
  [8,1],[8,2],[8,3],[8,4],[8,5],
  // 31: turn right
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
  // 37-38: turn down
  [14,7],[14,8],
  // 39-43: Blue start area, going left along row 8
  [13,8],[12,8],[11,8],[10,8],[9,8],
  // 44: turn down
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
  // 50-51: turn left
  [7,14],[6,14],
];

// Home columns (the colored path to the center for each player)
const HOME_COLS = [
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]], // Red: up column 7
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],     // Green: right row 7
  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],     // Yellow: down column 7
  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]], // Blue: left row 7
];

// Home base positions (4 tokens per player, in their corner)
const HOME_BASES = [
  [[1,10],[3,10],[1,12],[3,12]],  // Red: bottom-left
  [[10,1],[12,1],[10,3],[12,3]],  // Green: top-right
  [[10,10],[12,10],[10,12],[12,12]], // Yellow: bottom-right
  [[1,1],[3,1],[1,3],[3,3]],      // Blue: top-left
];

// Player entry points (main track index where they enter)
const ENTRY_POINTS = [0, 13, 26, 39];

// Convert main track index to absolute position for a player
// Player's token at relative position `rel` (0-51 on their personal track)
// maps to MAIN_TRACK[(ENTRY_POINTS[player] + rel) % 52]
function trackToPixel(playerIdx, relPos) {
  if (relPos < 0) {
    // In home base — not yet on track
    return null;
  }
  if (relPos < TRACK_LEN) {
    // On main track
    const absIdx = (ENTRY_POINTS[playerIdx] + relPos) % TRACK_LEN;
    const [col, row] = MAIN_TRACK[absIdx];
    return gc(col, row);
  }
  if (relPos < TRACK_LEN + HOME_COL_LEN + 1) {
    // In home column (indices 0-5)
    const homeIdx = relPos - TRACK_LEN;
    if (homeIdx < HOME_COLS[playerIdx].length) {
      const [col, row] = HOME_COLS[playerIdx][homeIdx];
      return gc(col, row);
    }
    // Reached center
    return gc(7, 7);
  }
  // Finished
  return gc(7, 7);
}

function homeBasePixel(playerIdx, tokenIdx) {
  const [col, row] = HOME_BASES[playerIdx][tokenIdx];
  return gc(col, row);
}

// ── Game Definition ─────────────────────────────────────────────────

const game = defineGame({
  display: {
    type: 'custom',
    width: 15,
    height: 15,
    cellSize: CS,
    canvasWidth: BOARD_PX + 200,
    canvasHeight: BOARD_PX + 40,
    offsetX: MX,
    offsetY: MY,
    background: '#1a1a2e',
  },
  input: {
    restart: { keys: ['r', 'R'] },
    speed:   { keys: ['s', 'S'] },  // Toggle speed
  },
});

// ── Components ──────────────────────────────────────────────────────

game.component('Token', {
  playerIdx: 0,
  tokenIdx: 0,
  pos: -1,      // -1 = home base, 0-51 = main track, 52-57 = home column, 58 = finished
  finished: false,
});

// ── Resources ───────────────────────────────────────────────────────

game.resource('state', {
  score: 0,
  level: 1,
  gameOver: false,
  winner: -1,
});

game.resource('turn', {
  currentPlayer: 0,
  diceValue: 0,
  diceRolled: false,
  phase: 'rolling',  // 'rolling' | 'moving' | 'animating'
  turnTimer: 0,
  consecutiveSixes: 0,
  message: 'Red rolls...',
  moveLog: [],
  speed: 1,  // 1 = normal, 3 = fast
});

// ── Spawn System ────────────────────────────────────────────────────

game.system('spawn', function spawnSystem(world, _dt) {
  if (world.getResource('_spawned')) return;
  world.setResource('_spawned', true);

  // Create 16 tokens (4 per player)
  for (let p = 0; p < 4; p++) {
    for (let t = 0; t < TOKENS_PER_PLAYER; t++) {
      const eid = world.createEntity();
      world.addComponent(eid, 'Token', {
        playerIdx: p,
        tokenIdx: t,
        pos: -1,
        finished: false,
      });
    }
  }
});

// ── Dice + AI Turn System ───────────────────────────────────────────

const TURN_DELAY = 400; // ms between actions

game.system('turns', function turnSystem(world, dt) {
  const state = world.getResource('state');
  if (state.gameOver) return;

  const turn = world.getResource('turn');
  turn.turnTimer += dt * turn.speed;

  if (turn.turnTimer < TURN_DELAY) return;
  turn.turnTimer = 0;

  const player = PLAYERS[turn.currentPlayer];
  const tokens = getPlayerTokens(world, turn.currentPlayer);

  if (turn.phase === 'rolling') {
    // Roll dice
    turn.diceValue = Math.floor(Math.random() * 6) + 1;
    turn.diceRolled = true;
    turn.message = `${player.name} rolled ${turn.diceValue}`;

    // Check for triple 6 (penalty: skip turn)
    if (turn.diceValue === 6) {
      turn.consecutiveSixes++;
      if (turn.consecutiveSixes >= 3) {
        turn.message = `${player.name} rolled three 6s! Turn skipped.`;
        turn.consecutiveSixes = 0;
        turn.phase = 'rolling';
        nextPlayer(turn);
        return;
      }
    } else {
      turn.consecutiveSixes = 0;
    }

    // Get valid moves
    const moves = getValidMoves(world, turn.currentPlayer, turn.diceValue);

    if (moves.length === 0) {
      turn.message += ' — no valid moves';
      turn.phase = 'rolling';
      if (turn.diceValue !== 6) nextPlayer(turn);
      return;
    }

    // AI picks a move
    const move = aiPickMove(turn.currentPlayer, moves, world);
    executeMove(world, move, turn, state);

    // Extra turn on 6
    if (turn.diceValue === 6 && !state.gameOver) {
      turn.phase = 'rolling';
      turn.message += ' — rolls again!';
    } else {
      turn.phase = 'rolling';
      nextPlayer(turn);
    }
  }
});

// ── Game Logic Helpers ──────────────────────────────────────────────

function getPlayerTokens(world, playerIdx) {
  const tokens = [];
  for (const eid of world.query('Token')) {
    const tok = world.getComponent(eid, 'Token');
    if (tok.playerIdx === playerIdx) {
      tokens.push({ eid, ...tok });
    }
  }
  return tokens;
}

function getValidMoves(world, playerIdx, dice) {
  const tokens = getPlayerTokens(world, playerIdx);
  const moves = [];

  for (const tok of tokens) {
    if (tok.finished) continue;

    if (tok.pos === -1) {
      // In home base — need 6 to enter
      if (dice === 6) {
        moves.push({ eid: tok.eid, tokenIdx: tok.tokenIdx, from: -1, to: 0, type: 'enter' });
      }
    } else {
      const newPos = tok.pos + dice;
      const FINISH_POS = TRACK_LEN + HOME_COL_LEN + 1; // 58

      if (newPos === FINISH_POS) {
        // Exact landing on finish
        moves.push({ eid: tok.eid, tokenIdx: tok.tokenIdx, from: tok.pos, to: newPos, type: 'finish' });
      } else if (newPos < FINISH_POS) {
        // Valid move
        const isCapture = checkCapture(world, playerIdx, newPos);
        moves.push({
          eid: tok.eid,
          tokenIdx: tok.tokenIdx,
          from: tok.pos,
          to: newPos,
          type: isCapture ? 'capture' : 'move',
        });
      }
      // If newPos > FINISH_POS, can't move (must land exactly)
    }
  }
  return moves;
}

function checkCapture(world, playerIdx, targetRelPos) {
  if (targetRelPos >= TRACK_LEN) return false; // Can't capture in home column

  const targetAbs = (ENTRY_POINTS[playerIdx] + targetRelPos) % TRACK_LEN;

  // Check if target is a safe spot
  if (SAFE_SPOTS.includes(targetAbs)) return false;

  // Check if any opponent token is at this position
  for (const eid of world.query('Token')) {
    const tok = world.getComponent(eid, 'Token');
    if (tok.playerIdx === playerIdx || tok.pos < 0 || tok.pos >= TRACK_LEN || tok.finished) continue;

    const tokAbs = (ENTRY_POINTS[tok.playerIdx] + tok.pos) % TRACK_LEN;
    if (tokAbs === targetAbs) return true;
  }
  return false;
}

function executeMove(world, move, turn, state) {
  const tok = world.getComponent(move.eid, 'Token');
  const player = PLAYERS[tok.playerIdx];

  tok.pos = move.to;

  if (move.type === 'enter') {
    turn.message = `${player.name} enters a token!`;
  } else if (move.type === 'finish') {
    tok.finished = true;
    turn.message = `${player.name} token home!`;
    state.score += 10;

    // Check win
    const allFinished = getPlayerTokens(world, tok.playerIdx).every(t => t.finished);
    if (allFinished) {
      state.gameOver = true;
      state.winner = tok.playerIdx;
      turn.message = `${player.name} WINS!`;
    }
  } else if (move.type === 'capture') {
    // Send captured token back to home base
    const capturedAbs = (ENTRY_POINTS[tok.playerIdx] + move.to) % TRACK_LEN;
    for (const eid of world.query('Token')) {
      const other = world.getComponent(eid, 'Token');
      if (other.playerIdx === tok.playerIdx || other.pos < 0 || other.pos >= TRACK_LEN || other.finished) continue;
      const otherAbs = (ENTRY_POINTS[other.playerIdx] + other.pos) % TRACK_LEN;
      if (otherAbs === capturedAbs) {
        other.pos = -1;
        turn.message = `${player.name} captures ${PLAYERS[other.playerIdx].name}!`;
        state.score += 5;
        break;
      }
    }
  } else {
    turn.message = `${player.name} moves token ${move.tokenIdx + 1}`;
  }

  // Log move
  turn.moveLog.push(`${player.name[0]}${move.tokenIdx}:${move.from}→${move.to}`);
  if (turn.moveLog.length > 20) turn.moveLog.shift();
}

function nextPlayer(turn) {
  turn.currentPlayer = (turn.currentPlayer + 1) % 4;
  turn.diceRolled = false;
  turn.consecutiveSixes = 0;
}

// ── AI Strategies ───────────────────────────────────────────────────

function aiPickMove(playerIdx, moves, world) {
  if (moves.length === 1) return moves[0];

  // Different AI per player
  switch (playerIdx) {
    case 0: return aiAggressive(moves, world);
    case 1: return aiBalanced(moves, world);
    case 2: return aiDefensive(moves, world);
    case 3: return pickRandomMove(moves);
    default: return pickRandomMove(moves);
  }
}

// Red: Aggressive — prioritize captures, then entering, then advancing
function aiAggressive(moves, world) {
  return pickBestMove(moves, (m) => {
    if (m.type === 'capture') return 100;
    if (m.type === 'finish') return 90;
    if (m.type === 'enter') return 60;
    return m.to; // Prefer advancing
  });
}

// Green: Balanced — weighted mix of aggression and safety
function aiBalanced(moves, world) {
  const evaluator = compositeEvaluator([
    { evaluator: (m) => m.type === 'capture' ? 50 : 0, weight: 1 },
    { evaluator: (m) => m.type === 'finish' ? 80 : 0, weight: 1 },
    { evaluator: (m) => m.type === 'enter' ? 30 : 0, weight: 1 },
    { evaluator: (m) => {
      // Prefer safe spots
      if (m.to < TRACK_LEN) {
        const abs = (ENTRY_POINTS[1] + m.to) % TRACK_LEN;
        if (SAFE_SPOTS.includes(abs)) return 20;
      }
      return m.to * 0.5; // Slight preference for advancing
    }, weight: 1 },
  ]);
  return pickWeightedMove(moves, evaluator);
}

// Yellow: Defensive — prioritize safe spots, home column, and entering
function aiDefensive(moves, world) {
  return pickBestMove(moves, (m) => {
    if (m.type === 'finish') return 100;
    if (m.to >= TRACK_LEN) return 80; // In home column = safe
    if (m.type === 'enter') return 40;
    // Prefer safe spots
    const abs = (ENTRY_POINTS[2] + m.to) % TRACK_LEN;
    if (SAFE_SPOTS.includes(abs)) return 60;
    // Avoid being near opponents
    return m.to * 0.3;
  });
}

// ── Speed Toggle ────────────────────────────────────────────────────

game.system('speedToggle', function speedSystem(world, _dt) {
  const input = world.getResource('input');
  if (input && input.speed) {
    input.speed = false;
    const turn = world.getResource('turn');
    turn.speed = turn.speed === 1 ? 5 : 1;
  }
});

// ── Render System ───────────────────────────────────────────────────

game.system('render', function renderSystem(world, _dt) {
  const renderer = world.getResource('renderer');
  if (!renderer) return;

  const { ctx } = renderer;
  const state = world.getResource('state');
  const turn = world.getResource('turn');

  // Clear
  clearCanvas(ctx, '#1a1a2e');

  // Draw Ludo board
  drawBoard(ctx);

  // Draw tokens
  drawTokens(ctx, world);

  // Draw dice
  if (turn.diceRolled) {
    drawDice(ctx, BOARD_PX + 70, 50, 60, turn.diceValue, {
      bgColor: PLAYERS[turn.currentPlayer].light,
    });
  }

  // Turn info
  const hx = BOARD_PX + 55;
  ctx.fillStyle = PLAYERS[turn.currentPlayer].color;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(PLAYERS[turn.currentPlayer].name + "'s turn", hx, 140);

  ctx.fillStyle = '#ccc';
  ctx.font = '12px monospace';
  const msg = turn.message || '';
  // Word wrap message
  const words = msg.split(' ');
  let line = '';
  let ly = 160;
  for (const word of words) {
    if ((line + word).length > 22) {
      ctx.fillText(line, hx, ly);
      ly += 16;
      line = word + ' ';
    } else {
      line += word + ' ';
    }
  }
  ctx.fillText(line, hx, ly);

  // Player scores (tokens finished)
  ctx.font = '13px monospace';
  let sy = 210;
  for (let p = 0; p < 4; p++) {
    const tokens = getPlayerTokens(world, p);
    const finished = tokens.filter(t => t.finished).length;
    const onBoard = tokens.filter(t => t.pos >= 0 && !t.finished).length;
    ctx.fillStyle = PLAYERS[p].color;
    ctx.fillText(`${PLAYERS[p].name}: ${finished}/4 home`, hx, sy);
    ctx.fillStyle = '#888';
    ctx.fillText(`  (${onBoard} on board)`, hx, sy + 14);
    sy += 36;
  }

  // Speed indicator
  ctx.fillStyle = '#666';
  ctx.font = '11px monospace';
  ctx.fillText(`Speed: ${turn.speed}x (S)`, hx, sy + 10);

  // Move log
  ctx.fillStyle = '#555';
  ctx.font = '10px monospace';
  const logStart = Math.max(0, turn.moveLog.length - 8);
  for (let i = logStart; i < turn.moveLog.length; i++) {
    ctx.fillText(turn.moveLog[i], hx, BOARD_PX - 80 + (i - logStart) * 13);
  }

  // Game over
  if (state.gameOver) {
    const winner = PLAYERS[state.winner];
    drawGameOver(ctx, MX, MY, 15 * CS, 15 * CS, {
      title: `${winner.name} WINS!`,
      titleColor: winner.color,
      subtitle: 'Press R to restart',
    });
  }
});

// ── Board Drawing ───────────────────────────────────────────────────

function drawBoard(ctx) {
  const s = CS;

  // Board background
  ctx.fillStyle = '#F5F0E1';
  ctx.fillRect(MX, MY, 15 * s, 15 * s);

  // Home bases (colored corners)
  const bases = [
    { x: 0, y: 9, color: '#E53935', light: '#FFCDD2' },  // Red: bottom-left
    { x: 9, y: 0, color: '#43A047', light: '#C8E6C9' },  // Green: top-right
    { x: 9, y: 9, color: '#FDD835', light: '#FFF9C4' },  // Yellow: bottom-right
    { x: 0, y: 0, color: '#1E88E5', light: '#BBDEFB' },  // Blue: top-left
  ];

  for (const base of bases) {
    ctx.fillStyle = base.light;
    ctx.fillRect(MX + base.x * s, MY + base.y * s, 6 * s, 6 * s);
    ctx.strokeStyle = base.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(MX + base.x * s, MY + base.y * s, 6 * s, 6 * s);

    // Inner circle area
    ctx.fillStyle = '#fff';
    ctx.fillRect(MX + (base.x + 1) * s, MY + (base.y + 1) * s, 4 * s, 4 * s);
    ctx.strokeStyle = base.color;
    ctx.strokeRect(MX + (base.x + 1) * s, MY + (base.y + 1) * s, 4 * s, 4 * s);
  }

  // Draw main track cells
  for (let i = 0; i < MAIN_TRACK.length; i++) {
    const [col, row] = MAIN_TRACK[i];
    let color = '#fff';
    // Color safe spots with stars
    if (SAFE_SPOTS.includes(i)) {
      // Determine which player's safe spot
      if (i === 0 || i === 47) color = '#FFCDD2';      // Red
      else if (i === 13 || i === 8) color = '#C8E6C9';  // Green
      else if (i === 26 || i === 21) color = '#FFF9C4';  // Yellow
      else if (i === 39 || i === 34) color = '#BBDEFB';  // Blue
    }
    drawSquare(ctx, MX + col * s, MY + row * s, s, s, color, '#999');

    // Star on safe spots
    if (SAFE_SPOTS.includes(i)) {
      ctx.fillStyle = '#888';
      ctx.font = `${s * 0.5}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', MX + col * s + s / 2, MY + row * s + s / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Draw home columns
  for (let p = 0; p < 4; p++) {
    const col = HOME_COLS[p];
    for (let i = 0; i < col.length; i++) {
      const [c, r] = col[i];
      drawSquare(ctx, MX + c * s, MY + r * s, s, s, PLAYERS[p].light, PLAYERS[p].color);
    }
  }

  // Center home (triangles → simplified as colored center)
  ctx.fillStyle = '#E53935';
  ctx.beginPath();
  ctx.moveTo(MX + 6 * s, MY + 6 * s);
  ctx.lineTo(MX + 7.5 * s, MY + 7.5 * s);
  ctx.lineTo(MX + 6 * s, MY + 9 * s);
  ctx.fill();

  ctx.fillStyle = '#43A047';
  ctx.beginPath();
  ctx.moveTo(MX + 6 * s, MY + 6 * s);
  ctx.lineTo(MX + 7.5 * s, MY + 7.5 * s);
  ctx.lineTo(MX + 9 * s, MY + 6 * s);
  ctx.fill();

  ctx.fillStyle = '#FDD835';
  ctx.beginPath();
  ctx.moveTo(MX + 9 * s, MY + 6 * s);
  ctx.lineTo(MX + 7.5 * s, MY + 7.5 * s);
  ctx.lineTo(MX + 9 * s, MY + 9 * s);
  ctx.fill();

  ctx.fillStyle = '#1E88E5';
  ctx.beginPath();
  ctx.moveTo(MX + 6 * s, MY + 9 * s);
  ctx.lineTo(MX + 7.5 * s, MY + 7.5 * s);
  ctx.lineTo(MX + 9 * s, MY + 9 * s);
  ctx.fill();

  // Board border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(MX, MY, 15 * s, 15 * s);
}

// ── Token Drawing ───────────────────────────────────────────────────

function drawTokens(ctx, world) {
  // Group tokens by position to handle stacking
  const posMap = {}; // "playerIdx-pos" -> count for stacking offset

  const allTokens = [];
  for (const eid of world.query('Token')) {
    allTokens.push(world.getComponent(eid, 'Token'));
  }

  // Count tokens at each absolute position for stacking
  const stackCount = {};
  for (const tok of allTokens) {
    const key = tok.pos === -1
      ? `base-${tok.playerIdx}-${tok.tokenIdx}`
      : `${tok.playerIdx}-${tok.pos}`;
    stackCount[key] = (stackCount[key] || 0) + 1;
  }

  const drawn = {};
  for (const tok of allTokens) {
    const player = PLAYERS[tok.playerIdx];
    let cx, cy;

    if (tok.finished) {
      // Finished tokens in center
      const offset = tok.tokenIdx * 8 - 12;
      const center = gc(7, 7);
      cx = center.cx + offset;
      cy = center.cy + (tok.playerIdx < 2 ? -6 : 6);
    } else if (tok.pos === -1) {
      // Home base
      const pos = homeBasePixel(tok.playerIdx, tok.tokenIdx);
      cx = pos.cx;
      cy = pos.cy;
    } else {
      // On track or home column
      const pos = trackToPixel(tok.playerIdx, tok.pos);
      if (!pos) continue;
      cx = pos.cx;
      cy = pos.cy;

      // Stack offset if multiple tokens at same absolute position
      const key = `${tok.playerIdx}-${tok.pos}`;
      if (!drawn[key]) drawn[key] = 0;
      const stackIdx = drawn[key]++;
      cx += stackIdx * 6 - 3;
      cy += stackIdx * 3 - 2;
    }

    drawToken(ctx, cx, cy, TOKEN_R, player.color, {
      strokeColor: '#fff',
      strokeWidth: 2,
      label: String(tok.tokenIdx + 1),
      labelColor: tok.playerIdx === 2 ? '#333' : '#fff', // Dark text on yellow
    });
  }
}

export default game;

// engine-ecs:../ecs/index.js
var World = class {
  constructor() {
    this.nextEntityId = 0;
    this.entities = /* @__PURE__ */ new Set();
    this.components = /* @__PURE__ */ new Map();
    this.systems = [];
    this.resources = /* @__PURE__ */ new Map();
    this.events = [];
    this.running = true;
  }
  // --- Entities ---
  createEntity() {
    const id = this.nextEntityId++;
    this.entities.add(id);
    return id;
  }
  destroyEntity(id) {
    this.entities.delete(id);
    for (const store of this.components.values()) {
      store.delete(id);
    }
  }
  // --- Components ---
  registerComponent(name) {
    if (!this.components.has(name)) {
      this.components.set(name, /* @__PURE__ */ new Map());
    }
  }
  addComponent(entityId, name, data = {}) {
    if (!this.components.has(name)) {
      this.registerComponent(name);
    }
    this.components.get(name).set(entityId, data);
    return this;
  }
  getComponent(entityId, name) {
    const store = this.components.get(name);
    return store ? store.get(entityId) : void 0;
  }
  hasComponent(entityId, name) {
    const store = this.components.get(name);
    return store ? store.has(entityId) : false;
  }
  removeComponent(entityId, name) {
    const store = this.components.get(name);
    if (store) store.delete(entityId);
  }
  // --- Queries ---
  query(...componentNames) {
    const results = [];
    for (const entityId of this.entities) {
      let match = true;
      for (const name of componentNames) {
        if (!this.hasComponent(entityId, name)) {
          match = false;
          break;
        }
      }
      if (match) results.push(entityId);
    }
    return results;
  }
  // --- Resources (global singletons) ---
  setResource(name, data) {
    this.resources.set(name, data);
  }
  getResource(name) {
    return this.resources.get(name);
  }
  // --- Events ---
  emit(type, data = {}) {
    this.events.push({ type, data });
  }
  getEvents(type) {
    return this.events.filter((e) => e.type === type);
  }
  clearEvents() {
    this.events.length = 0;
  }
  // --- Systems ---
  addSystem(name, fn, priority = 0) {
    this.systems.push({ name, fn, priority });
    this.systems.sort((a, b) => a.priority - b.priority);
  }
  tick(dt) {
    for (const system of this.systems) {
      system.fn(this, dt);
    }
    this.clearEvents();
  }
};

// engine:@engine/core
function defineGame(config) {
  const components = {};
  const entities = [];
  const resources = {};
  const systems = [];
  const builder = {
    /** Register a component type with default values. */
    component(name, defaults = {}) {
      components[name] = defaults;
      return builder;
    },
    /** Spawn an entity with the given components. */
    spawn(name, componentData) {
      entities.push({ name, components: componentData });
      return builder;
    },
    /** Register a global resource. */
    resource(name, data) {
      resources[name] = data;
      return builder;
    },
    /** Add a system function. Systems run in registration order. */
    system(name, fn) {
      systems.push({ name, fn });
      return builder;
    },
    /** Compile into a running ECS World with canvas. */
    compile(canvas) {
      const world = new World();
      const display = config.display;
      if (display.type === "grid") {
        const grid = [];
        for (let r = 0; r < display.height; r++) {
          grid.push(new Array(display.width).fill(null));
        }
        world.setResource("_board", {
          cols: display.width,
          rows: display.height,
          grid
        });
      }
      for (const [name, data] of Object.entries(resources)) {
        world.setResource(name, JSON.parse(JSON.stringify(data)));
      }
      if (config.input) {
        const input = {};
        for (const action of Object.keys(config.input)) {
          input[action] = false;
        }
        world.setResource("input", input);
      }
      if (config.timing) {
        world.setResource("_tickRate", config.timing.tickRate);
      }
      if (canvas) {
        const cellSize = display.cellSize || 30;
        const ctx = canvas.getContext("2d");
        if (display.canvasWidth && display.canvasHeight) {
          canvas.width = display.canvasWidth;
          canvas.height = display.canvasHeight;
        } else {
          canvas.width = display.width * cellSize + 180;
          canvas.height = display.height * cellSize + 20;
        }
        const offsetX = display.offsetX != null ? display.offsetX : 10;
        const offsetY = display.offsetY != null ? display.offsetY : 10;
        world.setResource("renderer", { ctx, cellSize, offsetX, offsetY });
      }
      for (const name of Object.keys(components)) {
        world.registerComponent(name);
      }
      for (const entity of entities) {
        const eid = world.createEntity();
        for (const [compName, compData] of Object.entries(entity.components)) {
          world.addComponent(eid, compName, JSON.parse(JSON.stringify(compData)));
        }
      }
      for (let i = 0; i < systems.length; i++) {
        world.addSystem(systems[i].name, systems[i].fn, i);
      }
      world.setResource("_config", config);
      world.setResource("_components", components);
      return world;
    },
    /** Compile and start the game loop with keyboard wiring. */
    start(canvas) {
      const world = builder.compile(canvas);
      if (config.input) {
        const input = world.getResource("input");
        const keyToAction = {};
        for (const [action, keys] of Object.entries(config.input)) {
          const keyList = Array.isArray(keys) ? keys : keys.keys || [keys];
          for (const key of keyList) {
            keyToAction[key] = action;
          }
        }
        document.addEventListener("keydown", (e) => {
          const action = keyToAction[e.key];
          if (action) {
            e.preventDefault();
            if (action === "restart") {
              const board = world.getResource("_board");
              if (board) {
                for (let r = 0; r < board.rows; r++) board.grid[r].fill(null);
              }
              const state = world.getResource("state");
              if (state && resources.state) {
                Object.assign(state, JSON.parse(JSON.stringify(resources.state)));
              }
              return;
            }
            input[action] = true;
          }
        });
      }
      let last = performance.now();
      function loop(now) {
        const dt = now - last;
        last = now;
        world.tick(dt);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
      return world;
    },
    /** Expose config for introspection. */
    getConfig() {
      return config;
    },
    getSystems() {
      return systems;
    },
    getResources() {
      return resources;
    },
    getComponents() {
      return components;
    },
    getEntities() {
      return entities;
    }
  };
  return builder;
}

// engine:@engine/ai
function pickBestMove(moves, evaluator) {
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestScore = evaluator(best);
  for (let i = 1; i < moves.length; i++) {
    const score = evaluator(moves[i]);
    if (score > bestScore) {
      bestScore = score;
      best = moves[i];
    }
  }
  return best;
}
function pickRandomMove(moves) {
  if (moves.length === 0) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}
function pickWeightedMove(moves, evaluator) {
  if (moves.length === 0) return null;
  const scored = moves.map((m) => ({ move: m, score: Math.max(0.1, evaluator(m)) }));
  const total = scored.reduce((s, m) => s + m.score, 0);
  let r = Math.random() * total;
  for (const { move, score } of scored) {
    r -= score;
    if (r <= 0) return move;
  }
  return scored[scored.length - 1].move;
}
function compositeEvaluator(evaluators) {
  return (move) => {
    let total = 0;
    for (const { evaluator, weight } of evaluators) {
      total += evaluator(move) * weight;
    }
    return total;
  };
}

// engine:@engine/render
function drawGameOver(ctx, offsetX, offsetY, W, H, opts = {}) {
  const {
    title = "GAME OVER",
    titleColor = "#ff4444",
    subtitle
  } = opts;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(offsetX, offsetY, W, H);
  ctx.fillStyle = titleColor;
  ctx.font = "bold 36px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, offsetX + W / 2, offsetY + H / 2 - 20);
  if (subtitle) {
    ctx.fillStyle = "#fff";
    ctx.font = "18px monospace";
    ctx.fillText(subtitle, offsetX + W / 2, offsetY + H / 2 + 20);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
function clearCanvas(ctx, bgColor = "#111") {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function drawToken(ctx, cx, cy, radius, fillColor, opts = {}) {
  const { strokeColor, strokeWidth = 2, label, labelColor = "#fff" } = opts;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
  if (label) {
    ctx.fillStyle = labelColor;
    ctx.font = `bold ${Math.floor(radius)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}
function drawDice(ctx, x, y, size, value, opts = {}) {
  const { bgColor = "#fff", dotColor = "#111", cornerRadius = 6 } = opts;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, cornerRadius);
  ctx.fill();
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1;
  ctx.stroke();
  const dotR = size * 0.08;
  const patterns = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]]
  };
  ctx.fillStyle = dotColor;
  for (const [dx, dy] of patterns[value] || patterns[1]) {
    ctx.beginPath();
    ctx.arc(x + dx * size, y + dy * size, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawSquare(ctx, x, y, w, h, fillColor, strokeColor) {
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, w, h);
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, w, h);
  }
}

// ../../../virtual/game.js
var BOARD_PX = 520;
var CELL = 34;
var TOKEN_R = 12;
var TRACK_LEN = 52;
var HOME_COL_LEN = 5;
var TOKENS_PER_PLAYER = 4;
var PLAYERS = [
  { id: 0, name: "Red", color: "#E53935", light: "#FFCDD2", entry: 0, homeEntry: 50, homeBase: { x: 40, y: 40 } },
  { id: 1, name: "Green", color: "#43A047", light: "#C8E6C9", entry: 13, homeEntry: 11, homeBase: { x: 320, y: 40 } },
  { id: 2, name: "Yellow", color: "#FDD835", light: "#FFF9C4", entry: 26, homeEntry: 24, homeBase: { x: 320, y: 320 } },
  { id: 3, name: "Blue", color: "#1E88E5", light: "#BBDEFB", entry: 39, homeEntry: 37, homeBase: { x: 40, y: 320 } }
];
var SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];
var CS = CELL;
var MX = 55;
var MY = 30;
function gc(col, row) {
  return { cx: MX + col * CS + CS / 2, cy: MY + row * CS + CS / 2 };
}
var MAIN_TRACK = [
  // 0-4: Red start area, going up along column 6
  [6, 13],
  [6, 12],
  [6, 11],
  [6, 10],
  [6, 9],
  // 5: turn left
  [5, 8],
  [4, 8],
  [3, 8],
  [2, 8],
  [1, 8],
  [0, 8],
  // 11-12: turn up
  [0, 7],
  [0, 6],
  // 13-17: Green start area, going right along row 6
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  // 18: turn up
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0],
  // 24-25: turn right
  [7, 0],
  [8, 0],
  // 26-30: Yellow approach, going down along column 8
  [8, 1],
  [8, 2],
  [8, 3],
  [8, 4],
  [8, 5],
  // 31: turn right
  [9, 6],
  [10, 6],
  [11, 6],
  [12, 6],
  [13, 6],
  [14, 6],
  // 37-38: turn down
  [14, 7],
  [14, 8],
  // 39-43: Blue start area, going left along row 8
  [13, 8],
  [12, 8],
  [11, 8],
  [10, 8],
  [9, 8],
  // 44: turn down
  [8, 9],
  [8, 10],
  [8, 11],
  [8, 12],
  [8, 13],
  [8, 14],
  // 50-51: turn left
  [7, 14],
  [6, 14]
];
var HOME_COLS = [
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  // Red: up column 7
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  // Green: right row 7
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  // Yellow: down column 7
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]
  // Blue: left row 7
];
var HOME_BASES = [
  [[1, 10], [3, 10], [1, 12], [3, 12]],
  // Red: bottom-left
  [[10, 1], [12, 1], [10, 3], [12, 3]],
  // Green: top-right
  [[10, 10], [12, 10], [10, 12], [12, 12]],
  // Yellow: bottom-right
  [[1, 1], [3, 1], [1, 3], [3, 3]]
  // Blue: top-left
];
var ENTRY_POINTS = [0, 13, 26, 39];
function trackToPixel(playerIdx, relPos) {
  if (relPos < 0) {
    return null;
  }
  if (relPos < TRACK_LEN) {
    const absIdx = (ENTRY_POINTS[playerIdx] + relPos) % TRACK_LEN;
    const [col, row] = MAIN_TRACK[absIdx];
    return gc(col, row);
  }
  if (relPos < TRACK_LEN + HOME_COL_LEN + 1) {
    const homeIdx = relPos - TRACK_LEN;
    if (homeIdx < HOME_COLS[playerIdx].length) {
      const [col, row] = HOME_COLS[playerIdx][homeIdx];
      return gc(col, row);
    }
    return gc(7, 7);
  }
  return gc(7, 7);
}
function homeBasePixel(playerIdx, tokenIdx) {
  const [col, row] = HOME_BASES[playerIdx][tokenIdx];
  return gc(col, row);
}
var game = defineGame({
  display: {
    type: "custom",
    width: 15,
    height: 15,
    cellSize: CS,
    canvasWidth: BOARD_PX + 200,
    canvasHeight: BOARD_PX + 40,
    offsetX: MX,
    offsetY: MY,
    background: "#1a1a2e"
  },
  input: {
    restart: { keys: ["r", "R"] },
    speed: { keys: ["s", "S"] }
    // Toggle speed
  }
});
game.component("Token", {
  playerIdx: 0,
  tokenIdx: 0,
  pos: -1,
  // -1 = home base, 0-51 = main track, 52-57 = home column, 58 = finished
  finished: false
});
game.resource("state", {
  score: 0,
  level: 1,
  gameOver: false,
  winner: -1
});
game.resource("turn", {
  currentPlayer: 0,
  diceValue: 0,
  diceRolled: false,
  phase: "rolling",
  // 'rolling' | 'moving' | 'animating'
  turnTimer: 0,
  consecutiveSixes: 0,
  message: "Red rolls...",
  moveLog: [],
  speed: 1
  // 1 = normal, 3 = fast
});
game.system("spawn", function spawnSystem(world, _dt) {
  if (world.getResource("_spawned")) return;
  world.setResource("_spawned", true);
  for (let p = 0; p < 4; p++) {
    for (let t = 0; t < TOKENS_PER_PLAYER; t++) {
      const eid = world.createEntity();
      world.addComponent(eid, "Token", {
        playerIdx: p,
        tokenIdx: t,
        pos: -1,
        finished: false
      });
    }
  }
});
var TURN_DELAY = 400;
game.system("turns", function turnSystem(world, dt) {
  const state = world.getResource("state");
  if (state.gameOver) return;
  const turn = world.getResource("turn");
  turn.turnTimer += dt * turn.speed;
  if (turn.turnTimer < TURN_DELAY) return;
  turn.turnTimer = 0;
  const player = PLAYERS[turn.currentPlayer];
  const tokens = getPlayerTokens(world, turn.currentPlayer);
  if (turn.phase === "rolling") {
    turn.diceValue = Math.floor(Math.random() * 6) + 1;
    turn.diceRolled = true;
    turn.message = `${player.name} rolled ${turn.diceValue}`;
    if (turn.diceValue === 6) {
      turn.consecutiveSixes++;
      if (turn.consecutiveSixes >= 3) {
        turn.message = `${player.name} rolled three 6s! Turn skipped.`;
        turn.consecutiveSixes = 0;
        turn.phase = "rolling";
        nextPlayer(turn);
        return;
      }
    } else {
      turn.consecutiveSixes = 0;
    }
    const moves = getValidMoves(world, turn.currentPlayer, turn.diceValue);
    if (moves.length === 0) {
      turn.message += " \u2014 no valid moves";
      turn.phase = "rolling";
      if (turn.diceValue !== 6) nextPlayer(turn);
      return;
    }
    const move = aiPickMove(turn.currentPlayer, moves, world);
    executeMove(world, move, turn, state);
    if (turn.diceValue === 6 && !state.gameOver) {
      turn.phase = "rolling";
      turn.message += " \u2014 rolls again!";
    } else {
      turn.phase = "rolling";
      nextPlayer(turn);
    }
  }
});
function getPlayerTokens(world, playerIdx) {
  const tokens = [];
  for (const eid of world.query("Token")) {
    const tok = world.getComponent(eid, "Token");
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
      if (dice === 6) {
        moves.push({ eid: tok.eid, tokenIdx: tok.tokenIdx, from: -1, to: 0, type: "enter" });
      }
    } else {
      const newPos = tok.pos + dice;
      const FINISH_POS = TRACK_LEN + HOME_COL_LEN + 1;
      if (newPos === FINISH_POS) {
        moves.push({ eid: tok.eid, tokenIdx: tok.tokenIdx, from: tok.pos, to: newPos, type: "finish" });
      } else if (newPos < FINISH_POS) {
        const isCapture = checkCapture(world, playerIdx, newPos);
        moves.push({
          eid: tok.eid,
          tokenIdx: tok.tokenIdx,
          from: tok.pos,
          to: newPos,
          type: isCapture ? "capture" : "move"
        });
      }
    }
  }
  return moves;
}
function checkCapture(world, playerIdx, targetRelPos) {
  if (targetRelPos >= TRACK_LEN) return false;
  const targetAbs = (ENTRY_POINTS[playerIdx] + targetRelPos) % TRACK_LEN;
  if (SAFE_SPOTS.includes(targetAbs)) return false;
  for (const eid of world.query("Token")) {
    const tok = world.getComponent(eid, "Token");
    if (tok.playerIdx === playerIdx || tok.pos < 0 || tok.pos >= TRACK_LEN || tok.finished) continue;
    const tokAbs = (ENTRY_POINTS[tok.playerIdx] + tok.pos) % TRACK_LEN;
    if (tokAbs === targetAbs) return true;
  }
  return false;
}
function executeMove(world, move, turn, state) {
  const tok = world.getComponent(move.eid, "Token");
  const player = PLAYERS[tok.playerIdx];
  tok.pos = move.to;
  if (move.type === "enter") {
    turn.message = `${player.name} enters a token!`;
  } else if (move.type === "finish") {
    tok.finished = true;
    turn.message = `${player.name} token home!`;
    state.score += 10;
    const allFinished = getPlayerTokens(world, tok.playerIdx).every((t) => t.finished);
    if (allFinished) {
      state.gameOver = true;
      state.winner = tok.playerIdx;
      turn.message = `${player.name} WINS!`;
    }
  } else if (move.type === "capture") {
    const capturedAbs = (ENTRY_POINTS[tok.playerIdx] + move.to) % TRACK_LEN;
    for (const eid of world.query("Token")) {
      const other = world.getComponent(eid, "Token");
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
  turn.moveLog.push(`${player.name[0]}${move.tokenIdx}:${move.from}\u2192${move.to}`);
  if (turn.moveLog.length > 20) turn.moveLog.shift();
}
function nextPlayer(turn) {
  turn.currentPlayer = (turn.currentPlayer + 1) % 4;
  turn.diceRolled = false;
  turn.consecutiveSixes = 0;
}
function aiPickMove(playerIdx, moves, world) {
  if (moves.length === 1) return moves[0];
  switch (playerIdx) {
    case 0:
      return aiAggressive(moves, world);
    case 1:
      return aiBalanced(moves, world);
    case 2:
      return aiDefensive(moves, world);
    case 3:
      return pickRandomMove(moves);
    default:
      return pickRandomMove(moves);
  }
}
function aiAggressive(moves, world) {
  return pickBestMove(moves, (m) => {
    if (m.type === "capture") return 100;
    if (m.type === "finish") return 90;
    if (m.type === "enter") return 60;
    return m.to;
  });
}
function aiBalanced(moves, world) {
  const evaluator = compositeEvaluator([
    { evaluator: (m) => m.type === "capture" ? 50 : 0, weight: 1 },
    { evaluator: (m) => m.type === "finish" ? 80 : 0, weight: 1 },
    { evaluator: (m) => m.type === "enter" ? 30 : 0, weight: 1 },
    { evaluator: (m) => {
      if (m.to < TRACK_LEN) {
        const abs = (ENTRY_POINTS[1] + m.to) % TRACK_LEN;
        if (SAFE_SPOTS.includes(abs)) return 20;
      }
      return m.to * 0.5;
    }, weight: 1 }
  ]);
  return pickWeightedMove(moves, evaluator);
}
function aiDefensive(moves, world) {
  return pickBestMove(moves, (m) => {
    if (m.type === "finish") return 100;
    if (m.to >= TRACK_LEN) return 80;
    if (m.type === "enter") return 40;
    const abs = (ENTRY_POINTS[2] + m.to) % TRACK_LEN;
    if (SAFE_SPOTS.includes(abs)) return 60;
    return m.to * 0.3;
  });
}
game.system("speedToggle", function speedSystem(world, _dt) {
  const input = world.getResource("input");
  if (input && input.speed) {
    input.speed = false;
    const turn = world.getResource("turn");
    turn.speed = turn.speed === 1 ? 5 : 1;
  }
});
game.system("render", function renderSystem(world, _dt) {
  const renderer = world.getResource("renderer");
  if (!renderer) return;
  const { ctx } = renderer;
  const state = world.getResource("state");
  const turn = world.getResource("turn");
  clearCanvas(ctx, "#1a1a2e");
  drawBoard(ctx);
  drawTokens(ctx, world);
  if (turn.diceRolled) {
    drawDice(ctx, BOARD_PX + 70, 50, 60, turn.diceValue, {
      bgColor: PLAYERS[turn.currentPlayer].light
    });
  }
  const hx = BOARD_PX + 55;
  ctx.fillStyle = PLAYERS[turn.currentPlayer].color;
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "left";
  ctx.fillText(PLAYERS[turn.currentPlayer].name + "'s turn", hx, 140);
  ctx.fillStyle = "#ccc";
  ctx.font = "12px monospace";
  const msg = turn.message || "";
  const words = msg.split(" ");
  let line = "";
  let ly = 160;
  for (const word of words) {
    if ((line + word).length > 22) {
      ctx.fillText(line, hx, ly);
      ly += 16;
      line = word + " ";
    } else {
      line += word + " ";
    }
  }
  ctx.fillText(line, hx, ly);
  ctx.font = "13px monospace";
  let sy = 210;
  for (let p = 0; p < 4; p++) {
    const tokens = getPlayerTokens(world, p);
    const finished = tokens.filter((t) => t.finished).length;
    const onBoard = tokens.filter((t) => t.pos >= 0 && !t.finished).length;
    ctx.fillStyle = PLAYERS[p].color;
    ctx.fillText(`${PLAYERS[p].name}: ${finished}/4 home`, hx, sy);
    ctx.fillStyle = "#888";
    ctx.fillText(`  (${onBoard} on board)`, hx, sy + 14);
    sy += 36;
  }
  ctx.fillStyle = "#666";
  ctx.font = "11px monospace";
  ctx.fillText(`Speed: ${turn.speed}x (S)`, hx, sy + 10);
  ctx.fillStyle = "#555";
  ctx.font = "10px monospace";
  const logStart = Math.max(0, turn.moveLog.length - 8);
  for (let i = logStart; i < turn.moveLog.length; i++) {
    ctx.fillText(turn.moveLog[i], hx, BOARD_PX - 80 + (i - logStart) * 13);
  }
  if (state.gameOver) {
    const winner = PLAYERS[state.winner];
    drawGameOver(ctx, MX, MY, 15 * CS, 15 * CS, {
      title: `${winner.name} WINS!`,
      titleColor: winner.color,
      subtitle: "Press R to restart"
    });
  }
});
function drawBoard(ctx) {
  const s = CS;
  ctx.fillStyle = "#F5F0E1";
  ctx.fillRect(MX, MY, 15 * s, 15 * s);
  const bases = [
    { x: 0, y: 9, color: "#E53935", light: "#FFCDD2" },
    // Red: bottom-left
    { x: 9, y: 0, color: "#43A047", light: "#C8E6C9" },
    // Green: top-right
    { x: 9, y: 9, color: "#FDD835", light: "#FFF9C4" },
    // Yellow: bottom-right
    { x: 0, y: 0, color: "#1E88E5", light: "#BBDEFB" }
    // Blue: top-left
  ];
  for (const base of bases) {
    ctx.fillStyle = base.light;
    ctx.fillRect(MX + base.x * s, MY + base.y * s, 6 * s, 6 * s);
    ctx.strokeStyle = base.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(MX + base.x * s, MY + base.y * s, 6 * s, 6 * s);
    ctx.fillStyle = "#fff";
    ctx.fillRect(MX + (base.x + 1) * s, MY + (base.y + 1) * s, 4 * s, 4 * s);
    ctx.strokeStyle = base.color;
    ctx.strokeRect(MX + (base.x + 1) * s, MY + (base.y + 1) * s, 4 * s, 4 * s);
  }
  for (let i = 0; i < MAIN_TRACK.length; i++) {
    const [col, row] = MAIN_TRACK[i];
    let color = "#fff";
    if (SAFE_SPOTS.includes(i)) {
      if (i === 0 || i === 47) color = "#FFCDD2";
      else if (i === 13 || i === 8) color = "#C8E6C9";
      else if (i === 26 || i === 21) color = "#FFF9C4";
      else if (i === 39 || i === 34) color = "#BBDEFB";
    }
    drawSquare(ctx, MX + col * s, MY + row * s, s, s, color, "#999");
    if (SAFE_SPOTS.includes(i)) {
      ctx.fillStyle = "#888";
      ctx.font = `${s * 0.5}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u2605", MX + col * s + s / 2, MY + row * s + s / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }
  for (let p = 0; p < 4; p++) {
    const col = HOME_COLS[p];
    for (let i = 0; i < col.length; i++) {
      const [c, r] = col[i];
      drawSquare(ctx, MX + c * s, MY + r * s, s, s, PLAYERS[p].light, PLAYERS[p].color);
    }
  }
  ctx.fillStyle = "#E53935";
  ctx.beginPath();
  ctx.moveTo(MX + 6 * s, MY + 6 * s);
  ctx.lineTo(MX + 7.5 * s, MY + 7.5 * s);
  ctx.lineTo(MX + 6 * s, MY + 9 * s);
  ctx.fill();
  ctx.fillStyle = "#43A047";
  ctx.beginPath();
  ctx.moveTo(MX + 6 * s, MY + 6 * s);
  ctx.lineTo(MX + 7.5 * s, MY + 7.5 * s);
  ctx.lineTo(MX + 9 * s, MY + 6 * s);
  ctx.fill();
  ctx.fillStyle = "#FDD835";
  ctx.beginPath();
  ctx.moveTo(MX + 9 * s, MY + 6 * s);
  ctx.lineTo(MX + 7.5 * s, MY + 7.5 * s);
  ctx.lineTo(MX + 9 * s, MY + 9 * s);
  ctx.fill();
  ctx.fillStyle = "#1E88E5";
  ctx.beginPath();
  ctx.moveTo(MX + 6 * s, MY + 9 * s);
  ctx.lineTo(MX + 7.5 * s, MY + 7.5 * s);
  ctx.lineTo(MX + 9 * s, MY + 9 * s);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.strokeRect(MX, MY, 15 * s, 15 * s);
}
function drawTokens(ctx, world) {
  const posMap = {};
  const allTokens = [];
  for (const eid of world.query("Token")) {
    allTokens.push(world.getComponent(eid, "Token"));
  }
  const stackCount = {};
  for (const tok of allTokens) {
    const key = tok.pos === -1 ? `base-${tok.playerIdx}-${tok.tokenIdx}` : `${tok.playerIdx}-${tok.pos}`;
    stackCount[key] = (stackCount[key] || 0) + 1;
  }
  const drawn = {};
  for (const tok of allTokens) {
    const player = PLAYERS[tok.playerIdx];
    let cx, cy;
    if (tok.finished) {
      const offset = tok.tokenIdx * 8 - 12;
      const center = gc(7, 7);
      cx = center.cx + offset;
      cy = center.cy + (tok.playerIdx < 2 ? -6 : 6);
    } else if (tok.pos === -1) {
      const pos = homeBasePixel(tok.playerIdx, tok.tokenIdx);
      cx = pos.cx;
      cy = pos.cy;
    } else {
      const pos = trackToPixel(tok.playerIdx, tok.pos);
      if (!pos) continue;
      cx = pos.cx;
      cy = pos.cy;
      const key = `${tok.playerIdx}-${tok.pos}`;
      if (!drawn[key]) drawn[key] = 0;
      const stackIdx = drawn[key]++;
      cx += stackIdx * 6 - 3;
      cy += stackIdx * 3 - 2;
    }
    drawToken(ctx, cx, cy, TOKEN_R, player.color, {
      strokeColor: "#fff",
      strokeWidth: 2,
      label: String(tok.tokenIdx + 1),
      labelColor: tok.playerIdx === 2 ? "#333" : "#fff"
      // Dark text on yellow
    });
  }
}
var game_default = game;
export {
  game_default as default
};

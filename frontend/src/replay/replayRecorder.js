// Records inputs and keyframes during a live match.
// Entirely in-memory — no network, no localStorage.
//
// Strategy: keyframe recorded after EVERY piece lock.
// This guarantees the engine never needs to cross a lock boundary during
// replay, avoiding non-determinism from dequeue() refills and applyGarbage()
// random hole columns.

export class ReplayRecorder {
  constructor({ seed, startLevel = 1 }) {
    this.seed       = seed;
    this.startLevel = startLevel;
    this.startTime  = null;
    this.inputs     = [];
    this.keyframes  = [];
    this._running   = false;
  }

  start() {
    this.startTime = performance.now();
    this.inputs    = [];
    this.keyframes = [];
    this._running  = true;
  }

  // Call once per player action dispatched in the input loop.
  recordInput(action) {
    if (!this._running) return;
    this.inputs.push({ action, t: this._now() });
  }

  // Call after EVERY piece lock (and once at t=0 for the initial state).
  // State must be the result AFTER the lock — i.e. the new piece is already
  // spawned, board and queue reflect the locked state.
  recordKeyframe(gameState) {
    if (!this._running) return;
    this.keyframes.push({ t: this._now(), state: _serializeState(gameState) });
  }

  // Force a keyframe at the very start (t=0) before _running guard matters.
  forceKeyframe(gameState) {
    this.keyframes.push({ t: this._now(), state: _serializeState(gameState) });
  }

  // Returns the complete player block.
  // meta = { nickname, score, lines, level }
  finish(meta = {}) {
    this._running = false;
    return {
      seed:       this.seed,
      startLevel: this.startLevel,
      inputs:     this.inputs,
      keyframes:  this.keyframes,
      meta,
    };
  }

  _now() {
    if (!this.startTime) return 0;
    return Math.round(performance.now() - this.startTime);
  }
}

// Serialize exactly the fields needed for deterministic mid-piece replay.
// Board is stored flat (TOTAL_ROWS * COLS integers).
function _serializeState(s) {
  return {
    board:          _flatBoard(s.board),
    piece:          s.piece ? { ...s.piece } : null,
    queue:          [...s.queue],
    holdType:       s.holdType   ?? null,
    holdUsed:       s.holdUsed   ?? false,
    combo:          s.combo      ?? -1,
    score:          s.score      ?? 0,
    lines:          s.lines      ?? 0,
    level:          s.level      ?? 1,
    pendingGarbage: s.pendingGarbage ?? 0,
  };
}

function _flatBoard(board) {
  const out = [];
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board[r].length; c++)
      out.push(board[r][c]);
  return out;
}
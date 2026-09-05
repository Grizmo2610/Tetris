import { emptyBoard } from '../engine/board.js';
import { initQueue } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick, receiveGarbage,
  enqueueGarbage, counterGarbageQueue, flushGarbageQueue,
} from '../engine/physics.js';
import { InputHandler } from '../input/inputHandler.js';
import { renderBoard, renderOpponentBoard, renderNextQueue, renderHoldPiece } from '../renderer/boardRenderer.js';
import { COLS, ROWS, BUFFER, TOTAL_ROWS } from '../../utils/constants.js';

// ─── OnlinePvpMode ────────────────────────────────────────────────────────────
// Handles one player's local game + opponent board display via WebSocket.

export class OnlinePvpMode {
  constructor({ mainCanvas, nextCanvas, holdCanvas, opponentCanvas,
                socket, onGameOver, onScoreUpdate, onDisconnect }) {
    this.mainCanvas     = mainCanvas;
    this.nextCanvas     = nextCanvas;
    this.holdCanvas     = holdCanvas;
    this.opponentCanvas = opponentCanvas;

    this.ctx  = mainCanvas.getContext('2d');
    this.nctx = nextCanvas.getContext('2d');
    this.hctx = holdCanvas.getContext('2d');
    this.octx = opponentCanvas.getContext('2d');

    this.socket        = socket;
    this.onGameOver    = onGameOver    ?? (() => {});
    this.onScoreUpdate = onScoreUpdate ?? (() => {});
    this.onDisconnect  = onDisconnect  ?? (() => {});

    this.state                  = null;
    this.opponentBoard          = null;
    this.opponentPendingGarbage = 0;

    this.input    = new InputHandler();
    this.raf      = null;
    this.lastTime = null;
    this.over     = false;
    this.paused   = false;
    this._loop = this._loop.bind(this);
    this._socketListeners = {};
  }

  start() {
    const queue = initQueue();
    const base  = createGameState(queue);
    this.state         = { ...base, board: emptyBoard() };
    this.opponentBoard = new Int8Array(COLS * ROWS);
    this.over   = false;
    this.paused = false;
    this.input.attach();
    this._attachSocketListeners();
    this.lastTime = null;
    this.raf = requestAnimationFrame(this._loop);
  }

  // Online mode: ESC shows pause overlay but does NOT freeze local game loop
  // (pausing mid-game against a live opponent is unfair). We expose pause/resume
  // so GameScreen can show a "Paused" overlay without stopping the rAF loop.
  pause() {
    if (this.paused || this.over) return;
    this.paused = true;
    cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  resume() {
    if (!this.paused || this.over) return;
    this.paused   = false;
    this.lastTime = null;
    this.raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this._detachSocketListeners();
  }

  // ─── Socket listeners ──────────────────────────────────────────────────────

  _attachSocketListeners() {
    const s = this.socket;

    const onOpponentUpdate = ({ board, linesCleared }) => {
      this.opponentBoard = new Int8Array(board);
      // Opponent clearing lines counters our outgoing garbage queue
      if (linesCleared > 0 && this.state) {
        this.state = {
          ...this.state,
          garbageQueue: counterGarbageQueue(this.state.garbageQueue ?? [], linesCleared),
        };
      }
    };

    // Opponent's 5-second delay expired — apply garbage to our board
    const onGarbageFlush = ({ amount }) => {
      if (amount > 0 && this.state?.status === 'playing') {
        this.state = receiveGarbage(this.state, amount);
      }
    };

    const onOpponentDisconnected = ({ timeoutSeconds }) => {
      this.onDisconnect({ type: 'disconnected', timeoutSeconds });
    };

    const onOpponentReconnected = () => {
      this.onDisconnect({ type: 'reconnected' });
    };

    const onOpponentLeft = () => {
      this.over = true;
      cancelAnimationFrame(this.raf);
      this.onGameOver({ reason: 'opponent_left', winner: true });
    };

    const onGameOver = ({ winner, loser, reason }) => {
      this.over = true;
      cancelAnimationFrame(this.raf);
      const st = this.state;
      this.onGameOver({ winner, loser, reason, score: st.score, lines: st.lines, level: st.level });
    };

    s.on('opponent-update',        onOpponentUpdate);
    s.on('garbage-flush',          onGarbageFlush);
    s.on('opponent-disconnected',  onOpponentDisconnected);
    s.on('opponent-reconnected',   onOpponentReconnected);
    s.on('opponent-left',          onOpponentLeft);
    s.on('game-over',              onGameOver);

    this._socketListeners = {
      'opponent-update':       onOpponentUpdate,
      'garbage-flush':         onGarbageFlush,
      'opponent-disconnected': onOpponentDisconnected,
      'opponent-reconnected':  onOpponentReconnected,
      'opponent-left':         onOpponentLeft,
      'game-over':             onGameOver,
    };
  }

  _detachSocketListeners() {
    for (const [event, handler] of Object.entries(this._socketListeners)) {
      this.socket.off(event, handler);
    }
    this._socketListeners = {};
  }

  // ─── Board serialization (visible 20 rows → flat array) ───────────────────

  _serializeBoard(board) {
    const flat = new Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        flat[r * COLS + c] = board[r + BUFFER][c];
      }
    }
    return flat;
  }

  _emitUpdate(state, garbageFlushed = 0) {
    const board = this._serializeBoard(state.board);
    this.socket.emit('game-update', {
      board,
      garbageSent:  garbageFlushed,
      linesCleared: state._linesCleared ?? 0,
      combo:        state.combo,
    });
  }

  // ─── Main loop ─────────────────────────────────────────────────────────────

  _loop(ts) {
    if (this.over || this.paused) return;

    const dt = this.lastTime ? Math.min(ts - this.lastTime, 100) : 0;
    this.lastTime = ts;
    const nowMs = performance.now();

    let s = this.state;
    if (!s || s.status !== 'playing') return;

    const actions = this.input.update(dt);
    for (const action of actions) {
      switch (action) {
        case 'moveLeft':   s = applyMove(s, -1);                             break;
        case 'moveRight':  s = applyMove(s, 1);                              break;
        case 'softDrop':   s = applySoftDrop(s);                              break;
        case 'hardDrop':   s = applyHardDrop(s);                              break;
        case 'rotateCW':   s = applyRotation(s, 1);                           break;
        case 'rotateCCW':  s = applyRotation(s, -1);                          break;
        case 'rotate180':  s = applyRotation(applyRotation(s, 1), 1);         break;
        case 'hold':       s = applyHold(s);                                  break;
      }
    }

    s = applyGravityTick(s, dt);
    if (s.onGround) s = applyLockTick(s, dt);

    // On piece lock: enqueue outgoing garbage with 5-second delay, emit board
    if (s._garbageSent !== undefined) {
      const sent = s._garbageSent ?? 0;
      if (sent > 0) {
        s = { ...s, garbageQueue: enqueueGarbage(s.garbageQueue ?? [], sent, nowMs) };
      }
      // Emit board state immediately (garbageSent=0; real garbage fires on flush)
      this._emitUpdate(s, 0);
      s = { ...s, _garbageSent: undefined, _linesCleared: undefined, _tspinType: undefined };
    }

    // Flush matured garbage: emit to server so opponent receives it
    if (s.garbageQueue?.length) {
      const { flushed, queue } = flushGarbageQueue(s.garbageQueue, nowMs);
      s = { ...s, garbageQueue: queue };
      if (flushed > 0) {
        // Emit a dedicated garbage flush event so opponent applies it
        this.socket.emit('garbage-flush', { amount: flushed });
      }
    }

    this.state = s;

    // Render
    renderBoard(this.ctx, s);
    renderNextQueue(this.nctx, s.queue);
    renderHoldPiece(this.hctx, s.holdType, s.holdUsed);
    this._renderOpponent();

    this.onScoreUpdate({ score: s.score, lines: s.lines, level: s.level });

    if (s.status === 'gameover') {
      this.over = true;
      this.socket.emit('game-over', { score: s.score, lines: s.lines, level: s.level });
      return;
    }

    this.raf = requestAnimationFrame(this._loop);
  }

  _renderOpponent() {
    const board2d = Array.from({ length: TOTAL_ROWS }, () => new Int8Array(COLS));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        board2d[r + BUFFER][c] = this.opponentBoard[r * COLS + c];
      }
    }
    renderOpponentBoard(this.octx, board2d, this.opponentPendingGarbage);
  }
}
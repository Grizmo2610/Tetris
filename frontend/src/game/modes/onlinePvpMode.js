import { emptyBoard } from '../engine/board.js';
import { initQueue } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick, receiveGarbage,
} from '../engine/physics.js';
import { InputHandler } from '../input/inputHandler.js';
import { renderBoard, renderOpponentBoard, renderNextQueue, renderHoldPiece, BOARD_W, BOARD_H } from '../renderer/boardRenderer.js';
import { COLS, BUFFER, TOTAL_ROWS } from '../../utils/constants.js';

// ─── OnlinePvpMode ────────────────────────────────────────────────────────────
// Handles one player's local game + opponent board display via WebSocket.
//
// Usage:
//   const mode = new OnlinePvpMode({
//     mainCanvas, nextCanvas, holdCanvas,
//     opponentCanvas,
//     socket,                    // socketClient instance
//     onGameOver, onScoreUpdate, onDisconnect,
//   })
//   mode.start()
//   mode.destroy()

export class OnlinePvpMode {
  constructor({ mainCanvas, nextCanvas, holdCanvas, opponentCanvas,
                socket, onGameOver, onScoreUpdate, onDisconnect }) {
    this.mainCanvas = mainCanvas;
    this.nextCanvas = nextCanvas;
    this.holdCanvas = holdCanvas;
    this.opponentCanvas = opponentCanvas;

    this.ctx  = mainCanvas.getContext('2d');
    this.nctx = nextCanvas.getContext('2d');
    this.hctx = holdCanvas.getContext('2d');
    this.octx = opponentCanvas.getContext('2d');

    this.socket = socket;
    this.onGameOver    = onGameOver    ?? (() => {});
    this.onScoreUpdate = onScoreUpdate ?? (() => {});
    this.onDisconnect  = onDisconnect  ?? (() => {});

    this.state = null;
    this.opponentBoard = null;      // flat Int8Array(200) from opponent
    this.opponentPendingGarbage = 0;

    this.input = new InputHandler();
    this.raf = null;
    this.lastTime = null;
    this.over = false;
    this._loop = this._loop.bind(this);
    this._socketListeners = {};
  }

  start() {
    const queue = initQueue();
    const base = createGameState(queue);
    this.state = { ...base, board: emptyBoard() };
    this.opponentBoard = new Int8Array(COLS * ROWS); // cleared board
    this.over = false;
    this.input.attach();
    this._attachSocketListeners();
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

    const onOpponentUpdate = ({ board, garbageSent, linesCleared, combo }) => {
      // board is flat array [200] of visible rows (row 0 = top visible)
      this.opponentBoard = new Int8Array(board);
      if (garbageSent > 0) {
        this.state = receiveGarbage(this.state, garbageSent);
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
      const s = this.state;
      this.onGameOver({ winner, loser, reason, score: s.score, lines: s.lines, level: s.level });
    };

    s.on('opponent-update', onOpponentUpdate);
    s.on('opponent-disconnected', onOpponentDisconnected);
    s.on('opponent-reconnected', onOpponentReconnected);
    s.on('opponent-left', onOpponentLeft);
    s.on('game-over', onGameOver);

    this._socketListeners = {
      'opponent-update': onOpponentUpdate,
      'opponent-disconnected': onOpponentDisconnected,
      'opponent-reconnected': onOpponentReconnected,
      'opponent-left': onOpponentLeft,
      'game-over': onGameOver,
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

  // ─── Emit game-update after each piece lock ────────────────────────────────

  _emitUpdate(state) {
    const board = this._serializeBoard(state.board);
    this.socket.emit('game-update', {
      board,
      garbageSent: state._garbageSent ?? 0,
      linesCleared: state._linesCleared ?? 0,
      combo: state.combo,
    });
  }

  // ─── Main loop ─────────────────────────────────────────────────────────────

  _loop(ts) {
    const dt = this.lastTime ? Math.min(ts - this.lastTime, 100) : 0;
    this.lastTime = ts;
    if (this.over) return;

    let s = this.state;
    if (!s || s.status !== 'playing') return;

    const prevLockMoves = s.lockMoves;
    const actions = this.input.update(dt);
    for (const action of actions) {
      switch (action) {
        case 'moveLeft':   s = applyMove(s, -1);        break;
        case 'moveRight':  s = applyMove(s, 1);         break;
        case 'softDrop':   s = applySoftDrop(s);         break;
        case 'hardDrop':   s = applyHardDrop(s);         break;
        case 'rotateCW':   s = applyRotation(s, 1);      break;
        case 'rotateCCW':  s = applyRotation(s, -1);     break;
        case 'rotate180':  s = applyRotation(applyRotation(s, 1), 1); break;
        case 'hold':       s = applyHold(s);             break;
        case 'pause':
          // Pause not supported in online mode; could show warning
          break;
      }
    }

    const wasLocked = s.lockMoves !== prevLockMoves; // rough proxy
    s = applyGravityTick(s, dt);
    const prevMoves = s.lockMoves;
    if (s.onGround) s = applyLockTick(s, dt);

    // Detect lock event (lockMoves reset after locking)
    const justLocked = s.lockMoves < prevMoves || s._garbageSent !== undefined && s._linesCleared !== undefined;

    if (justLocked || (s._linesCleared !== undefined && s._linesCleared >= 0)) {
      if (s._garbageSent !== undefined) {
        this._emitUpdate(s);
        s = { ...s, _garbageSent: undefined, _linesCleared: undefined, _tspinType: undefined };
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
      // Emit our loss to server
      this.socket.emit('game-over', {
        score: s.score,
        lines: s.lines,
        level: s.level,
      });
      return;
    }

    this.raf = requestAnimationFrame(this._loop);
  }

  _renderOpponent() {
    // Reconstruct 2D board from flat array for renderer
    const board2d = Array.from({ length: TOTAL_ROWS }, () => new Int8Array(COLS));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        board2d[r + BUFFER][c] = this.opponentBoard[r * COLS + c];
      }
    }
    renderOpponentBoard(this.octx, board2d, this.opponentPendingGarbage);
  }
}

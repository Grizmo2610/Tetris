import { emptyBoard } from '../engine/board.js';
import { initQueueFromSeed, generateSeed } from '../engine/piece.js';
import { ReplayRecorder } from '../../replay/replayRecorder.js';
import { buildReplayData, replayStorage } from '../../replay/replayStorage.js';
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
    this._recorder  = null;
    this._startTs   = null;
    this._loop = this._loop.bind(this);
    this._socketListeners = {};
  }

  start() {
    const seed = generateSeed();
    const queue = initQueueFromSeed(seed);
    const base  = createGameState(queue);
    this.state         = { ...base, board: emptyBoard() };
    this.opponentBoard = new Int8Array(COLS * ROWS);
    this.over   = false;
    this.paused = false;
    this._startTs = performance.now();

    this._recorder = new ReplayRecorder({ seed, startLevel: 1 });
    this._recorder.start();
    this._recorder.forceKeyframe(this.state);
    this._opponentBoardTimeline = [];

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
      this._opponentBoardTimeline?.push({ t: Math.round(performance.now() - this._startTs), board: Array.from(board) });
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
        this._recorder?.recordGarbageReceived(amount);
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
      if (this._recorder) {
        const durationMs = Math.round(performance.now() - this._startTs);
        const p1Block = this._recorder.finish({
          nickname: 'Player',
          score: st.score, lines: st.lines, level: st.level,
        });
        replayStorage.set(buildReplayData({
          mode: 'onlinePvp',
          winner: winner ?? null,
          p1Block,
          p2Block: this._opponentBoardTimeline?.length
            ? { boardTimeline: this._opponentBoardTimeline, meta: { nickname: 'Opponent' } }
            : null,
          durationMs,
        }));
        this._recorder = null;
        this._opponentBoardTimeline = null;
      }
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
      const pieceBeforeInput = s.piece;
      switch (action) {
        case 'moveLeft':   this._recorder?.recordInput(action); s = applyMove(s, -1);                             break;
        case 'moveRight':  this._recorder?.recordInput(action); s = applyMove(s, 1);                              break;
        case 'softDrop':   this._recorder?.recordInput(action); s = applySoftDrop(s);                              break;
        case 'hardDrop':   this._recorder?.recordInput(action); s = applyHardDrop(s);                              break;
        case 'rotateCW':   this._recorder?.recordInput(action); s = applyRotation(s, 1);                           break;
        case 'rotateCCW':  this._recorder?.recordInput(action); s = applyRotation(s, -1);                          break;
        case 'rotate180':  this._recorder?.recordInput(action); s = applyRotation(applyRotation(s, 1), 1);         break;
        case 'hold':       this._recorder?.recordInput(action); s = applyHold(s);                                  break;
      }
      if (action === 'hardDrop' && s.piece !== pieceBeforeInput) {
        this._recorder?.recordKeyframe(s);
      }
    }

    const prevPiece = s.piece;
    s = applyGravityTick(s, dt);
    if (s.onGround) s = applyLockTick(s, dt);
    if (s.piece !== prevPiece) this._recorder?.recordKeyframe(s);

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
      cancelAnimationFrame(this.raf);
      this.raf = null;
      this.socket.emit('game-over', { score: s.score, lines: s.lines, level: s.level });
      // Note: GameScreen shows game-over overlay when server echoes 'game-over' back.
      // If server is unreachable, fall back to local game-over after 3s.
      setTimeout(() => {
        if (this.over && !this.paused) {
          this.onGameOver({ reason: 'topout', winner: false, score: s.score, lines: s.lines, level: s.level });
        }
      }, 3000);
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
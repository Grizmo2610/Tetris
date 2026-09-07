import { emptyBoard } from '../engine/board.js';
import { initQueueFromSeed, generateSeed } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick,
} from '../engine/physics.js';
import { InputHandler } from '../input/inputHandler.js';
import { renderBoard, renderNextQueue, renderHoldPiece } from '../renderer/boardRenderer.js';
import { ReplayRecorder } from '../../replay/replayRecorder.js';
import { buildReplayData, replayStorage } from '../../replay/replayStorage.js';

// ─── SoloMode ─────────────────────────────────────────────────────────────────
// Usage:
//   const mode = new SoloMode({ mainCanvas, nextCanvas, holdCanvas, onGameOver, onScoreUpdate })
//   mode.start()
//   mode.destroy()
//
// Pause/resume is handled externally by GameScreen (ESC key listener).
// Call mode.pause() / mode.resume() from the parent.

export class SoloMode {
  constructor({ mainCanvas, nextCanvas, holdCanvas, onGameOver, onScoreUpdate }) {
    this.mainCanvas = mainCanvas;
    this.nextCanvas = nextCanvas;
    this.holdCanvas = holdCanvas;
    this.onGameOver    = onGameOver    ?? (() => {});
    this.onScoreUpdate = onScoreUpdate ?? (() => {});

    this.ctx  = mainCanvas.getContext('2d');
    this.nctx = nextCanvas.getContext('2d');
    this.hctx = holdCanvas.getContext('2d');

    this.state    = null;
    this.input    = new InputHandler();
    this.raf      = null;
    this.lastTime = null;
    this.paused   = false;
    this._seed    = null;
    this._recorder = null;
    this._startTs  = null;
    this._lastKfT  = -Infinity;
    this._loop = this._loop.bind(this);
  }

  start() {
    this._seed = generateSeed();
    const queue = initQueueFromSeed(this._seed);
    const base  = createGameState(queue);
    this.state    = { ...base, board: emptyBoard() };
    this.paused   = false;
    this.lastTime = null;
    this._startTs  = performance.now();
    this._lastKfT  = -Infinity;

    this._recorder = new ReplayRecorder({ seed: this._seed, startLevel: 1 });
    this._recorder.start();
    this._recorder.forceKeyframe(this.state);

    this.input.attach();
    this.raf = requestAnimationFrame(this._loop);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  resume() {
    if (!this.paused) return;
    this.paused   = false;
    this.lastTime = null; // reset so dt=0 on first resumed frame
    this.raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.detach();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _loop(ts) {
    if (this.paused) return;

    const dt = this.lastTime ? Math.min(ts - this.lastTime, 100) : 0;
    this.lastTime = ts;

    let s = this.state;
    if (!s || s.status !== 'playing') return;

    // Process input
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
      // Keyframe immediately after hardDrop lock (piece already spawned)
      if (action === 'hardDrop' && s.piece !== pieceBeforeInput && this._recorder) {
        this._recorder.recordKeyframe(s);
      }
    }

    // Physics
    const prevPiece = s.piece;
    s = applyGravityTick(s, dt);
    if (s.onGround) s = applyLockTick(s, dt);

    // Keyframe after gravity-triggered lock
    if (s.piece !== prevPiece && this._recorder) {
      this._recorder.recordKeyframe(s);
    }

    this.state = s;

    // Render
    this._render(s);

    // Notify score
    this.onScoreUpdate({ score: s.score, lines: s.lines, level: s.level });

    if (s.status === 'gameover') {
      this._render(s);
      if (this._recorder) {
        const durationMs = Math.round(performance.now() - this._startTs);
        const p1Block = this._recorder.finish({
          nickname: this.nickname ?? 'Player',
          score: s.score, lines: s.lines, level: s.level,
        });
        replayStorage.set(buildReplayData({
          mode: 'solo',
          winner: null,
          p1Block,
          durationMs,
        }));
        this._recorder = null;
      }
      this.onGameOver({ score: s.score, lines: s.lines, level: s.level });
      return;
    }

    this.raf = requestAnimationFrame(this._loop);
  }

  _render(s) {
    renderBoard(this.ctx, s);
    renderNextQueue(this.nctx, s.queue);
    renderHoldPiece(this.hctx, s.holdType, s.holdUsed);
  }
}
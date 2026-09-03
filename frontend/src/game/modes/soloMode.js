import { emptyBoard } from '../engine/board.js';
import { initQueue } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick,
} from '../engine/physics.js';
import { InputHandler } from '../input/inputHandler.js';
import { renderBoard, renderNextQueue, renderHoldPiece, BOARD_W, BOARD_H } from '../renderer/boardRenderer.js';

// ─── SoloMode ─────────────────────────────────────────────────────────────────
// Usage:
//   const mode = new SoloMode({ mainCanvas, nextCanvas, holdCanvas, onGameOver, onScoreUpdate })
//   mode.start()
//   mode.destroy()

export class SoloMode {
  constructor({ mainCanvas, nextCanvas, holdCanvas, onGameOver, onScoreUpdate }) {
    this.mainCanvas = mainCanvas;
    this.nextCanvas = nextCanvas;
    this.holdCanvas = holdCanvas;
    this.onGameOver = onGameOver ?? (() => {});
    this.onScoreUpdate = onScoreUpdate ?? (() => {});

    this.ctx = mainCanvas.getContext('2d');
    this.nctx = nextCanvas.getContext('2d');
    this.hctx = holdCanvas.getContext('2d');

    this.state = null;
    this.input = new InputHandler();
    this.raf = null;
    this.lastTime = null;
    this._loop = this._loop.bind(this);
  }

  start() {
    const queue = initQueue();
    const base = createGameState(queue);
    this.state = { ...base, board: emptyBoard() };
    this.input.attach();
    this.lastTime = null;
    this.raf = requestAnimationFrame(this._loop);
  }

  pause() {
    if (this.state?.status === 'playing') {
      this.state = { ...this.state, status: 'paused' };
      cancelAnimationFrame(this.raf);
    }
  }

  resume() {
    if (this.state?.status === 'paused') {
      this.state = { ...this.state, status: 'playing', lastTime: null };
      this.lastTime = null;
      this.raf = requestAnimationFrame(this._loop);
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.detach();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _loop(ts) {
    const dt = this.lastTime ? Math.min(ts - this.lastTime, 100) : 0;
    this.lastTime = ts;

    let s = this.state;
    if (!s || s.status !== 'playing') return;

    // Process input
    const actions = this.input.update(dt);
    for (const action of actions) {
      switch (action) {
        case 'moveLeft':    s = applyMove(s, -1); break;
        case 'moveRight':   s = applyMove(s, 1);  break;
        case 'softDrop':    s = applySoftDrop(s);  break;
        case 'hardDrop':    s = applyHardDrop(s);  break;
        case 'rotateCW':    s = applyRotation(s, 1);  break;
        case 'rotateCCW':   s = applyRotation(s, -1); break;
        case 'rotate180':
          s = applyRotation(applyRotation(s, 1), 1);  break;
        case 'hold':        s = applyHold(s);      break;
        case 'pause':       this.state = s; this.pause(); return;
      }
    }

    // Physics
    s = applyGravityTick(s, dt);
    if (s.onGround) s = applyLockTick(s, dt);

    this.state = s;

    // Render
    this._render(s);

    // Notify score update
    this.onScoreUpdate({ score: s.score, lines: s.lines, level: s.level });

    if (s.status === 'gameover') {
      this._render(s);
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

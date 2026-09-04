import { emptyBoard } from '../engine/board.js';
import { initQueue } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick, receiveGarbage,
} from '../engine/physics.js';
import { InputHandler, DEFAULT_BINDINGS_P1, DEFAULT_BINDINGS_P2 } from '../input/inputHandler.js';
import { renderBoard, renderNextQueue, renderHoldPiece } from '../renderer/boardRenderer.js';

// ─── LocalPvpMode ──────────────────────────────────────────────────────────────
// Two boards, two InputHandlers, one shared requestAnimationFrame loop.
// Garbage flows: P1 → P2 and P2 → P1 via _garbageSent metadata on each lock.

export class LocalPvpMode {
  constructor({ p1Canvases, p2Canvases, onGameOver, onScoreUpdate }) {
    this.canvases = [p1Canvases, p2Canvases];
    this.ctxs = [
      p1Canvases.main.getContext('2d'),
      p2Canvases.main.getContext('2d'),
    ];
    this.nctxs = [
      p1Canvases.next.getContext('2d'),
      p2Canvases.next.getContext('2d'),
    ];
    this.hctxs = [
      p1Canvases.hold.getContext('2d'),
      p2Canvases.hold.getContext('2d'),
    ];

    this.onGameOver    = onGameOver    ?? (() => {});
    this.onScoreUpdate = onScoreUpdate ?? (() => {});

    this.states = [null, null];
    this.inputs = [
      new InputHandler(InputHandler.loadBindings('p1') ?? DEFAULT_BINDINGS_P1),
      new InputHandler(InputHandler.loadBindings('p2') ?? DEFAULT_BINDINGS_P2),
    ];
    this.raf      = null;
    this.lastTime = null;
    this.over     = false;
    this.paused   = false;
    this._loop = this._loop.bind(this);
  }

  start() {
    for (let i = 0; i < 2; i++) {
      const queue = initQueue();
      const base  = createGameState(queue);
      this.states[i] = { ...base, board: emptyBoard() };
      this.inputs[i].attach();
    }
    this.over     = false;
    this.paused   = false;
    this.lastTime = null;
    this.raf = requestAnimationFrame(this._loop);
  }

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
    this.inputs[0].detach();
    this.inputs[1].detach();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _loop(ts) {
    if (this.over || this.paused) return;

    const dt = this.lastTime ? Math.min(ts - this.lastTime, 100) : 0;
    this.lastTime = ts;

    // garbage[i] = lines to send TO player i (accumulated this frame)
    const garbagePending = [0, 0];

    for (let i = 0; i < 2; i++) {
      let s = this.states[i];
      if (!s || s.status !== 'playing') continue;

      const actions = this.inputs[i].update(dt);
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

      // Collect garbage generated this tick (set by applyLock)
      const garbage = s._garbageSent ?? 0;
      if (garbage > 0) {
        garbagePending[1 - i] += garbage;
        s = { ...s, _garbageSent: 0 };
      }

      this.states[i] = s;
    }

    // Apply accumulated garbage to opponents
    for (let i = 0; i < 2; i++) {
      if (garbagePending[i] > 0) {
        this.states[i] = receiveGarbage(this.states[i], garbagePending[i]);
      }
    }

    // Check game over
    for (let i = 0; i < 2; i++) {
      if (this.states[i]?.status === 'gameover') {
        this.over = true;
        this._renderAll();
        const winner = i === 0 ? 1 : 0;
        this.onGameOver({
          winner,
          scores: this.states.map(s => ({ score: s.score, lines: s.lines, level: s.level })),
        });
        return;
      }
    }

    this._renderAll();
    this.onScoreUpdate(this.states.map(s => ({ score: s.score, lines: s.lines, level: s.level })));

    this.raf = requestAnimationFrame(this._loop);
  }

  _renderAll() {
    for (let i = 0; i < 2; i++) {
      const s = this.states[i];
      if (!s) continue;
      renderBoard(this.ctxs[i], s, { dimmed: s.status !== 'playing' });
      renderNextQueue(this.nctxs[i], s.queue);
      renderHoldPiece(this.hctxs[i], s.holdType, s.holdUsed);
    }
  }
}
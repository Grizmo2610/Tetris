import { emptyBoard } from '../engine/board.js';
import { initQueueFromSeed, generateSeed } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick, receiveGarbage,
} from '../engine/physics.js';
import { InputHandler } from '../input/inputHandler.js';
import { renderBoard, renderNextQueue, renderHoldPiece } from '../renderer/boardRenderer.js';
import { renderGameOverOverlay } from '../renderer/uiRenderer.js';
import { BOARD_W, BOARD_H } from '../../utils/constants.js';

// ─── Local PvP key bindings ───────────────────────────────────────────────────
const LOCAL_BINDINGS_P1 = {
  moveLeft:  'a',
  moveRight: 'd',
  softDrop:  's',
  hardDrop:  ' ',
  rotateCW:  'w',
  rotateCCW: 'z',
  rotate180: null,
  hold:      'c',
  pause:     null,
};

const LOCAL_BINDINGS_P2 = {
  moveLeft:  'ArrowLeft',
  moveRight: 'ArrowRight',
  softDrop:  'ArrowDown',
  hardDrop:  'l',
  rotateCW:  'ArrowUp',
  rotateCCW: 'j',
  rotate180: null,
  hold:      'k',
  pause:     null,
};

// ─── LocalPvpMode ─────────────────────────────────────────────────────────────
//
// SCORE-BASED WIN CONDITION:
//   When a player overflows (top-out), their board freezes with a "GAME OVER"
//   overlay and their final score is locked in as the target.
//   The surviving player must reach that target score to win.
//   If the surviving player also overflows before reaching the target → they lose.
//   If both overflow on the same frame → higher score wins.

export class LocalPvpMode {
  constructor({ p1Canvases, p2Canvases, onGameOver, onScoreUpdate }) {
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

    this.states    = [null, null];
    // lockedScore[i] = the score that player i locked in when they topped out.
    // null = still alive.
    this.lockedScore = [null, null];

    this.inputs = [
      new InputHandler(LOCAL_BINDINGS_P1),
      new InputHandler(LOCAL_BINDINGS_P2),
    ];
    this.raf      = null;
    this.lastTime = null;
    this.over     = false;
    this.paused   = false;
    this._loop = this._loop.bind(this);
  }

  start() {
    const seed = generateSeed();
    for (let i = 0; i < 2; i++) {
      const queue = initQueueFromSeed(seed);
      this.states[i] = { ...createGameState(queue), board: emptyBoard() };
      this.lockedScore[i] = null;
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

    const garbagePending = [0, 0];

    // ── Tick each player that is still alive ──────────────────────────────
    for (let i = 0; i < 2; i++) {
      let s = this.states[i];
      if (!s || s.status !== 'playing') continue;

      const actions = this.inputs[i].update(dt);
      for (const action of actions) {
        switch (action) {
          case 'moveLeft':  s = applyMove(s, -1);                            break;
          case 'moveRight': s = applyMove(s,  1);                            break;
          case 'softDrop':  s = applySoftDrop(s);                             break;
          case 'hardDrop':  s = applyHardDrop(s);                             break;
          case 'rotateCW':  s = applyRotation(s,  1);                         break;
          case 'rotateCCW': s = applyRotation(s, -1);                         break;
          case 'rotate180': s = applyRotation(applyRotation(s, 1), 1);        break;
          case 'hold':      s = applyHold(s);                                 break;
        }
      }

      s = applyGravityTick(s, dt);
      if (s.onGround) s = applyLockTick(s, dt);

      const garbage = s._garbageSent ?? 0;
      if (garbage > 0) {
        garbagePending[1 - i] += garbage;
        s = { ...s, _garbageSent: 0 };
      }

      this.states[i] = s;
    }

    // ── Apply garbage only to alive players ───────────────────────────────
    for (let i = 0; i < 2; i++) {
      if (garbagePending[i] > 0 && this.states[i]?.status === 'playing') {
        this.states[i] = receiveGarbage(this.states[i], garbagePending[i]);
      }
    }

    // ── Lock in scores for newly topped-out players ───────────────────────
    for (let i = 0; i < 2; i++) {
      if (this.states[i]?.status === 'gameover' && this.lockedScore[i] === null) {
        this.lockedScore[i] = this.states[i].score;
      }
    }

    // ── Evaluate win condition ────────────────────────────────────────────
    const result = this._checkWinner();
    if (result !== null) {
      this.over = true;
      this._renderAll();
      this.onGameOver({
        winner: result.winner,   // 0, 1, or -1 (draw)
        scores: this.states.map(s => ({ score: s.score, lines: s.lines, level: s.level })),
      });
      return;
    }

    this._renderAll();
    this.onScoreUpdate(
      this.states.map((s, i) => ({
        score: s.score,
        lines: s.lines,
        level: s.level,
        // Pass target score to HUD so it can show the chase indicator
        targetScore: this.lockedScore[1 - i],
      }))
    );

    this.raf = requestAnimationFrame(this._loop);
  }

  // Returns { winner: 0|1|-1 } or null (game continues).
  //
  // Cases:
  //   1. Both alive              → null (keep playing)
  //   2. One topped-out, other alive:
  //        - alive player's score >= dead player's locked score → alive wins
  //        - alive player also tops out before reaching target  → dead player wins
  //   3. Both topped-out same frame → higher score wins (draw if equal)
  _checkWinner() {
    const s0 = this.states[0];
    const s1 = this.states[1];
    const dead0 = s0?.status === 'gameover';
    const dead1 = s1?.status === 'gameover';

    // Both still alive
    if (!dead0 && !dead1) return null;

    // Both topped out (same frame or already dead)
    if (dead0 && dead1) {
      const sc0 = s0.score;
      const sc1 = s1.score;
      if (sc0 > sc1) return { winner: 0 };
      if (sc1 > sc0) return { winner: 1 };
      return { winner: -1 }; // draw
    }

    // P0 topped out, P1 still alive
    if (dead0 && !dead1) {
      const target = this.lockedScore[0];
      // P1 has reached or exceeded P0's score → P1 wins
      if (s1.score >= target) return { winner: 1 };
      // P1 still alive but hasn't reached target yet → keep playing
      return null;
    }

    // P1 topped out, P0 still alive
    if (!dead0 && dead1) {
      const target = this.lockedScore[1];
      if (s0.score >= target) return { winner: 0 };
      return null;
    }

    return null;
  }

  _renderAll() {
    for (let i = 0; i < 2; i++) {
      const s = this.states[i];
      if (!s) continue;
      renderBoard(this.ctxs[i], s);
      renderNextQueue(this.nctxs[i], s.queue);
      renderHoldPiece(this.hctxs[i], s.holdType, s.holdUsed);

      // If this player is dead but game is still going, show overlay + target label
      if (s.status === 'gameover' && !this.over) {
        const ctx = this.ctxs[i];
        renderGameOverOverlay(ctx, BOARD_W, BOARD_H);
        // Show locked score so the opponent knows the target
        ctx.save();
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#ffcc44';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          `Target: ${s.score.toLocaleString()}`,
          BOARD_W / 2,
          BOARD_H / 2 + 48,
        );
        ctx.restore();
      }
    }
  }
}
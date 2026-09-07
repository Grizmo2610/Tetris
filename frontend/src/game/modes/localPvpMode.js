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
    this.lockedScore = [null, null];

    this.inputs = [
      new InputHandler(LOCAL_BINDINGS_P1),
      new InputHandler(LOCAL_BINDINGS_P2),
    ];
    this.raf        = null;
    this.lastTime   = null;
    this.over       = false;
    this.paused     = false;
    this._recorders = [null, null];
    this._startTs   = null;
    this._prevPiece = [null, null];
    this._loop = this._loop.bind(this);
  }

  start() {
    const seed = generateSeed();
    this._startTs = performance.now();
    for (let i = 0; i < 2; i++) {
      const queue = initQueueFromSeed(seed);
      this.states[i] = { ...createGameState(queue), board: emptyBoard() };
      this.lockedScore[i] = null;
      this.inputs[i].attach();
      this._recorders[i] = new ReplayRecorder({ seed, startLevel: 1 });
      this._recorders[i].start();
      this._recorders[i].forceKeyframe(this.states[i]);
      this._prevPiece[i] = this.states[i].piece;
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
    const nowMs = performance.now();

    // ── Tick each player that is still alive ──────────────────────────────
    for (let i = 0; i < 2; i++) {
      let s = this.states[i];
      if (!s || s.status !== 'playing') continue;

      const actions = this.inputs[i].update(dt);
      for (const action of actions) {
        const pieceBeforeInput = s.piece;
        switch (action) {
          case 'moveLeft':  this._recorders[i]?.recordInput(action); s = applyMove(s, -1);                            break;
          case 'moveRight': this._recorders[i]?.recordInput(action); s = applyMove(s,  1);                            break;
          case 'softDrop':  this._recorders[i]?.recordInput(action); s = applySoftDrop(s);                             break;
          case 'hardDrop':  this._recorders[i]?.recordInput(action); s = applyHardDrop(s);                             break;
          case 'rotateCW':  this._recorders[i]?.recordInput(action); s = applyRotation(s,  1);                         break;
          case 'rotateCCW': this._recorders[i]?.recordInput(action); s = applyRotation(s, -1);                         break;
          case 'rotate180': this._recorders[i]?.recordInput(action); s = applyRotation(applyRotation(s, 1), 1);        break;
          case 'hold':      this._recorders[i]?.recordInput(action); s = applyHold(s);                                 break;
        }
        if (action === 'hardDrop' && s.piece !== pieceBeforeInput) {
          this._recorders[i]?.recordKeyframe(s);
        }
      }

      const prevPiece = s.piece;
      s = applyGravityTick(s, dt);
      if (s.onGround) s = applyLockTick(s, dt);

      // Keyframe after gravity-triggered lock
      if (s.piece !== prevPiece) this._recorders[i]?.recordKeyframe(s);

      // If a piece just locked, handle garbage queue
      if (s._garbageSent !== undefined) {
        const sent = s._garbageSent ?? 0;
        const cleared = s._linesCleared ?? 0;
        const opp = 1 - i;

        // Enqueue outgoing garbage (5-second delay)
        if (sent > 0) {
          s = { ...s, garbageQueue: enqueueGarbage(s.garbageQueue ?? [], sent, nowMs) };
        }

        // Counter: this player's clears cancel opponent's pending outgoing garbage
        if (cleared > 0 && this.states[opp]) {
          const oppQueue = counterGarbageQueue(this.states[opp].garbageQueue ?? [], cleared);
          this.states[opp] = { ...this.states[opp], garbageQueue: oppQueue };
        }

        s = { ...s, _garbageSent: undefined, _linesCleared: undefined };
      }

      this.states[i] = s;
    }

    // ── Flush matured garbage from each player's queue to the opponent ─────
    for (let i = 0; i < 2; i++) {
      const s = this.states[i];
      if (!s || !s.garbageQueue?.length) continue;
      const { flushed, queue } = flushGarbageQueue(s.garbageQueue, nowMs);
      this.states[i] = { ...s, garbageQueue: queue };
      const opp = 1 - i;
      if (flushed > 0 && this.states[opp]?.status === 'playing') {
        this.states[opp] = receiveGarbage(this.states[opp], flushed);
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

      const durationMs = Math.round(performance.now() - this._startTs);
      const nicks = ['Player 1', 'Player 2'];
      const p1Block = this._recorders[0]?.finish({
        nickname: nicks[0],
        score: this.states[0].score, lines: this.states[0].lines, level: this.states[0].level,
      });
      const p2Block = this._recorders[1]?.finish({
        nickname: nicks[1],
        score: this.states[1].score, lines: this.states[1].lines, level: this.states[1].level,
      });
      const winnerNick = result.winner === 0 ? nicks[0] : result.winner === 1 ? nicks[1] : null;
      replayStorage.set(buildReplayData({ mode: 'localPvp', winner: winnerNick, p1Block, p2Block, durationMs }));
      this._recorders = [null, null];

      this.onGameOver({
        winner: result.winner,
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
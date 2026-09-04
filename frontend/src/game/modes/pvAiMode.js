import { emptyBoard } from '../engine/board.js';
import { initQueue } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick, receiveGarbage,
} from '../engine/physics.js';
import { InputHandler } from '../input/inputHandler.js';
import { renderBoard, renderNextQueue, renderHoldPiece } from '../renderer/boardRenderer.js';
import { AI_THINK_DELAY, AI_MOVE_DELAY } from '../../utils/constants.js';

// ─── PvAiMode ─────────────────────────────────────────────────────────────────
// Human (left board) vs AI controller (right board).
// AI implements { getNextMove(gameState): Promise<{rotation, column}>, destroy() }.

export class PvAiMode {
  constructor({ mainCanvas, nextCanvas, holdCanvas,
                aiCanvas, aiNextCanvas, aiHoldCanvas,
                aiController, difficulty = 'medium',
                onGameOver, onScoreUpdate }) {
    this.ctx  = mainCanvas.getContext('2d');
    this.nctx = nextCanvas.getContext('2d');
    this.hctx = holdCanvas.getContext('2d');
    this.actx  = aiCanvas.getContext('2d');
    this.anctx = aiNextCanvas.getContext('2d');
    this.ahctx = aiHoldCanvas.getContext('2d');

    this.aiController = aiController;
    this.difficulty   = difficulty;
    this.onGameOver    = onGameOver    ?? (() => {});
    this.onScoreUpdate = onScoreUpdate ?? (() => {});

    this.playerState = null;
    this.aiState     = null;
    this.input = new InputHandler();

    // AI animation state
    this.aiThinkTimer      = 0;
    this.aiMoveTimer       = 0;
    this.aiTargetPlacement = null;
    this.aiMovesLeft       = [];

    this.raf = null;
    this.lastTime = null;
    this.over = false;
    this.paused = false;
    this._loop = this._loop.bind(this);
  }

  start() {
    this.playerState = { ...createGameState(initQueue()), board: emptyBoard() };
    this.aiState     = { ...createGameState(initQueue()), board: emptyBoard() };
    this.over   = false;
    this.paused = false;
    this.aiThinkTimer      = 0;
    this.aiMoveTimer       = 0;
    this.aiTargetPlacement = null;
    this.aiMovesLeft       = [];
    this.input.attach();
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
    this.paused = false;
    this.lastTime = null; // reset so dt=0 on first frame after resume
    this.raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.aiController?.destroy();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _loop(ts) {
    if (this.over || this.paused) return;

    const dt = this.lastTime ? Math.min(ts - this.lastTime, 100) : 0;
    this.lastTime = ts;

    let ps = this.playerState;
    let as = this.aiState;

    // ── Player input ──────────────────────────────────────────────────────
    const actions = this.input.update(dt);
    for (const action of actions) {
      switch (action) {
        case 'moveLeft':   ps = applyMove(ps, -1);                              break;
        case 'moveRight':  ps = applyMove(ps, 1);                               break;
        case 'softDrop':   ps = applySoftDrop(ps);                               break;
        case 'hardDrop':   ps = applyHardDrop(ps);                               break;
        case 'rotateCW':   ps = applyRotation(ps, 1);                            break;
        case 'rotateCCW':  ps = applyRotation(ps, -1);                           break;
        case 'rotate180':  ps = applyRotation(applyRotation(ps, 1), 1);          break;
        case 'hold':       ps = applyHold(ps);                                   break;
      }
    }

    // Player gravity + lock
    ps = applyGravityTick(ps, dt);
    if (ps.onGround) ps = applyLockTick(ps, dt);

    // Collect garbage player generated this tick
    const playerGarbage = ps._garbageSent ?? 0;
    if (playerGarbage > 0) {
      as = receiveGarbage(as, playerGarbage);
      ps = { ...ps, _garbageSent: 0 };
    }

    // ── AI tick ───────────────────────────────────────────────────────────
    if (as.status === 'playing') {
      if (!this.aiTargetPlacement) {
        // Think phase
        this.aiThinkTimer += dt;
        if (this.aiThinkTimer >= AI_THINK_DELAY[this.difficulty]) {
          this.aiThinkTimer = 0;
          this._requestAIMove(as);
        }
      } else {
        // Move animation phase
        this.aiMoveTimer += dt;
        const moveDelay = AI_MOVE_DELAY[this.difficulty];
        if (this.aiMoveTimer >= moveDelay && this.aiMovesLeft.length > 0) {
          this.aiMoveTimer = 0;
          const action = this.aiMovesLeft.shift();
          if (action === 'left')     as = applyMove(as, -1);
          if (action === 'right')    as = applyMove(as, 1);
          if (action === 'rotateCW') as = applyRotation(as, 1);
        } else if (this.aiMovesLeft.length === 0) {
          // Hard drop when no moves left → lock immediately
          as = applyHardDrop(as);
          // Collect garbage AI generated
          const aiGarbage = as._garbageSent ?? 0;
          if (aiGarbage > 0) {
            ps = receiveGarbage(ps, aiGarbage);
            as = { ...as, _garbageSent: 0 };
          }
          this.aiTargetPlacement = null;
          this.aiThinkTimer = 0; // restart think phase
        }

        // AI gravity still applies between moves
        as = applyGravityTick(as, dt);
        // Check for garbage AI generated via gravity lock
        const aiGravGarbage = as._garbageSent ?? 0;
        if (aiGravGarbage > 0) {
          ps = receiveGarbage(ps, aiGravGarbage);
          as = { ...as, _garbageSent: 0 };
        }
      }
    }

    this.playerState = ps;
    this.aiState     = as;

    // ── Render ────────────────────────────────────────────────────────────
    renderBoard(this.ctx, ps);
    renderNextQueue(this.nctx, ps.queue);
    renderHoldPiece(this.hctx, ps.holdType, ps.holdUsed);
    renderBoard(this.actx, as, { showGhost: false });
    renderNextQueue(this.anctx, as.queue);
    renderHoldPiece(this.ahctx, as.holdType, as.holdUsed);

    this.onScoreUpdate({
      player: { score: ps.score, lines: ps.lines, level: ps.level },
      ai:     { score: as.score, lines: as.lines, level: as.level },
    });

    // ── Game over ─────────────────────────────────────────────────────────
    if (ps.status === 'gameover' || as.status === 'gameover') {
      this.over = true;
      const playerLost = ps.status === 'gameover';
      this.onGameOver({
        winner:      playerLost ? 'ai' : 'player',
        playerScore: { score: ps.score, lines: ps.lines, level: ps.level },
        aiScore:     { score: as.score, lines: as.lines, level: as.level },
      });
      return;
    }

    this.raf = requestAnimationFrame(this._loop);
  }

  async _requestAIMove(state) {
    try {
      const placement = await this.aiController.getNextMove(state);
      if (!placement || this.over) return;
      this.aiTargetPlacement = placement;
      this.aiMovesLeft       = this._planMoves(state.piece, placement);
      this.aiMoveTimer       = 0;
    } catch (err) {
      console.warn('[PvAiMode] AI move error, skipping:', err);
      this.aiTargetPlacement = null;
    }
  }

  _planMoves(piece, placement) {
    const moves = [];
    let rotDiff = (placement.rotation - piece.rot + 4) % 4;
    for (let i = 0; i < rotDiff; i++) moves.push('rotateCW');
    const colDiff = placement.column - piece.col;
    const dir = colDiff > 0 ? 'right' : 'left';
    for (let i = 0; i < Math.abs(colDiff); i++) moves.push(dir);
    return moves;
  }
}
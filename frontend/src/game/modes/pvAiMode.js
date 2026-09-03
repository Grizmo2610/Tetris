import { emptyBoard } from '../engine/board.js';
import { initQueue } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick, receiveGarbage,
} from '../engine/physics.js';
import { InputHandler } from '../input/inputHandler.js';
import { renderBoard, renderOpponentBoard, renderNextQueue, renderHoldPiece, BOARD_W, BOARD_H } from '../renderer/boardRenderer.js';
import { COLS, BUFFER, TOTAL_ROWS } from '../../utils/constants.js';
import { AI_THINK_DELAY, AI_MOVE_DELAY } from '../../utils/constants.js';
import { ghostRow } from '../engine/piece.js';

// ─── PvAiMode ─────────────────────────────────────────────────────────────────
// Human (left board) vs AI controller (right board).
// AI implements { getNextMove(gameState): Promise<{rotation, column}>, destroy() }.
//
// Usage:
//   const mode = new PvAiMode({
//     mainCanvas, nextCanvas, holdCanvas,
//     aiCanvas, aiNextCanvas, aiHoldCanvas,
//     aiController,   // HeuristicAI | ONNXAIController
//     difficulty,     // 'easy' | 'medium' | 'hard' | 'expert'
//     onGameOver, onScoreUpdate,
//   })
//   mode.start()
//   mode.destroy()

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
    this.aiThinkTimer   = 0;
    this.aiMoveTimer    = 0;
    this.aiTargetPlacement = null; // { rotation, column }
    this.aiCurrentRot  = 0;
    this.aiCurrentCol  = 0;
    this.aiMovesLeft   = [];  // queue of moves to animate

    this.raf = null;
    this.lastTime = null;
    this.over = false;
    this._loop = this._loop.bind(this);
  }

  start() {
    this.playerState = { ...createGameState(initQueue()), board: emptyBoard() };
    this.aiState     = { ...createGameState(initQueue()), board: emptyBoard() };
    this.over = false;
    this.aiThinkTimer = 0;
    this.aiMoveTimer  = 0;
    this.aiTargetPlacement = null;
    this.aiMovesLeft = [];
    this.input.attach();
    this.lastTime = null;
    this.raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.aiController?.destroy();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _loop(ts) {
    const dt = this.lastTime ? Math.min(ts - this.lastTime, 100) : 0;
    this.lastTime = ts;
    if (this.over) return;

    let ps = this.playerState;
    let as = this.aiState;

    // ── Player input ──────────────────────────────────────────────────────
    const actions = this.input.update(dt);
    for (const action of actions) {
      switch (action) {
        case 'moveLeft':   ps = applyMove(ps, -1);        break;
        case 'moveRight':  ps = applyMove(ps, 1);         break;
        case 'softDrop':   ps = applySoftDrop(ps);         break;
        case 'hardDrop':   ps = applyHardDrop(ps);         break;
        case 'rotateCW':   ps = applyRotation(ps, 1);      break;
        case 'rotateCCW':  ps = applyRotation(ps, -1);     break;
        case 'rotate180':  ps = applyRotation(applyRotation(ps, 1), 1); break;
        case 'hold':       ps = applyHold(ps);             break;
      }
    }
    ps = applyGravityTick(ps, dt);
    if (ps.onGround) {
      const prev = ps.lockMoves;
      ps = applyLockTick(ps, dt);
      if (ps.lockMoves < prev || ps._garbageSent !== undefined) {
        const g = ps._garbageSent ?? 0;
        if (g > 0) as = receiveGarbage(as, g);
        ps = { ...ps, _garbageSent: 0 };
      }
    }

    // ── AI tick ───────────────────────────────────────────────────────────
    if (as.status === 'playing') {
      if (!this.aiTargetPlacement) {
        // Think phase
        this.aiThinkTimer += dt;
        if (this.aiThinkTimer >= AI_THINK_DELAY[this.difficulty]) {
          this.aiThinkTimer = 0;
          // Request move asynchronously, apply when done
          this._requestAIMove(as);
        }
      } else {
        // Move animation phase
        this.aiMoveTimer += dt;
        const moveDelay = AI_MOVE_DELAY[this.difficulty];
        if (this.aiMoveTimer >= moveDelay && this.aiMovesLeft.length > 0) {
          this.aiMoveTimer = 0;
          const action = this.aiMovesLeft.shift();
          if (action === 'left')    as = applyMove(as, -1);
          if (action === 'right')   as = applyMove(as, 1);
          if (action === 'rotateCW') as = applyRotation(as, 1);
        } else if (this.aiMovesLeft.length === 0) {
          // Hard drop when no moves left
          as = applyHardDrop(as);
          const g = as._garbageSent ?? 0;
          if (g > 0) ps = receiveGarbage(ps, g);
          as = { ...as, _garbageSent: 0 };
          this.aiTargetPlacement = null;
        }

        // AI gravity still applies
        as = applyGravityTick(as, dt);
      }
    }

    this.playerState = ps;
    this.aiState = as;

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
        winner: playerLost ? 'ai' : 'player',
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
      this.aiMovesLeft = this._planMoves(state.piece, placement);
      this.aiMoveTimer = 0;
    } catch (err) {
      console.warn('[PvAiMode] AI move error, skipping:', err);
      this.aiTargetPlacement = null;
    }
  }

  // Generate sequence of move actions to reach target placement
  _planMoves(piece, placement) {
    const moves = [];
    // Rotations
    let rot = piece.rot;
    let rotDiff = (placement.rotation - rot + 4) % 4;
    for (let i = 0; i < rotDiff; i++) moves.push('rotateCW');
    // Horizontal moves
    const colDiff = placement.column - piece.col;
    const dir = colDiff > 0 ? 'right' : 'left';
    for (let i = 0; i < Math.abs(colDiff); i++) moves.push(dir);
    return moves;
  }
}

import { emptyBoard } from '../engine/board.js';
import { initQueueFromSeed, generateSeed } from '../engine/piece.js';
import {
  createGameState, applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick, receiveGarbage,
} from '../engine/physics.js';
import { InputHandler } from '../input/inputHandler.js';
import { renderBoard, renderNextQueue, renderHoldPiece } from '../renderer/boardRenderer.js';
import { renderGameOverOverlay } from '../renderer/uiRenderer.js';
import { AI_THINK_DELAY, AI_MOVE_DELAY, BOARD_W, BOARD_H } from '../../utils/constants.js';

// ─── PvAiMode ─────────────────────────────────────────────────────────────────
//
// SCORE-BASED WIN CONDITION (same rules as LocalPvpMode):
//   When one side tops out, their score is locked as the target.
//   The surviving side must reach that score to win.
//   If the surviving side also tops out before reaching the target → they lose.

export class PvAiMode {
  constructor({ mainCanvas, nextCanvas, holdCanvas,
                aiCanvas, aiNextCanvas, aiHoldCanvas,
                aiController, difficulty = 'medium',
                onGameOver, onScoreUpdate }) {
    this.ctx   = mainCanvas.getContext('2d');
    this.nctx  = nextCanvas.getContext('2d');
    this.hctx  = holdCanvas.getContext('2d');
    this.actx  = aiCanvas.getContext('2d');
    this.anctx = aiNextCanvas.getContext('2d');
    this.ahctx = aiHoldCanvas.getContext('2d');

    this.aiController = aiController;
    this.difficulty   = difficulty;
    this.onGameOver    = onGameOver    ?? (() => {});
    this.onScoreUpdate = onScoreUpdate ?? (() => {});

    this.playerState = null;
    this.aiState     = null;
    // Locked scores: set when a side tops out. null = still alive.
    this.playerLockedScore = null;
    this.aiLockedScore     = null;

    this.input = new InputHandler();

    this.aiThinkTimer      = 0;
    this.aiMoveTimer       = 0;
    this.aiTargetPlacement = null;
    this.aiMovesLeft       = [];

    this.raf      = null;
    this.lastTime = null;
    this.over     = false;
    this.paused   = false;
    this._loop = this._loop.bind(this);
  }

  start() {
    const seed = generateSeed();
    this.playerState = { ...createGameState(initQueueFromSeed(seed)), board: emptyBoard() };
    this.aiState     = { ...createGameState(initQueueFromSeed(seed)), board: emptyBoard() };
    this.playerLockedScore = null;
    this.aiLockedScore     = null;
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
    this.paused   = false;
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
    if (this.over || this.paused) return;

    const dt = this.lastTime ? Math.min(ts - this.lastTime, 100) : 0;
    this.lastTime = ts;

    let ps = this.playerState;
    let as = this.aiState;

    // ── Player tick (only if still alive) ────────────────────────────────
    if (ps.status === 'playing') {
      const actions = this.input.update(dt);
      for (const action of actions) {
        switch (action) {
          case 'moveLeft':  ps = applyMove(ps, -1);                             break;
          case 'moveRight': ps = applyMove(ps,  1);                             break;
          case 'softDrop':  ps = applySoftDrop(ps);                              break;
          case 'hardDrop':  ps = applyHardDrop(ps);                              break;
          case 'rotateCW':  ps = applyRotation(ps,  1);                          break;
          case 'rotateCCW': ps = applyRotation(ps, -1);                          break;
          case 'rotate180': ps = applyRotation(applyRotation(ps, 1), 1);         break;
          case 'hold':      ps = applyHold(ps);                                  break;
        }
      }
      ps = applyGravityTick(ps, dt);
      if (ps.onGround) ps = applyLockTick(ps, dt);

      const playerGarbage = ps._garbageSent ?? 0;
      if (playerGarbage > 0 && as.status === 'playing') {
        as = receiveGarbage(as, playerGarbage);
        ps = { ...ps, _garbageSent: 0 };
      } else if (playerGarbage > 0) {
        ps = { ...ps, _garbageSent: 0 };
      }
    }

    // ── AI tick (only if still alive) ─────────────────────────────────────
    if (as.status === 'playing') {
      if (!this.aiTargetPlacement) {
        this.aiThinkTimer += dt;
        if (this.aiThinkTimer >= AI_THINK_DELAY[this.difficulty]) {
          this.aiThinkTimer = 0;
          this._requestAIMove(as);
        }
      } else {
        this.aiMoveTimer += dt;
        const moveDelay = AI_MOVE_DELAY[this.difficulty];
        if (this.aiMoveTimer >= moveDelay && this.aiMovesLeft.length > 0) {
          this.aiMoveTimer = 0;
          const action = this.aiMovesLeft.shift();
          if (action === 'left')     as = applyMove(as, -1);
          if (action === 'right')    as = applyMove(as,  1);
          if (action === 'rotateCW') as = applyRotation(as, 1);
        } else if (this.aiMovesLeft.length === 0) {
          as = applyHardDrop(as);
          const aiGarbage = as._garbageSent ?? 0;
          if (aiGarbage > 0 && ps.status === 'playing') {
            ps = receiveGarbage(ps, aiGarbage);
            as = { ...as, _garbageSent: 0 };
          } else if (aiGarbage > 0) {
            as = { ...as, _garbageSent: 0 };
          }
          this.aiTargetPlacement = null;
          this.aiThinkTimer = 0;
        }

        as = applyGravityTick(as, dt);
        const aiGravGarbage = as._garbageSent ?? 0;
        if (aiGravGarbage > 0 && ps.status === 'playing') {
          ps = receiveGarbage(ps, aiGravGarbage);
          as = { ...as, _garbageSent: 0 };
        } else if (aiGravGarbage > 0) {
          as = { ...as, _garbageSent: 0 };
        }
      }
    }

    this.playerState = ps;
    this.aiState     = as;

    // ── Lock in scores for newly topped-out sides ─────────────────────────
    if (ps.status === 'gameover' && this.playerLockedScore === null) {
      this.playerLockedScore = ps.score;
    }
    if (as.status === 'gameover' && this.aiLockedScore === null) {
      this.aiLockedScore = as.score;
    }

    // ── Render ────────────────────────────────────────────────────────────
    renderBoard(this.ctx, ps);
    renderNextQueue(this.nctx, ps.queue);
    renderHoldPiece(this.hctx, ps.holdType, ps.holdUsed);
    renderBoard(this.actx, as);
    renderNextQueue(this.anctx, as.queue);
    renderHoldPiece(this.ahctx, as.holdType, as.holdUsed);

    // Show frozen overlay + target label on the topped-out side
    if (ps.status === 'gameover' && !this.over) {
      renderGameOverOverlay(this.ctx, BOARD_W, BOARD_H);
      this._renderTargetLabel(this.ctx, this.playerLockedScore);
    }
    if (as.status === 'gameover' && !this.over) {
      renderGameOverOverlay(this.actx, BOARD_W, BOARD_H);
      this._renderTargetLabel(this.actx, this.aiLockedScore);
    }

    // ── Score update HUD ──────────────────────────────────────────────────
    this.onScoreUpdate({
      player: {
        score: ps.score, lines: ps.lines, level: ps.level,
        targetScore: this.aiLockedScore,     // player must beat AI's locked score
      },
      ai: {
        score: as.score, lines: as.lines, level: as.level,
        targetScore: this.playerLockedScore, // AI must beat player's locked score
      },
    });

    // ── Evaluate win condition ────────────────────────────────────────────
    const result = this._checkWinner();
    if (result !== null) {
      this.over = true;
      this.onGameOver({
        winner:      result.winner, // 'player' | 'ai' | 'draw'
        playerScore: { score: ps.score, lines: ps.lines, level: ps.level },
        aiScore:     { score: as.score, lines: as.lines, level: as.level },
      });
      return;
    }

    this.raf = requestAnimationFrame(this._loop);
  }

  // Returns { winner: 'player'|'ai'|'draw' } or null (game continues).
  _checkWinner() {
    const ps = this.playerState;
    const as = this.aiState;
    const playerDead = ps?.status === 'gameover';
    const aiDead     = as?.status === 'gameover';

    if (!playerDead && !aiDead) return null;

    if (playerDead && aiDead) {
      const pScore = ps.score;
      const aScore = as.score;
      if (pScore > aScore) return { winner: 'player' };
      if (aScore > pScore) return { winner: 'ai' };
      return { winner: 'draw' };
    }

    // Player topped out, AI still alive
    if (playerDead && !aiDead) {
      const target = this.playerLockedScore;
      if (as.score >= target) return { winner: 'ai' };
      return null; // AI still chasing
    }

    // AI topped out, player still alive
    if (!playerDead && aiDead) {
      const target = this.aiLockedScore;
      if (ps.score >= target) return { winner: 'player' };
      return null; // Player still chasing
    }

    return null;
  }

  _renderTargetLabel(ctx, lockedScore) {
    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#ffcc44';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `Target: ${lockedScore?.toLocaleString() ?? '—'}`,
      BOARD_W / 2,
      BOARD_H / 2 + 48,
    );
    ctx.restore();
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
    const rotDiff = (placement.rotation - piece.rot + 4) % 4;
    for (let i = 0; i < rotDiff; i++) moves.push('rotateCW');
    const colDiff = placement.column - piece.col;
    const dir = colDiff > 0 ? 'right' : 'left';
    for (let i = 0; i < Math.abs(colDiff); i++) moves.push(dir);
    return moves;
  }
}
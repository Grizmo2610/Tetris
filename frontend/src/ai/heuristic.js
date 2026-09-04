import { COLS, BUFFER, TOTAL_ROWS } from '../utils/constants.js';
import { PIECES, isValidPosition, ghostRow } from '../game/engine/piece.js';
import {
  lockPieceOnBoard, clearLines,
  getAggregateHeight, countHoles, getBumpiness, countCompleteLines,
} from '../game/engine/board.js';

// ─── Weight sets ──────────────────────────────────────────────────────────────
//
// Each weight set controls what the AI values when choosing a placement.
// Positive = good, Negative = bad.
//
// SURVIVAL weights (easy/medium):
//   Pure board-health AI. Only cares about staying alive — no concept of
//   sending garbage or combos. Based on Thiery & Scherrer 2009.
//
// ATTACK weights (hard/medium-attack):
//   Rewards sending garbage: values Tetris clears and combos heavily,
//   accepts a slightly messier board in exchange for offensive output.
//   Also penalizes having a high "danger" stack so it doesn't suicide.
//
// BALANCED weights (default for medium):
//   Compromise — plays reasonably clean AND goes for multi-line clears.

const WEIGHTS_SURVIVAL = {
  aggregateHeight: -0.510066,
  linesCleared:    +0.760666,
  holes:           -0.356630,
  bumpiness:       -0.184483,
  // attack features — ignored in survival mode
  tetrisBonus:     +0.0,
  comboBonus:      +0.0,
  garbageSent:     +0.0,
  dangerPenalty:   -0.0,
};

const WEIGHTS_BALANCED = {
  aggregateHeight: -0.55,
  linesCleared:    +0.80,
  holes:           -0.45,
  bumpiness:       -0.20,
  // Reward 4-line clears specifically (on top of linesCleared bonus)
  tetrisBonus:     +1.20,
  // Reward keeping an ongoing combo alive
  comboBonus:      +0.40,
  // Penalise very tall stacks harder (danger zone = top 6 rows)
  dangerPenalty:   -0.80,
  garbageSent:     +0.0,  // not directly observable pre-placement; handled via tetris/combo
};

const WEIGHTS_ATTACK = {
  aggregateHeight: -0.40,   // less conservative about height
  linesCleared:    +0.60,
  holes:           -0.50,   // still avoid holes (they kill combos)
  bumpiness:       -0.15,
  // Big reward for Tetris clears (4 lines = 4 garbage)
  tetrisBonus:     +2.50,
  // Each consecutive clear kept alive = bonus
  comboBonus:      +0.80,
  // Hard penalty when stack enters danger zone (top 8 rows occupied)
  dangerPenalty:   -1.50,
  garbageSent:     +0.0,
};

// Map difficulty → weights + lookahead + error rate
const DIFFICULTY_CONFIG = {
  easy:   { weights: WEIGHTS_SURVIVAL, lookahead: 1, errorRate: 0.30 },
  medium: { weights: WEIGHTS_BALANCED, lookahead: 2, errorRate: 0.10 },
  hard:   { weights: WEIGHTS_ATTACK,   lookahead: 2, errorRate: 0.02 },
};

// ─── Board feature extraction ─────────────────────────────────────────────────

// How many cells in the top N rows are occupied (danger indicator)
function countDangerCells(board, dangerRows = 8) {
  let count = 0;
  for (let r = BUFFER; r < BUFFER + dangerRows; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0) count++;
    }
  }
  return count;
}

// ─── Score a board state after a placement ────────────────────────────────────
// `linesJustCleared` — how many lines were cleared by this specific placement
// `currentCombo`     — the combo counter BEFORE this placement
//                      (if linesJustCleared > 0 the combo continues/starts)

function scoreBoard(board, linesJustCleared, currentCombo, weights) {
  const aggH    = getAggregateHeight(board);
  const holes   = countHoles(board);
  const bump    = getBumpiness(board);
  const danger  = countDangerCells(board);

  // Tetris bonus: extra reward specifically for 4-line clears
  const tetrisBonus = linesJustCleared === 4 ? 1 : 0;

  // Combo bonus: reward continuing an active combo
  // currentCombo is -1 when no combo, 0 on first clear, etc.
  const comboValue = linesJustCleared > 0 ? Math.max(0, currentCombo + 1) : 0;

  return (
    weights.aggregateHeight * aggH +
    weights.linesCleared    * linesJustCleared +
    weights.holes           * holes +
    weights.bumpiness       * bump +
    weights.tetrisBonus     * tetrisBonus +
    weights.comboBonus      * comboValue +
    weights.dangerPenalty   * danger
  );
}

// ─── Enumerate all valid placements ──────────────────────────────────────────

function enumeratePlacements(board, type, currentCombo, weights) {
  const results = [];

  for (let rot = 0; rot < 4; rot++) {
    const cells = PIECES[type][rot];
    const minDC = Math.min(...cells.map(([, c]) => c));
    const maxDC = Math.max(...cells.map(([, c]) => c));

    for (let col = -minDC; col < COLS - maxDC; col++) {
      const spawnRow = 1;
      if (!isValidPosition(board, type, rot, spawnRow, col)) continue;

      const landRow = ghostRow(board, type, rot, spawnRow, col);
      const locked  = lockPieceOnBoard(board, type, rot, landRow, col);
      const { board: cleared, linesCleared } = clearLines(locked);

      const s = scoreBoard(cleared, linesCleared, currentCombo, weights);
      results.push({ rotation: rot, column: col, score: s, board: cleared, linesCleared });
    }
  }

  return results;
}

// ─── Lookahead ────────────────────────────────────────────────────────────────

function bestPlacement1(board, type, combo, weights) {
  const placements = enumeratePlacements(board, type, combo, weights);
  if (placements.length === 0) return null;
  placements.sort((a, b) => b.score - a.score);
  return placements;
}

function bestScore2(board, type1, type2, combo, weights) {
  const p1 = enumeratePlacements(board, type1, combo, weights);
  for (const placement of p1) {
    // After placing type1, what combo counter would type2 inherit?
    const nextCombo = placement.linesCleared > 0 ? combo + 1 : -1;
    const p2 = enumeratePlacements(placement.board, type2, nextCombo, weights);
    const best2 = p2.length > 0 ? Math.max(...p2.map(p => p.score)) : -Infinity;
    placement.futureScore = (placement.score + best2) / 2;
  }
  p1.sort((a, b) => b.futureScore - a.futureScore);
  return p1;
}

// ─── HeuristicAI ─────────────────────────────────────────────────────────────

export class HeuristicAI {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
    const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.medium;
    this.weights   = cfg.weights;
    this.lookahead = cfg.lookahead;
    this.errorRate = cfg.errorRate;
  }

  async getNextMove(gameState) {
    const { board, piece, queue, combo = -1 } = gameState;
    const type = piece.type;

    let candidates;
    if (this.lookahead === 2 && queue.length > 0) {
      candidates = bestScore2(board, type, queue[0], combo, this.weights);
    } else {
      candidates = bestPlacement1(board, type, combo, this.weights);
    }

    if (!candidates || candidates.length === 0) {
      return this._randomValid(board, type, piece);
    }

    // Error injection: occasionally pick from top-5 randomly
    if (Math.random() < this.errorRate) {
      const pool = candidates.slice(0, Math.min(5, candidates.length));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { rotation: pick.rotation, column: pick.column };
    }

    return { rotation: candidates[0].rotation, column: candidates[0].column };
  }

  destroy() {}

  _randomValid(board, type, piece) {
    for (let rot = 0; rot < 4; rot++) {
      for (let col = 0; col < COLS; col++) {
        if (isValidPosition(board, type, rot, piece.row, col)) {
          return { rotation: rot, column: col };
        }
      }
    }
    return { rotation: 0, column: piece.col };
  }
}
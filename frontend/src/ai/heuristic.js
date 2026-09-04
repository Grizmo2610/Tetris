import { COLS, BUFFER, TOTAL_ROWS } from '../utils/constants.js';
import { PIECES, isValidPosition, ghostRow } from '../game/engine/piece.js';
import {
  lockPieceOnBoard, clearLines,
  getAggregateHeight, countHoles, getBumpiness, countCompleteLines,
} from '../game/engine/board.js';

// ─── Heuristic weights (Thiery & Scherrer 2009) ───────────────────────────────

const WEIGHTS = {
  aggregateHeight: -0.510066,
  linesCleared:    +0.760666,
  holes:           -0.35663,
  bumpiness:       -0.184483,
};

// ─── Score a board position ───────────────────────────────────────────────────

function scoreBoard(board) {
  return (
    WEIGHTS.aggregateHeight * getAggregateHeight(board) +
    WEIGHTS.linesCleared    * countCompleteLines(board) +
    WEIGHTS.holes           * countHoles(board) +
    WEIGHTS.bumpiness       * getBumpiness(board)
  );
}

// ─── Enumerate all valid placements for a piece ───────────────────────────────
// Returns array of { rotation, column, score, board }

function enumeratePlacements(board, type) {
  const results = [];

  for (let rot = 0; rot < 4; rot++) {
    const cells = PIECES[type][rot];
    // Find valid column range for this rotation
    const minDC = Math.min(...cells.map(([, c]) => c));
    const maxDC = Math.max(...cells.map(([, c]) => c));

    for (let col = -minDC; col < COLS - maxDC; col++) {
      const spawnRow = 1;
      if (!isValidPosition(board, type, rot, spawnRow, col)) continue;

      // Drop to floor
      const landRow = ghostRow(board, type, rot, spawnRow, col);

      // Lock and evaluate
      const locked = lockPieceOnBoard(board, type, rot, landRow, col);
      const { board: cleared } = clearLines(locked);
      const s = scoreBoard(cleared);

      results.push({ rotation: rot, column: col, score: s, board: cleared });
    }
  }

  return results;
}

// ─── Lookahead scoring ────────────────────────────────────────────────────────

function bestPlacement1(board, type) {
  const placements = enumeratePlacements(board, type);
  if (placements.length === 0) return null;
  placements.sort((a, b) => b.score - a.score);
  return placements;
}

function bestScore2(board, type1, type2) {
  const p1 = enumeratePlacements(board, type1);
  for (const placement of p1) {
    const p2 = enumeratePlacements(placement.board, type2);
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
    this.errorRate = difficulty === 'easy' ? 0.30 : 0.10;
    this.lookahead = difficulty === 'easy' ? 1 : 2;
  }

  // Implements AIController interface
  async getNextMove(gameState) {
    const { board, piece, queue } = gameState;
    const type = piece.type;

    let candidates;
    if (this.lookahead === 2 && queue.length > 0) {
      candidates = bestScore2(board, type, queue[0]);
    } else {
      candidates = bestPlacement1(board, type);
    }

    if (!candidates || candidates.length === 0) {
      // Fallback: any valid placement
      return this._randomValid(board, type, piece);
    }

    // Error injection: sometimes pick from top-5 randomly
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

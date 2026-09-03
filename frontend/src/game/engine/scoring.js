import {
  LINE_SCORES, TSPIN_SCORES, MINI_TSPIN_SCORES,
  COMBO_BONUS, ALL_CLEAR_BONUS,
  GARBAGE_TABLE, COMBO_GARBAGE,
} from '../../utils/constants.js';
import { PIECES } from './piece.js';
import { COLS, TOTAL_ROWS } from '../../utils/constants.js';

// ─── Level progression ────────────────────────────────────────────────────────

export function calcLevel(totalLines) {
  return Math.floor(totalLines / 10) + 1;
}

// ─── T-Spin detection (3-corner rule) ────────────────────────────────────────
// Returns: null | 'tspin' | 'mini'

export function detectTSpin(board, type, rot, row, col, lastMoveWasRotation) {
  if (type !== 3) return null;        // Only T-piece
  if (!lastMoveWasRotation) return null;

  // The 4 corners of the T's 3×3 bounding box
  const corners = [
    [row + 0, col + 0],
    [row + 0, col + 2],
    [row + 2, col + 0],
    [row + 2, col + 2],
  ];

  let filledCorners = 0;
  for (const [r, c] of corners) {
    if (r < 0 || r >= TOTAL_ROWS || c < 0 || c >= COLS || board[r][c] !== 0) {
      filledCorners++;
    }
  }

  if (filledCorners < 3) return null;

  // Determine "facing" corners of T (the two in front of the mast)
  // rot 0 = up, 1 = right, 2 = down, 3 = left
  const facingCorners = {
    0: [[row + 0, col + 0], [row + 0, col + 2]], // top two
    1: [[row + 0, col + 2], [row + 2, col + 2]], // right two
    2: [[row + 2, col + 0], [row + 2, col + 2]], // bottom two
    3: [[row + 0, col + 0], [row + 2, col + 0]], // left two
  }[rot];

  let facingFilled = 0;
  for (const [r, c] of facingCorners) {
    if (r < 0 || r >= TOTAL_ROWS || c < 0 || c >= COLS || board[r][c] !== 0) {
      facingFilled++;
    }
  }

  // Mini T-Spin: only 1 of the 2 facing corners is filled
  if (facingFilled < 2) return 'mini';
  return 'tspin';
}

// ─── Score calculation ────────────────────────────────────────────────────────

// Returns { score, tspinType }
export function calcLineScore(linesCleared, level, tspinType, combo, allClear) {
  let pts = 0;

  if (tspinType === 'tspin') {
    pts = (TSPIN_SCORES[linesCleared] ?? 0) * level;
  } else if (tspinType === 'mini') {
    pts = (MINI_TSPIN_SCORES[linesCleared] ?? 0) * level;
  } else {
    pts = LINE_SCORES[linesCleared] * level;
  }

  // Combo bonus (combo >= 1 means at least 2 consecutive line clears)
  if (combo >= 1) {
    pts += COMBO_BONUS * combo * level;
  }

  // All Clear bonus
  if (allClear) {
    pts += ALL_CLEAR_BONUS * level;
  }

  return pts;
}

// ─── Garbage generation ───────────────────────────────────────────────────────

// Returns garbage lines to SEND to opponent
export function calcGarbageSent(linesCleared, tspinType, combo, allClear) {
  let garbage = 0;

  if (tspinType === 'tspin') {
    if (linesCleared === 1) garbage = GARBAGE_TABLE.tspinSingle;
    else if (linesCleared === 2) garbage = GARBAGE_TABLE.tspinDouble;
    else if (linesCleared === 3) garbage = GARBAGE_TABLE.tspinTriple;
    // T-Spin 0 lines sends 0
  } else if (tspinType === 'mini') {
    if (linesCleared === 1) garbage = GARBAGE_TABLE.miniTspinSingle;
  } else {
    if (linesCleared === 2) garbage = GARBAGE_TABLE.double;
    else if (linesCleared === 3) garbage = GARBAGE_TABLE.triple;
    else if (linesCleared === 4) garbage = GARBAGE_TABLE.tetris;
  }

  // Combo garbage (independent of line clear type)
  if (combo >= 1 && linesCleared > 0) {
    const comboIdx = Math.min(combo, COMBO_GARBAGE.length - 1);
    garbage += COMBO_GARBAGE[comboIdx];
  }

  // All Clear bonus garbage (added on top)
  if (allClear) {
    garbage += GARBAGE_TABLE.allClear;
  }

  return garbage;
}

// ─── Counter mechanic ─────────────────────────────────────────────────────────

// Returns { netSent, remainingPending }
export function applyCounter(garbageGenerated, pendingIncoming) {
  const netSent = Math.max(0, garbageGenerated - pendingIncoming);
  const remainingPending = Math.max(0, pendingIncoming - garbageGenerated);
  return { netSent, remainingPending };
}

// ─── Combo tracking ───────────────────────────────────────────────────────────

// Returns new combo count. Starts at -1 (no combo active).
export function updateCombo(combo, linesCleared) {
  if (linesCleared > 0) return combo + 1;
  return -1; // reset
}

// ─── Soft/Hard drop score ─────────────────────────────────────────────────────

export function softDropScore(cellsDropped) {
  return cellsDropped; // 1 point per cell
}

export function hardDropScore(cellsDropped) {
  return cellsDropped * 2; // 2 points per cell
}

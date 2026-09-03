import { COLS, TOTAL_ROWS, BUFFER } from '../../utils/constants.js';
import { PIECES, isValidPosition } from './piece.js';

// ─── Board creation ───────────────────────────────────────────────────────────

export function emptyBoard() {
  return Array.from({ length: TOTAL_ROWS }, () => new Int8Array(COLS));
}

export function cloneBoard(board) {
  return board.map(row => new Int8Array(row));
}

// ─── Place piece onto board (returns new board) ───────────────────────────────

export function lockPieceOnBoard(board, type, rot, row, col) {
  const next = cloneBoard(board);
  for (const [dr, dc] of PIECES[type][rot]) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS) {
      next[r][c] = type;
    }
  }
  return next;
}

// ─── Line clear ───────────────────────────────────────────────────────────────

// Returns { board, linesCleared, clearedRows }
export function clearLines(board) {
  const clearedRows = [];
  const kept = [];

  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (board[r].every(cell => cell !== 0)) {
      clearedRows.push(r);
    } else {
      kept.push(board[r]);
    }
  }

  const linesCleared = clearedRows.length;
  const newBoard = [
    ...Array.from({ length: linesCleared }, () => new Int8Array(COLS)),
    ...kept,
  ];

  return { board: newBoard, linesCleared, clearedRows };
}

// ─── All Clear detection ──────────────────────────────────────────────────────

export function isAllClear(board) {
  // Check only visible rows (BUFFER onwards)
  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    if (board[r].some(cell => cell !== 0)) return false;
  }
  return true;
}

// ─── Top-out detection ────────────────────────────────────────────────────────

// Returns true if any locked cell is in the buffer zone
export function isTopOut(type, rot, row) {
  for (const [dr] of PIECES[type][rot]) {
    if (row + dr < BUFFER) return true;
  }
  return false;
}

// ─── Garbage application ──────────────────────────────────────────────────────

// Apply `count` garbage lines to board.
// Each garbage line is a full row with one random hole.
// All lines in one batch share the SAME hole column (consistent column rule).
// Returns new board.
export function applyGarbage(board, count) {
  if (count <= 0) return board;

  const holeCol = Math.floor(Math.random() * COLS);
  const garbageLines = Array.from({ length: count }, () => {
    const row = new Int8Array(COLS).fill(8); // 8 = garbage color
    row[holeCol] = 0;
    return row;
  });

  // Shift existing rows up by count, dropping rows that go above TOTAL_ROWS
  const shifted = board.slice(count);
  return [...shifted, ...garbageLines];
}

// ─── Board statistics (used by heuristic AI) ─────────────────────────────────

export function getColumnHeights(board) {
  const heights = new Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    for (let r = BUFFER; r < TOTAL_ROWS; r++) {
      if (board[r][c] !== 0) {
        heights[c] = TOTAL_ROWS - r;
        break;
      }
    }
  }
  return heights;
}

export function getAggregateHeight(board) {
  return getColumnHeights(board).reduce((a, b) => a + b, 0);
}

export function countHoles(board) {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let blockFound = false;
    for (let r = BUFFER; r < TOTAL_ROWS; r++) {
      if (board[r][c] !== 0) blockFound = true;
      else if (blockFound) holes++;
    }
  }
  return holes;
}

export function getBumpiness(board) {
  const h = getColumnHeights(board);
  let bumpiness = 0;
  for (let c = 0; c < COLS - 1; c++) {
    bumpiness += Math.abs(h[c] - h[c + 1]);
  }
  return bumpiness;
}

export function countCompleteLines(board) {
  let count = 0;
  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    if (board[r].every(cell => cell !== 0)) count++;
  }
  return count;
}

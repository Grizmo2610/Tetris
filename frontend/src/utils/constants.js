// ─── Board dimensions ─────────────────────────────────────────────────────────
export const COLS = 10;
export const ROWS = 20;          // visible rows
export const BUFFER = 4;         // hidden buffer rows above visible area
export const TOTAL_ROWS = ROWS + BUFFER; // 24 total rows in board array

// ─── Rendering ────────────────────────────────────────────────────────────────
export const CELL_SIZE = 30;     // pixels per cell
export const BOARD_W = COLS * CELL_SIZE;   // 300px
export const BOARD_H = ROWS * CELL_SIZE;   // 600px

// ─── Piece colors (index = piece type 0-8) ────────────────────────────────────
export const COLORS = {
  0: null,
  1: '#00BFFF', // I – cyan
  2: '#FFD700', // O – yellow
  3: '#A020F0', // T – purple
  4: '#3CB371', // S – green
  5: '#FF4040', // Z – red
  6: '#4466FF', // J – blue
  7: '#FF8C00', // L – orange
  8: '#666666', // garbage – gray
};

// ─── Piece type IDs ───────────────────────────────────────────────────────────
export const PIECE_I = 1;
export const PIECE_O = 2;
export const PIECE_T = 3;
export const PIECE_S = 4;
export const PIECE_Z = 5;
export const PIECE_J = 6;
export const PIECE_L = 7;

// ─── Gravity (frames per cell at 60 fps) — Tetris Guideline table ─────────────
export const GRAVITY_TABLE = [
  24, 20, 17, 14, 11, 9, 7, 5, 4, 3,
   3,  2,  2,  2,  2, 1, 1, 1, 1, 1,
];

// ─── Lock-down ────────────────────────────────────────────────────────────────
export const LOCK_DELAY_MS = 500;
export const LOCK_MOVE_LIMIT = 15;

// ─── DAS / ARR ────────────────────────────────────────────────────────────────
export const DAS_MS = 167;
export const ARR_MS = 33;

// ─── Scoring ─────────────────────────────────────────────────────────────────
export const LINE_SCORES    = [0, 100, 300, 500, 800];  // base × level
export const TSPIN_SCORES   = [400, 800, 1200, 1600];   // 0-3 lines × level
export const MINI_TSPIN_SCORES = [100, 200];             // 0-1 lines × level
export const COMBO_BONUS    = 50;                        // × combo × level
export const ALL_CLEAR_BONUS = 3500;                     // × level

// ─── Garbage output table (lines sent per action) ────────────────────────────
// Index by lines cleared (0-4). Combos added separately.
export const GARBAGE_TABLE = {
  single: 0,
  double: 1,
  triple: 2,
  tetris: 4,
  tspinSingle: 2,
  tspinDouble: 4,
  tspinTriple: 6,
  miniTspinSingle: 0,
  allClear: 10,   // added on top of base garbage
};

// Combo garbage table (index = combo count, 0-based)
export const COMBO_GARBAGE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4]; // 12+ = 4

// ─── Garbage delay ────────────────────────────────────────────────────────────
// Garbage waits this long before being sent. During the window the receiver can
// clear lines to reduce the incoming amount (1 line cleared = 1 garbage cancelled).
export const GARBAGE_DELAY_MS = 5000;

// ─── Disconnect timer ─────────────────────────────────────────────────────────
export const DISCONNECT_TIMEOUT_MS = 30_000;

// ─── AI timing ────────────────────────────────────────────────────────────────
export const AI_THINK_DELAY = {
  easy: 500, medium: 300, hard: 200, expert: 100,
  'meta-easy': 450, 'meta-medium': 250, 'meta-hard': 180, 'meta-expert': 80,
};
export const AI_MOVE_DELAY = {
  easy: 200, medium: 150, hard: 100, expert: 50,
  'meta-easy': 180, 'meta-medium': 120, 'meta-hard': 80, 'meta-expert': 40,
};
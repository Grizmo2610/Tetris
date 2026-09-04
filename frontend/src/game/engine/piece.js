import { COLS, BUFFER, TOTAL_ROWS } from '../../utils/constants.js';

// ─── SRS Rotation tables ──────────────────────────────────────────────────────
// PIECES[type][rotation] = array of [row, col] offsets from piece origin
// Origin is the top-left of bounding box. Piece coords are relative.

export const PIECES = {
  1: [ // I – cyan (4×1 bounding box with 2-row padding → 4×4)
    [[1, 0], [1, 1], [1, 2], [1, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 1], [1, 1], [2, 1], [3, 1]],
  ],
  2: [ // O – yellow (all rotations identical)
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
  ],
  3: [ // T – purple
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 1], [1, 0], [1, 1], [2, 1]],
  ],
  4: [ // S – green
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 1], [1, 2], [2, 0], [2, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
  ],
  5: [ // Z – red
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 2], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[0, 1], [1, 0], [1, 1], [2, 0]],
  ],
  6: [ // J – blue
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 0], [2, 1]],
  ],
  7: [ // L – orange
    [[0, 2], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [1, 2], [2, 0]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ],
};

// ─── SRS Wall Kick tables ─────────────────────────────────────────────────────
// Key: "fromRot>toRot" → array of (row_offset, col_offset) to try in order

// For J, L, S, T, Z pieces
export const KICKS_JLSTZ = {
  '0>1': [[ 0, 0], [-1, 0], [-1,  1], [0, -2], [-1, -2]],
  '1>0': [[ 0, 0], [ 1, 0], [ 1, -1], [0,  2], [ 1,  2]],
  '1>2': [[ 0, 0], [ 1, 0], [ 1, -1], [0,  2], [ 1,  2]],
  '2>1': [[ 0, 0], [-1, 0], [-1,  1], [0, -2], [-1, -2]],
  '2>3': [[ 0, 0], [ 1, 0], [ 1,  1], [0, -2], [ 1, -2]],
  '3>2': [[ 0, 0], [-1, 0], [-1, -1], [0,  2], [-1,  2]],
  '3>0': [[ 0, 0], [-1, 0], [-1, -1], [0,  2], [-1,  2]],
  '0>3': [[ 0, 0], [ 1, 0], [ 1,  1], [0, -2], [ 1, -2]],
};

// For I piece (different kick data)
export const KICKS_I = {
  '0>1': [[0,  0], [0, -2], [0,  1], [ 1, -2], [-2,  1]],
  '1>0': [[0,  0], [0,  2], [0, -1], [-1,  2], [ 2, -1]],
  '1>2': [[0,  0], [0, -1], [0,  2], [-2, -1], [ 1,  2]],
  '2>1': [[0,  0], [0,  1], [0, -2], [ 2,  1], [-1, -2]],
  '2>3': [[0,  0], [0,  2], [0, -1], [ 1,  2], [-2, -1]],
  '3>2': [[0,  0], [0, -2], [0,  1], [-1, -2], [ 2,  1]],
  '3>0': [[0,  0], [0,  1], [0, -2], [-2,  1], [ 1, -2]],
  '0>3': [[0,  0], [0, -1], [0,  2], [ 2, -1], [-1,  2]],
};

// ─── Spawn positions ─────────────────────────────────────────────────────────
// Returns the initial piece state for a given type
export function spawnPiece(type) {
  const col = type === 1 ? 3 : type === 2 ? 4 : 3;
  return { type, rot: 0, row: 1, col };
}

// ─── Seeded RNG (Mulberry32) ──────────────────────────────────────────────────
// A fast, high-quality 32-bit PRNG. Deterministic given the same seed.
// Used to synchronize piece queues between two players in the same match.

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a random 32-bit integer seed, shareable between players.
export function generateSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

// ─── 7-bag randomizer ────────────────────────────────────────────────────────

// Shuffle a bag using a provided rng() function (returns [0,1)).
function shuffleBag(rng) {
  const bag = [1, 2, 3, 4, 5, 6, 7];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// Legacy: unseeded bag (kept for solo mode which doesn't need sync).
export function newBag() {
  const bag = [1, 2, 3, 4, 5, 6, 7];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// Initialize queue with two bags — unseeded (solo mode).
export function initQueue() {
  return [...newBag(), ...newBag()];
}

// Initialize queue from a seed — both players must receive the same seed
// so their piece sequences are identical from the start of the match.
export function initQueueFromSeed(seed) {
  const rng = mulberry32(seed);
  return [...shuffleBag(rng), ...shuffleBag(rng)];
}

// Pop next piece type from queue, refill if needed.
// Refill uses Math.random() — divergence after the initial bags is intentional
// (players will have taken different actions so their queues will differ anyway).
export function dequeue(queue) {
  const next = [...queue];
  if (next.length < 7) next.push(...newBag());
  const type = next.shift();
  return { type, queue: next };
}

// ─── Validation helpers ───────────────────────────────────────────────────────
export function isValidPosition(board, type, rot, row, col) {
  for (const [dr, dc] of PIECES[type][rot]) {
    const r = row + dr;
    const c = col + dc;
    if (c < 0 || c >= COLS || r >= TOTAL_ROWS) return false;
    if (r >= 0 && board[r][c] !== 0) return false;
  }
  return true;
}

// Returns the lowest row the piece can occupy (ghost position)
export function ghostRow(board, type, rot, row, col) {
  let r = row;
  while (isValidPosition(board, type, rot, r + 1, col)) r++;
  return r;
}

// Get kick offsets for a rotation transition
export function getKicks(type, fromRot, toRot) {
  const key = `${fromRot}>${toRot}`;
  return type === 1 ? (KICKS_I[key] ?? [[0, 0]]) : (KICKS_JLSTZ[key] ?? [[0, 0]]);
}
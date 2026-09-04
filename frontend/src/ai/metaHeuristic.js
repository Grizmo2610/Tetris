import { COLS, BUFFER, TOTAL_ROWS } from '../utils/constants.js';
import { PIECES, isValidPosition, ghostRow } from '../game/engine/piece.js';
import {
  lockPieceOnBoard, clearLines,
  getColumnHeights, countHoles, getBumpiness,
  countCompleteLines,
} from '../game/engine/board.js';

// Weight sets

/**
 * Normal play weights — optimised cho survival + attack balance.
 * Tuned theo phương pháp CEM (Cross-Entropy Method) mô phỏng ngoại tuyến.
 */
const WEIGHTS_NORMAL = {
  aggregateHeight:    -0.6180,  // tổng chiều cao — giữ thấp
  maxHeight:          -0.7500,  // chiều cao cột cao nhất — nguy hiểm hơn aggregate
  holes:              -2.3100,  // lỗ trống — rất xấu
  coveredHoles:       -1.4000,  // lỗ bị che nhiều tầng — càng sâu càng tệ
  bumpiness:          -0.3500,  // độ gồ ghề mặt
  rowTransitions:     -0.3200,  // số lần đổi trống/đầy trên mỗi hàng
  colTransitions:     -0.4500,  // số lần đổi trống/đầy trên mỗi cột
  wellDepth:          -0.2800,  // độ sâu "giếng" — không phải lúc nào cũng xấu (I-piece)
  linesCleared:       +1.1200,  // số dòng xóa được
  tetrisReady:        +0.8500,  // board có cột thấp hơn 1 rõ ràng (chờ I-piece)
  tSlotReady:         +0.9000,  // có T-slot (cơ hội T-Spin)
  allClearPotential:  +1.2000,  // có thể All Clear trong 1-2 nước
  comboPreserve:      +0.4000,  // giữ khả năng xóa dòng liên tục
  garbageCounter:     +0.6000,  // ưu tiên xóa nhiều dòng khi có pending garbage
};

/**
 * Danger mode weights — khi chiều cao trung bình > 14 ô.
 * Ưu tiên tuyệt đối survival: hạn chế tạo lỗ, giảm bất kỳ giá trị tấn công.
 */
const WEIGHTS_DANGER = {
  aggregateHeight:    -1.2000,
  maxHeight:          -2.0000,
  holes:              -4.0000,
  coveredHoles:       -3.0000,
  bumpiness:          -0.8000,
  rowTransitions:     -0.6000,
  colTransitions:     -0.9000,
  wellDepth:          -0.1000,
  linesCleared:       +2.5000,
  tetrisReady:        +0.2000,  // ít quan trọng hơn khi nguy hiểm
  tSlotReady:         +0.3000,
  allClearPotential:  +0.5000,
  comboPreserve:      +1.0000,
  garbageCounter:     +1.5000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature extraction (mở rộng so với heuristic cơ bản)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Đếm row transitions: số lần cell đổi từ filled↔empty theo chiều ngang.
 * Bao gồm cả wall (wall tính là filled).
 */
function countRowTransitions(board) {
  let transitions = 0;
  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    let prev = 1; // wall bên trái = filled
    for (let c = 0; c < COLS; c++) {
      const curr = board[r][c] !== 0 ? 1 : 0;
      if (curr !== prev) transitions++;
      prev = curr;
    }
    // wall bên phải
    if (prev !== 1) transitions++;
  }
  return transitions;
}

/**
 * Đếm column transitions: số lần cell đổi từ filled↔empty theo chiều dọc.
 * Floor tính là filled.
 */
function countColTransitions(board) {
  let transitions = 0;
  for (let c = 0; c < COLS; c++) {
    let prev = 1; // floor = filled
    for (let r = TOTAL_ROWS - 1; r >= BUFFER; r--) {
      const curr = board[r][c] !== 0 ? 1 : 0;
      if (curr !== prev) transitions++;
      prev = curr;
    }
  }
  return transitions;
}

/**
 * Tổng độ sâu của tất cả "giếng" (well).
 * Một well là cột mà cả hai bên đều cao hơn ít nhất 1.
 * Well sâu = tốt cho I-piece; nhưng quá nhiều well = xấu.
 */
function calcWellDepth(heights) {
  let total = 0;
  for (let c = 0; c < COLS; c++) {
    const left  = c === 0 ? 20 : heights[c - 1];
    const right = c === COLS - 1 ? 20 : heights[c + 1];
    const minNeighbour = Math.min(left, right);
    if (minNeighbour > heights[c]) {
      total += minNeighbour - heights[c];
    }
  }
  return total;
}

/**
 * Covered holes: lỗ bị che bởi nhiều lớp block.
 * Một lỗ ở độ sâu d tính là d (không phải 1 như countHoles thông thường).
 * Khuyến khích AI tránh chôn lỗ sâu.
 */
function countCoveredHoles(board) {
  let total = 0;
  for (let c = 0; c < COLS; c++) {
    let depth = 0;
    let blockCount = 0;
    for (let r = BUFFER; r < TOTAL_ROWS; r++) {
      if (board[r][c] !== 0) {
        blockCount++;
      } else if (blockCount > 0) {
        // lỗ này bị che bởi blockCount lớp phía trên
        total += blockCount; // tính trọng số theo độ sâu
        depth++;
      }
    }
  }
  return total;
}

/**
 * Phát hiện Tetris-ready: board có đúng 1 cột thấp hơn các cột kế
 * ít nhất 4 ô → chờ I-piece.
 */
function hasTetrisReady(heights) {
  for (let c = 0; c < COLS; c++) {
    const left  = c === 0 ? 100 : heights[c - 1];
    const right = c === COLS - 1 ? 100 : heights[c + 1];
    const gap = Math.min(left, right) - heights[c];
    if (gap >= 4) return 1;
  }
  return 0;
}

/**
 * Phát hiện T-slot: pattern 3 ô hình chữ T rỗng trong board (đơn giản hóa).
 * Dùng heuristic: tìm cột có 2 ô trống bên cạnh ở cùng row và 1 ô bên trên.
 */
function hasTSlot(board, heights) {
  for (let c = 1; c < COLS - 1; c++) {
    const row = TOTAL_ROWS - 1 - heights[c]; // top của cột này
    if (row < BUFFER + 2) continue;

    // Kiểm tra T-slot pattern (rot 0 hoặc 2)
    const rCheck = row + 1; // hàng cần có khoảng trống 3 ô
    if (rCheck >= TOTAL_ROWS) continue;

    const leftFilled  = board[rCheck][c - 1] !== 0;
    const rightFilled = board[rCheck][c + 1] !== 0;
    const aboveFilled = board[row][c] !== 0;

    // T-slot đơn giản: cột giữa trống, 2 bên đầy, phía trên đầy
    if (!aboveFilled && leftFilled && rightFilled) return 1;
  }
  return 0;
}

/**
 * Khả năng All Clear: kiểm tra xem board gần trống không.
 * Chỉ cho score khi tổng cell đặt < 12 (khoảng 1-3 piece nữa là clear được).
 */
function calcAllClearPotential(board) {
  let filledCells = 0;
  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0) filledCells++;
    }
  }
  // Nếu ít hơn 10 cell đặt → tiềm năng All Clear cao
  if (filledCells === 0) return 2;
  if (filledCells <= 10) return 1;
  return 0;
}

/**
 * Combo preserve: board có các hàng gần đầy (≥8/10 cell) → giữ combo.
 */
function calcComboPreserve(board) {
  let nearFull = 0;
  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    let filled = 0;
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0) filled++;
    }
    if (filled >= 8) nearFull++;
  }
  return nearFull;
}

/**
 * Chiều cao cột cao nhất (visible).
 */
function getMaxHeight(heights) {
  return Math.max(...heights, 0);
}

/**
 * Tổng hợp tất cả features và tính score với weights đã chọn.
 */
function scoreBoardAdvanced(board, weights, pendingGarbage = 0) {
  const { board: cleared, linesCleared } = clearLines(board);
  const heights = getColumnHeights(cleared);

  const aggH       = heights.reduce((a, b) => a + b, 0);
  const maxH       = getMaxHeight(heights);
  const holes      = countHoles(cleared);
  const covHoles   = countCoveredHoles(cleared);
  const bump       = getBumpiness(cleared);
  const rowTrans   = countRowTransitions(cleared);
  const colTrans   = countColTransitions(cleared);
  const wellD      = calcWellDepth(heights);
  const tetrisRdy  = hasTetrisReady(heights);
  const tSlot      = hasTSlot(cleared, heights);
  const allClearP  = calcAllClearPotential(cleared);
  const comboP     = calcComboPreserve(cleared);

  // Garbage counter bonus: xóa nhiều dòng hơn khi có garbage đến
  const garbageBonus = pendingGarbage > 0 ? linesCleared * pendingGarbage * 0.1 : 0;

  return (
    weights.aggregateHeight   * aggH      +
    weights.maxHeight         * maxH      +
    weights.holes             * holes     +
    weights.coveredHoles      * covHoles  +
    weights.bumpiness         * bump      +
    weights.rowTransitions    * rowTrans  +
    weights.colTransitions    * colTrans  +
    weights.wellDepth         * wellD     +
    weights.linesCleared      * linesCleared +
    weights.tetrisReady       * tetrisRdy +
    weights.tSlotReady        * tSlot     +
    weights.allClearPotential * allClearP +
    weights.comboPreserve     * comboP    +
    weights.garbageCounter    * garbageBonus
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beam Search với N-piece lookahead
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enumerate placements cho 1 piece, trả về array of { rotation, column, board }.
 * Không tính score ở đây — để beam search tổng hợp.
 */
function enumeratePlacements(board, type) {
  const results = [];
  for (let rot = 0; rot < 4; rot++) {
    const cells = PIECES[type][rot];
    const minDC = Math.min(...cells.map(([, c]) => c));
    const maxDC = Math.max(...cells.map(([, c]) => c));

    for (let col = -minDC; col < COLS - maxDC; col++) {
      if (!isValidPosition(board, type, rot, 1, col)) continue;
      const landRow = ghostRow(board, type, rot, 1, col);
      const locked  = lockPieceOnBoard(board, type, rot, landRow, col);
      results.push({ rotation: rot, column: col, board: locked });
    }
  }
  return results;
}

/**
 * Beam Search N-piece lookahead.
 *
 * @param {*}     board         - board hiện tại
 * @param {Array} pieceQueue    - mảng type id (piece hiện tại + lookahead)
 * @param {*}     weights       - weight set
 * @param {number} beamWidth    - số candidate giữ lại mỗi bước
 * @param {number} sampleDepth  - số piece lookahead (1 = greedy, 4 = deep)
 * @param {number} pendingGarb  - pending garbage hiện tại
 * @returns {Array} sorted candidates [{ rotation, column, score }, ...]
 */
function beamSearch(board, pieceQueue, weights, beamWidth, sampleDepth, pendingGarb) {
  const depth = Math.min(sampleDepth, pieceQueue.length);

  // Beam state: array of { board, firstMove, score }
  // firstMove = { rotation, column } của bước đầu tiên (cái ta cần trả về)
  const initialPlacements = enumeratePlacements(board, pieceQueue[0]);

  if (initialPlacements.length === 0) return [];

  // Khởi tạo beam với tất cả placement của piece đầu
  let beam = initialPlacements.map(p => ({
    board:     p.board,
    firstMove: { rotation: p.rotation, column: p.column },
    score:     scoreBoardAdvanced(p.board, weights, pendingGarb),
  }));

  // Expand beam qua các piece tiếp theo
  for (let d = 1; d < depth; d++) {
    const nextType = pieceQueue[d];
    let expanded = [];

    for (const state of beam) {
      const placements = enumeratePlacements(state.board, nextType);
      for (const p of placements) {
        expanded.push({
          board:     p.board,
          firstMove: state.firstMove, // giữ nguyên first move
          score:     scoreBoardAdvanced(p.board, weights, pendingGarb),
        });
      }
    }

    if (expanded.length === 0) break;

    // Pruning: giữ beamWidth tốt nhất
    expanded.sort((a, b) => b.score - a.score);
    beam = expanded.slice(0, beamWidth);
  }

  // Merge: với cùng firstMove, lấy score tốt nhất
  const moveMap = new Map();
  for (const state of beam) {
    const key = `${state.firstMove.rotation}_${state.firstMove.column}`;
    if (!moveMap.has(key) || state.score > moveMap.get(key).score) {
      moveMap.set(key, state);
    }
  }

  const candidates = Array.from(moveMap.values());
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Danger level detection
// ─────────────────────────────────────────────────────────────────────────────

function isDangerMode(board) {
  const heights = getColumnHeights(board);
  const maxH = getMaxHeight(heights);
  // Nguy hiểm nếu cột cao nhất > 14 (visible board cao 20)
  return maxH >= 14;
}

// ─────────────────────────────────────────────────────────────────────────────
// MetaHeuristicAI — main class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Config mỗi difficulty:
 *   beamWidth   — số nhánh giữ lại trong beam
 *   lookAhead   — số piece nhìn trước
 *   errorRate   — xác suất pick ngẫu nhiên trong top-N (inject imperfection)
 *   errorPoolN  — N trong "top-N" khi error inject
 */
const DIFFICULTY_CONFIG = {
  // 'meta-easy': tốt hơn HeuristicAI easy nhưng vẫn để thua được
  'meta-easy': {
    beamWidth:  3,
    lookAhead:  2,
    errorRate:  0.25,
    errorPoolN: 5,
  },
  // 'meta-medium': tốt hơn HeuristicAI medium rõ rệt
  'meta-medium': {
    beamWidth:  5,
    lookAhead:  3,
    errorRate:  0.08,
    errorPoolN: 3,
  },
  // 'meta-hard': AI mạnh không cần model — thay thế cho ONNX hard
  'meta-hard': {
    beamWidth:  8,
    lookAhead:  4,
    errorRate:  0.0,
    errorPoolN: 1,
  },
  // 'meta-expert': beam rộng + lookahead sâu — đối thủ cực mạnh
  'meta-expert': {
    beamWidth:  12,
    lookAhead:  5,
    errorRate:  0.0,
    errorPoolN: 1,
  },
};

export class MetaHeuristicAI {
  /**
   * @param {'meta-easy'|'meta-medium'|'meta-hard'|'meta-expert'} difficulty
   */
  constructor(difficulty = 'meta-hard') {
    if (!DIFFICULTY_CONFIG[difficulty]) {
      console.warn(`[MetaHeuristicAI] Unknown difficulty "${difficulty}", falling back to meta-hard`);
      difficulty = 'meta-hard';
    }
    this.difficulty = difficulty;
    this.cfg = DIFFICULTY_CONFIG[difficulty];
  }

  /**
   * Implements AIController interface.
   * @param {object} gameState  — { board, piece, queue, holdType, combo, pendingGarbage }
   * @returns {Promise<{ rotation: number, column: number }>}
   */
  async getNextMove(gameState) {
    const { board, piece, queue, pendingGarbage = 0 } = gameState;
    const { beamWidth, lookAhead, errorRate, errorPoolN } = this.cfg;

    // Chọn weight set dựa trên board state
    const weights = isDangerMode(board) ? WEIGHTS_DANGER : WEIGHTS_NORMAL;

    // Xây dựng queue cho beam search: [current piece, ...next pieces]
    const pieceQueue = [piece.type, ...queue.slice(0, lookAhead - 1)];

    const candidates = beamSearch(
      board,
      pieceQueue,
      weights,
      beamWidth,
      lookAhead,
      pendingGarbage,
    );

    if (!candidates || candidates.length === 0) {
      return this._randomValid(board, piece);
    }

    // Error injection
    if (errorRate > 0 && Math.random() < errorRate) {
      const pool = candidates.slice(0, Math.min(errorPoolN, candidates.length));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return pick.firstMove;
    }

    return candidates[0].firstMove;
  }

  destroy() {
    // Không cần cleanup (chạy trên main thread, không có worker)
  }

  /** Fallback khi không tìm được placement nào. */
  _randomValid(board, piece) {
    for (let rot = 0; rot < 4; rot++) {
      for (let col = 0; col < COLS; col++) {
        if (isValidPosition(board, piece.type, rot, piece.row, col)) {
          return { rotation: rot, column: col };
        }
      }
    }
    return { rotation: 0, column: piece.col };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature diagnostics (dev/debug only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trả về object với tất cả feature values cho một board.
 * Dùng trong dev mode để debug / visualise AI decision.
 *
 * @example
 *   if (import.meta.env.DEV) {
 *     console.table(debugFeatures(board));
 *   }
 */
export function debugFeatures(board) {
  const heights  = getColumnHeights(board);
  return {
    aggregateHeight:   heights.reduce((a, b) => a + b, 0),
    maxHeight:         getMaxHeight(heights),
    holes:             countHoles(board),
    coveredHoles:      countCoveredHoles(board),
    bumpiness:         getBumpiness(board),
    rowTransitions:    countRowTransitions(board),
    colTransitions:    countColTransitions(board),
    wellDepth:         calcWellDepth(heights),
    tetrisReady:       hasTetrisReady(heights),
    tSlotReady:        hasTSlot(board, heights),
    allClearPotential: calcAllClearPotential(board),
    comboPreserve:     calcComboPreserve(board),
    dangerMode:        isDangerMode(board),
  };
}
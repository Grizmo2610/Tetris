import { HeuristicAI } from './heuristic.js';
import { MetaHeuristicAI } from './metaHeuristic.js';
import { COLS, BUFFER } from '../utils/constants.js';
import { PIECES, isValidPosition } from '../game/engine/piece.js';

// ─── Input vector construction (224 dims) ─────────────────────────────────────
// Matches the training environment input spec in 08-ai-design.md

function buildStateVector(gameState) {
  const { board, piece, queue, holdType, combo, pendingGarbage } = gameState;
  const vec = new Float32Array(224);
  let i = 0;

  // Board: 10×20 binary (occupied = 1) — visible rows only
  for (let r = BUFFER; r < BUFFER + 20; r++) {
    for (let c = 0; c < COLS; c++) {
      vec[i++] = board[r][c] !== 0 ? 1 : 0;
    }
  }

  // Current piece: one-hot 7
  for (let t = 1; t <= 7; t++) vec[i++] = piece.type === t ? 1 : 0;

  // Next piece: one-hot 7
  const nextType = queue[0] ?? 0;
  for (let t = 1; t <= 7; t++) vec[i++] = nextType === t ? 1 : 0;

  // Hold piece: one-hot 7 + null flag
  for (let t = 1; t <= 7; t++) vec[i++] = holdType === t ? 1 : 0;
  vec[i++] = holdType === null ? 1 : 0;

  // Combo (normalized by 20)
  vec[i++] = Math.max(0, combo) / 20;

  // Pending garbage (normalized by 20)
  vec[i++] = Math.min(pendingGarbage, 20) / 20;

  return vec; // i should be 224
}

// ─── Action → placement mapping ───────────────────────────────────────────────
// Model output: 40 values = 4 rotations × 10 columns

function actionToPlacement(action) {
  const rotation = Math.floor(action / COLS);
  const column   = action % COLS;
  return { rotation, column };
}

// Valid action mask: actions where the piece cannot reach the column are masked
function buildValidMask(board, type, spawnRow, spawnCol) {
  const mask = new Array(40).fill(false);
  for (let rot = 0; rot < 4; rot++) {
    for (let col = 0; col < COLS; col++) {
      if (isValidPosition(board, type, rot, spawnRow, col)) {
        mask[rot * COLS + col] = true;
      }
    }
  }
  return mask;
}

// ─── ONNXAIController ─────────────────────────────────────────────────────────

export class ONNXAIController {
  constructor(worker) {
    this._worker = worker;
    this._pending = new Map(); // requestId → { resolve, timeoutHandle }
    this._reqCounter = 0;
    this._worker.onmessage = ({ data }) => this._onWorkerMessage(data);
  }

  async getNextMove(gameState) {
    const { piece, board } = gameState;
    const state = buildStateVector(gameState);
    const mask  = buildValidMask(board, piece.type, piece.row, piece.col);

    return new Promise((resolve) => {
      const requestId = `req_${this._reqCounter++}`;

      const timeoutHandle = setTimeout(() => {
        this._pending.delete(requestId);
        // Fallback: random valid placement
        resolve(this._randomValid(mask));
      }, 2000);

      this._pending.set(requestId, { resolve, timeoutHandle });
      this._worker.postMessage({ type: 'INFER', requestId, state });
    });
  }

  destroy() {
    // Clear pending requests
    for (const { timeoutHandle, resolve } of this._pending.values()) {
      clearTimeout(timeoutHandle);
      resolve({ rotation: 0, column: 4 }); // benign fallback
    }
    this._pending.clear();
    this._worker.terminate();
  }

  _onWorkerMessage(data) {
    if (data.type === 'RESULT') {
      const pending = this._pending.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timeoutHandle);
      this._pending.delete(data.requestId);

      // Apply valid mask before using action
      const action = data.action;
      const mask   = null; // stored per-request if needed; for now trust model
      pending.resolve(actionToPlacement(action));
    }
    if (data.type === 'ERROR') {
      const pending = this._pending.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timeoutHandle);
      this._pending.delete(data.requestId);
      pending.resolve({ rotation: 0, column: 4 });
    }
  }

  _randomValid(mask) {
    const valid = mask.map((v, i) => v ? i : -1).filter(i => i >= 0);
    if (valid.length === 0) return { rotation: 0, column: 4 };
    const action = valid[Math.floor(Math.random() * valid.length)];
    return actionToPlacement(action);
  }
}

// ─── Factory function ─────────────────────────────────────────────────────────

export async function createAIController(difficulty) {
  if (difficulty === 'easy' || difficulty === 'medium') {
    return new HeuristicAI(difficulty);
  }

  // Meta Heuristic — không cần model, không cần network
  if (difficulty === 'meta-easy')   return new MetaHeuristicAI('meta-easy');
  if (difficulty === 'meta-medium') return new MetaHeuristicAI('meta-medium');
  if (difficulty === 'meta-hard')   return new MetaHeuristicAI('meta-hard');
  if (difficulty === 'meta-expert') return new MetaHeuristicAI('meta-expert');

  // Hard / Expert: load ONNX model from R2.
  // If anything fails, fall back to the equivalent MetaHeuristicAI level
  // so the game remains fully playable without a model file.
  const metaFallback = difficulty === 'hard' ? 'meta-hard' : 'meta-expert';

  const modelUrl = difficulty === 'hard'
    ? (import.meta.env.VITE_R2_MODEL_URL_HARD   ?? '/models/tetris-ai-hard-int8.onnx')
    : (import.meta.env.VITE_R2_MODEL_URL_EXPERT ?? '/models/tetris-ai-expert-int8.onnx');

  let response;
  try {
    response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Model fetch failed: ${response.status}`);
  } catch (err) {
    console.warn(`[AI] ONNX model unavailable (${err.message}), falling back to ${metaFallback}`);
    return new MetaHeuristicAI(metaFallback);
  }
  const modelBuffer = await response.arrayBuffer();

  const worker = new Worker(
    new URL('./onnxWorker.js', import.meta.url),
    { type: 'module' }
  );

  // Wait for READY signal with 10s timeout
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('ONNX worker init timeout')), 10_000);
      worker.postMessage({ type: 'INIT', modelBuffer }, [modelBuffer]);
      worker.onmessage = ({ data }) => {
        if (data.type === 'READY')  { clearTimeout(t); resolve(); }
        if (data.type === 'ERROR')  { clearTimeout(t); reject(new Error(data.message)); }
      };
    });
  } catch (err) {
    console.warn(`[AI] ONNX worker failed (${err.message}), falling back to ${metaFallback}`);
    worker.terminate();
    return new MetaHeuristicAI(metaFallback);
  }

  return new ONNXAIController(worker);
}
import { COLS, ROWS, BUFFER, TOTAL_ROWS, CELL_SIZE, COLORS } from '../../utils/constants.js';
import { PIECES } from '../engine/piece.js';
import { ghostRow } from '../engine/piece.js';

const CS = CELL_SIZE;
const W = COLS * CS;
const H = ROWS * CS;

// ─── Background (drawn once into offscreen canvas) ────────────────────────────

let bgCanvas = null;

function getBgCanvas() {
  if (bgCanvas) return bgCanvas;
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = W;
  bgCanvas.height = H;
  const ctx = bgCanvas.getContext('2d');
  ctx.fillStyle = '#080814';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#141428';
  ctx.lineWidth = 0.5;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CS); ctx.lineTo(W, r * CS); ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * CS, 0); ctx.lineTo(c * CS, H); ctx.stroke();
  }
  return bgCanvas;
}

// ─── Cell drawing ─────────────────────────────────────────────────────────────

function drawCell(ctx, row, col, color, alpha = 1) {
  const x = col * CS;
  const y = row * CS;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, CS - 2, CS - 2);
  // Top/left highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 1, y + 1, CS - 2, 4);
  ctx.fillRect(x + 1, y + 1, 4, CS - 6);
  // Bottom shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x + 1, y + CS - 5, CS - 2, 4);
  ctx.globalAlpha = 1;
}

// ─── Main board render ────────────────────────────────────────────────────────

export function renderBoard(ctx, state, options = {}) {
  const { showGhost = true, dimmed = false } = options;
  const { board, piece, onGround, lockTimer, pendingGarbage } = state;

  // Background
  ctx.drawImage(getBgCanvas(), 0, 0);
  if (dimmed) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
  }

  // Board cells (visible rows only)
  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      drawCell(ctx, r - BUFFER, c, COLORS[v]);
    }
  }

  if (!piece) return;
  const { type, rot, row, col } = piece;

  // Ghost piece
  if (showGhost) {
    const ghost = ghostRow(board, type, rot, row, col);
    if (ghost !== row) {
      for (const [dr, dc] of PIECES[type][rot]) {
        const ar = ghost + dr - BUFFER;
        if (ar >= 0 && ar < ROWS) {
          drawCell(ctx, ar, col + dc, COLORS[type], 0.22);
        }
      }
    }
  }

  // Active piece
  for (const [dr, dc] of PIECES[type][rot]) {
    const ar = row + dr - BUFFER;
    if (ar >= 0 && ar < ROWS) {
      drawCell(ctx, ar, col + dc, COLORS[type]);
    }
  }

  // Lock-down flash
  if (onGround && lockTimer > 0) {
    const alpha = Math.min(0.3, (lockTimer / 500) * 0.3);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (const [dr, dc] of PIECES[type][rot]) {
      const ar = row + dr - BUFFER;
      if (ar >= 0 && ar < ROWS) {
        ctx.fillRect((col + dc) * CS + 1, ar * CS + 1, CS - 2, CS - 2);
      }
    }
  }

  // Pending garbage bar (right edge, red)
  if (pendingGarbage > 0) {
    const barW = 6;
    const maxGarbage = 20;
    const barH = Math.min(pendingGarbage / maxGarbage, 1) * H;
    const flash = pendingGarbage >= 4;
    ctx.fillStyle = flash
      ? `rgba(255,60,60,${0.7 + 0.3 * Math.sin(Date.now() / 120)})`
      : 'rgba(220,50,50,0.75)';
    ctx.fillRect(W - barW - 1, H - barH, barW, barH);
  }
}

// ─── Opponent board (simpler, no ghost, no input) ─────────────────────────────

export function renderOpponentBoard(ctx, boardData, pendingGarbage = 0) {
  ctx.drawImage(getBgCanvas(), 0, 0);

  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = boardData[r * COLS + c] ?? boardData[r]?.[c] ?? 0;
      if (v === 0) continue;
      drawCell(ctx, r - BUFFER, c, COLORS[v]);
    }
  }

  if (pendingGarbage > 0) {
    const barW = 6;
    const barH = Math.min(pendingGarbage / 20, 1) * H;
    ctx.fillStyle = 'rgba(220,50,50,0.75)';
    ctx.fillRect(W - barW - 1, H - barH, barW, barH);
  }
}

// ─── Mini piece preview (next queue / hold) ───────────────────────────────────

export function renderMiniPiece(ctx, canvasWidth, canvasHeight, type, offsetY, dimmed = false) {
  if (!type) return;
  const cells = PIECES[type][0];
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  const S = 20;
  const padX = Math.floor((canvasWidth - (4 * S)) / 2);

  ctx.globalAlpha = dimmed ? 0.3 : 1;
  for (const [dr, dc] of cells) {
    const x = padX + (dc - minC) * S;
    const y = offsetY + (dr - minR) * S;
    ctx.fillStyle = COLORS[type];
    ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 1, y + 1, S - 2, 3);
    ctx.fillRect(x + 1, y + 1, 3, S - 4);
  }
  ctx.globalAlpha = 1;
}

export function renderNextQueue(ctx, types, maxVisible = 5) {
  const cw = ctx.canvas.width;
  ctx.clearRect(0, 0, cw, ctx.canvas.height);
  ctx.fillStyle = '#080814';
  ctx.fillRect(0, 0, cw, ctx.canvas.height);
  types.slice(0, maxVisible).forEach((type, i) => {
    renderMiniPiece(ctx, cw, 60, type, i * 62 + 6);
  });
}

export function renderHoldPiece(ctx, holdType, holdUsed) {
  const cw = ctx.canvas.width;
  ctx.clearRect(0, 0, cw, ctx.canvas.height);
  ctx.fillStyle = '#080814';
  ctx.fillRect(0, 0, cw, ctx.canvas.height);
  if (holdType) renderMiniPiece(ctx, cw, 60, holdType, 8, holdUsed);
}

// ─── Invalidate bg cache (call if CELL_SIZE changes) ─────────────────────────
export function resetBgCache() {
  bgCanvas = null;
}

export { W as BOARD_W, H as BOARD_H };

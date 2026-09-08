import { COLS, ROWS, BUFFER, TOTAL_ROWS, CELL_SIZE, COLORS } from '../../utils/constants.js';
import { PIECES } from '../engine/piece.js';
import { ghostRow } from '../engine/piece.js';

const CS = CELL_SIZE;
const W  = COLS * CS;
const H  = ROWS * CS;

// ─── Neon glow map ────────────────────────────────────────────────────────────

const GLOW = {
  1: 'rgba(0,191,255,0.55)',   // I cyan
  2: 'rgba(255,215,0,0.55)',   // O yellow
  3: 'rgba(160,32,240,0.55)',  // T purple
  4: 'rgba(60,179,113,0.55)',  // S green
  5: 'rgba(255,64,64,0.55)',   // Z red
  6: 'rgba(68,102,255,0.55)',  // J blue
  7: 'rgba(255,140,0,0.55)',   // L orange
  8: 'rgba(100,100,100,0.35)', // garbage
};

// ─── Background cache ─────────────────────────────────────────────────────────

let bgCanvas = null;

function getBgCanvas() {
  if (bgCanvas) return bgCanvas;
  bgCanvas = document.createElement('canvas');
  bgCanvas.width  = W;
  bgCanvas.height = H;
  const ctx = bgCanvas.getContext('2d');

  // Dark gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0d0d1a');
  grad.addColorStop(0.5, '#0a0a15');
  grad.addColorStop(1, '#0d0d1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  for (let r = 0; r <= ROWS; r++) {
    const alpha = r % 2 === 0 ? 0.06 : 0.03;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, r * CS); ctx.lineTo(W, r * CS); ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(c * CS, 0); ctx.lineTo(c * CS, H); ctx.stroke();
  }
  return bgCanvas;
}

// ─── Cell drawing ─────────────────────────────────────────────────────────────

const CORNER_R = 3;

function drawCell(ctx, row, col, colorId, alpha = 1) {
  const x = col * CS + 1;
  const y = row * CS + 1;
  const w = CS - 2;
  const h = CS - 2;
  const color = typeof colorId === 'string' ? colorId : COLORS[colorId];
  const glow  = typeof colorId === 'number' ? GLOW[colorId] : null;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Neon glow
  if (glow && alpha > 0.5) {
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
  }

  // Rounded rect path
  roundRect(ctx, x, y, w, h, CORNER_R);

  // Gradient fill (top lighter, bottom darker)
  const fillGrad = ctx.createLinearGradient(x, y, x, y + h);
  fillGrad.addColorStop(0, lighten(color, 0.15));
  fillGrad.addColorStop(1, darken(color, 0.2));
  ctx.fillStyle = fillGrad;
  ctx.fill();

  ctx.shadowBlur = 0;

  // Inner highlight (top-left shimmer)
  roundRect(ctx, x, y, w, h * 0.45, CORNER_R);
  const shimmer = ctx.createLinearGradient(x, y, x, y + h * 0.45);
  shimmer.addColorStop(0, 'rgba(255,255,255,0.30)');
  shimmer.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shimmer;
  ctx.fill();

  // Bottom shadow
  roundRect(ctx, x, y + h * 0.6, w, h * 0.4, CORNER_R);
  const shadow = ctx.createLinearGradient(x, y + h * 0.6, x, y + h);
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = shadow;
  ctx.fill();

  // Edge outline
  roundRect(ctx, x, y, w, h, CORNER_R);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.restore();
}

// ─── Rounded rect helper ──────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function lighten(hex, amt) {
  return adjustColor(hex, amt);
}
function darken(hex, amt) {
  return adjustColor(hex, -amt);
}
function adjustColor(hex, amt) {
  let c = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (c >> 16) + Math.round(amt * 255)));
  const g = Math.min(255, Math.max(0, ((c >> 8) & 0xff) + Math.round(amt * 255)));
  const b = Math.min(255, Math.max(0, (c & 0xff) + Math.round(amt * 255)));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ─── Main board render ────────────────────────────────────────────────────────

export function renderBoard(ctx, state, options = {}) {
  const { showGhost = true } = options;
  const { board, piece, onGround, lockTimer, pendingGarbage } = state;

  ctx.globalAlpha = 1;
  ctx.drawImage(getBgCanvas(), 0, 0);

  // Board cells (visible rows only)
  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      drawCell(ctx, r - BUFFER, c, v);
    }
  }

  if (!piece) return;
  const { type, rot, row, col } = piece;

  // Ghost piece — neon outline style
  if (showGhost) {
    const ghost = ghostRow(board, type, rot, row, col);
    if (ghost !== row) {
      const gColor = COLORS[type];
      for (const [dr, dc] of PIECES[type][rot]) {
        const ar = ghost + dr - BUFFER;
        if (ar >= 0 && ar < ROWS) {
          const x = (col + dc) * CS + 2;
          const y = ar * CS + 2;
          const w = CS - 4;
          const h = CS - 4;
          ctx.save();
          roundRect(ctx, x, y, w, h, CORNER_R);
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          ctx.fill();
          roundRect(ctx, x, y, w, h, CORNER_R);
          ctx.strokeStyle = gColor;
          ctx.globalAlpha = 0.28;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // Active piece
  for (const [dr, dc] of PIECES[type][rot]) {
    const ar = row + dr - BUFFER;
    if (ar >= 0 && ar < ROWS) {
      drawCell(ctx, ar, col + dc, type);
    }
  }

  // Lock-down flash
  if (onGround && lockTimer > 0) {
    const alpha = Math.min(0.25, (lockTimer / 500) * 0.25);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (const [dr, dc] of PIECES[type][rot]) {
      const ar = row + dr - BUFFER;
      if (ar >= 0 && ar < ROWS) {
        ctx.fillRect((col + dc) * CS + 1, ar * CS + 1, CS - 2, CS - 2);
      }
    }
  }

  // Pending garbage bar — neon red
  if (pendingGarbage > 0) {
    const barW = 5;
    const maxG = 20;
    const barH = Math.min(pendingGarbage / maxG, 1) * H;
    const flash = pendingGarbage >= 4;
    const t = Date.now() / 200;

    const barGrad = ctx.createLinearGradient(0, H - barH, 0, H);
    barGrad.addColorStop(0, `rgba(255,0,80,${flash ? 0.6 + 0.4 * Math.abs(Math.sin(t)) : 0.55})`);
    barGrad.addColorStop(1, `rgba(255,80,0,${flash ? 0.9 + 0.1 * Math.abs(Math.sin(t)) : 0.8})`);
    ctx.fillStyle = barGrad;
    ctx.fillRect(W - barW - 1, H - barH, barW, barH);

    // Glow on bar
    if (flash) {
      ctx.shadowColor = '#ff0050';
      ctx.shadowBlur  = 12;
      ctx.fillStyle   = `rgba(255,0,80,0.3)`;
      ctx.fillRect(W - barW - 1, H - barH, barW, barH);
      ctx.shadowBlur  = 0;
    }
  }
}

// ─── Opponent board ───────────────────────────────────────────────────────────

export function renderOpponentBoard(ctx, boardData, pendingGarbage = 0) {
  ctx.globalAlpha = 1;
  ctx.drawImage(getBgCanvas(), 0, 0);

  for (let r = BUFFER; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = boardData[r * COLS + c] ?? boardData[r]?.[c] ?? 0;
      if (v === 0) continue;
      drawCell(ctx, r - BUFFER, c, v);
    }
  }

  if (pendingGarbage > 0) {
    const barW = 5;
    const barH = Math.min(pendingGarbage / 20, 1) * H;
    ctx.fillStyle = 'rgba(220,50,50,0.75)';
    ctx.fillRect(W - barW - 1, H - barH, barW, barH);
  }
}

// ─── Mini piece preview ───────────────────────────────────────────────────────

const S = 20; // mini cell size

function drawMiniCell(ctx, x, y, colorId) {
  const color = COLORS[colorId];
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur  = 6;
  roundRect(ctx, x + 1, y + 1, S - 2, S - 2, 2);
  const grad = ctx.createLinearGradient(x, y, x, y + S);
  grad.addColorStop(0, lighten(color, 0.12));
  grad.addColorStop(1, darken(color, 0.15));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;
  // highlight
  roundRect(ctx, x + 1, y + 1, S - 2, (S - 2) * 0.4, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.restore();
}

export function renderMiniPiece(ctx, canvasWidth, canvasHeight, type, offsetY, dimmed = false) {
  if (!type) return;
  const cells = PIECES[type][0];
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  const padX = Math.floor((canvasWidth - 4 * S) / 2);

  ctx.globalAlpha = dimmed ? 0.4 : 1;
  for (const [dr, dc] of cells) {
    const x = padX + (dc - minC) * S;
    const y = offsetY + (dr - minR) * S;
    drawMiniCell(ctx, x, y, type);
  }
  ctx.globalAlpha = 1;
}

export function renderNextQueue(ctx, types, maxVisible = 5) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;

  // Dark bg
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  types.slice(0, maxVisible).forEach((type, i) => {
    renderMiniPiece(ctx, cw, 60, type, i * 62 + 8);
  });
}

export function renderHoldPiece(ctx, holdType, holdUsed) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  if (holdType) renderMiniPiece(ctx, cw, 60, holdType, 10, holdUsed);
}

export function resetBgCache() { bgCanvas = null; }
export { W as BOARD_W, H as BOARD_H };

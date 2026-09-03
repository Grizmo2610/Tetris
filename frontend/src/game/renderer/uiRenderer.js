// uiRenderer.js — draws text HUD elements onto a 2D canvas overlay
// Kept separate from boardRenderer so game board and UI layers are decoupled.

const FONT_SANS = "'Inter', 'Segoe UI', sans-serif";
const FONT_MONO = "'Courier New', monospace";

// ─── Combo pop-up ─────────────────────────────────────────────────────────────

export function renderComboPopup(ctx, combo, x, y) {
  if (combo < 1) return;
  ctx.save();
  ctx.font = `bold ${14 + combo * 2}px ${FONT_SANS}`;
  ctx.fillStyle = `hsl(${40 + combo * 8}, 90%, 60%)`;
  ctx.textAlign = 'center';
  ctx.fillText(`${combo} COMBO`, x, y);
  ctx.restore();
}

// ─── Action label (Tetris! T-Spin! All Clear!) ────────────────────────────────

const ACTION_COLORS = {
  tetris:       '#00BFFF',
  tspin:        '#A020F0',
  tspinSingle:  '#CC44FF',
  tspinDouble:  '#DD22FF',
  tspinTriple:  '#FF00FF',
  allClear:     '#FFD700',
  default:      '#ffffff',
};

export function renderActionLabel(ctx, label, x, y) {
  if (!label) return;
  ctx.save();
  ctx.font = `bold 16px ${FONT_SANS}`;
  ctx.fillStyle = ACTION_COLORS[label] ?? ACTION_COLORS.default;
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  const text = {
    tetris:      'TETRIS!',
    tspin:       'T-SPIN',
    tspinSingle: 'T-SPIN SINGLE',
    tspinDouble: 'T-SPIN DOUBLE',
    tspinTriple: 'T-SPIN TRIPLE',
    allClear:    '✦ ALL CLEAR ✦',
  }[label] ?? label.toUpperCase();
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ─── Countdown (3-2-1-GO!) ────────────────────────────────────────────────────

export function renderCountdown(ctx, value, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(5,5,20,0.75)';
  ctx.fillRect(0, 0, w, h);
  ctx.font = `bold 72px ${FONT_SANS}`;
  ctx.fillStyle = value === 0 ? '#3eff3e' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value === 0 ? 'GO!' : String(value), w / 2, h / 2);
  ctx.restore();
}

// ─── Disconnect overlay ───────────────────────────────────────────────────────

export function renderDisconnectOverlay(ctx, secondsLeft, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(5,5,20,0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.font = `bold 18px ${FONT_SANS}`;
  ctx.fillStyle = '#ffcc44';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Opponent disconnected', w / 2, h / 2 - 24);
  ctx.font = `28px ${FONT_MONO}`;
  ctx.fillStyle = secondsLeft <= 5 ? '#ff4444' : '#ffffff';
  ctx.fillText(`${secondsLeft}s`, w / 2, h / 2 + 14);
  ctx.restore();
}

// ─── Game-over overlay ────────────────────────────────────────────────────────

export function renderGameOverOverlay(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(5,5,20,0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.font = `bold 28px ${FONT_SANS}`;
  ctx.fillStyle = '#ff6b6b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GAME OVER', w / 2, h / 2);
  ctx.restore();
}

import { DAS_MS, ARR_MS } from '../../utils/constants.js';

// ─── Default key bindings ─────────────────────────────────────────────────────

export const DEFAULT_BINDINGS_P1 = {
  moveLeft:     'ArrowLeft',
  moveRight:    'ArrowRight',
  softDrop:     'ArrowDown',
  hardDrop:     ' ',
  rotateCW:     'ArrowUp',
  rotateCCW:    'z',
  rotate180:    'a',
  hold:         'c',
  pause:        'Escape',
};

export const DEFAULT_BINDINGS_P2 = {
  moveLeft:     'a',
  moveRight:    'd',
  softDrop:     's',
  hardDrop:     'w',
  rotateCW:     'e',
  rotateCCW:    'q',
  rotate180:    'f',
  hold:         'r',
  pause:        null, // P2 cannot pause
};

// Keys that should have default browser behavior suppressed
const SUPPRESS_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp',
  ' ', 'z', 'Z', 'x', 'X', 'a', 'A', 'c', 'C', 'Shift', 'Escape',
  'w', 'W', 's', 'S', 'd', 'D', 'q', 'Q', 'e', 'E', 'r', 'R', 'f', 'F',
]);

// ─── InputHandler class ───────────────────────────────────────────────────────

export class InputHandler {
  constructor(bindings = DEFAULT_BINDINGS_P1) {
    this.bindings = this._normalizeBindings(bindings);
    this.held = {};       // key → boolean
    this.das = {};        // action → { held: ms }
    this.events = [];     // buffered one-shot events this frame
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.held = {};
    this.das = {};
    this.events = [];
  }

  // Load bindings from localStorage (falls back to defaults)
  static loadBindings(player = 'p1') {
    try {
      const raw = localStorage.getItem(`tetris_bindings_${player}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return player === 'p2' ? DEFAULT_BINDINGS_P2 : DEFAULT_BINDINGS_P1;
  }

  static saveBindings(player, bindings) {
    localStorage.setItem(`tetris_bindings_${player}`, JSON.stringify(bindings));
  }

  // ─── Called each frame by game loop ────────────────────────────────────────
  // Returns { actions } — set of actions that fired this frame

  update(dt) {
    const actions = new Set();

    // Flush one-shot events from this frame
    for (const action of this.events) actions.add(action);
    this.events = [];

    // DAS/ARR for move left/right
    for (const action of ['moveLeft', 'moveRight']) {
      const key = this.bindings[action];
      if (!key || !this.held[key]) {
        delete this.das[action];
        continue;
      }
      if (!this.das[action]) {
        // First press already fired as one-shot event; init DAS timer
        this.das[action] = { held: 0 };
      } else {
        this.das[action].held += dt;
        if (this.das[action].held >= DAS_MS) {
          const extra = this.das[action].held - DAS_MS;
          const reps = Math.floor(extra / ARR_MS);
          for (let i = 0; i < reps; i++) actions.add(action);
          this.das[action].held = DAS_MS + (extra % ARR_MS);
        }
      }
    }

    // Continuous soft drop
    if (this.held[this.bindings.softDrop]) {
      actions.add('softDrop');
    }

    return actions;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _normalizeBindings(b) {
    // Lowercase single-char keys for case-insensitive matching
    const result = {};
    for (const [action, key] of Object.entries(b)) {
      result[action] = key && key.length === 1 ? key.toLowerCase() : key;
    }
    return result;
  }

  _actionFor(key) {
    const k = key.length === 1 ? key.toLowerCase() : key;
    for (const [action, binding] of Object.entries(this.bindings)) {
      if (binding === k) return action;
    }
    return null;
  }

  _onKeyDown(e) {
    if (SUPPRESS_KEYS.has(e.key)) e.preventDefault();

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (this.held[key]) return; // already held, DAS handles repeats
    this.held[key] = true;

    const action = this._actionFor(e.key);
    if (!action) return;

    // One-shot actions (fired once on keydown)
    const oneShot = ['hardDrop', 'rotateCW', 'rotateCCW', 'rotate180', 'hold', 'pause'];
    if (oneShot.includes(action)) {
      this.events.push(action);
    }

    // Move actions: fire once on first press, DAS handles repeats
    if (action === 'moveLeft' || action === 'moveRight') {
      this.events.push(action);
    }
  }

  _onKeyUp(e) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.held[key] = false;
    const action = this._actionFor(e.key);
    if (action === 'moveLeft' || action === 'moveRight') {
      delete this.das[action];
    }
  }
}

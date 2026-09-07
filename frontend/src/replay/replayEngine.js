import { COLS, TOTAL_ROWS } from '../utils/constants.js';
import {
  applyMove, applyRotation, applySoftDrop,
  applyHardDrop, applyHold, applyGravityTick, applyLockTick,
} from '../game/engine/physics.js';

// Headless replay engine.
//
// Design: keyframes are recorded after every piece lock, so getStateAt(t)
// only ever needs to fast-forward inputs within a single piece lifetime.
// This avoids all non-determinism (dequeue refill, garbage hole column).
//
// Usage:
//   const engine = new ReplayEngine(playerBlock);
//   const state  = engine.getStateAt(12500);   // ms from match start
//   engine.getDuration();
//   engine.getKeyframes();

export class ReplayEngine {
  constructor(playerBlock) {
    this._block    = playerBlock;
    this._duration = _calcDuration(playerBlock);
  }

  getDuration() { return this._duration; }

  // Returns [{ t }] — useful for scrubbing UI markers.
  getKeyframes() {
    return this._block.keyframes.map(kf => ({ t: kf.t }));
  }

  // Returns a visual game state at time t.
  // Algorithm:
  //   1. Find the latest keyframe kf where kf.t <= t.
  //   2. Clone kf.state as the starting point.
  //   3. Replay inputs in (kf.t, t] — but STOP replaying at the first
  //      piece lock (hardDrop or lockTick firing). After a lock the board
  //      and queue change non-deterministically, so we use the NEXT keyframe
  //      instead.
  //   4. Return the resulting state.
  getStateAt(t) {
    const clamped = Math.max(0, Math.min(t, this._duration));
    const { keyframes, inputs } = this._block;

    // Step 1: find best keyframe
    let kfIdx = 0;
    for (let i = 0; i < keyframes.length; i++) {
      if (keyframes[i].t <= clamped) kfIdx = i;
      else break;
    }

    // Step 2: clone keyframe state
    let state = _deserializeState(keyframes[kfIdx].state);
    const kfT  = keyframes[kfIdx].t;

    // Step 3: replay inputs between kfT and clamped
    // We simulate time passing but skip the lock: as soon as the piece would
    // lock, we instead load the next available keyframe that is still <= t.
    const relevantInputs = inputs.filter(inp => inp.t > kfT && inp.t <= clamped);

    for (const inp of relevantInputs) {
      if (!state || state.status !== 'playing') break;
      const before = state.piece;
      state = _applyAction(state, inp.action);

      // If the piece changed (lock happened inside hardDrop), switch to
      // the next keyframe that covers this moment.
      if (state.piece !== before && inp.action === 'hardDrop') {
        const nextKf = _findKeyframeAfter(keyframes, inp.t, clamped);
        if (nextKf) {
          state = _deserializeState(nextKf.state);
          kfIdx = keyframes.indexOf(nextKf);
        }
        break;
      }
    }

    return state;
  }
}

// Find the earliest keyframe with kf.t > afterT and kf.t <= maxT
function _findKeyframeAfter(keyframes, afterT, maxT) {
  for (const kf of keyframes) {
    if (kf.t > afterT && kf.t <= maxT) return kf;
  }
  return null;
}

function _calcDuration(block) {
  let max = 0;
  if (block.inputs.length)    max = Math.max(max, block.inputs[block.inputs.length - 1].t);
  if (block.keyframes.length) max = Math.max(max, block.keyframes[block.keyframes.length - 1].t);
  return max;
}

function _deserializeState(s) {
  const flat  = s.board;
  const board = Array.from({ length: TOTAL_ROWS }, (_, r) =>
    new Int8Array(flat.slice(r * COLS, r * COLS + COLS))
  );
  return {
    board,
    piece:          s.piece ? { ...s.piece } : null,
    queue:          [...s.queue],
    holdType:       s.holdType,
    holdUsed:       s.holdUsed,
    combo:          s.combo,
    score:          s.score,
    lines:          s.lines,
    level:          s.level,
    pendingGarbage: s.pendingGarbage,
    status:         'playing',
    gravityTimer:   0,
    lockTimer:      0,
    lockMoves:      0,
    lastMoveWasRotation: false,
    onGround:       false,
    garbageQueue:   [],
  };
}

function _applyAction(state, action) {
  if (!state || state.status !== 'playing') return state;
  switch (action) {
    case 'moveLeft':  return applyMove(state, -1);
    case 'moveRight': return applyMove(state,  1);
    case 'softDrop':  return applySoftDrop(state);
    case 'hardDrop':  return applyHardDrop(state);
    case 'rotateCW':  return applyRotation(state,  1);
    case 'rotateCCW': return applyRotation(state, -1);
    case 'rotate180': return applyRotation(applyRotation(state, 1), 1);
    case 'hold':      return applyHold(state);
    default:          return state;
  }
}
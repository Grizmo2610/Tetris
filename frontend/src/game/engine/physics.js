import { GRAVITY_TABLE, LOCK_DELAY_MS, LOCK_MOVE_LIMIT, BUFFER, GARBAGE_DELAY_MS } from '../../utils/constants.js';
import { PIECES, isValidPosition, ghostRow, getKicks, spawnPiece, dequeue } from './piece.js';
import { lockPieceOnBoard, clearLines, isAllClear, isTopOut, applyGarbage } from './board.js';
import {
  detectTSpin, calcLineScore, calcGarbageSent,
  applyCounter, updateCombo, hardDropScore, softDropScore, calcLevel,
} from './scoring.js';

// ─── Gravity ─────────────────────────────────────────────────────────────────

export function getGravityMs(level) {
  const idx = Math.min(level - 1, GRAVITY_TABLE.length - 1);
  return (GRAVITY_TABLE[idx] / 60) * 1000;
}

// ─── Initial game state factory ───────────────────────────────────────────────

export function createGameState(queue) {
  // queue must have at least 2 pieces ready
  const { type, queue: remaining } = dequeue(queue);
  const piece = spawnPiece(type);
  return {
    board: null,          // caller sets board (emptyBoard())
    piece,
    queue: remaining,
    holdType: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    pendingGarbage: 0,
    // garbageQueue: array of { amount, readyAt } — garbage waiting to be sent
    // after the 5-second delay. Managed by the mode orchestrator.
    garbageQueue: [],
    gravityTimer: 0,
    lockTimer: 0,
    lockMoves: 0,
    lastMoveWasRotation: false,
    onGround: false,
    status: 'playing',   // 'playing' | 'paused' | 'gameover'
    lastTime: null,
  };
}

// ─── Pure state transitions ───────────────────────────────────────────────────
// All functions take a state snapshot + inputs, return a new state snapshot.
// Board is treated as immutable; new board created on each change.

// --- Horizontal move ---
export function applyMove(state, dc) {
  const { board, piece } = state;
  const { type, rot, row, col } = piece;
  const nc = col + dc;
  if (!isValidPosition(board, type, rot, row, nc)) return state;

  const og = !isValidPosition(board, type, rot, row + 1, nc);
  return {
    ...state,
    piece: { ...piece, col: nc },
    lastMoveWasRotation: false,
    onGround: og,
    lockMoves: og ? state.lockMoves + 1 : state.lockMoves,
    lockTimer: og ? 0 : state.lockTimer,
  };
}

// --- Rotation ---
export function applyRotation(state, dir) {
  const { board, piece } = state;
  const { type, rot, row, col } = piece;
  const newRot = (rot + dir + 4) % 4;
  const kicks = getKicks(type, rot, newRot);

  for (const [dr, dc] of kicks) {
    const nr = row + dr;
    const nc = col + dc;
    if (isValidPosition(board, type, newRot, nr, nc)) {
      const og = !isValidPosition(board, type, newRot, nr + 1, nc);
      return {
        ...state,
        piece: { type, rot: newRot, row: nr, col: nc },
        lastMoveWasRotation: true,
        onGround: og,
        lockMoves: og ? state.lockMoves + 1 : state.lockMoves,
        lockTimer: og ? 0 : state.lockTimer,
      };
    }
  }
  return state; // rotation failed, all kicks exhausted
}

// --- Soft drop (one cell) ---
export function applySoftDrop(state) {
  const { board, piece } = state;
  const { type, rot, row, col } = piece;
  if (!isValidPosition(board, type, rot, row + 1, col)) return state;
  return {
    ...state,
    piece: { ...piece, row: row + 1 },
    score: state.score + softDropScore(1),
    gravityTimer: 0,
    lastMoveWasRotation: false,
  };
}

// --- Hard drop + immediate lock ---
export function applyHardDrop(state) {
  const { board, piece } = state;
  const { type, rot, row, col } = piece;
  const targetRow = ghostRow(board, type, rot, row, col);
  const dropped = targetRow - row;
  const withScore = { ...state, score: state.score + hardDropScore(dropped) };
  // Move piece to ghost position then lock
  const movedState = { ...withScore, piece: { ...piece, row: targetRow } };
  return applyLock(movedState);
}

// --- Hold ---
export function applyHold(state) {
  if (state.holdUsed) return state;
  const { piece, holdType, queue } = state;
  let newType, newQueue;

  if (holdType === null) {
    const res = dequeue(queue);
    newType = res.type;
    newQueue = res.queue;
  } else {
    newType = holdType;
    newQueue = queue;
  }

  return {
    ...state,
    piece: spawnPiece(newType),
    holdType: piece.type,
    holdUsed: true,
    queue: newQueue,
    gravityTimer: 0,
    lockTimer: 0,
    lockMoves: 0,
    lastMoveWasRotation: false,
    onGround: false,
  };
}

// --- Lock piece (the big one) ---
// Handles: lock, line clear, T-Spin, scoring, garbage, counter, spawn next, top-out
export function applyLock(state) {
  const { board, piece, queue, pendingGarbage, combo, level } = state;
  const { type, rot, row, col } = piece;

  // 1. Detect T-Spin BEFORE clearing lines
  const tspinType = detectTSpin(board, type, rot, row, col, state.lastMoveWasRotation);

  // 2. Lock piece onto board
  const lockedBoard = lockPieceOnBoard(board, type, rot, row, col);

  // 3. Clear lines
  const { board: clearedBoard, linesCleared } = clearLines(lockedBoard);

  // 4. Update combo
  const newCombo = updateCombo(combo, linesCleared);

  // 5. All Clear check
  const allClear = linesCleared > 0 && isAllClear(clearedBoard);

  // 6. Score
  const newLevel = calcLevel(state.lines + linesCleared);
  const pts = calcLineScore(linesCleared, level, tspinType, newCombo, allClear);

  // 7. Garbage generation
  const rawGarbage = calcGarbageSent(linesCleared, tspinType, newCombo, allClear);

  // 8. Counter mechanic
  let boardAfterGarbage = clearedBoard;
  let newPending = pendingGarbage;

  if (rawGarbage > 0 || pendingGarbage > 0) {
    const { netSent, remainingPending } = applyCounter(rawGarbage, pendingGarbage);
    newPending = remainingPending;
    // Apply remaining incoming garbage BEFORE spawning next piece
    if (remainingPending > 0) {
      boardAfterGarbage = applyGarbage(clearedBoard, remainingPending);
      newPending = 0;
    }
    // netSent is returned as metadata for caller to relay to opponent
    state = { ...state, _garbageSent: netSent, _linesCleared: linesCleared, _tspinType: tspinType };
  } else {
    state = { ...state, _garbageSent: 0, _linesCleared: linesCleared, _tspinType: tspinType };
  }

  // 9. Top-out check (piece was locked above visible board)
  if (isTopOut(type, rot, row)) {
    return { ...state, board: boardAfterGarbage, status: 'gameover' };
  }

  // 10. Spawn next piece
  const { type: nextType, queue: newQueue } = dequeue(queue);
  const nextPiece = spawnPiece(nextType);

  // 11. Spawn collision → top-out
  if (!isValidPosition(boardAfterGarbage, nextPiece.type, nextPiece.rot, nextPiece.row, nextPiece.col)) {
    return {
      ...state,
      board: boardAfterGarbage,
      piece: nextPiece,
      queue: newQueue,
      status: 'gameover',
    };
  }

  return {
    ...state,
    board: boardAfterGarbage,
    piece: nextPiece,
    queue: newQueue,
    holdUsed: false,
    score: state.score + pts,
    lines: state.lines + linesCleared,
    level: newLevel,
    combo: newCombo,
    pendingGarbage: newPending,
    gravityTimer: 0,
    lockTimer: 0,
    lockMoves: 0,
    lastMoveWasRotation: false,
    onGround: false,
  };
}

// --- Gravity tick (called each frame with delta time in ms) ---
export function applyGravityTick(state, dt) {
  if (state.status !== 'playing') return state;
  let s = { ...state, gravityTimer: state.gravityTimer + dt };
  const ms = getGravityMs(s.level);

  if (s.gravityTimer >= ms) {
    s = { ...s, gravityTimer: 0 };
    const { type, rot, row, col } = s.piece;
    if (isValidPosition(s.board, type, rot, row + 1, col)) {
      s = { ...s, piece: { ...s.piece, row: row + 1 }, onGround: false };
    } else {
      s = { ...s, onGround: true };
    }
  }
  return s;
}

// --- Lock-down tick (called each frame when piece is on ground) ---
// Returns state with possible lock applied
export function applyLockTick(state, dt) {
  if (!state.onGround) return { ...state, lockTimer: 0 };
  const s = { ...state, lockTimer: state.lockTimer + dt };
  if (s.lockTimer >= LOCK_DELAY_MS || s.lockMoves >= LOCK_MOVE_LIMIT) {
    return applyLock(s);
  }
  return s;
}

// --- Receive garbage from opponent ---
// Immediately reduces the sender's outgoing garbage queue (counter mechanic).
// Whatever cannot be countered is added to pendingGarbage (applied on next spawn).
// linesToCounter: how many lines THIS player just cleared (for counter mechanic).
export function receiveGarbage(state, lines) {
  return { ...state, pendingGarbage: state.pendingGarbage + lines };
}

// ─── Garbage queue helpers (used by mode orchestrators) ──────────────────────

// Enqueue outgoing garbage with a delay timestamp.
// Called right after applyLock returns _garbageSent > 0.
export function enqueueGarbage(garbageQueue, amount, nowMs) {
  if (amount <= 0) return garbageQueue;
  return [...garbageQueue, { amount, readyAt: nowMs + GARBAGE_DELAY_MS }];
}

// Counter: when a player clears lines, cancel up to `linesCleared` garbage
// from the OLDEST entries in their outgoing queue.
// Returns the new queue after cancellation.
export function counterGarbageQueue(garbageQueue, linesCleared) {
  if (linesCleared <= 0 || !garbageQueue.length) return garbageQueue;
  let toCancel = linesCleared;
  const newQueue = [];
  for (const entry of garbageQueue) {
    if (toCancel <= 0) {
      newQueue.push(entry);
    } else if (entry.amount <= toCancel) {
      toCancel -= entry.amount;
      // entry fully cancelled, drop it
    } else {
      newQueue.push({ ...entry, amount: entry.amount - toCancel });
      toCancel = 0;
    }
  }
  return newQueue;
}

// Flush all entries whose readyAt <= nowMs.
// Returns { flushed: number, queue: remaining }.
export function flushGarbageQueue(garbageQueue, nowMs) {
  let flushed = 0;
  const remaining = [];
  for (const entry of garbageQueue) {
    if (entry.readyAt <= nowMs) {
      flushed += entry.amount;
    } else {
      remaining.push(entry);
    }
  }
  return { flushed, queue: remaining };
}

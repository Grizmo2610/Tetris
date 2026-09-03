'use strict';
const logger = require('./logger');

// ─── Room state machine ────────────────────────────────────────────────────────
// waiting → in-game → finished → (rematch → in-game) | deleted

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const ROOM_CODE_LEN   = 4;
const TTL_WAITING_MS  = 10 * 60 * 1000;  // 10 min
const TTL_FINISHED_MS =  5 * 60 * 1000;  //  5 min
const DISCONNECT_TIMER_MS = 30_000;

// rooms: Map<code, Room>
const rooms = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not generate unique room code after 10 attempts');
}

function makePlayer(socketId, nickname) {
  return {
    socketId,
    previousSocketId: null,
    nickname,
    connected: true,
    disconnectTimer: null,
    rematchReady: false,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

function createRoom(nickname, socketId) {
  const code = generateCode();
  const room = {
    code,
    status: 'waiting',
    players: [makePlayer(socketId, nickname), null],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  rooms.set(code, room);
  logger.info('room.created', { code, host: nickname });
  return room;
}

function joinRoom(code, nickname, socketId) {
  const room = rooms.get(code);
  if (!room)                    throw Object.assign(new Error('Room not found'),    { code: 'ROOM_NOT_FOUND' });
  if (room.status !== 'waiting') throw Object.assign(new Error('Game in progress'), { code: 'ROOM_IN_GAME' });
  if (room.players[1] !== null)  throw Object.assign(new Error('Room is full'),     { code: 'ROOM_FULL' });
  if (room.players[0].nickname === nickname) {
    throw Object.assign(new Error('Nickname already taken in this room'), { code: 'INVALID_NICKNAME' });
  }

  room.players[1] = makePlayer(socketId, nickname);
  room.status = 'in-game';
  room.lastActivityAt = Date.now();
  logger.info('room.joined', { code, joiner: nickname });
  return room;
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  // Clear any disconnect timers
  for (const p of room.players) {
    if (p?.disconnectTimer) clearTimeout(p.disconnectTimer);
  }
  rooms.delete(code);
  logger.info('room.deleted', { code, reason: 'explicit' });
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

function findRoomByCode(code) {
  return rooms.get(code) ?? null;
}

function findRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    for (const p of room.players) {
      if (p && p.socketId === socketId) return room;
    }
  }
  return null;
}

function getOpponent(room, socketId) {
  const [p0, p1] = room.players;
  if (p0?.socketId === socketId) return p1;
  if (p1?.socketId === socketId) return p0;
  return null;
}

function getPlayerBySocketId(room, socketId) {
  return room.players.find(p => p?.socketId === socketId) ?? null;
}

// ─── Disconnect / Reconnect ───────────────────────────────────────────────────

function setPlayerDisconnected(room, socketId) {
  const player = getPlayerBySocketId(room, socketId);
  if (!player) return;
  player.connected = false;
  player.previousSocketId = socketId;
}

// Returns true if reconnect succeeded
function reconnectPlayer(room, previousSocketId, newSocketId) {
  const player = room.players.find(p => p && p.previousSocketId === previousSocketId);
  if (!player) return false;

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }

  player.socketId = newSocketId;
  player.connected = true;
  return true;
}

function setDisconnectTimer(room, socketId, callback) {
  const player = getPlayerBySocketId(room, socketId);
  if (!player) return;
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  player.disconnectTimer = setTimeout(callback, DISCONNECT_TIMER_MS);
}

function clearDisconnectTimer(room, socketId) {
  const player = getPlayerBySocketId(room, socketId);
  if (!player) return;
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
}

// ─── Rematch ──────────────────────────────────────────────────────────────────

function setRematchReady(room, socketId) {
  const player = getPlayerBySocketId(room, socketId);
  if (player) player.rematchReady = true;
}

function bothRematchReady(room) {
  return room.players.every(p => p && p.rematchReady);
}

function resetForRematch(room) {
  room.status = 'in-game';
  room.lastActivityAt = Date.now();
  for (const p of room.players) {
    if (p) p.rematchReady = false;
  }
}

// ─── Stats (for /health) ──────────────────────────────────────────────────────

function getRoomStats() {
  let waiting = 0, inGame = 0, finished = 0;
  for (const r of rooms.values()) {
    if (r.status === 'waiting')  waiting++;
    if (r.status === 'in-game')  inGame++;
    if (r.status === 'finished') finished++;
  }
  return { total: rooms.size, waiting, inGame, finished };
}

// ─── TTL cleanup (global interval sweep) ─────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.status === 'waiting'  && now - room.createdAt       > TTL_WAITING_MS)  {
      deleteRoom(code);
      logger.info('room.deleted', { code, reason: 'ttl_waiting' });
    }
    if (room.status === 'finished' && now - room.lastActivityAt  > TTL_FINISHED_MS) {
      deleteRoom(code);
      logger.info('room.deleted', { code, reason: 'ttl_finished' });
    }
  }
}, 60_000);

module.exports = {
  createRoom,
  joinRoom,
  deleteRoom,
  findRoomByCode,
  findRoomBySocketId,
  getOpponent,
  getPlayerBySocketId,
  setPlayerDisconnected,
  reconnectPlayer,
  setDisconnectTimer,
  clearDisconnectTimer,
  setRematchReady,
  bothRematchReady,
  resetForRematch,
  getRoomStats,
};

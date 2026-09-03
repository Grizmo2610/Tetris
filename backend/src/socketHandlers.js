'use strict';
const logger = require('./logger');
const rm = require('./roomManager');

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateNickname(n) {
  return typeof n === 'string' && n.trim().length > 0 && n.trim().length <= 32;
}

function validateGameUpdate(data) {
  return (
    data &&
    Array.isArray(data.board) &&
    data.board.length === 200 &&
    data.board.every(v => Number.isInteger(v) && v >= 0 && v <= 8) &&
    Number.isInteger(data.garbageSent)  && data.garbageSent  >= 0 &&
    Number.isInteger(data.linesCleared) && data.linesCleared >= 0 && data.linesCleared <= 4
  );
}

// ─── Register handlers for one socket ────────────────────────────────────────

function registerHandlers(io, socket) {

  // ── create-room ────────────────────────────────────────────────────────────

  socket.on('create-room', ({ nickname } = {}) => {
    if (!validateNickname(nickname)) {
      socket.emit('room-error', { code: 'INVALID_NICKNAME', message: 'Invalid nickname' });
      return;
    }

    // Remove from any existing room first
    const existing = rm.findRoomBySocketId(socket.id);
    if (existing) rm.deleteRoom(existing.code);

    try {
      const room = rm.createRoom(nickname.trim(), socket.id);
      socket.join(room.code);
      socket.emit('room-created', { code: room.code });
    } catch (err) {
      logger.error('room.create_failed', { error: err.message });
      socket.emit('room-error', { code: 'SERVER_ERROR', message: 'Could not create room' });
    }
  });

  // ── join-room ──────────────────────────────────────────────────────────────

  socket.on('join-room', ({ code, nickname } = {}) => {
    if (!code || typeof code !== 'string') {
      socket.emit('room-error', { code: 'INVALID_CODE', message: 'Invalid room code' });
      return;
    }
    if (!validateNickname(nickname)) {
      socket.emit('room-error', { code: 'INVALID_NICKNAME', message: 'Invalid nickname' });
      return;
    }

    try {
      const room = rm.joinRoom(code.toUpperCase(), nickname.trim(), socket.id);
      socket.join(room.code);

      const host = room.players[0];
      const joiner = room.players[1];

      // Notify host
      io.to(host.socketId).emit('room-joined', {
        opponentNickname: joiner.nickname,
        roomCode: room.code,
      });
      // Notify joiner
      socket.emit('room-joined', {
        opponentNickname: host.nickname,
        roomCode: room.code,
      });

      logger.info('room.game_starting', { code: room.code });
    } catch (err) {
      socket.emit('room-error', { code: err.code ?? 'SERVER_ERROR', message: err.message });
    }
  });

  // ── reconnect-room ─────────────────────────────────────────────────────────

  socket.on('reconnect-room', ({ roomCode, nickname, previousSocketId } = {}) => {
    const room = rm.findRoomByCode(roomCode);
    if (!room) {
      socket.emit('room-error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }

    const ok = rm.reconnectPlayer(room, previousSocketId, socket.id);
    if (!ok) {
      socket.emit('room-error', { code: 'RECONNECT_FAILED', message: 'Cannot reconnect' });
      return;
    }

    socket.join(roomCode);
    logger.info('player.reconnected', { socketId: socket.id, roomCode });

    // Notify opponent
    const opponent = rm.getOpponent(room, socket.id);
    if (opponent?.connected) {
      io.to(opponent.socketId).emit('opponent-reconnected');
    }
  });

  // ── game-update ────────────────────────────────────────────────────────────

  socket.on('game-update', (data) => {
    if (!validateGameUpdate(data)) {
      logger.warn('validation.failed', { socketEvent: 'game-update', socketId: socket.id });
      socket.emit('error', { message: 'Invalid game-update payload' });
      return;
    }

    const room = rm.findRoomBySocketId(socket.id);
    if (!room || room.status !== 'in-game') return;

    room.lastActivityAt = Date.now();

    const opponent = rm.getOpponent(room, socket.id);
    if (opponent?.connected) {
      io.to(opponent.socketId).emit('opponent-update', {
        board:        data.board,
        garbageSent:  data.garbageSent,
        linesCleared: data.linesCleared,
        combo:        data.combo ?? -1,
      });
    }
  });

  // ── game-over (client topped out) ─────────────────────────────────────────

  socket.on('game-over', ({ score, lines, level } = {}) => {
    const room = rm.findRoomBySocketId(socket.id);
    if (!room || room.status !== 'in-game') return;

    const loser    = rm.getPlayerBySocketId(room, socket.id);
    const opponent = rm.getOpponent(room, socket.id);

    room.status = 'finished';
    room.lastActivityAt = Date.now();

    const payload = {
      winner: opponent?.nickname ?? null,
      loser:  loser?.nickname   ?? null,
      reason: 'topout',
    };

    io.to(room.code).emit('game-over', payload);
    logger.info('room.game_over', { code: room.code, ...payload });
  });

  // ── rematch-ready ──────────────────────────────────────────────────────────

  socket.on('rematch-ready', () => {
    const room = rm.findRoomBySocketId(socket.id);
    if (!room || room.status !== 'finished') return;

    rm.setRematchReady(room, socket.id);

    if (rm.bothRematchReady(room)) {
      rm.resetForRematch(room);
      io.to(room.code).emit('rematch-start');
      logger.info('room.rematch', { code: room.code });
    }
  });

  // ── leave-room ─────────────────────────────────────────────────────────────

  socket.on('leave-room', () => {
    const room = rm.findRoomBySocketId(socket.id);
    if (!room) return;

    const opponent = rm.getOpponent(room, socket.id);
    if (opponent?.connected) {
      io.to(opponent.socketId).emit('opponent-left');
    }

    rm.deleteRoom(room.code);
    socket.leave(room.code);
    logger.info('player.left', { socketId: socket.id, code: room.code });
  });

  // ── disconnect ─────────────────────────────────────────────────────────────

  socket.on('disconnect', (reason) => {
    logger.info('player.disconnected', { socketId: socket.id, reason });

    const room = rm.findRoomBySocketId(socket.id);
    if (!room) return;

    rm.setPlayerDisconnected(room, socket.id);

    const opponent = rm.getOpponent(room, socket.id);

    // Both disconnected → delete room immediately
    if (!opponent || !opponent.connected) {
      rm.deleteRoom(room.code);
      return;
    }

    // Notify opponent and start 30s timer
    io.to(opponent.socketId).emit('opponent-disconnected', { timeoutSeconds: 30 });

    rm.setDisconnectTimer(room, socket.id, () => {
      // Timer expired — opponent wins
      io.to(opponent.socketId).emit('game-over', {
        winner: opponent.nickname,
        loser:  null,
        reason: 'disconnect',
      });
      rm.deleteRoom(room.code);
      logger.info('room.game_over', { code: room.code, reason: 'disconnect_timeout' });
    });
  });
}

module.exports = { registerHandlers };

import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';
const RECONNECT_ATTEMPTS = 10;
const STORAGE_KEY_SOCKET_ID = 'tetris_prev_socket_id';
const STORAGE_KEY_ROOM_CODE  = 'tetris_room_code';
const STORAGE_KEY_NICKNAME   = 'tetris_nickname';

// ─── SocketClient ─────────────────────────────────────────────────────────────
// Thin wrapper around Socket.io client.
// Provides:
//   - connect / disconnect lifecycle
//   - Room operations: createRoom, joinRoom, reconnectRoom, leaveRoom
//   - Game events: sendGameUpdate, sendGameOver, sendRematchReady
//   - on / off for server→client events
//   - Auto-reconnect with previousSocketId stored in localStorage

class SocketClient {
  constructor() {
    this._socket = null;
    this._connected = false;
    this._nickname = null;
    this._roomCode = null;
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  connect() {
    if (this._socket?.connected) return;

    this._socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: RECONNECT_ATTEMPTS,
      autoConnect: true,
    });

    this._socket.on('connect', () => {
      this._connected = true;

      // Read previous socket ID BEFORE overwriting with new one
      const prevSocketId = localStorage.getItem(STORAGE_KEY_SOCKET_ID);
      const roomCode     = localStorage.getItem(STORAGE_KEY_ROOM_CODE);
      const nickname     = localStorage.getItem(STORAGE_KEY_NICKNAME);

      // Always update stored socket ID to current
      localStorage.setItem(STORAGE_KEY_SOCKET_ID, this._socket.id);

      // Attempt reconnect only if we have a different previous socket ID
      if (roomCode && nickname && prevSocketId && prevSocketId !== this._socket.id) {
        this._socket.emit('reconnect-room', { roomCode, nickname, previousSocketId: prevSocketId });
      }
    });

    this._socket.on('disconnect', () => {
      this._connected = false;
    });
  }

  disconnect() {
    this._socket?.disconnect();
    this._socket = null;
    this._connected = false;
  }

  get connected() { return this._connected; }
  get socketId()  { return this._socket?.id ?? null; }

  // ─── Room operations ───────────────────────────────────────────────────────

  createRoom(nickname) {
    this._nickname = nickname;
    localStorage.setItem(STORAGE_KEY_NICKNAME, nickname);
    this._socket.emit('create-room', { nickname });
  }

  joinRoom(code, nickname) {
    this._nickname = nickname;
    this._roomCode = code.toUpperCase();
    localStorage.setItem(STORAGE_KEY_NICKNAME, nickname);
    localStorage.setItem(STORAGE_KEY_ROOM_CODE, this._roomCode);
    this._socket.emit('join-room', { code: this._roomCode, nickname });
  }

  reconnectRoom(roomCode, nickname, previousSocketId) {
    this._socket.emit('reconnect-room', { roomCode, nickname, previousSocketId });
  }

  leaveRoom() {
    this._socket.emit('leave-room');
    this._clearRoomStorage();
  }

  sendRematchReady() {
    this._socket.emit('rematch-ready');
  }

  // Called after room-created or room-joined to store code
  setRoomCode(code) {
    this._roomCode = code;
    localStorage.setItem(STORAGE_KEY_ROOM_CODE, code);
  }

  // ─── Game events ───────────────────────────────────────────────────────────

  // Call after each piece lock
  sendGameUpdate({ board, garbageSent, linesCleared, combo }) {
    this._socket.emit('game-update', { board, garbageSent, linesCleared, combo });
  }

  // Call when local player tops out
  sendGameOver({ score, lines, level }) {
    this._socket.emit('game-over', { score, lines, level });
  }

  // ─── Event pub/sub ────────────────────────────────────────────────────────

  on(event, handler) {
    this._socket?.on(event, handler);
  }

  off(event, handler) {
    this._socket?.off(event, handler);
  }

  once(event, handler) {
    this._socket?.once(event, handler);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _clearRoomStorage() {
    localStorage.removeItem(STORAGE_KEY_ROOM_CODE);
    localStorage.removeItem(STORAGE_KEY_SOCKET_ID);
  }
}

// Singleton
export const socketClient = new SocketClient();
// RoomScreens.jsx — lobby screens for Online PvP

import { useEffect, useRef, useState } from 'react';
import { socketClient } from '../../network/socketClient.js';

// ─── CreateRoom ───────────────────────────────────────────────────────────────

export function CreateRoom({ nickname, onRoomReady, onCancel }) {
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  // Use a ref to guard against calling onRoomReady after unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    socketClient.connect();

    const onRoomCreated = ({ code }) => {
      if (!mountedRef.current) return;
      setCode(code);
      socketClient.setRoomCode(code);
    };

    const onRoomJoined = ({ opponentNickname, roomCode }) => {
      if (!mountedRef.current) return;
      onRoomReady({ roomCode, opponentNickname });
    };

    const onRoomError = ({ message }) => {
      if (!mountedRef.current) return;
      setError(message);
    };

    socketClient.on('room-created', onRoomCreated);
    socketClient.on('room-joined',  onRoomJoined);
    socketClient.on('room-error',   onRoomError);

    socketClient.createRoom(nickname);

    return () => {
      mountedRef.current = false;
      socketClient.off('room-created', onRoomCreated);
      socketClient.off('room-joined',  onRoomJoined);
      socketClient.off('room-error',   onRoomError);
    };
  }, [nickname, onRoomReady]);

  return (
    <div style={styles.root}>
      <div style={styles.title}>Đang chờ đối thủ…</div>

      {code && (
        <>
          <div style={styles.label}>Chia sẻ mã phòng cho bạn:</div>
          <div style={styles.code}>{code}</div>
          <div style={styles.hint}>Bạn nhập mã này để tham gia</div>
        </>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <button style={styles.cancelBtn} onClick={() => { socketClient.leaveRoom(); onCancel(); }}>
        Huỷ
      </button>
    </div>
  );
}

// ─── JoinRoom ─────────────────────────────────────────────────────────────────

export function JoinRoom({ nickname, roomCode, onRoomReady, onCancel }) {
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    socketClient.connect();

    const onRoomJoined = ({ opponentNickname, roomCode: rc }) => {
      if (!mountedRef.current) return;
      setJoining(false);
      socketClient.setRoomCode(rc);
      onRoomReady({ roomCode: rc, opponentNickname });
    };

    const onRoomError = ({ message }) => {
      if (!mountedRef.current) return;
      setError(message);
      setJoining(false);
    };

    socketClient.on('room-joined', onRoomJoined);
    socketClient.on('room-error',  onRoomError);

    socketClient.joinRoom(roomCode, nickname);

    return () => {
      mountedRef.current = false;
      socketClient.off('room-joined', onRoomJoined);
      socketClient.off('room-error',  onRoomError);
    };
  }, [nickname, roomCode, onRoomReady]);

  return (
    <div style={styles.root}>
      <div style={styles.title}>
        {joining ? `Đang vào phòng ${roomCode}…` : 'Đã kết nối!'}
      </div>
      {error && <div style={styles.error}>{error}</div>}
      {error && (
        <button style={styles.cancelBtn} onClick={onCancel}>Quay lại</button>
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    padding: '2rem',
    fontFamily: 'var(--font-sans)',
  },
  title: {
    fontSize: 18, fontWeight: 500,
    color: 'var(--text-primary)',
  },
  label: {
    fontSize: 13, color: 'var(--text-muted)',
  },
  code: {
    fontSize: 48, fontWeight: 700, letterSpacing: 8,
    color: '#a0a0ff',
    fontFamily: 'var(--font-mono, monospace)',
    background: 'var(--surface-1)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '16px 32px',
  },
  hint: {
    fontSize: 12, color: 'var(--text-muted)',
  },
  error: {
    color: '#ff6b6b', fontSize: 14,
  },
  cancelBtn: {
    marginTop: 8,
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 28px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
  },
};
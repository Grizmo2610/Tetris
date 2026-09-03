// CreateRoom.jsx — shown after "Create Room" while waiting for opponent

import { useEffect, useState } from 'react';
import { socketClient } from '../../network/socketClient.js';

export function CreateRoom({ nickname, onRoomReady, onCancel }) {
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    socketClient.connect();

    socketClient.once('room-created', ({ code }) => {
      setCode(code);
      socketClient.setRoomCode(code);
    });

    socketClient.once('room-joined', ({ opponentNickname, roomCode }) => {
      setWaiting(false);
      onRoomReady({ roomCode, opponentNickname });
    });

    socketClient.once('room-error', ({ message }) => {
      setError(message);
    });

    socketClient.createRoom(nickname);

    return () => {
      socketClient.off('room-created');
      socketClient.off('room-joined');
      socketClient.off('room-error');
    };
  }, [nickname, onRoomReady]);

  return (
    <div style={styles.root}>
      <div style={styles.title}>Waiting for opponent…</div>

      {code && (
        <>
          <div style={styles.label}>Share this room code:</div>
          <div style={styles.code}>{code}</div>
          <div style={styles.hint}>Your friend enters this code to join</div>
        </>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <button style={styles.cancelBtn} onClick={() => { socketClient.leaveRoom(); onCancel(); }}>
        Cancel
      </button>
    </div>
  );
}

// ─── JoinRoom ─────────────────────────────────────────────────────────────────

export function JoinRoom({ nickname, roomCode, onRoomReady, onCancel }) {
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(true);

  useEffect(() => {
    socketClient.connect();

    socketClient.once('room-joined', ({ opponentNickname, roomCode: rc }) => {
      setJoining(false);
      socketClient.setRoomCode(rc);
      onRoomReady({ roomCode: rc, opponentNickname });
    });

    socketClient.once('room-error', ({ message, code }) => {
      setError(message);
      setJoining(false);
    });

    socketClient.joinRoom(roomCode, nickname);

    return () => {
      socketClient.off('room-joined');
      socketClient.off('room-error');
    };
  }, [nickname, roomCode, onRoomReady]);

  return (
    <div style={styles.root}>
      <div style={styles.title}>
        {joining ? `Joining room ${roomCode}…` : 'Connected!'}
      </div>
      {error && <div style={styles.error}>{error}</div>}
      {error && (
        <button style={styles.cancelBtn} onClick={onCancel}>Back</button>
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

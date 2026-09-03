import { useState } from 'react';

export default function NicknameInput({ mode, onSubmit, onBack }) {
  const [nickname, setNickname] = useState(
    () => localStorage.getItem('tetris_nickname') ?? ''
  );
  const [nickname2, setNickname2] = useState('');
  const [roomAction, setRoomAction] = useState('create');  // 'create' | 'join'
  const [roomCode, setRoomCode]     = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [error, setError]           = useState('');

  function validate() {
    if (!nickname.trim()) { setError('Enter a nickname'); return false; }
    if (nickname.trim().length > 32) { setError('Nickname too long (max 32)'); return false; }
    if (mode === 'localPvp' && !nickname2.trim()) { setError('Enter Player 2 nickname'); return false; }
    if (mode === 'onlinePvp' && roomAction === 'join' && roomCode.trim().length !== 4) {
      setError('Room code must be 4 characters'); return false;
    }
    setError('');
    return true;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    localStorage.setItem('tetris_nickname', nickname.trim());

    const base = { nickname: nickname.trim() };

    if (mode === 'solo') return onSubmit(base);
    if (mode === 'localPvp') return onSubmit({ ...base, nickname2: nickname2.trim() });
    if (mode === 'pvai') return onSubmit({ ...base, difficulty });
    if (mode === 'onlinePvp') {
      return onSubmit({ ...base, roomAction, roomCode: roomCode.toUpperCase().trim() });
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.root}>
      <Field label="Your Nickname">
        <Input
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder="Enter nickname"
          maxLength={32}
          autoFocus
        />
      </Field>

      {mode === 'localPvp' && (
        <Field label="Player 2 Nickname">
          <Input
            value={nickname2}
            onChange={e => setNickname2(e.target.value)}
            placeholder="Enter nickname"
            maxLength={32}
          />
        </Field>
      )}

      {mode === 'pvai' && (
        <Field label="Difficulty">
          <div style={styles.diffRow}>
            {['easy','medium','hard','expert'].map(d => (
              <DiffBtn key={d} selected={difficulty === d} onClick={() => setDifficulty(d)}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </DiffBtn>
            ))}
          </div>
        </Field>
      )}

      {mode === 'onlinePvp' && (
        <>
          <Field label="Room">
            <div style={styles.diffRow}>
              <DiffBtn selected={roomAction === 'create'} onClick={() => setRoomAction('create')}>Create</DiffBtn>
              <DiffBtn selected={roomAction === 'join'}   onClick={() => setRoomAction('join')}>Join</DiffBtn>
            </div>
          </Field>
          {roomAction === 'join' && (
            <Field label="Room Code">
              <Input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                maxLength={4}
                style={{ letterSpacing: 4, textTransform: 'uppercase', textAlign: 'center' }}
              />
            </Field>
          )}
        </>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.btnRow}>
        <Btn type="button" secondary onClick={onBack}>Back</Btn>
        <Btn type="submit">
          {mode === 'onlinePvp' && roomAction === 'create' ? 'Create Room' :
           mode === 'onlinePvp' && roomAction === 'join'   ? 'Join Room' :
           'Start Game'}
        </Btn>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'var(--font-sans)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({ style, ...props }) {
  return (
    <input
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        color: 'var(--text-primary)',
        fontSize: 15,
        outline: 'none',
        width: '100%',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
      {...props}
    />
  );
}

function DiffBtn({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        background: selected ? '#3a3acc' : 'var(--surface-1)',
        border: `1px solid ${selected ? '#3a3acc' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '8px 0',
        color: selected ? '#fff' : 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 13,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </button>
  );
}

function Btn({ children, secondary, ...props }) {
  return (
    <button
      style={{
        flex: 1,
        background: secondary ? 'transparent' : '#3a3acc',
        border: secondary ? '1px solid var(--border)' : 'none',
        borderRadius: 8,
        padding: '12px 0',
        color: '#fff',
        fontSize: 14,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
      {...props}
    >
      {children}
    </button>
  );
}

const styles = {
  root: {
    display: 'flex', flexDirection: 'column', gap: 18,
    width: 320,
    fontFamily: 'var(--font-sans)',
  },
  diffRow: {
    display: 'flex', gap: 8,
  },
  btnRow: {
    display: 'flex', gap: 10, marginTop: 8,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
  },
};

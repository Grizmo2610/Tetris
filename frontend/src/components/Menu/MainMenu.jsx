import { useState, useRef } from 'react';
import ModeSelect from './ModeSelect.jsx';
import NicknameInput from './NicknameInput.jsx';

// # MainMenu
// Props:
//   onStartGame(mode, params)
//   onImportReplay(file)

export default function MainMenu({ onStartGame, onLeaderboard, onImportReplay }) {
  const [step, setStep] = useState('mode');
  const [selectedMode, setSelectedMode] = useState(null);
  const fileInputRef = useRef(null);

  function handleModeSelect(mode) {
    setSelectedMode(mode);
    setStep('nickname');
  }

  function handleNicknameSubmit(params) {
    onStartGame(selectedMode, params);
  }

  function handleReplayPick(e) {
    const file = e.target.files?.[0];
    if (file) onImportReplay?.(file);
    e.target.value = '';
  }

  return (
    <div style={styles.root}>
      <h1 style={styles.logo}>TETRIS</h1>

      {step === 'mode' && (
        <>
          <ModeSelect onSelect={handleModeSelect} onLeaderboard={onLeaderboard} />
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleReplayPick}
          />
          <button
            style={styles.replayBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            📽 Xem Replay
          </button>
        </>
      )}

      {step === 'nickname' && (
        <NicknameInput
          mode={selectedMode}
          onSubmit={handleNicknameSubmit}
          onBack={() => setStep('mode')}
        />
      )}
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 32,
    padding: '3rem 1rem',
    fontFamily: 'var(--font-sans)',
    minHeight: '100vh',
  },
  logo: {
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: 6,
    color: 'var(--text-primary)',
    margin: 0,
  },
  replayBtn: {
    background: 'transparent',
    color: '#888',
    border: '1px solid #2a2a5a',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
};
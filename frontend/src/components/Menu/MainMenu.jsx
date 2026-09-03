import { useState } from 'react';
import ModeSelect from './ModeSelect.jsx';
import NicknameInput from './NicknameInput.jsx';

// ─── MainMenu ─────────────────────────────────────────────────────────────────
// Props:
//   onStartGame(mode, params) – called when game should begin

export default function MainMenu({ onStartGame, onLeaderboard }) {
  const [step, setStep] = useState('mode');    // 'mode' | 'nickname'
  const [selectedMode, setSelectedMode] = useState(null);

  function handleModeSelect(mode) {
    setSelectedMode(mode);
    setStep('nickname');
  }

  function handleNicknameSubmit(params) {
    onStartGame(selectedMode, params);
  }

  return (
    <div style={styles.root}>
      <h1 style={styles.logo}>TETRIS</h1>

      {step === 'mode' && (
        <ModeSelect onSelect={handleModeSelect} onLeaderboard={onLeaderboard} />
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
};

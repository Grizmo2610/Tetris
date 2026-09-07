import { useEffect, useState } from 'react';
import { replayStorage } from '../../replay/replayStorage.js';

export default function GameOverlay({ result, mode, onRematch, onExit, onWatchReplay }) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const hasReplay = replayStorage.has();

  const isWin = result?.winner === 'player' || result?.winner === true;
  const isOnline = mode === 'onlinePvp';

  const title =
    result?.reason === 'disconnect_timeout' ? 'Opponent Left' :
    result?.reason === 'opponent_left'       ? 'Opponent Left' :
    isWin ? 'You Win!' : 'Game Over';

  const titleColor =
    isWin ? '#3eff3e' :
    result?.reason?.includes('left') ? '#ffcc44' : '#ff6b6b';

  return (
    <div style={styles.backdrop}>
      <div style={styles.card}>
        <div style={{ ...styles.title, color: titleColor }}>{title}</div>

        {result?.score !== undefined && (
          <div style={styles.stats}>
            <StatRow label="Score" value={(result.score ?? result.playerScore?.score ?? 0).toLocaleString()} />
            <StatRow label="Lines" value={result.lines ?? result.playerScore?.lines ?? 0} />
            <StatRow label="Level" value={result.level ?? result.playerScore?.level ?? 1} />
          </div>
        )}

        {submitted && (
          <div style={styles.toast}>✓ Score saved to leaderboard</div>
        )}

        <div style={styles.buttons}>
          <Btn onClick={onRematch}>
            {isOnline ? 'Rematch' : 'Play Again'}
          </Btn>
          {hasReplay && (
            <Btn onClick={onWatchReplay}>Watch Replay</Btn>
          )}
          {hasReplay && (
            <Btn secondary onClick={() => replayStorage.download()}>Download Replay</Btn>
          )}
          <Btn secondary onClick={onExit}>Main Menu</Btn>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: '#ddd', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Btn({ children, onClick, secondary }) {
  return (
    <button onClick={onClick} style={{
      background: secondary ? 'transparent' : '#3a3acc',
      color: '#fff',
      border: secondary ? '1px solid #3a3acc' : 'none',
      borderRadius: 8,
      padding: '10px 28px',
      fontSize: 14,
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      letterSpacing: 0.5,
    }}>{children}</button>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(5,5,20,0.70)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  card: {
    background: '#0f0f24',
    border: '1px solid #2a2a4a',
    borderRadius: 12,
    padding: '32px 40px',
    minWidth: 280,
    display: 'flex', flexDirection: 'column', gap: 20,
    fontFamily: 'var(--font-sans)',
  },
  title: {
    fontSize: 24, fontWeight: 700,
    textAlign: 'center',
  },
  stats: {
    display: 'flex', flexDirection: 'column', gap: 8,
    fontSize: 14,
    borderTop: '1px solid #1a1a3a',
    paddingTop: 16,
  },
  toast: {
    background: '#1a3a1a',
    border: '1px solid #2a5a2a',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12,
    color: '#4eff4e',
    textAlign: 'center',
  },
  buttons: {
    display: 'flex', flexDirection: 'column', gap: 10,
    borderTop: '1px solid #1a1a3a',
    paddingTop: 16,
  },
};
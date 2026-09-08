import { replayStorage } from '../../replay/replayStorage.js';

export default function GameOverlay({ result, mode, onRematch, onExit, onWatchReplay }) {
  const hasReplay = replayStorage.has();
  const isWin    = result?.winner === 'player' || result?.winner === true;
  const isLeft   = result?.reason === 'disconnect_timeout' || result?.reason === 'opponent_left';

  const title   = isLeft ? 'Opponent Left' : isWin ? 'YOU WIN!' : 'GAME OVER';
  const accent  = isLeft ? '#ffcc44' : isWin ? '#00ff88' : '#ff3366';
  const glow    = isLeft ? 'rgba(255,204,68,0.25)' : isWin ? 'rgba(0,255,136,0.25)' : 'rgba(255,51,102,0.25)';

  const score  = result?.score ?? result?.playerScore?.score ?? 0;
  const lines  = result?.lines ?? result?.playerScore?.lines ?? 0;
  const level  = result?.level ?? result?.playerScore?.level ?? 1;

  return (
    <div style={styles.backdrop}>
      <div style={{ ...styles.card, boxShadow: `0 0 60px ${glow}, 0 24px 64px rgba(0,0,0,0.6)` }}>
        {/* Title */}
        <div style={{ ...styles.title, color: accent, textShadow: `0 0 24px ${glow}` }}>
          {title}
        </div>

        {/* Stats */}
        {result?.score !== undefined && (
          <div style={styles.stats}>
            <StatRow label="Score" value={score.toLocaleString()} accent={accent} />
            <StatRow label="Lines" value={lines} accent={accent} />
            <StatRow label="Level" value={level} accent={accent} />
          </div>
        )}

        {/* Buttons */}
        <div style={styles.buttons}>
          <button className="btn-neon" style={{ width: '100%' }} onClick={onRematch}>
            {mode === 'onlinePvp' ? 'Rematch' : 'Play Again'}
          </button>
          {hasReplay && (
            <button style={styles.ghostBtn} onClick={onWatchReplay}>
              📽 Watch Replay
            </button>
          )}
          {hasReplay && (
            <button style={styles.ghostBtn} onClick={() => replayStorage.download()}>
              ⬇ Download Replay
            </button>
          )}
          <button style={{ ...styles.ghostBtn, color: 'var(--text-muted)' }} onClick={onExit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
      <span style={{ color: accent, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15 }}>{value}</span>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(5,5,20,0.88)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
    backdropFilter: 'blur(10px)',
    animation: 'fadeIn 0.25s ease',
  },
  card: {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: '36px 44px',
    minWidth: 300,
    display: 'flex', flexDirection: 'column', gap: 24,
    backdropFilter: 'blur(20px)',
    animation: 'fadeIn 0.3s ease',
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    textAlign: 'center',
    letterSpacing: 4,
    fontFamily: 'var(--font-sans)',
    textTransform: 'uppercase',
  },
  stats: {
    display: 'flex', flexDirection: 'column', gap: 10,
    borderTop: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    padding: '16px 0',
  },
  buttons: {
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  ghostBtn: {
    width: '100%',
    padding: '10px 0',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 1,
    background: 'transparent',
    color: '#ccc',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 50,
    cursor: 'pointer',
    transition: 'border-color 0.2s, color 0.2s',
    fontFamily: 'var(--font-sans)',
  },
};

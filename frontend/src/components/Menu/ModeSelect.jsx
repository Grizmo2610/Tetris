const MODES = [
  { id: 'solo',      label: 'Solo',        desc: 'Play alone, beat your high score' },
  { id: 'localPvp',  label: 'Local PvP',   desc: 'Two players, one keyboard' },
  { id: 'onlinePvp', label: 'Online PvP',  desc: 'Play with a friend over the internet' },
  { id: 'pvai',      label: 'vs AI',       desc: 'Challenge the bot' },
];

export default function ModeSelect({ onSelect, onLeaderboard }) {
  return (
    <div style={styles.root}>
      <div style={styles.grid}>
        {MODES.map(m => (
          <button key={m.id} style={styles.card} onClick={() => onSelect(m.id)}>
            <div style={styles.cardLabel}>{m.label}</div>
            <div style={styles.cardDesc}>{m.desc}</div>
          </button>
        ))}
      </div>
      <button style={styles.lbBtn} onClick={onLeaderboard}>
        🏆 Leaderboard
      </button>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    width: 360,
  },
  card: {
    background: 'var(--surface-1)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '18px 16px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s, background 0.15s',
    fontFamily: 'var(--font-sans)',
    ':hover': { borderColor: '#5050cc' },
  },
  cardLabel: {
    fontSize: 16, fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  lbBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 24px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
  },
};

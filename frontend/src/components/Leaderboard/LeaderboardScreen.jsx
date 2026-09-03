import { useState, useEffect } from 'react';
import { useLeaderboard } from '../../hooks/useLeaderboard.js';

const MODES = [
  { id: 'solo', label: 'Solo' },
  { id: 'pvp',  label: 'Online PvP' },
  { id: 'pvai', label: 'vs AI' },
];

export default function LeaderboardScreen({ onBack }) {
  const [activeMode, setActiveMode] = useState('solo');
  const { entries, total, loading, error, refetch } = useLeaderboard(activeMode, 20);

  useEffect(() => { refetch(); }, [activeMode]);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
        <h2 style={styles.title}>🏆 Leaderboard</h2>
      </div>

      <div style={styles.tabs}>
        {MODES.map(m => (
          <button
            key={m.id}
            style={{ ...styles.tab, ...(activeMode === m.id ? styles.tabActive : {}) }}
            onClick={() => setActiveMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading && <div style={styles.state}>Loading…</div>}
      {error   && <div style={{ ...styles.state, color: '#ff6b6b' }}>Could not load leaderboard.</div>}

      {!loading && !error && entries.length === 0 && (
        <div style={styles.state}>No scores yet. Be the first!</div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Name</Th>
                <Th>Score</Th>
                <Th>Lines</Th>
                <Th>Lvl</Th>
                {activeMode !== 'solo' && <Th>Result</Th>}
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id ?? i} style={i % 2 === 0 ? styles.rowEven : {}}>
                  <Td>
                    <span style={{ color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text-muted)' }}>
                      {e.rank ?? i + 1}
                    </span>
                  </Td>
                  <Td>{e.nickname}</Td>
                  <Td><strong>{e.score.toLocaleString()}</strong></Td>
                  <Td>{e.lines}</Td>
                  <Td>{e.level}</Td>
                  {activeMode !== 'solo' && (
                    <Td>
                      <span style={{ color: e.result === 'win' ? '#3eff3e' : '#ff6b6b' }}>
                        {e.result ?? '—'}
                      </span>
                    </Td>
                  )}
                  <Td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {formatDate(e.created_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={styles.total}>{total} total entries</div>
        </div>
      )}
    </div>
  );
}

function Th({ children }) {
  return <th style={styles.th}>{children}</th>;
}
function Td({ children, style }) {
  return <td style={{ ...styles.td, ...style }}>{children}</td>;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

const styles = {
  root: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '2rem 1rem', gap: 20,
    fontFamily: 'var(--font-sans)',
    minHeight: '100vh',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 16, width: '100%', maxWidth: 640,
  },
  backBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: 14, fontFamily: 'var(--font-sans)',
  },
  title: {
    fontSize: 22, fontWeight: 600,
    color: 'var(--text-primary)', margin: 0,
  },
  tabs: {
    display: 'flex', gap: 4,
    background: 'var(--surface-1)',
    border: '1px solid var(--border)',
    borderRadius: 10, padding: 4,
  },
  tab: {
    background: 'transparent', border: 'none',
    borderRadius: 8, padding: '8px 20px',
    color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: 13, fontFamily: 'var(--font-sans)',
    transition: 'background 0.15s',
  },
  tabActive: {
    background: '#3a3acc', color: '#fff',
  },
  state: {
    color: 'var(--text-muted)', fontSize: 14, marginTop: 32,
  },
  tableWrap: {
    width: '100%', maxWidth: 640, overflowX: 'auto',
  },
  table: {
    width: '100%', borderCollapse: 'collapse',
    fontSize: 13, color: 'var(--text-primary)',
  },
  th: {
    padding: '10px 12px', textAlign: 'left',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-muted)', fontWeight: 500,
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  td: {
    padding: '10px 12px',
    borderBottom: '0.5px solid var(--border)',
  },
  rowEven: {
    background: 'rgba(255,255,255,0.02)',
  },
  total: {
    textAlign: 'right', fontSize: 11,
    color: 'var(--text-muted)', marginTop: 8,
  },
};

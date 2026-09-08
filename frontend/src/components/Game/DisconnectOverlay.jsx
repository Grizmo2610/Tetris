import { useState, useEffect } from 'react';

export default function DisconnectOverlay({ seconds, onTimeout }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(interval); onTimeout?.(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds, onTimeout]);

  const isUrgent = remaining <= 5;
  const pct = (remaining / seconds) * 100;

  return (
    <div style={styles.backdrop}>
      <div style={styles.card}>
        <div style={styles.icon}>⚡</div>
        <div style={styles.label}>Opponent disconnected</div>
        <div style={{ ...styles.timer, color: isUrgent ? '#ff3366' : '#fff',
          textShadow: isUrgent ? '0 0 24px rgba(255,51,102,0.8)' : '0 0 16px rgba(255,255,255,0.4)' }}>
          {remaining}s
        </div>
        {/* Progress ring */}
        <svg width="80" height="80" style={{ position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)' }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle cx="40" cy="40" r="34" fill="none"
            stroke={isUrgent ? '#ff3366' : '#00ccff'}
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 34}`}
            strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
          />
        </svg>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
          Waiting for reconnect…
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(5,5,20,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 90,
    backdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-sans)',
  },
  card: {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: '32px 48px 48px',
    minWidth: 240,
    display: 'flex', flexDirection: 'column', gap: 10,
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
    boxShadow: '0 0 40px rgba(255,51,102,0.08), 0 24px 64px rgba(0,0,0,0.5)',
    position: 'relative',
    animation: 'fadeIn 0.25s ease',
  },
  icon: { fontSize: 28 },
  label: { fontSize: 14, color: '#ffcc44', fontWeight: 600, letterSpacing: 0.5 },
  timer: {
    fontSize: 56,
    fontWeight: 800,
    fontFamily: 'var(--font-mono)',
    transition: 'color 0.3s, text-shadow 0.3s',
    lineHeight: 1,
    marginTop: 4,
  },
};

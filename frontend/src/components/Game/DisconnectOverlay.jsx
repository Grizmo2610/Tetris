import { useState, useEffect } from 'react';

export default function DisconnectOverlay({ seconds, onTimeout }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeout?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds, onTimeout]);

  const isUrgent = remaining <= 5;

  return (
    <div style={styles.backdrop}>
      <div style={styles.card}>
        <div style={{ fontSize: 16, color: '#ffcc44', fontWeight: 500 }}>
          Opponent disconnected
        </div>
        <div style={{ ...styles.timer, color: isUrgent ? '#ff4444' : '#ffffff' }}>
          {remaining}s
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          Waiting for reconnect…
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(5,5,20,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 90,
    fontFamily: 'var(--font-sans)',
  },
  card: {
    background: '#0f0f24',
    border: '1px solid #2a2a4a',
    borderRadius: 12,
    padding: '28px 40px',
    display: 'flex', flexDirection: 'column', gap: 12,
    alignItems: 'center',
  },
  timer: {
    fontSize: 48,
    fontWeight: 700,
    fontFamily: 'var(--font-mono, monospace)',
    transition: 'color 0.3s',
  },
};

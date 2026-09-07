import { useEffect, useRef } from 'react';

const SPEEDS = [0.25, 0.5, 1, 2, 4];

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function ReplayControls({
  currentT, duration, playing, speed,
  onTogglePlay, onSeek, onSpeedChange,
  onStepBack, onStepForward, onJumpStart, onJumpEnd,
}) {
  const barRef = useRef(null);

  const progress = duration > 0 ? currentT / duration : 0;

  function handleBarClick(e) {
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  function handleBarPointerMove(e) {
    if (e.buttons !== 1) return;
    handleBarClick(e);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); onTogglePlay(); }
      if (e.code === 'Home')  { e.preventDefault(); onJumpStart(); }
      if (e.code === 'End')   { e.preventDefault(); onJumpEnd(); }
      if (e.code === 'ArrowLeft'  && e.shiftKey) { e.preventDefault(); onSeek(Math.max(0, currentT - 30000)); }
      if (e.code === 'ArrowRight' && e.shiftKey) { e.preventDefault(); onSeek(Math.min(duration, currentT + 30000)); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentT, duration, onTogglePlay, onJumpStart, onJumpEnd, onSeek]);

  return (
    <div style={styles.wrap}>
      {/* Progress bar */}
      <div
        ref={barRef}
        style={styles.bar}
        onClick={handleBarClick}
        onPointerMove={handleBarPointerMove}
      >
        <div style={{ ...styles.fill, width: `${progress * 100}%` }} />
        <div style={{ ...styles.thumb, left: `${progress * 100}%` }} />
      </div>

      {/* Controls row */}
      <div style={styles.row}>
        <div style={styles.left}>
          <Btn title="Jump to start" onClick={onJumpStart}>⏮</Btn>
          <Btn title="Back 5s" onClick={onStepBack}>◀</Btn>
          <Btn title="Play / Pause" onClick={onTogglePlay} primary>{playing ? '⏸' : '▶'}</Btn>
          <Btn title="Forward 5s" onClick={onStepForward}>▶</Btn>
          <Btn title="Jump to end" onClick={onJumpEnd}>⏭</Btn>
        </div>

        <div style={styles.center}>
          {fmt(currentT)} / {fmt(duration)}
        </div>

        <div style={styles.right}>
          <span style={styles.label}>Speed:</span>
          <select
            value={speed}
            onChange={e => onSpeedChange(Number(e.target.value))}
            style={styles.select}
          >
            {SPEEDS.map(s => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.hint}>Space: play/pause · Shift+←/→: ±30s · Home/End: jump</div>
    </div>
  );
}

function Btn({ children, onClick, title, primary }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        ...styles.btn,
        background: primary ? '#3a3acc' : '#1a1a3a',
        border: primary ? 'none' : '1px solid #2a2a5a',
      }}
    >
      {children}
    </button>
  );
}

const styles = {
  wrap: {
    display: 'flex', flexDirection: 'column', gap: 8,
    background: '#0c0c20',
    border: '1px solid #1a1a3a',
    borderRadius: 8,
    padding: '12px 16px',
    userSelect: 'none',
    minWidth: 320,
  },
  bar: {
    position: 'relative',
    height: 8,
    background: '#1a1a3a',
    borderRadius: 4,
    cursor: 'pointer',
  },
  fill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    background: '#3a3acc',
    borderRadius: 4,
    pointerEvents: 'none',
  },
  thumb: {
    position: 'absolute', top: '50%',
    width: 14, height: 14,
    background: '#7a7aff',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  left: {
    display: 'flex', gap: 4, flex: 1,
  },
  center: {
    flex: 1,
    textAlign: 'center',
    color: '#aaa',
    fontSize: 12,
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },
  right: {
    display: 'flex', alignItems: 'center', gap: 6,
    flex: 1, justifyContent: 'flex-end',
  },
  btn: {
    color: '#ddd',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    minWidth: 30,
  },
  label: {
    color: '#888', fontSize: 12,
  },
  select: {
    background: '#1a1a3a',
    color: '#ddd',
    border: '1px solid #2a2a5a',
    borderRadius: 6,
    padding: '3px 6px',
    fontSize: 12,
    cursor: 'pointer',
  },
  hint: {
    color: '#555', fontSize: 11, textAlign: 'center',
  },
};
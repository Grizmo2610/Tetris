import { useEffect, useRef, useState, useCallback } from 'react';
import { CELL_SIZE, COLS, ROWS, TOTAL_ROWS } from '../../utils/constants.js';
import { ReplayEngine } from '../../replay/replayEngine.js';
import { renderBoard, renderNextQueue, renderHoldPiece } from '../../game/renderer/boardRenderer.js';
import ReplayControls from './ReplayControls.jsx';

const BOARD_W = COLS * CELL_SIZE;
const BOARD_H = ROWS * CELL_SIZE;
const PANEL_W = 100;
const MINI_H  = 70;
const NEXT_H  = 320;

// Returns the board flat array at time t from a boardTimeline.
// boardTimeline = [{ t, board: number[] }, ...]
function getBoardAtT(timeline, t) {
  let best = timeline[0]?.board ?? null;
  for (const entry of timeline) {
    if (entry.t <= t) best = entry.board;
    else break;
  }
  return best;
}

export default function ReplayViewer({ replayData, onExit }) {
  const mode = replayData.meta?.mode ?? 'solo';

  // Determine if p2 is a full engine block or a boardTimeline block (online)
  const p2HasTimeline = !!(replayData.p2?.boardTimeline);
  const twoPlayers   = !!(replayData.p2);

  const main1Ref = useRef(null);
  const next1Ref = useRef(null);
  const hold1Ref = useRef(null);
  const main2Ref = useRef(null);
  const next2Ref = useRef(null);
  const hold2Ref = useRef(null);

  const [playing,  setPlaying]  = useState(false);
  const [speed,    setSpeed]    = useState(1);
  const [currentT, setCurrentT] = useState(0);

  const engineP1  = useRef(null);
  const engineP2  = useRef(null);
  const rafRef    = useRef(null);
  const stateRef  = useRef({ t: 0, playing: false, speed: 1 });
  const lastTsRef = useRef(null);

  const duration = replayData.p1 ? new ReplayEngine(replayData.p1).getDuration() : 0;

  useEffect(() => {
    engineP1.current = new ReplayEngine(replayData.p1);
    engineP2.current = (!p2HasTimeline && replayData.p2) ? new ReplayEngine(replayData.p2) : null;
    stateRef.current = { t: 0, playing: false, speed: 1 };
    setCurrentT(0);
    setPlaying(false);
    _renderAt(0);
  }, [replayData]);

  useEffect(() => { stateRef.current.playing = playing; }, [playing]);
  useEffect(() => { stateRef.current.speed   = speed;   }, [speed]);

  useEffect(() => {
    function loop(ts) {
      const s = stateRef.current;
      if (!s.playing) { lastTsRef.current = null; return; }
      const dt = lastTsRef.current ? Math.min(ts - lastTsRef.current, 100) : 0;
      lastTsRef.current = ts;
      const dur = engineP1.current?.getDuration() ?? 0;
      let nextT = s.t + dt * s.speed;
      if (nextT >= dur) {
        nextT = dur;
        stateRef.current.t = nextT;
        stateRef.current.playing = false;
        setCurrentT(nextT);
        setPlaying(false);
        _renderAt(nextT);
        return;
      }
      stateRef.current.t = nextT;
      setCurrentT(nextT);
      _renderAt(nextT);
      rafRef.current = requestAnimationFrame(loop);
    }
    if (playing) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  function _renderAt(t) {
    if (engineP1.current && main1Ref.current) {
      const s1 = engineP1.current.getStateAt(t);
      renderBoard(main1Ref.current.getContext('2d'), s1);
      renderNextQueue(next1Ref.current.getContext('2d'), s1.queue);
      renderHoldPiece(hold1Ref.current.getContext('2d'), s1.holdType, s1.holdUsed);
    }

    if (twoPlayers && main2Ref.current) {
      if (p2HasTimeline) {
        // Online PvP: render raw board snapshots received from opponent
        const flat = getBoardAtT(replayData.p2.boardTimeline, t);
        if (flat) {
          const board2d = Array.from({ length: TOTAL_ROWS }, (_, r) =>
            new Int8Array(flat.slice(r * COLS, r * COLS + COLS))
          );
          renderBoard(main2Ref.current.getContext('2d'), {
            board: board2d, piece: null,
            queue: [], holdType: null, holdUsed: false,
            pendingGarbage: 0, status: 'playing',
          });
        }
        // No next/hold for online opponent (not recorded)
        if (next2Ref.current) next2Ref.current.getContext('2d').clearRect(0, 0, PANEL_W, NEXT_H);
        if (hold2Ref.current) hold2Ref.current.getContext('2d').clearRect(0, 0, PANEL_W, MINI_H);
      } else if (engineP2.current) {
        const s2 = engineP2.current.getStateAt(t);
        renderBoard(main2Ref.current.getContext('2d'), s2);
        renderNextQueue(next2Ref.current.getContext('2d'), s2.queue);
        renderHoldPiece(hold2Ref.current.getContext('2d'), s2.holdType, s2.holdUsed);
      }
    }
  }

  const handleTogglePlay = useCallback(() => {
    setPlaying(p => {
      if (stateRef.current.t >= (engineP1.current?.getDuration() ?? 0)) {
        stateRef.current.t = 0;
        setCurrentT(0);
        _renderAt(0);
      }
      return !p;
    });
  }, []);

  const handleSeek = useCallback((t) => {
    const clamped = Math.max(0, Math.min(t, duration));
    stateRef.current.t = clamped;
    setCurrentT(clamped);
    _renderAt(clamped);
  }, [duration]);

  const handleSpeedChange = useCallback((s) => {
    stateRef.current.speed = s;
    setSpeed(s);
  }, []);

  const handleStepBack    = useCallback(() => handleSeek(currentT - 5000), [handleSeek, currentT]);
  const handleStepForward = useCallback(() => handleSeek(currentT + 5000), [handleSeek, currentT]);
  const handleJumpStart   = useCallback(() => handleSeek(0), [handleSeek]);
  const handleJumpEnd     = useCallback(() => handleSeek(duration), [handleSeek, duration]);

  const p1Nick = replayData.p1?.meta?.nickname ?? 'Player 1';
  const p2Nick = replayData.p2?.meta?.nickname ?? (mode === 'pvai' ? 'AI' : 'Player 2');
  const winner = replayData.meta?.winner ?? null;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.badge}>REPLAY</span>
        <span style={styles.modeName}>{MODE_LABELS[mode] ?? mode}</span>
        {winner && <span style={styles.winner}>Winner: {winner}</span>}
        <button style={styles.backBtn} onClick={onExit}>← Back</button>
      </div>

      <div style={styles.boards}>
        <PlayerPanel
          mainRef={main1Ref} nextRef={next1Ref} holdRef={hold1Ref}
          nickname={p1Nick}
          score={replayData.p1?.meta?.score ?? 0}
          lines={replayData.p1?.meta?.lines ?? 0}
          level={replayData.p1?.meta?.level ?? 1}
        />
        {twoPlayers && (
          <PlayerPanel
            mainRef={main2Ref} nextRef={next2Ref} holdRef={hold2Ref}
            nickname={p2Nick}
            score={replayData.p2?.meta?.score ?? 0}
            lines={replayData.p2?.meta?.lines ?? 0}
            level={replayData.p2?.meta?.level ?? 1}
            hideNextHold={p2HasTimeline}
          />
        )}
      </div>

      <ReplayControls
        currentT={currentT}
        duration={duration}
        playing={playing}
        speed={speed}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onSpeedChange={handleSpeedChange}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onJumpStart={handleJumpStart}
        onJumpEnd={handleJumpEnd}
      />
    </div>
  );
}

function PlayerPanel({ mainRef, nextRef, holdRef, nickname, score, lines, level, hideNextHold }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelLeft}>
        <div style={styles.panelLabel}>Hold</div>
        <canvas ref={holdRef} width={PANEL_W} height={MINI_H} style={{ display: 'block', opacity: hideNextHold ? 0 : 1 }} />
        <div style={{ marginTop: 16 }}>
          <StatLabel label="Score" value={score.toLocaleString()} />
          <StatLabel label="Lines" value={lines} />
          <StatLabel label="Level" value={level} />
        </div>
      </div>

      <div>
        <div style={styles.nick}>{nickname}</div>
        <canvas ref={mainRef} width={BOARD_W} height={BOARD_H} style={{ display: 'block' }} />
      </div>

      <div style={styles.panelRight}>
        <div style={styles.panelLabel}>Next</div>
        <canvas ref={nextRef} width={PANEL_W} height={NEXT_H} style={{ display: 'block', opacity: hideNextHold ? 0 : 1 }} />
      </div>
    </div>
  );
}

function StatLabel({ label, value }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: '#ccc', fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const MODE_LABELS = {
  solo: 'Solo',
  localPvp: 'Local PvP',
  onlinePvp: 'Online PvP',
  pvai: 'vs AI',
};

const styles = {
  root: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 16,
    minHeight: '100vh',
    background: 'var(--bg)',
    padding: '24px 16px',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', maxWidth: 900,
    fontFamily: 'var(--font-sans)',
  },
  badge: {
    background: '#3a3acc', color: '#fff',
    borderRadius: 4, padding: '3px 8px',
    fontSize: 11, fontWeight: 700, letterSpacing: 1,
  },
  modeName: { color: '#aaa', fontSize: 13 },
  winner: { color: '#ffe066', fontSize: 13 },
  backBtn: {
    marginLeft: 'auto',
    background: 'transparent', color: '#aaa',
    border: '1px solid #2a2a5a',
    borderRadius: 6, padding: '5px 14px',
    fontSize: 13, cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  boards: {
    display: 'flex', gap: 32, alignItems: 'flex-start',
  },
  panel: {
    display: 'flex', gap: 8, alignItems: 'flex-start',
  },
  panelLeft: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    width: PANEL_W,
  },
  panelRight: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    width: PANEL_W,
  },
  panelLabel: {
    color: '#666', fontSize: 10, textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 4,
  },
  nick: {
    color: '#ccc', fontSize: 13, fontWeight: 600,
    textAlign: 'center', marginBottom: 4,
    fontFamily: 'var(--font-sans)',
  },
};
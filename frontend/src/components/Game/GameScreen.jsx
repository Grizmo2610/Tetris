import { useEffect, useRef, useState, useCallback } from 'react';
import { CELL_SIZE, COLS, ROWS } from '../../utils/constants.js';
import GameOverlay from './GameOverlay.jsx';
import DisconnectOverlay from './DisconnectOverlay.jsx';

const BOARD_W = COLS * CELL_SIZE;
const BOARD_H = ROWS * CELL_SIZE;
const PANEL_W = 100;
const MINI_H  = 70;  // hold canvas height
const NEXT_H  = 320; // next canvas height

// ─── GameScreen ──────────────────────────────────────────────────────────────
// Props:
//   mode       – 'solo' | 'localPvp' | 'onlinePvp' | 'pvai'
//   modeParams – extra params passed to the mode constructor (nickname, socket, etc.)
//   onExit     – called when player chooses to leave

export default function GameScreen({ mode, modeParams = {}, onExit }) {
  // Player 1 canvas refs
  const mainRef = useRef(null);
  const nextRef = useRef(null);
  const holdRef = useRef(null);

  // Player 2 / opponent canvas refs (for localPvp, onlinePvp, pvai)
  const main2Ref = useRef(null);
  const next2Ref = useRef(null);
  const hold2Ref = useRef(null);

  const modeInstanceRef = useRef(null);

  const [scoreP1, setScoreP1] = useState({ score: 0, lines: 0, level: 1 });
  const [scoreP2, setScoreP2] = useState({ score: 0, lines: 0, level: 1 });
  const [gameOver, setGameOver] = useState(null);      // null | result object
  const [disconnect, setDisconnect] = useState(null);  // null | { timeoutSeconds }
  const [paused, setPaused]   = useState(false);
  const [countdown, setCountdown] = useState(null);    // 3|2|1|0|null

  const needsSecondBoard = ['localPvp', 'onlinePvp', 'pvai'].includes(mode);

  // ─── Countdown then start mode ────────────────────────────────────────────

  const startMode = useCallback(async () => {
    if (!mainRef.current) return;

    // Dynamic import to keep initial bundle lean
    let ModeClass;
    if (mode === 'solo') {
      const { SoloMode } = await import('../../game/modes/soloMode.js');
      ModeClass = SoloMode;
    } else if (mode === 'localPvp') {
      const { LocalPvpMode } = await import('../../game/modes/localPvpMode.js');
      ModeClass = LocalPvpMode;
    } else if (mode === 'onlinePvp') {
      const { OnlinePvpMode } = await import('../../game/modes/onlinePvpMode.js');
      ModeClass = OnlinePvpMode;
    } else if (mode === 'pvai') {
      const { PvAiMode } = await import('../../game/modes/pvAiMode.js');
      ModeClass = PvAiMode;
    }

    const commonArgs = {
      mainCanvas: mainRef.current,
      nextCanvas: nextRef.current,
      holdCanvas: holdRef.current,
      onScoreUpdate: (data) => {
        if (data.player) { setScoreP1(data.player); setScoreP2(data.ai); }
        else if (Array.isArray(data)) { setScoreP1(data[0]); setScoreP2(data[1]); }
        else setScoreP1(data);
      },
      onGameOver: (result) => setGameOver(result),
    };

    const modeArgs = {
      ...commonArgs,
      ...(needsSecondBoard ? {
        p1Canvases: { main: mainRef.current, next: nextRef.current, hold: holdRef.current },
        p2Canvases: { main: main2Ref.current, next: next2Ref.current, hold: hold2Ref.current },
        opponentCanvas: main2Ref.current,
        aiCanvas: main2Ref.current,
        aiNextCanvas: next2Ref.current,
        aiHoldCanvas: hold2Ref.current,
      } : {}),
      onDisconnect: ({ type, timeoutSeconds }) => {
        if (type === 'disconnected') setDisconnect({ timeoutSeconds });
        else setDisconnect(null);
      },
      ...modeParams,
    };

    const instance = new ModeClass(modeArgs);
    modeInstanceRef.current = instance;
    instance.start();
  }, [mode, modeParams, needsSecondBoard]);

  // Run countdown then start
  useEffect(() => {
    let t = 3;
    setCountdown(3);
    const interval = setInterval(() => {
      t--;
      setCountdown(t);
      if (t <= 0) {
        clearInterval(interval);
        setCountdown(null);
        startMode();
      }
    }, 1000);
    return () => {
      clearInterval(interval);
      modeInstanceRef.current?.destroy();
    };
  }, [startMode]);

  // ─── Rematch ──────────────────────────────────────────────────────────────

  const handleRematch = useCallback(() => {
    setGameOver(null);
    setDisconnect(null);
    setScoreP1({ score: 0, lines: 0, level: 1 });
    setScoreP2({ score: 0, lines: 0, level: 1 });
    modeInstanceRef.current?.destroy();
    setCountdown(3);
    let t = 3;
    const interval = setInterval(() => {
      t--;
      setCountdown(t);
      if (t <= 0) {
        clearInterval(interval);
        setCountdown(null);
        startMode();
      }
    }, 1000);
  }, [startMode]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      <PlayerPanel
        canvasRef={mainRef}
        nextRef={nextRef}
        holdRef={holdRef}
        score={scoreP1}
        label={modeParams.nickname ?? 'Player 1'}
        countdown={countdown}
      />

      {needsSecondBoard && (
        <PlayerPanel
          canvasRef={main2Ref}
          nextRef={next2Ref}
          holdRef={hold2Ref}
          score={scoreP2}
          label={
            mode === 'pvai' ? `AI (${modeParams.difficulty ?? 'medium'})` :
            mode === 'onlinePvp' ? (modeParams.opponentNickname ?? 'Opponent') :
            (modeParams.nickname2 ?? 'Player 2')
          }
          right
        />
      )}

      {disconnect && (
        <DisconnectOverlay
          seconds={disconnect.timeoutSeconds}
          onTimeout={() => setGameOver({ reason: 'disconnect_timeout' })}
        />
      )}

      {gameOver && (
        <GameOverlay
          result={gameOver}
          mode={mode}
          onRematch={handleRematch}
          onExit={onExit}
        />
      )}
    </div>
  );
}

// ─── PlayerPanel ─────────────────────────────────────────────────────────────

function PlayerPanel({ canvasRef, nextRef, holdRef, score, label, countdown, right }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {!right && <SidePanel nextRef={nextRef} holdRef={holdRef} score={score} label={label} left />}

      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          style={{ display: 'block', border: '1px solid #2a2a4a', borderRadius: 4 }}
        />
        {countdown !== null && (
          <div style={styles.countdown}>
            <span style={{ fontSize: countdown === 0 ? 52 : 64, color: countdown === 0 ? '#3eff3e' : '#fff' }}>
              {countdown === 0 ? 'GO!' : countdown}
            </span>
          </div>
        )}
      </div>

      {right && <SidePanel nextRef={nextRef} holdRef={holdRef} score={score} label={label} />}
    </div>
  );
}

// ─── SidePanel ────────────────────────────────────────────────────────────────

function SidePanel({ nextRef, holdRef, score, label, left }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: PANEL_W }}>
      <div style={styles.label}>{label}</div>
      <InfoBox title="Hold">
        <canvas ref={holdRef} width={PANEL_W - 16} height={MINI_H} />
      </InfoBox>
      <InfoBox title="Score"><Stat>{score.score.toLocaleString()}</Stat></InfoBox>
      <InfoBox title="Lines"><Stat>{score.lines}</Stat></InfoBox>
      <InfoBox title="Level"><Stat>{score.level}</Stat></InfoBox>
      {!left && (
        <InfoBox title="Next">
          <canvas ref={nextRef} width={PANEL_W - 16} height={NEXT_H} />
        </InfoBox>
      )}
      {left && (
        <InfoBox title="Next">
          <canvas ref={nextRef} width={PANEL_W - 16} height={NEXT_H} />
        </InfoBox>
      )}
    </div>
  );
}

function InfoBox({ title, children }) {
  return (
    <div style={styles.infoBox}>
      <div style={styles.infoTitle}>{title}</div>
      {children}
    </div>
  );
}

function Stat({ children }) {
  return <div style={styles.stat}>{children}</div>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: 'flex',
    gap: 24,
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '1rem',
    userSelect: 'none',
  },
  label: {
    fontSize: 12,
    color: 'var(--text-muted)',
    textAlign: 'center',
    letterSpacing: 1,
    fontFamily: 'var(--font-sans)',
    textTransform: 'uppercase',
    padding: '4px 0',
  },
  countdown: {
    position: 'absolute', inset: 0,
    background: 'rgba(5,5,20,0.80)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 4,
    fontFamily: 'var(--font-sans)',
    fontWeight: 700,
  },
  infoBox: {
    background: 'var(--surface-1)',
    border: '0.5px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '6px 8px',
  },
  infoTitle: {
    fontSize: 10,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: 'var(--font-sans)',
  },
  stat: {
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono, monospace)',
  },
};

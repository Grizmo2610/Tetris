import { useEffect, useRef, useState, useCallback } from 'react';
import { CELL_SIZE, COLS, ROWS } from '../../utils/constants.js';
import GameOverlay from './GameOverlay.jsx';
import DisconnectOverlay from './DisconnectOverlay.jsx';

const BOARD_W  = COLS * CELL_SIZE;
const BOARD_H  = ROWS * CELL_SIZE;
const PANEL_W  = 110;
const MINI_H   = 72;
const NEXT_H   = 330;

export default function GameScreen({ mode, modeParams = {}, onGameOver, onExit, onWatchReplay }) {
  const mainRef  = useRef(null);
  const nextRef  = useRef(null);
  const holdRef  = useRef(null);
  const main2Ref = useRef(null);
  const next2Ref = useRef(null);
  const hold2Ref = useRef(null);
  const modeInstanceRef = useRef(null);

  const [scoreP1, setScoreP1]   = useState({ score: 0, lines: 0, level: 1, combo: -1, b2b: false });
  const [scoreP2, setScoreP2]   = useState({ score: 0, lines: 0, level: 1, combo: -1, b2b: false });
  const [gameOver, setGameOver]     = useState(null);
  const [disconnect, setDisconnect] = useState(null);
  const [paused, setPaused]         = useState(false);
  const [countdown, setCountdown]   = useState(null);

  const needsSecondBoard = ['localPvp', 'onlinePvp', 'pvai'].includes(mode);

  // ── ESC pause
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (countdown !== null || gameOver !== null || disconnect !== null) return;
      const instance = modeInstanceRef.current;
      if (!instance) return;
      setPaused(prev => {
        const next = !prev;
        next ? instance.pause?.() : instance.resume?.();
        return next;
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [countdown, gameOver, disconnect]);

  // ── Start mode
  const startMode = useCallback(async () => {
    if (!mainRef.current) return;
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
      onGameOver: (result) => {
        setPaused(false);
        setGameOver(result);
        onGameOver?.(result);
      },
    };

    const modeArgs = {
      ...commonArgs,
      ...(needsSecondBoard ? {
        p1Canvases: { main: mainRef.current, next: nextRef.current, hold: holdRef.current },
        p2Canvases: { main: main2Ref.current, next: next2Ref.current, hold: hold2Ref.current },
        opponentCanvas: main2Ref.current,
        aiCanvas:       main2Ref.current,
        aiNextCanvas:   next2Ref.current,
        aiHoldCanvas:   hold2Ref.current,
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
  }, [mode, modeParams, needsSecondBoard, onGameOver]);

  // ── Countdown → start
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

  // ── Rematch
  const handleRematch = useCallback(() => {
    setGameOver(null); setDisconnect(null); setPaused(false);
    setScoreP1({ score: 0, lines: 0, level: 1, combo: -1, b2b: false });
    setScoreP2({ score: 0, lines: 0, level: 1, combo: -1, b2b: false });
    modeInstanceRef.current?.destroy();
    setCountdown(3);
    let t = 3;
    const interval = setInterval(() => {
      t--;
      setCountdown(t);
      if (t <= 0) { clearInterval(interval); setCountdown(null); startMode(); }
    }, 1000);
  }, [startMode]);

  const handleResume = useCallback(() => {
    modeInstanceRef.current?.resume?.();
    setPaused(false);
  }, []);

  // ── Labels
  const label1 = modeParams.nickname ?? 'Player 1';
  const label2 =
    mode === 'pvai'      ? `AI (${modeParams.difficulty ?? 'medium'})` :
    mode === 'onlinePvp' ? (modeParams.opponentNickname ?? 'Opponent') :
    (modeParams.nickname2 ?? 'Player 2');

  return (
    <div style={styles.root}>
      {/* Background glow orbs */}
      <div style={styles.orbLeft} />
      <div style={styles.orbRight} />

      <div style={styles.boards}>
        <PlayerPanel
          canvasRef={mainRef} nextRef={nextRef} holdRef={holdRef}
          score={scoreP1} label={label1}
          countdown={countdown} accentColor="#ff00cc"
        />

        {needsSecondBoard && (
          <PlayerPanel
            canvasRef={main2Ref} nextRef={next2Ref} holdRef={hold2Ref}
            score={scoreP2} label={label2}
            countdown={countdown} accentColor="#00ccff" right
          />
        )}
      </div>

      {disconnect && (
        <DisconnectOverlay
          seconds={disconnect.timeoutSeconds}
          onTimeout={() => setGameOver({ reason: 'disconnect_timeout' })}
        />
      )}

      {gameOver && (
        <GameOverlay
          result={gameOver} mode={mode}
          onRematch={handleRematch} onExit={onExit} onWatchReplay={onWatchReplay}
        />
      )}

      {paused && !gameOver && (
        <PauseOverlay onResume={handleResume} onExit={onExit} isOnline={mode === 'onlinePvp'} />
      )}
    </div>
  );
}

// ─── PauseOverlay ─────────────────────────────────────────────────────────────

function PauseOverlay({ onResume, onExit, isOnline }) {
  return (
    <div style={styles.overlayBackdrop}>
      <div style={styles.pauseCard}>
        <div className="gradient-text" style={styles.pauseTitle}>TẠM DỪNG</div>
        {isOnline && (
          <div style={styles.pauseWarning}>
            ⚠ Game online vẫn tiếp tục trên server!
          </div>
        )}
        <button className="btn-neon" style={{ width: '100%', marginTop: 8 }} onClick={onResume}>
          ▶ Tiếp tục (ESC)
        </button>
        <button style={styles.ghostBtn} onClick={onExit}>
          ✕ Thoát
        </button>
      </div>
    </div>
  );
}

// ─── PlayerPanel ─────────────────────────────────────────────────────────────

function PlayerPanel({ canvasRef, nextRef, holdRef, score, label, countdown, accentColor, right }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexShrink: 0 }}>
      {!right && (
        <SidePanel nextRef={nextRef} holdRef={holdRef} score={score} label={label} accentColor={accentColor} left />
      )}

      <div style={{ position: 'relative', flexShrink: 0 }}>
        {/* Neon border around canvas */}
        <div style={{ ...styles.boardWrapper, '--accent-color': accentColor }}>
          <canvas
            ref={canvasRef}
            width={BOARD_W}
            height={BOARD_H}
            style={{
              display: 'block',
              width: BOARD_W,
              height: BOARD_H,
              imageRendering: 'pixelated',
              borderRadius: 8,
            }}
          />
          {countdown !== null && (
            <div style={styles.countdownOverlay}>
              <span style={{
                fontSize: countdown === 0 ? 56 : 72,
                fontWeight: 700,
                color: countdown === 0 ? '#00ff88' : '#fff',
                textShadow: countdown === 0
                  ? '0 0 30px rgba(0,255,136,0.8)'
                  : '0 0 30px rgba(255,255,255,0.6)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: -2,
              }}>
                {countdown === 0 ? 'GO!' : countdown}
              </span>
            </div>
          )}
        </div>
      </div>

      {right && (
        <SidePanel nextRef={nextRef} holdRef={holdRef} score={score} label={label} accentColor={accentColor} />
      )}
    </div>
  );
}

// ─── SidePanel ────────────────────────────────────────────────────────────────

function SidePanel({ nextRef, holdRef, score, label, accentColor }) {
  const combo = score.combo ?? -1;
  const b2b   = score.b2b ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: PANEL_W, flexShrink: 0 }}>
      {/* Player label */}
      <div style={{ ...styles.playerLabel, background: accentColor + '22', borderColor: accentColor + '55' }}>
        <span style={{ color: accentColor, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>
          {label.toUpperCase()}
        </span>
      </div>

      <PanelBox title="Hold">
        <canvas
          ref={holdRef}
          width={PANEL_W - 20}
          height={MINI_H}
          style={{ display: 'block', width: PANEL_W - 20, height: MINI_H, imageRendering: 'pixelated' }}
        />
      </PanelBox>

      <PanelBox title="Score">
        <div style={styles.statValue}>{(score.score ?? 0).toLocaleString()}</div>
      </PanelBox>

      <PanelBox title="Lines">
        <div style={styles.statValue}>{score.lines ?? 0}</div>
      </PanelBox>

      <PanelBox title="Level">
        <div style={styles.statValue}>{score.level ?? 1}</div>
      </PanelBox>

      {/* Combo badge */}
      {combo >= 1 && (
        <div style={{ ...styles.comboBadge, '--accent-color': accentColor }}>
          <span style={{ color: accentColor }}>{combo}× COMBO</span>
        </div>
      )}

      {/* B2B badge */}
      {b2b && (
        <div style={styles.b2bBadge}>B2B</div>
      )}

      <PanelBox title="Next">
        <canvas
          ref={nextRef}
          width={PANEL_W - 20}
          height={NEXT_H}
          style={{ display: 'block', width: PANEL_W - 20, height: NEXT_H, imageRendering: 'pixelated' }}
        />
      </PanelBox>
    </div>
  );
}

function PanelBox({ title, children }) {
  return (
    <div className="glass" style={styles.panelBox}>
      <div style={styles.panelTitle}>{title}</div>
      {children}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '24px 16px 16px',
    position: 'relative',
    overflow: 'hidden',
    userSelect: 'none',
  },
  // background glow orbs
  orbLeft: {
    position: 'fixed', top: '60%', left: '-10%',
    width: 500, height: 500, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(204,0,255,0.08) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
  },
  orbRight: {
    position: 'fixed', top: '10%', right: '-10%',
    width: 500, height: 500, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,200,255,0.07) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
  },
  boards: {
    display: 'flex',
    gap: 28,
    alignItems: 'flex-start',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },

  // Board wrapper with neon border
  boardWrapper: {
    position: 'relative',
    borderRadius: 10,
    padding: 2,
    background: 'linear-gradient(135deg, var(--accent-color, #ff00cc), rgba(255,255,255,0.05))',
    boxShadow: '0 0 32px rgba(204,0,255,0.12), 0 8px 32px rgba(0,0,0,0.5)',
  },

  playerLabel: {
    textAlign: 'center',
    padding: '6px 10px',
    borderRadius: 20,
    border: '1px solid',
    fontFamily: 'var(--font-sans)',
  },

  panelBox: {
    padding: '8px 10px',
  },
  panelTitle: {
    fontSize: 10,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
    fontFamily: 'var(--font-sans)',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: -0.5,
  },

  // Combo / B2B
  comboBadge: {
    background: 'rgba(255,0,200,0.08)',
    border: '1px solid rgba(255,0,200,0.25)',
    borderRadius: 20,
    padding: '4px 10px',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    animation: 'pulseGlow 0.8s ease-in-out infinite alternate',
  },
  b2bBadge: {
    background: 'linear-gradient(135deg, #ffd700, #ff8800)',
    color: '#000',
    borderRadius: 20,
    padding: '3px 10px',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2,
    boxShadow: '0 0 12px rgba(255,215,0,0.4)',
  },

  // Countdown overlay
  countdownOverlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(5,5,20,0.78)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
    backdropFilter: 'blur(2px)',
  },

  // Overlays
  overlayBackdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(5,5,20,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
    backdropFilter: 'blur(8px)',
    animation: 'fadeIn 0.2s ease',
  },
  pauseCard: {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: '36px 44px',
    minWidth: 280,
    display: 'flex', flexDirection: 'column', gap: 14,
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
    boxShadow: '0 0 60px rgba(204,0,255,0.12), 0 24px 64px rgba(0,0,0,0.5)',
    animation: 'fadeIn 0.25s ease',
  },
  pauseTitle: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: 6,
    marginBottom: 8,
  },
  pauseWarning: {
    fontSize: 12,
    color: '#f0a040',
    textAlign: 'center',
    maxWidth: 220,
    lineHeight: 1.6,
  },
  ghostBtn: {
    width: '100%',
    padding: '10px 0',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 1,
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 50,
    cursor: 'pointer',
    transition: 'border-color 0.2s, color 0.2s',
  },
};

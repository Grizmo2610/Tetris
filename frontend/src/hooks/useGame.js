import { useState, useCallback, useRef } from 'react';
import { submitScore } from './useLeaderboard.js';
import { socketClient } from '../network/socketClient.js';

// ─── useGame ──────────────────────────────────────────────────────────────────
// Manages top-level game flow: screen transitions, score submission, rematch.
//
// Returns:
//   screen         — 'menu' | 'lobby' | 'game' | 'leaderboard'
//   gameProps      — props to pass to GameScreen
//   goToMenu()
//   goToLeaderboard()
//   startGame(mode, params)

export function useGame() {
  const [screen,    setScreen]    = useState('menu');
  const [activeMode, setActiveMode] = useState(null);
  const [modeParams, setModeParams] = useState({});
  const [toast,     setToast]     = useState(null);   // { msg, ok }
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, ok = true) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ─── Navigation ─────────────────────────────────────────────────────────────

  const goToMenu = useCallback(() => {
    socketClient.disconnect();
    setScreen('menu');
    setActiveMode(null);
    setModeParams({});
  }, []);

  const goToLeaderboard = useCallback(() => {
    setScreen('leaderboard');
  }, []);

  // ─── Start game ─────────────────────────────────────────────────────────────

  const startGame = useCallback(async (mode, params) => {
    setActiveMode(mode);

    if (mode === 'onlinePvp') {
      // Need to go through lobby first (create/join room)
      setModeParams(params);
      setScreen('lobby');
      return;
    }

    if (mode === 'pvai' && (params.difficulty === 'hard' || params.difficulty === 'expert')) {
      // Lazy-load ONNX controller
      setModeParams({ ...params, aiController: null, loading: true });
      setScreen('game');
      try {
        const { createAIController } = await import('../ai/aiController.js');
        const aiController = await createAIController(params.difficulty);
        setModeParams(prev => ({ ...prev, aiController, loading: false }));
      } catch (err) {
        console.warn('[useGame] ONNX load failed, falling back to medium heuristic:', err);
        showToast('AI model unavailable, using Medium difficulty', false);
        const { createAIController } = await import('../ai/aiController.js');
        const aiController = await createAIController('medium');
        setModeParams(prev => ({ ...prev, aiController, difficulty: 'medium', loading: false }));
      }
      return;
    }

    if (mode === 'pvai') {
      // Heuristic AI – synchronous
      const { createAIController } = await import('../ai/aiController.js');
      const aiController = await createAIController(params.difficulty);
      setModeParams({ ...params, aiController });
      setScreen('game');
      return;
    }

    setModeParams(params);
    setScreen('game');
  }, [showToast]);

  // ─── Called when lobby is ready (online PvP) ─────────────────────────────────

  const onLobbyReady = useCallback(({ roomCode, opponentNickname }) => {
    setModeParams(prev => ({ ...prev, roomCode, opponentNickname, socket: socketClient }));
    setScreen('game');
  }, []);

  // ─── Game over callback ──────────────────────────────────────────────────────

  const onGameOver = useCallback(async (result) => {
    const { nickname, difficulty } = modeParams;
    const score  = result.score  ?? result.playerScore?.score  ?? 0;
    const lines  = result.lines  ?? result.playerScore?.lines  ?? 0;
    const level  = result.level  ?? result.playerScore?.level  ?? 1;

    let leaderboardMode = activeMode;
    if (activeMode === 'localPvp')  leaderboardMode = 'pvp';
    if (activeMode === 'onlinePvp') leaderboardMode = 'pvp';
    if (activeMode === 'pvai')      leaderboardMode = 'pvai';

    const resultValue =
      activeMode === 'solo' ? null :
      result.winner === 'player' || result.winner === true ? 'win' : 'loss';

    const { ok } = await submitScore({
      nickname: nickname ?? 'Anonymous',
      score, lines, level,
      mode: leaderboardMode,
      result: resultValue,
      opponent: modeParams.opponentNickname ?? null,
    });

    if (!ok) showToast('Score could not be saved', false);
    else showToast('Score saved!');
  }, [activeMode, modeParams, showToast]);

  return {
    screen,
    activeMode,
    modeParams,
    toast,
    goToMenu,
    goToLeaderboard,
    startGame,
    onLobbyReady,
    onGameOver,
  };
}

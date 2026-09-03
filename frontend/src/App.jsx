import { useEffect } from 'react';
import { useGame } from './hooks/useGame.js';
import MainMenu from './components/Menu/MainMenu.jsx';
import GameScreen from './components/Game/GameScreen.jsx';
import LeaderboardScreen from './components/Leaderboard/LeaderboardScreen.jsx';
import { CreateRoom, JoinRoom } from './components/Room/RoomScreens.jsx';

// ─── Keep-alive ping (prevents Render free tier sleep) ─────────────────────────

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

function useKeepAlive() {
  useEffect(() => {
    const ping = () => fetch(`${BACKEND_URL}/health`).catch(() => {});
    ping();
    const interval = setInterval(ping, 4 * 60 * 1000); // every 4 min
    return () => clearInterval(interval);
  }, []);
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  useKeepAlive();

  const {
    screen,
    activeMode,
    modeParams,
    toast,
    goToMenu,
    goToLeaderboard,
    startGame,
    onLobbyReady,
    onGameOver,
  } = useGame();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {screen === 'menu' && (
        <MainMenu
          onStartGame={startGame}
          onLeaderboard={goToLeaderboard}
        />
      )}

      {screen === 'leaderboard' && (
        <LeaderboardScreen onBack={goToMenu} />
      )}

      {screen === 'lobby' && activeMode === 'onlinePvp' && (
        <LobbyScreen
          params={modeParams}
          onReady={onLobbyReady}
          onCancel={goToMenu}
        />
      )}

      {screen === 'game' && (
        <GameScreen
          mode={activeMode}
          modeParams={modeParams}
          onGameOver={onGameOver}
          onExit={goToMenu}
        />
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}

// ─── LobbyScreen ──────────────────────────────────────────────────────────────

function LobbyScreen({ params, onReady, onCancel }) {
  const { nickname, roomAction, roomCode } = params;

  if (roomAction === 'create') {
    return <CreateRoom nickname={nickname} onRoomReady={onReady} onCancel={onCancel} />;
  }
  return <JoinRoom nickname={nickname} roomCode={roomCode} onRoomReady={onReady} onCancel={onCancel} />;
}

// ─── Toast notification ───────────────────────────────────────────────────────

function Toast({ msg, ok }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: ok ? '#1a3a1a' : '#3a1a1a',
      border: `1px solid ${ok ? '#2a5a2a' : '#5a2a2a'}`,
      color: ok ? '#4eff4e' : '#ff6b6b',
      borderRadius: 8, padding: '10px 20px',
      fontSize: 13, fontFamily: 'var(--font-sans)',
      zIndex: 200, whiteSpace: 'nowrap',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      {msg}
    </div>
  );
}

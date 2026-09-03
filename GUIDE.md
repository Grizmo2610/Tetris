# Tetris Platform

Multiplayer Tetris in the browser — Solo, Local PvP, Online PvP, and vs AI.

**Stack:** React + Canvas · Node.js + Socket.io · PostgreSQL · Cloudflare Pages + Render  
**Cost:** $0/month (free tiers)

---

## Quick Start

### Prerequisites

- Node.js 20 LTS
- npm 9+
- PostgreSQL 14+ (local dev)

### 1. Clone and install

```bash
git clone https://github.com/<org>/tetris-platform.git
cd tetris-platform

cd frontend && npm install && cd ..
cd backend  && npm install && cd ..
```

### 2. Configure backend

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL, ALLOWED_ORIGINS
```

Create local database and run migration:

```bash
createdb tetris_dev
psql tetris_dev -f src/migrations/001_create_leaderboard.sql
```

### 3. Configure frontend

```bash
cd frontend
cp .env.example .env.local
# VITE_BACKEND_URL=http://localhost:4000 (default, no change needed)
```

### 4. Run

In separate terminals:

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:3000

---

## Game Controls

| Key | Action |
|---|---|
| ← → | Move |
| ↑ / X | Rotate clockwise |
| Z | Rotate counter-clockwise |
| ↓ | Soft drop |
| Space | Hard drop |
| C | Hold |
| Esc | Pause |

---

## Project Structure

```
tetris-platform/
├── frontend/src/
│   ├── game/engine/        ← Board, physics, scoring, pieces (SRS)
│   ├── game/renderer/      ← Canvas 2D rendering
│   ├── game/input/         ← DAS/ARR keyboard input
│   ├── game/modes/         ← Solo, LocalPvP, OnlinePvP, PvAI
│   ├── ai/                 ← Heuristic + ONNX DQN + Web Worker
│   ├── network/            ← Socket.io client wrapper
│   ├── components/         ← React UI (Menu, Game, Room, Leaderboard)
│   └── hooks/              ← useGame, useLeaderboard
├── backend/src/
│   ├── server.js           ← Express + Socket.io entry point
│   ├── roomManager.js      ← In-memory room state machine
│   ├── socketHandlers.js   ← All WebSocket event handlers
│   ├── leaderboardRouter.js ← REST API (POST score, GET leaderboard)
│   ├── db.js               ← PostgreSQL connection pool
│   ├── backup.js           ← Weekly CSV backup to R2
│   └── migrations/         ← Numbered SQL migration files
└── ai-training/            ← DQN training scripts (Python/PyTorch)
```

---

## Deployment

### Frontend → Cloudflare Pages

1. Connect GitHub repo in Cloudflare Pages dashboard
2. Build command: `cd frontend && npm run build`
3. Output directory: `frontend/dist`
4. Add environment variables: `VITE_BACKEND_URL`, `VITE_R2_MODEL_URL_HARD`, `VITE_R2_MODEL_URL_EXPERT`

### Backend → Render

1. Connect GitHub repo in Render dashboard
2. Root directory: `backend`
3. Build: `npm install` / Start: `node src/server.js`
4. Add environment variables (see `backend/.env.example`)
5. Run migration after first deploy: `npm run migrate`

### Database → Render PostgreSQL (free)

⚠️ **Expires after 90 days** — automated weekly backup to R2 is configured.  
Set a calendar reminder for day 80 to renew or migrate to Neon.

---

## Development Notes

- Server restart clears all rooms (in-memory, by design)
- ONNX AI models are lazy-loaded from R2 only when Hard/Expert is selected
- Full board sync (not delta) for Online PvP — self-correcting on packet loss
- DAS: 167ms · ARR: 33ms · Lock delay: 500ms · Move limit: 15

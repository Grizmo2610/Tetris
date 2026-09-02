# AGENTS.md - Instructions and Context for AI Coding Assistants

Read this file first when working in this repository. It is the shortest reliable summary of the app, the architecture, and the rules that matter during implementation.

## Project Overview

Tetris Platform is a browser-based multiplayer Tetris game supporting Solo, Local PvP, Online PvP, and PvAI modes. The codebase is a monorepo with a React client (Canvas rendering), a Socket.IO relay server, PostgreSQL leaderboard persistence, and a client-side AI module (Heuristic + ONNX DQN).

## Architecture

- `frontend/src/` contains the React app, Canvas game engine, AI module, WebSocket client, and hooks.
- `frontend/src/game/` contains the core game logic — engine, renderer, input, and mode orchestrators.
- `frontend/src/ai/` contains the Heuristic AI, the ONNX Web Worker, and the unified AI controller interface.
- `backend/src/` contains the Express server, Socket.IO handlers, Room Manager, Leaderboard REST API, and PostgreSQL client.
- `backend/src/migrations/` contains numbered SQL migration files.
- `ai-training/` contains the Python DQN training environment and ONNX export scripts.
- `docs/` contains the full design specification — read the relevant file before changing a subsystem.
- `dist/` and `dist-server/` are build outputs, do not edit.

Core flow:

1. The client runs the full game loop locally via `requestAnimationFrame` and Canvas 2D.
2. In Online PvP, the client sends board state to the server after each piece lock.
3. The server relays the update to the opponent in the same room via Socket.IO — it does not validate game physics.
4. The opponent client receives the board state and renders it.
5. Scores are submitted to the server via REST after a game ends and persisted in PostgreSQL.

## Important Rules

- The client is the source of truth for game physics, not the server.
- The server only relays WebSocket events and persists leaderboard data.
- Never run game logic on the server — gravity, collision, line clear, and garbage must stay in `frontend/src/game/engine/`.
- Never send hidden game state (e.g. opponent's next pieces) to the wrong client.
- Public log entries and board state broadcasts must not leak information the receiving client should not see.
- Room state lives in memory only — server restart clears all rooms, this is accepted behavior.
- Always use parameterized queries for PostgreSQL — no string concatenation in SQL.

## Game Logic Notes

- The game engine lives in `frontend/src/game/engine/`.
- Piece definitions and SRS rotation tables live in `frontend/src/game/engine/piece.js`.
- Garbage calculation, combo tracking, T-Spin detection, and All Clear are in `frontend/src/game/engine/scoring.js`.
- Each game mode has its own orchestrator in `frontend/src/game/modes/`.
- If you change a game rule (gravity, garbage table, lock-down timing), update the engine file and the relevant mode orchestrator together, then verify with manual test scenarios in `docs/14-development-plan.md`.
- Garbage conversion values and T-Spin rules follow the Tetris Guideline — do not deviate without explicit instruction.

## AI Notes

- Heuristic AI (Easy/Medium) lives in `frontend/src/ai/heuristic.js` and runs on the main thread.
- ONNX inference (Hard/Expert) runs inside `frontend/src/ai/onnxWorker.js` as a Web Worker — never move it to the main thread.
- Both AI types implement the same `AIController` interface in `frontend/src/ai/aiController.js`.
- The Web Worker has a 2-second timeout — if inference does not return in time, fall back to a random valid placement.
- If the ONNX model fails to load from R2, fall back silently to Medium heuristic and show a toast.

## UI Notes

- UI text must remain Vietnamese unless the task explicitly requires otherwise.
- The game board renders on Canvas — do not replace Canvas rendering with DOM elements for game cells.
- Keep both player boards visible simultaneously in Local PvP and Online PvP without forcing scrolling.
- Validation failures and server errors should surface through toast notifications or the existing error overlay.
- Settings (key bindings, DAS/ARR values) are persisted in `localStorage`.

## Coding Conventions

- Use English for all code identifiers, variable names, and comments.
- Keep comments short and only for non-obvious logic.
- Prefer small functions with one clear responsibility.
- Do not add a new abstraction unless it removes an actual repeated pattern.
- Use `Int8Array` for board state representation, not regular arrays.
- Never use `dangerouslySetInnerHTML`.
- Never concatenate SQL strings — always use `$1, $2, ...` parameterized form.

## Working Rules

- Use `apply_patch` for manual file edits.
- Do not commit unless the user explicitly asks for a commit.
- Do not revert or overwrite unrelated user changes.
- Prefer `rg` for text and file searches.
- Before handing off any change that touches game mechanics, the socket event contract, or the leaderboard schema, run the relevant tests and a production build.
- When adding a new Socket.IO event, update both `backend/src/socketHandlers.js` and `docs/06-api-spec.md`.
- When changing the leaderboard schema, add a new numbered migration file — do not modify existing ones.

## Verification Commands

```bash
# Frontend
cd frontend && npm run build
cd frontend && npm run lint

# Backend
cd backend && npm run build
cd backend && npm run lint

# Run all tests (when test suite exists)
npm run test
```

## Key Files

- `frontend/src/game/engine/board.js` — board state, line clear, garbage application
- `frontend/src/game/engine/piece.js` — tetrimino definitions, SRS rotation tables
- `frontend/src/game/engine/physics.js` — gravity, lock-down, collision
- `frontend/src/game/engine/scoring.js` — score, level, garbage generation, T-Spin, All Clear
- `frontend/src/game/modes/onlinePvpMode.js` — Online PvP game loop and socket integration
- `frontend/src/ai/heuristic.js` — placement enumeration and scoring
- `frontend/src/ai/onnxWorker.js` — Web Worker for ONNX inference
- `frontend/src/network/socketClient.js` — Socket.IO client wrapper
- `backend/src/server.js` — Express + Socket.IO setup, CORS
- `backend/src/roomManager.js` — in-memory room CRUD and lifecycle
- `backend/src/socketHandlers.js` — all Socket.IO event handlers
- `backend/src/leaderboardRouter.js` — REST API for scores
- `backend/src/db.js` — PostgreSQL connection pool
- `backend/src/migrations/001_create_leaderboard.sql`
- `docs/index.md` — full documentation index

## Design Documentation

The `docs/` folder contains the authoritative design for every subsystem. Check the relevant file before changing behavior you did not write:

| Topic | File |
|---|---|
| Game mechanics (gravity, garbage, T-Spin) | `docs/04-game-engine.md` |
| Mode behavior and flows | `docs/05-game-modes.md` |
| WebSocket and REST API contract | `docs/06-api-spec.md` |
| Room lifecycle and disconnect handling | `docs/07-room-manager.md` |
| AI heuristic weights and ONNX worker protocol | `docs/08-ai-design.md` |
| Database schema and backup | `docs/09-data-schema.md` |
| Environment variables and deployment | `docs/10-infrastructure.md` |

## Git Policy

- Keep commits focused on one behavior change.
- Use a descriptive message that reflects what changed and why.
- Follow the existing branch unless the user explicitly asks for a new one.
- Do not commit build outputs, `.env` files, or model weights.
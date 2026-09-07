# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-09-07

### Added
- **Replay System**: Full match replay support across all four game modes (Solo, Local PvP, Online PvP, PvAI).
  - Input log + per-piece-lock keyframe recording for pixel-accurate, deterministic playback.
  - Seek to any point in the match via progress bar or keyboard shortcuts (Space, Home/End, Shift+←/→).
  - Variable playback speed: 0.25×, 0.5×, 1×, 2×, 4×.
  - Step forward/back by 5 seconds.
  - Both player boards rendered simultaneously during playback for two-player modes.
  - Export replay as a `.json` file; re-import from the main menu to watch later.
  - "Watch Replay" and "Download Replay" buttons on the game-over screen.
- **Meta Heuristic AI** (`meta-easy`, `meta-medium`, `meta-hard`, `meta-expert`): Beam Search with N-piece lookahead, 13-feature evaluation, dual weight sets for normal/danger modes, and garbage awareness.
- **Seeded RNG**: `generateSeed()` and `initQueueFromSeed(seed)` added to `piece.js` (Mulberry32 PRNG), ensuring deterministic piece sequences across replay and local multiplayer sessions.

### Fixed
- Player 2 board visual discrepancy in Local PvP and PvAI modes: both boards now use identical rendering code with no opacity or dimming differences.

### Changed
- `initQueue()` in `piece.js` now accepts an optional seed; callers that need deterministic sequences should use `initQueueFromSeed(seed)` instead.

## [0.1.0] - 2026-09-03

### Added
- **Core Game Engine**: Implementation of Tetris Guideline-compliant mechanics, including SRS rotation, DAS/ARR input handling, and garbage system (combo, T-spin, All Clear).
- **Game Modes**: Support for 4 distinct modes: Solo, Local PvP, Online PvP, and PvAI.
- **Real-time Multiplayer**: Room-based PvP via Socket.IO with automatic synchronization and connection handling.
- **AI Integration**:
  - Heuristic-based AI for Easy and Medium difficulty levels.
  - ONNX-based DQN AI for Hard and Expert difficulty levels, utilizing Web Worker for inference.
- **Persistence**: Leaderboard system with REST API using PostgreSQL for score tracking.
- **Infrastructure**:
  - Monorepo architecture with distinct Frontend (React + Vite) and Backend (Node.js + Express) deployments.
  - Automated weekly CSV backups to Cloudflare R2.
- **Deployment**: Full production-ready setup for Cloudflare Pages (Frontend) and Render (Backend + Database).
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

<!-- Improved compatibility of back to top link -->

<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![project_license][license-shield]][license-url]

<br />
<div align="center">
  <a href="https://github.com/Grizmo2610/Tetris">
    <img src="images/logo.svg" alt="Logo" width="80" height="80">
  </a>

<h3 align="center">Tetris Platform</h3>

  <p align="center">
    A real-time multiplayer Tetris game built with React, Vite, JavaScript, and Socket.IO
    <br />
    <a href="docs/index.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/Grizmo2610/Tetris">View Repository</a>
    ·
    <a href="https://github.com/Grizmo2610/Tetris/issues/new?labels=bug&template=bug_report.md">Report Bug</a>
    ·
    <a href="https://github.com/Grizmo2610/Tetris/issues/new?labels=enhancement&template=feature_request.md">Request Feature</a>
  </p>
</div>

---

## About The Project

**Tetris Platform** is a browser-based multiplayer Tetris game where players can compete in real time, challenge an AI opponent, or play solo for a high score. The game runs entirely in the browser with a thin relay server handling room management and leaderboard persistence.

The project is split into a focused monorepo architecture:

1. **React Web Client (`frontend/`)**: Vite + React UI, Canvas 2D game rendering, mode selection, leaderboard, and WebSocket integration.
2. **Socket.IO Server (`backend/`)**: Room lifecycle, disconnect handling, event relay, and Leaderboard REST API.
3. **Game Engine (`frontend/src/game/`)**: All Tetris physics, SRS rotation, garbage mechanic, scoring, and mode orchestrators — runs entirely on the client.
4. **AI Module (`frontend/src/ai/`)**: Heuristic AI (Easy/Medium) and ONNX DQN inference in a Web Worker (Hard/Expert).
5. **Database Layer (`backend/src/migrations/`)**: PostgreSQL schema for persistent leaderboard storage.
6. **Design Documents (`docs/`)**: Architecture, game mechanics, API spec, AI design, and infrastructure notes.
7. **AI Training (`ai-training/`)**: Python DQN training environment and ONNX export scripts.

### Core Features

* **4 Game Modes**: Solo, Local PvP, Online PvP, and PvAI.
* **Real-time Multiplayer**: Rooms sync over Socket.IO with Room Code system.
* **Garbage Mechanic**: Full Tetris Guideline garbage — combo, T-Spin, All Clear, and counter.
* **Disconnect Handling**: 30-second reconnect window with automatic game-over if timed out.
* **AI Opponents**: Four difficulty levels — Heuristic (Easy/Medium) and ONNX DQN in a Web Worker (Hard/Expert).
* **Persistent Leaderboard**: Top scores per mode stored in PostgreSQL.
* **Zero Cost Hosting**: Cloudflare Pages + Render free tier + Cloudflare R2.

<p align="center">
  <img src="images/screenshot.png" alt="Tetris Platform screenshot" />
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Documentation

Explore the current documentation set:

* [Overview & Architecture](docs/01-overview.md)
* [Architecture Diagram](docs/02-architecture.md)
* [Technology Stack](docs/03-tech-stack.md)
* [Game Engine](docs/04-game-engine.md)
* [Game Modes](docs/05-game-modes.md)
* [API Specification](docs/06-api-spec.md)
* [Room Manager](docs/07-room-manager.md)
* [AI Design](docs/08-ai-design.md)
* [Data Schema](docs/09-data-schema.md)
* [Infrastructure](docs/10-infrastructure.md)
* [Reliability](docs/11-reliability.md)
* [Security](docs/12-security.md)
* [Observability](docs/13-observability.md)
* [Development Plan](docs/14-development-plan.md)
* [Architecture Decision Records](docs/15-adr.md)
* [Performance](docs/16-performance.md)
* [Developer Quick Start](docs/17-developer-quickstart.md)
* [Changelog](CHANGELOG.md)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Built With

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/React-18%2B-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.IO-Realtime-black?style=for-the-badge&logo=socketdotio&logoColor=white" />
  <img src="https://img.shields.io/badge/Canvas API-Game Rendering-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/ONNX Runtime Web-AI Inference-005CED?style=for-the-badge" />
  <img src="https://img.shields.io/badge/PostgreSQL-Leaderboard-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Cloudflare Pages-Hosting-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Getting Started & Installation

### Prerequisites

* Node.js 20 LTS
* npm 9+
* PostgreSQL 14+ (local development)
* Python 3.10+ (AI training only)

### Clone the Repository

```sh
git clone https://github.com/Grizmo2610/Tetris.git
cd tetris-platform
```

### Install Dependencies

```sh
cd frontend && npm install
cd ../backend && npm install
```

### Run the Development Client

```sh
cd frontend
npm run dev
```

### Run the Development Server

In a separate terminal:

```sh
cd backend
npm run dev
```

### Build for Production

```sh
cd frontend && npm run build
cd ../backend && npm run build
```

### Run the Production Server

After building the project:

```sh
cd backend
npm start
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Usage

### Game Flow

1. **Home Screen** — Choose Solo, Local PvP, Online PvP, or PvAI.
2. **Room Setup** — For Online PvP: create a room and share the 4-character code, or join with an existing code.
3. **Gameplay** — Place pieces, clear lines, and send garbage to your opponent.
4. **AI Opponent** — For PvAI: select a difficulty level; Hard/Expert loads an ONNX model from the CDN on first use.
5. **Game Over** — View results, submit your score to the leaderboard, or rematch in the same room.

### Development Flow

1. Update the game engine in `frontend/src/game/engine/` if the rule changes.
2. Update the relevant mode orchestrator in `frontend/src/game/modes/`.
3. If the Socket.IO event contract changes, update both `backend/src/socketHandlers.js` and `docs/06-api-spec.md`.
4. Build and verify.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Roadmap

* [ ] Phase 1 — Solo game engine (Canvas, SRS rotation, DAS/ARR)
* [ ] Phase 2 — Local PvP and full garbage mechanic
* [ ] Phase 3 — Online PvP via Socket.IO and Room Code
* [ ] Phase 4 — Leaderboard (PostgreSQL)
* [ ] Phase 5 — Heuristic AI (Easy / Medium)
* [ ] Phase 6 — ONNX DQN AI (Hard / Expert)
* [ ] Phase 7 — Polish and production deploy

See the [open issues](https://github.com/Grizmo2610/Tetris/issues) for a full list of proposed improvements and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contact

Project Link: [https://github.com/Grizmo2610/Tetris](https://github.com/Grizmo2610/Tetris)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Acknowledgments

* Tetris Guideline for game mechanics reference
* React, Vite, Socket.IO, and onnxruntime-web communities
* Kaggle for free GPU compute used in AI training

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

[contributors-shield]: https://img.shields.io/github/contributors/Grizmo2610/Tetris.svg?style=for-the-badge
[contributors-url]: https://github.com/Grizmo2610/Tetris/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Grizmo2610/Tetris.svg?style=for-the-badge
[forks-url]: https://github.com/Grizmo2610/Tetris/network/members
[stars-shield]: https://img.shields.io/github/stars/Grizmo2610/Tetris.svg?style=for-the-badge
[stars-url]: https://github.com/Grizmo2610/Tetris/stargazers
[issues-shield]: https://img.shields.io/github/issues/Grizmo2610/Tetris.svg?style=for-the-badge
[issues-url]: https://github.com/Grizmo2610/Tetris/issues
[license-shield]: https://img.shields.io/github/license/Grizmo2610/Tetris.svg?style=for-the-badge
[license-url]: https://github.com/Grizmo2610/Tetris/blob/main/LICENSE
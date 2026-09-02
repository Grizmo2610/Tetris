# 02 — Architecture

---

## Style: Modular Monolith + Thin Relay Server

Server cực kỳ đơn giản — chỉ relay WebSocket events và lưu leaderboard. Không có server-side game logic, không có server-side AI.

---

## Sơ đồ hệ thống

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                       │
│                                                              │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────┐  │
│  │  Game Engine │  │    AI Module      │  │  UI / React  │  │
│  │  (Canvas)    │  │  ┌─────────────┐  │  │  Components  │  │
│  │              │  │  │ Heuristic   │  │  │              │  │
│  │  - Board     │  │  │ Easy/Medium │  │  │  - Menu      │  │
│  │  - Pieces    │  │  ├─────────────┤  │  │  - Game UI   │  │
│  │  - Physics   │  │  │ ONNX Worker │  │  │  - Leaderbd  │  │
│  │  - Scoring   │  │  │ Hard/Expert │  │  │  - Room UI   │  │
│  │  - Garbage   │  │  └─────────────┘  │  │              │  │
│  └──────┬───────┘  └───────────────────┘  └──────────────┘  │
│         │                                                     │
│  ┌──────▼──────────────────────────────────────────────────┐ │
│  │              WebSocket Client (Socket.io)                │ │
│  │              REST Client (fetch API)                    │ │
│  └──────────────────────┬────────────────────────────────--┘ │
└─────────────────────────│────────────────────────────────────┘
                          │ WSS / HTTPS
┌─────────────────────────▼────────────────────────────────────┐
│                    BACKEND (Render)                           │
│                                                              │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Socket.io    │  │  Room Manager    │  │  Leaderboard │  │
│  │  Server       │  │  (in-memory)     │  │  REST API    │  │
│  │               │  │                  │  │              │  │
│  │  - Event bus  │  │  - CRUD rooms    │  │  GET scores  │  │
│  │  - Heartbeat  │  │  - Disconnect    │  │  POST score  │  │
│  │  - Reconnect  │  │    timers        │  │              │  │
│  └──────┬────────┘  └──────┬───────────┘  └──────┬───────┘  │
│         └──────────────────┴─────────────────────┘          │
│                            │                                 │
│  ┌─────────────────────────▼────────────────────────────┐   │
│  │                   Express.js App                      │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬──────────────────────────┘
                                    │ TCP (pg driver)
┌───────────────────────────────────▼──────────────────────────┐
│              DATABASE — PostgreSQL (Render free)              │
│              Leaderboard entries (persistent)                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              Cloudflare R2 (Object Storage)                  │
│              ONNX model file (~300–500KB)                    │
│              Leaderboard CSV backups                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Responsibilities từng Component

### Client — Game Engine

**Nơi:** `frontend/src/game/engine/`

Chịu trách nhiệm **toàn bộ game logic** — server không biết và không quan tâm đến physics:

- Board state (10×20 grid), collision detection
- Piece rotation (SRS — Super Rotation System)
- Gravity, soft drop, hard drop
- Lock-down timer (piece không bị lock ngay khi chạm đất)
- Line clear detection và animation trigger
- Garbage generation (tính toán số garbage dựa trên lines cleared, T-Spin, combo, All Clear)
- Pending garbage accumulation và placement
- Score và level progression
- 60fps game loop qua `requestAnimationFrame`

Không có server-side validation cho physics. Nếu client gửi board state sai → đó là UI bug, không phải cheating (nhóm bạn bè).

---

### Client — AI Module

**Nơi:** `frontend/src/ai/`

Hai sub-systems hoạt động độc lập:

**Heuristic AI (Easy/Medium):**
- Enumerate tất cả possible placements cho piece hiện tại (và piece tiếp theo cho lookahead).
- Score mỗi placement bằng heuristic function (aggregate height, holes, bumpiness, lines cleared).
- Chọn placement có score cao nhất.
- Easy: chỉ lookahead 1 piece, thỉnh thoảng random error.
- Medium: lookahead 2 pieces, ít error hơn.

**ONNX DQN (Hard/Expert):**
- Lazy load model file từ Cloudflare R2 khi người dùng chọn Hard/Expert.
- Chạy inference trong Web Worker (thread riêng biệt).
- Main thread gửi board state → Worker trả về action qua `postMessage`.
- Timeout 2 giây: nếu inference không trả về trong 2s → fallback random valid placement.

AI module hoàn toàn không cần network sau khi model đã load.

---

### Client — WebSocket Client

**Nơi:** `frontend/src/network/socketClient.js`

Wrapper mỏng quanh Socket.io client:

- Connect/disconnect lifecycle
- Gửi `game-update` sau mỗi piece lock (board state + garbage info)
- Nhận `opponent-update` và đẩy vào game engine của opponent panel
- Xử lý disconnect events (hiển thị countdown UI)
- Auto-reconnect (Socket.io built-in, exponential backoff)
- Reconnect identification: gửi `{ roomCode, nickname, previousSocketId }` khi reconnect

---

### Backend — Socket.io Server

**Nơi:** `backend/src/server.js` + `socketHandlers.js`

Không có game logic — chỉ relay:

- Nhận event từ Player A, emit đến Player B trong cùng room
- Detect disconnect qua heartbeat timeout (~45s worst case)
- Trigger disconnect timer (30s countdown) và notify player còn lại
- Nếu reconnect trong 30s: clear timer, notify `opponent-reconnected`
- Nếu timer hết: emit `game-over` cho player còn lại

---

### Backend — Room Manager

**Nơi:** `backend/src/roomManager.js`

In-memory, single-process:

- Generate room code (4 ký tự alphanumeric, unique)
- CRUD rooms với state machine: `waiting` → `in-game` → `finished`
- Lưu player info: `{ socketId, previousSocketId, nickname, connected }`
- **Global interval sweep** mỗi 60 giây: xóa rooms đã ở trạng thái `waiting` quá 10 phút
- Disconnect timer lưu trong room object, clear khi reconnect

Xem chi tiết: [07-room-manager.md](./07-room-manager.md)

---

### Backend — Leaderboard API

**Nơi:** `backend/src/leaderboardRouter.js`

REST endpoints đơn giản:

- `POST /api/scores` — ghi entry mới
- `GET /api/leaderboard` — trả top N theo mode

Không có auth hiện tại. Rate limiting thêm khi mở public.

---

### Database — PostgreSQL

**Nơi:** Render PostgreSQL free tier

Chỉ lưu leaderboard entries. Không lưu room state, không lưu session.

Schema xem: [09-data-schema.md](./09-data-schema.md)

---

### Cloudflare R2

Lưu 2 loại file:

1. **ONNX model** (`tetris-ai.onnx`, ~300–500KB) — serve qua public URL với CORS
2. **Leaderboard CSV backups** (`backups/leaderboard-YYYY-MM-DD.csv`) — private bucket

---

## Communication Patterns

| Luồng | Protocol | Sync/Async | Ghi chú |
|---|---|---|---|
| Client ↔ Backend (game) | WebSocket (Socket.io) | Async | Event-driven |
| Client → Backend (post score) | REST HTTP POST | Sync | Sau khi ván kết thúc |
| Client → Backend (view leaderboard) | REST HTTP GET | Sync | On-demand |
| Client → R2 (load ONNX) | HTTPS GET | Sync (one-time) | Lazy, chỉ khi chọn Hard/Expert |
| Backend → PostgreSQL | TCP (pg driver) | Sync (pool) | Connection pool |
| Backend → R2 (backup) | HTTPS PUT | Async (scheduled) | Weekly cron |

---

## Capacity Planning

### Hiện tại (5–20 concurrent users)

| Metric | Ước tính |
|---|---|
| WebSocket connections | 10–20 |
| Active rooms | 2–10 |
| Messages/giây | ~20–50 msg/s |
| Message size | ~500–800 bytes |
| Network bandwidth server | ~40KB/s |
| RAM sử dụng (Node.js) | ~100–150MB |

Render free tier (0.1 vCPU, 512MB RAM) **đủ**.

### Khi mở public (~100 users)

| Metric | Ước tính |
|---|---|
| WebSocket connections | 100 |
| Messages/giây | ~100–250 msg/s |
| Network bandwidth server | ~200KB/s |
| RAM sử dụng | ~300–400MB |

Cần upgrade Render Starter ($7/tháng, 512MB dedicated). Vẫn single instance.

### Architectural threshold

Vượt ~500 concurrent users → cần Redis cho shared room state + horizontal scaling. Đây là redesign đáng kể, không phải upgrade đơn giản.

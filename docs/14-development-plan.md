# 14 — Development Plan

---

## Tổng quan

7 phases, ước tính ~9 tuần. Mỗi phase deliverable một feature hoàn chỉnh, playable.

```
Week  1   2   3   4   5   6   7   8   9
      ├───┤   │   │   │   │   │   │   │
P1    [Game Engine Core        ]
P2        [Local PvP + Garbage ]
P3              [Backend + Online PvP      ]
P4                          [Leaderboard]
P5                              [Heuristic AI]
P6                                  [ONNX AI   ]
P7                                          [Polish]
```

---

## Phase 1 — Game Engine Core

**Tuần:** 1–2  
**Objective:** Tetris chơi được offline trong browser.

### Deliverables

- [ ] Board state management (10×20 grid)
- [ ] 7 tetrimino definitions với spawn positions
- [ ] SRS rotation system với wall kick tables
- [ ] Gravity system (bảng chuẩn Guideline)
- [ ] Extended Placement Lock Down (500ms delay, 15 move limit)
- [ ] Line clear detection và row drop
- [ ] Scoring (single/double/triple/Tetris × level)
- [ ] Level progression (mỗi 10 lines)
- [ ] 7-bag random generator
- [ ] Hold piece
- [ ] Ghost piece
- [ ] Hard drop / Soft drop
- [ ] Canvas renderer: board, pieces, ghost, next piece queue
- [ ] Input handler: DAS/ARR, configurable key mapping
- [ ] Solo game loop (requestAnimationFrame)
- [ ] Game over detection (Top Out)
- [ ] Pause/resume

### Files tạo trong phase này

```
frontend/src/game/engine/board.js
frontend/src/game/engine/piece.js
frontend/src/game/engine/physics.js
frontend/src/game/engine/scoring.js
frontend/src/game/renderer/boardRenderer.js
frontend/src/game/renderer/uiRenderer.js
frontend/src/game/input/inputHandler.js
frontend/src/game/modes/soloMode.js
frontend/src/utils/constants.js
frontend/src/components/Game/GameScreen.jsx
frontend/src/components/Menu/MainMenu.jsx
```

### Validation

**Test thủ công:**
- Chơi ván Tetris solo hoàn chỉnh đến Top Out
- Kiểm tra rotation đúng cho tất cả 7 pieces
- Kiểm tra wall kick: thử xoay I-piece ở cạnh board
- Kiểm tra DAS/ARR: giữ → sau, phải
- Kiểm tra level tăng sau 10 lines
- Kiểm tra hold piece (chỉ dùng được 1 lần per piece)
- Kiểm tra ghost piece cập nhật theo move

**Score sanity check:**
- Tetris (4 lines) ở level 1 = 800 điểm
- Soft drop 5 cells = +5 điểm
- Hard drop từ top = +38 điểm (~19 cells × 2)

---

## Phase 2 — Local PvP + Garbage Mechanic

**Tuần:** 2–3  
**Dependencies:** Phase 1 hoàn thành  
**Objective:** Hai người chơi cùng máy, garbage mechanic đúng.

### Deliverables

- [ ] Garbage calculation (conversion table đầy đủ)
- [ ] Combo tracking và garbage
- [ ] T-Spin detection (3-corner rule)
- [ ] T-Spin garbage bonus
- [ ] All Clear detection và bonus
- [ ] Counter mechanic (offset garbage với garbage gửi đi)
- [ ] Pending garbage display (thanh đỏ bên cạnh board)
- [ ] Garbage application khi piece spawn (consistent column)
- [ ] Garbage line visual (màu xám, 1 ô trống)
- [ ] Local PvP mode (2 boards, 2 input sets)
- [ ] Kết quả khi một bên Top Out
- [ ] Rematch local

### Files tạo

```
frontend/src/game/modes/localPvpMode.js
```

### Files cập nhật

```
frontend/src/game/engine/board.js    ← thêm garbage apply
frontend/src/game/engine/scoring.js  ← thêm garbage generation
frontend/src/game/renderer/uiRenderer.js ← thêm garbage bar
frontend/src/components/Menu/ModeSelect.jsx
```

### Validation

**Test garbage scenarios (bắt buộc verify từng cái):**

| Action | Expected garbage |
|---|---|
| Double | 1 line |
| Triple | 2 lines |
| Tetris | 4 lines |
| T-Spin Single | 2 lines |
| T-Spin Double | 4 lines |
| Combo 3 (3 clears liên tiếp) | 1 + 1 + 1 = 3 lines tổng |
| All Clear sau Tetris | 4 + 10 = 14 lines |
| Counter: gây 4 garbage, đang có 2 pending | Net sent = 2, pending = 0 |

Dùng hai tab console để verify garbage đang gửi và nhận đúng.

---

## Phase 3 — Backend + Online PvP

**Tuần:** 3–5  
**Dependencies:** Phase 1, 2 hoàn thành  
**Objective:** Online PvP qua WebSocket.

### Deliverables

**Backend:**
- [ ] Express server setup với CORS
- [ ] Socket.io server
- [ ] Room Manager (tạo, join, delete, TTL cleanup)
- [ ] Socket event handlers: create-room, join-room, game-update, game-over, rematch
- [ ] Disconnect handling (30s timer)
- [ ] Reconnect flow (previousSocketId verification)
- [ ] `/health` endpoint
- [ ] Structured logging

**Frontend:**
- [ ] Socket.io client wrapper
- [ ] Online PvP mode
- [ ] Room creation UI (hiển thị code)
- [ ] Room join UI (input code)
- [ ] Opponent board display (render received board state)
- [ ] Disconnect overlay (countdown timer)
- [ ] Rematch flow

### Files tạo

```
backend/src/server.js
backend/src/roomManager.js
backend/src/socketHandlers.js
backend/src/db.js               ← setup pool (chưa dùng đến phase 4)
backend/package.json

frontend/src/network/socketClient.js
frontend/src/game/modes/onlinePvpMode.js
frontend/src/components/Room/CreateRoom.jsx
frontend/src/components/Room/JoinRoom.jsx
frontend/src/components/Game/DisconnectOverlay.jsx
```

### Validation

Test với 2 browser windows (hoặc 2 thiết bị):
- [ ] A tạo phòng → nhận code ABCD
- [ ] B join với code ABCD → cả hai vào game
- [ ] A đặt piece → B thấy board A cập nhật
- [ ] A gây garbage → B nhận garbage đúng số dòng
- [ ] B disconnect → A thấy countdown 30s
- [ ] B reconnect trong 30s → game tiếp tục
- [ ] B không reconnect → A thắng sau 30s
- [ ] B Top Out → A thắng, cả hai thấy game over screen
- [ ] Cả hai bấm Rematch → game mới bắt đầu
- [ ] Chỉ A bấm Rematch → A thấy "Waiting for opponent..."

---

## Phase 4 — Leaderboard

**Tuần:** 5  
**Dependencies:** Phase 3 (backend đã có)  
**Objective:** Lưu và hiển thị điểm số persistent.

### Deliverables

- [ ] PostgreSQL migration: `001_create_leaderboard.sql`
- [ ] `leaderboardRouter.js`: POST /api/scores, GET /api/leaderboard
- [ ] Input validation cho score payload
- [ ] Connection pooling với pg-pool
- [ ] Retry logic cho failed writes (3×)
- [ ] `useLeaderboard` hook (fetch và post)
- [ ] Leaderboard screen UI (tab: Solo / PvP / PvAI)
- [ ] Score submission sau mỗi ván
- [ ] Hiển thị rank, nickname, score, lines, level, timestamp

### Files tạo

```
backend/src/leaderboardRouter.js
backend/src/migrations/001_create_leaderboard.sql

frontend/src/hooks/useLeaderboard.js
frontend/src/components/Leaderboard/LeaderboardScreen.jsx
```

### Validation

- [ ] Chơi ván Solo → score xuất hiện trên leaderboard
- [ ] Chơi PvP → cả hai scores xuất hiện (winner/loser rõ ràng)
- [ ] Leaderboard đúng thứ tự (cao nhất trên đầu)
- [ ] Filter theo mode hoạt động
- [ ] DB restart không mất data
- [ ] Nếu POST fail → toast hiển thị, không crash app

---

## Phase 5 — Heuristic AI

**Tuần:** 6  
**Dependencies:** Phase 2 (garbage mechanic), Phase 4 (leaderboard)  
**Objective:** PvAI với Easy/Medium bot.

### Deliverables

- [ ] Placement enumeration (tất cả rotation × column combos)
- [ ] Heuristic scoring (aggregate height, holes, bumpiness, lines)
- [ ] 1-piece lookahead (Easy)
- [ ] 2-piece lookahead (Medium)
- [ ] Error injection (30% Easy, 10% Medium)
- [ ] AI action timing với think delay và move delay
- [ ] PvAI mode orchestrator
- [ ] AI controller interface (unified cho cả Heuristic và ONNX)
- [ ] Difficulty selection UI

### Files tạo

```
frontend/src/ai/heuristic.js
frontend/src/ai/aiController.js
frontend/src/game/modes/pvAiMode.js
```

### Validation

- [ ] Easy AI chơi được, không crash, đặt pieces hợp lý
- [ ] Medium AI rõ ràng chơi tốt hơn Easy (ít holes hơn, survive lâu hơn)
- [ ] AI gây garbage sang người chơi khi clear multiple lines
- [ ] Người chơi thắng được Easy nhưng khó thắng Medium

---

## Phase 6 — ONNX AI

**Tuần:** 7–8+  
**Dependencies:** Phase 5, training environment sẵn sàng  
**Objective:** Hard/Expert bot qua DQN model.

### Sub-phase 6a: Training Environment

- [ ] Custom Tetris Gym environment (Python)
- [ ] Board state → feature vector (224 dims)
- [ ] Action space: 40 (4 rotations × 10 columns)
- [ ] Reward function
- [ ] DQN agent với experience replay
- [ ] W&B integration cho monitoring

### Sub-phase 6b: Training

- [ ] Train trên Kaggle T4 GPU
- [ ] Save checkpoint mỗi 5000 episodes
- [ ] Hard checkpoint: ~30k episodes
- [ ] Expert checkpoint: ~50k episodes
- [ ] Benchmark: Hard vs Medium heuristic (Hard phải thắng >70% games)

### Sub-phase 6c: Export & Integration

- [ ] Export ONNX (opset 17)
- [ ] Quantize INT8
- [ ] Upload lên Cloudflare R2
- [ ] Web Worker (`onnxWorker.js`)
- [ ] `postMessage` protocol (INIT, INFER, RESULT)
- [ ] Timeout handler (2s → fallback)
- [ ] Lazy loading với loading indicator
- [ ] Fallback khi R2 unavailable

### Validation

- [ ] Hard bot load thành công từ R2
- [ ] Inference không block game loop (verify bằng FPS counter)
- [ ] Hard bot rõ ràng khó hơn Medium
- [ ] Expert bot gần như không thua khi đánh nhau với Medium
- [ ] Timeout fallback hoạt động (test bằng cách mock Worker delay)
- [ ] R2 unavailable fallback hoạt động (test bằng cách sai URL)

---

## Phase 7 — Polish & Deploy

**Tuần:** 8–9  
**Dependencies:** Tất cả phases trước  
**Objective:** Production-ready, deploy lên Cloudflare Pages + Render.

### Deliverables

**Infrastructure:**
- [ ] Backend deploy lên Render (CI/CD từ GitHub)
- [ ] Frontend deploy lên Cloudflare Pages (CI/CD từ GitHub)
- [ ] Environment variables configured
- [ ] UptimeRobot setup
- [ ] Automated backup script (node-cron + R2)
- [ ] CORS configured đúng

**Reliability:**
- [ ] React Error Boundaries cho Game và Leaderboard
- [ ] Retry logic cho leaderboard writes
- [ ] ONNX fallback flow
- [ ] Unhandled promise rejection logging

**UX Polish:**
- [ ] Loading states (ONNX load, leaderboard fetch)
- [ ] Toast notifications (score saved, error messages)
- [ ] Smooth transitions giữa screens
- [ ] Mobile-friendly menu (không cần mobile gameplay)
- [ ] Key bindings settings screen
- [ ] Sound effects (optional, low priority)

**Documentation:**
- [ ] README.md với setup instructions
- [ ] `.env.example` đầy đủ

### Validation

**Full flow test:**
- [ ] Từ localhost: `npm install` + `npm run dev` → game chạy trong 2 phút
- [ ] Deploy production → tất cả modes hoạt động
- [ ] Leaderboard data persist qua server restart
- [ ] UptimeRobot trigger sau khi manually stop server
- [ ] Backup script chạy thành công → CSV trong R2

---

## Dependency Graph

```
Phase 1 (Game Engine)
    │
    ├── Phase 2 (Garbage Mechanic)
    │       │
    │       ├── Phase 3 (Backend + Online PvP)
    │       │       │
    │       │       └── Phase 4 (Leaderboard)
    │       │               │
    │       │               └── Phase 7 (Deploy)
    │       │
    │       └── Phase 5 (Heuristic AI)
    │               │
    │               └── Phase 6 (ONNX AI)
    │                       │
    │                       └── Phase 7 (Deploy)
    │
    └── [Phase 3 cũng cần Phase 1 cho game logic]
```

Phase 4 và Phase 5 có thể chạy song song nếu có 2 người.

---

## Risk Buffer

| Phase | Estimated | Buffer | Total |
|---|---|---|---|
| P1 Game Engine | 10 ngày | 2 ngày | 12 ngày |
| P2 Local PvP | 7 ngày | 2 ngày | 9 ngày |
| P3 Backend + Online PvP | 12 ngày | 3 ngày | 15 ngày |
| P4 Leaderboard | 5 ngày | 1 ngày | 6 ngày |
| P5 Heuristic AI | 7 ngày | 2 ngày | 9 ngày |
| P6 ONNX AI | 14 ngày | 5 ngày | 19 ngày |
| P7 Polish + Deploy | 7 ngày | 2 ngày | 9 ngày |
| **Total** | **62 ngày** | **17 ngày** | **~79 ngày** |

~11 tuần với buffer. Target 9 tuần nếu không có blockers lớn.

**Biggest risk:** Phase 6 (ONNX AI) — training DQN có thể mất nhiều thời gian hơn dự kiến. Mitigation: ship Phase 5 (Heuristic AI) trước, Phase 6 là optional enhancement.

# 05 — Game Modes

---

## Solo Mode

### Mục tiêu
Người chơi chơi đến khi thua (Top Out). Mục tiêu: đạt điểm cao nhất.

### Luồng

```
Menu → Nhập nickname → Chọn Solo → Game bắt đầu
→ Chơi đến khi Top Out
→ Màn hình kết quả (score, lines, level, time)
→ POST score lên leaderboard
→ Options: Play Again / Main Menu
```

### Đặc điểm

- Không có đối thủ → không có garbage nhận vào
- Không có garbage gửi đi (không cần tính)
- Score được submit lên leaderboard với `mode: 'solo'`
- Không có giới hạn thời gian

### State

```javascript
SoloState {
  board: number[24][10],
  activePiece: Piece,
  nextPieces: Piece[5],       // 5 lookahead
  holdPiece: Piece | null,
  holdUsed: boolean,
  score: number,
  lines: number,
  level: number,
  combo: number,
  status: 'playing' | 'paused' | 'game_over'
}
```

---

## Local PvP Mode

### Mục tiêu
Hai người chơi trên cùng một máy tính, mỗi người một nửa bàn phím.

### Luồng

```
Menu → Nhập nickname P1 + P2 → Chọn Local PvP → Game bắt đầu
→ Chơi đồng thời với 2 board riêng
→ Khi một bên Top Out → Màn hình kết quả
→ POST score cả hai lên leaderboard
→ Options: Rematch / Main Menu
```

### Key Mapping

| Action | Player 1 | Player 2 |
|---|---|---|
| Move left | A | ← |
| Move right | D | → |
| Soft drop | S | ↓ |
| Hard drop | W | ↑ |
| Rotate CW | E | Numpad 1 |
| Rotate CCW | Q | Numpad 3 |
| Hold | R | Numpad 0 |

Key bindings configurable trong settings (lưu vào localStorage).

### Layout UI

```
┌──────────────┬──────────────┐
│  Player 1    │  Player 2    │
│  Board       │  Board       │
│              │              │
│  Score: XXX  │  Score: XXX  │
│  Level: X    │  Level: X    │
└──────────────┴──────────────┘
```

Garbage bar hiển thị bên trong mỗi board (không shared).

### Garbage flow

Garbage từ P1 → P2 và ngược lại. Counter mechanic áp dụng độc lập cho mỗi board. Garbage apply khi piece mới spawn (không phải realtime).

### State

Hai `SoloState` instance chạy song song trong cùng game loop. Shared clock (cùng `requestAnimationFrame`).

---

## Online PvP Mode

### Mục tiêu
Hai người chơi qua internet, mỗi người một thiết bị.

### Luồng đầy đủ

```
Player A                          Server                        Player B
   │                                 │                              │
   │ Nhập nickname                   │                              │
   │ Chọn "Create Room"              │                              │
   ├──── create-room ───────────────►│                              │
   │◄─── room-created { code: ABCD } │                              │
   │ Hiển thị code ABCD              │                              │
   │ (waiting for opponent...)       │                              │
   │                                 │     Nhập nickname            │
   │                                 │     Chọn "Join Room"         │
   │                                 │◄─── join-room { ABCD } ──────│
   │◄─── room-joined ────────────────│─── room-joined ─────────────►│
   │     { opponentNickname: B }     │   { opponentNickname: A }    │
   │                                 │                              │
   │         [COUNTDOWN 3-2-1]       │                              │
   │                                 │                              │
   │         [GAME IN PROGRESS]      │                              │
   │                                 │                              │
   ├── game-update ─────────────────►│─── opponent-update ─────────►│
   │   { board, garbage }           │                              │
   │◄── opponent-update ─────────────│◄── game-update ──────────────│
   │                                 │                              │
   │         [B TOP OUT]             │                              │
   │                                 │◄── game-over { loser: B } ───│
   │◄── game-over { winner: A } ─────│                              │
   │                                 │                              │
   │         [REMATCH SCREEN]        │                              │
   ├── rematch-ready ───────────────►│                              │
   │                                 │◄── rematch-ready ────────────│
   │◄── rematch-start ───────────────┤─── rematch-start ───────────►│
```

### game-update payload

Gửi **sau mỗi piece lock**:

```javascript
{
  board: number[200],       // 24×10 flattened, chỉ visible 20 rows
  garbageSent: number,      // garbage đang gửi lần này
  linesCleared: number,     // để opponent hiển thị animation
  combo: number             // để hiển thị combo counter trên opponent
}
```

Full board sync, không phải delta. Nếu một message bị mất → message tiếp theo tự correct board.

### Disconnect Handling

```
B disconnect
    │
    ├─ Server emit → A: opponent-disconnected { timeoutSeconds: 30 }
    │  A hiển thị: "Opponent disconnected (29s...)"
    │
    ├─ Server set disconnect timer 30s
    │
    ├─ [Nếu B reconnect trong 30s]
    │   Server emit → A: opponent-reconnected
    │   A ẩn overlay, game tiếp tục
    │
    └─ [Nếu timer hết]
        Server emit → A: game-over { winner: A, reason: 'disconnect' }
```

### Reconnect Identification

Khi B reconnect sau disconnect, B gửi:

```javascript
{
  roomCode: 'ABCD',
  nickname: 'PlayerB',
  previousSocketId: 'abc123'   // socketId cũ, lưu trong localStorage
}
```

Server verify `previousSocketId` tồn tại trong room state. Nếu match → cho reconnect, clear timer, notify opponent.

**Edge case:** Nếu có người khác join với cùng nickname trong 30s → kiểm tra `previousSocketId`, không match → reject join với `room-error: 'Room is occupied, reconnect only'`.

### Rematch

- Sau `game-over`, cả hai thấy màn hình kết quả với nút "Rematch"
- Bấm "Rematch" → emit `rematch-ready`
- Server đợi cả hai `rematch-ready` → emit `rematch-start`
- Room state reset, game bắt đầu lại (không cần tạo room mới)
- Nếu chỉ một người bấm → hiển thị "Waiting for opponent..." và nút "Leave"

---

## PvAI Mode

### Mục tiêu
Người chơi đấu với AI bot. Không cần network.

### AI levels

| Level | AI type | Mô tả |
|---|---|---|
| Easy | Heuristic | Tìm valid move, đôi khi sai ngẫu nhiên (30% error rate) |
| Medium | Heuristic | Chơi tốt, ít sai (10% error rate), lookahead 2 piece |
| Hard | ONNX DQN | Model DQN, lazy load từ R2 |
| Expert | ONNX DQN | Model DQN trained lâu hơn / fine-tuned cho aggressive play |

### Luồng

```
Menu → Chọn PvAI → Chọn AI level
→ [Nếu Hard/Expert: load ONNX model từ R2]
→ Game bắt đầu
→ AI tự động chơi board bên phải
→ Khi một bên thua → Màn hình kết quả
→ POST score lên leaderboard (mode: 'pvai', result: win/loss)
→ Options: Rematch / Change Difficulty / Main Menu
```

### AI action timing

AI không chơi theo kiểu "instant" — thêm delay giả để tạo cảm giác tự nhiên:

| Level | Think delay | Move delay |
|---|---|---|
| Easy | 500ms | 200ms/move |
| Medium | 300ms | 150ms/move |
| Hard | 200ms | 100ms/move |
| Expert | 100ms | 50ms/move |

"Think delay" là khoảng nghỉ sau khi piece spawn trước khi AI bắt đầu ra quyết định. "Move delay" là delay giữa mỗi move (di chuyển ngang, rotation) để animation có thể thấy được.

### ONNX model loading

```javascript
// Khi người dùng chọn Hard/Expert
async function loadAIModel() {
  showToast('Loading AI model...')
  try {
    const response = await fetch(VITE_R2_MODEL_URL)
    const modelBuffer = await response.arrayBuffer()
    const session = await ort.InferenceSession.create(modelBuffer)
    onnxWorker.postMessage({ type: 'init', session })
    hideToast()
  } catch (error) {
    showToast('AI model unavailable, falling back to Medium difficulty')
    fallbackToHeuristic()
  }
}
```

Nếu R2 không available → fallback về Medium heuristic, thông báo cho người dùng.

### Layout UI

Giống Local PvP nhưng board bên phải là AI. Hiển thị "AI (Hard)" hoặc "AI (Expert)" thay nickname.

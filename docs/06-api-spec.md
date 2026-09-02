# 06 — API Specification

---

## REST API

Base URL: `https://<render-app>.onrender.com`

Tất cả responses là JSON. Tất cả requests cần `Content-Type: application/json` với POST.

---

### `GET /health`

Health check endpoint. Dùng bởi UptimeRobot và frontend để verify server alive.

**Response 200:**
```json
{
  "status": "ok",
  "rooms": 3,
  "connections": 6,
  "uptime": 3600
}
```

| Field | Type | Mô tả |
|---|---|---|
| `status` | string | Luôn `"ok"` nếu server chạy |
| `rooms` | number | Số rooms đang active |
| `connections` | number | Số WebSocket connections hiện tại |
| `uptime` | number | Seconds kể từ khi server start |

---

### `POST /api/scores`

Ghi score sau khi ván kết thúc. Gọi từ client, không cần auth (hiện tại).

**Request body:**
```json
{
  "nickname": "PlayerA",
  "score": 45200,
  "mode": "solo",
  "lines": 87,
  "level": 9,
  "result": null,
  "opponent": null
}
```

| Field | Type | Required | Validation | Mô tả |
|---|---|---|---|---|
| `nickname` | string | ✓ | 1–32 ký tự, strip whitespace | Tên người chơi |
| `score` | number | ✓ | integer ≥ 0 | Điểm số |
| `mode` | string | ✓ | `"solo"` \| `"pvp"` \| `"pvai"` | Chế độ chơi |
| `lines` | number | ✓ | integer ≥ 0 | Số dòng đã xóa |
| `level` | number | ✓ | integer ≥ 1 | Level khi kết thúc |
| `result` | string \| null | ✗ | `"win"` \| `"loss"` \| null | Chỉ dùng cho pvp/pvai |
| `opponent` | string \| null | ✗ | 1–32 ký tự | Chỉ dùng cho pvp/pvai |

**Response 201:**
```json
{
  "id": 42,
  "created_at": "2024-01-15T14:30:00Z"
}
```

**Response 400:**
```json
{
  "error": "Validation failed",
  "details": "nickname must not be empty"
}
```

**Response 500:**
```json
{
  "error": "Internal server error"
}
```

**Notes:**
- Server không validate rằng score có "hợp lệ" về mặt gameplay — client gửi gì thì lưu đó. Anti-cheat không nằm trong scope.
- Gọi ngay sau khi game over, trước khi hiển thị màn hình kết quả.
- Nếu server unavailable: retry 3 lần, mỗi lần cách 2s. Nếu vẫn fail: hiển thị toast "Score could not be saved" và tiếp tục.

---

### `GET /api/leaderboard`

Lấy top entries. Gọi khi người dùng mở màn hình leaderboard.

**Query parameters:**

| Parameter | Type | Default | Validation | Mô tả |
|---|---|---|---|---|
| `mode` | string | `"solo"` | `"solo"` \| `"pvp"` \| `"pvai"` | Filter theo mode |
| `limit` | number | `20` | 1–100 | Số entries trả về |

**Request:** `GET /api/leaderboard?mode=solo&limit=20`

**Response 200:**
```json
{
  "entries": [
    {
      "rank": 1,
      "nickname": "PlayerA",
      "score": 95400,
      "lines": 187,
      "level": 19,
      "result": null,
      "created_at": "2024-01-15T14:30:00Z"
    },
    {
      "rank": 2,
      "nickname": "PlayerB",
      "score": 72300,
      "lines": 142,
      "level": 15,
      "result": null,
      "created_at": "2024-01-14T20:15:00Z"
    }
  ],
  "total": 47,
  "mode": "solo"
}
```

**Response 400:**
```json
{
  "error": "Invalid mode parameter"
}
```

**Notes:**
- `created_at` trả về ISO 8601 UTC. Client tự format theo timezone local.
- `rank` được tính server-side dựa trên ORDER BY score DESC trong mode đó.
- Không có pagination hiện tại — chỉ top N. Đủ cho nhóm bạn bè.

---

## WebSocket API (Socket.io)

Namespace: `/` (default)

---

### Connection

```javascript
// Client
const socket = io('wss://<render-app>.onrender.com', {
  transports: ['websocket', 'polling'],  // fallback to polling nếu WS bị block
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10
})
```

---

### Events: Client → Server

#### `create-room`

Tạo phòng mới.

```javascript
socket.emit('create-room', {
  nickname: 'PlayerA'
})
```

| Field | Type | Validation |
|---|---|---|
| `nickname` | string | 1–32 ký tự |

**Server response:** emit `room-created` hoặc `room-error` về đúng socket này.

---

#### `join-room`

Join vào phòng có sẵn bằng code.

```javascript
socket.emit('join-room', {
  code: 'ABCD',
  nickname: 'PlayerB'
})
```

| Field | Type | Validation |
|---|---|---|
| `code` | string | 4 ký tự alphanumeric, uppercase |
| `nickname` | string | 1–32 ký tự |

**Server response:** emit `room-joined` hoặc `room-error`.

---

#### `reconnect-room`

Gửi khi client detect mình vừa reconnect vào server (Socket.io auto-reconnect).

```javascript
socket.emit('reconnect-room', {
  roomCode: 'ABCD',
  nickname: 'PlayerB',
  previousSocketId: 'abc123xyz'   // lưu từ connection trước
})
```

Server verify `previousSocketId` trong room state. Nếu match → clear disconnect timer, update socketId, emit `opponent-reconnected` cho player kia.

---

#### `game-update`

Gửi sau mỗi piece lock. Server relay đến opponent.

```javascript
socket.emit('game-update', {
  board: [0,0,1,0,...],  // 200 integers (20 rows × 10 cols, visible board)
  garbageSent: 4,         // garbage đang gửi lần này
  linesCleared: 2,        // để opponent UI animation
  combo: 3                // combo hiện tại (để hiển thị trên opponent view)
})
```

| Field | Type | Validation |
|---|---|---|
| `board` | number[] | Length = 200, mỗi value 0–7 |
| `garbageSent` | number | integer ≥ 0 |
| `linesCleared` | number | 0–4 |
| `combo` | number | integer ≥ -1 |

---

#### `game-over`

Client emit khi phát hiện mình Top Out. Server emit `game-over` với winner cho cả hai.

```javascript
socket.emit('game-over', {
  score: 45200,
  lines: 87,
  level: 9
})
```

---

#### `rematch-ready`

Emit khi người chơi bấm nút Rematch.

```javascript
socket.emit('rematch-ready')
```

Không có payload. Server đếm, khi đủ 2 → emit `rematch-start` cho cả hai.

---

#### `leave-room`

Emit khi người chơi chủ động rời phòng (không phải disconnect).

```javascript
socket.emit('leave-room')
```

Server xóa người chơi khỏi room, notify opponent.

---

### Events: Server → Client

#### `room-created`

```javascript
socket.on('room-created', ({ code }) => { ... })
// code: 'ABCD'
```

---

#### `room-joined`

```javascript
socket.on('room-joined', ({ opponentNickname, roomCode }) => { ... })
// opponentNickname: 'PlayerA'
// roomCode: 'ABCD'
```

Cả **người tạo phòng và người join** đều nhận event này khi người thứ 2 join. Dùng để trigger countdown và bắt đầu game.

---

#### `room-error`

```javascript
socket.on('room-error', ({ message, code }) => { ... })
```

| `code` | `message` | Khi nào |
|---|---|---|
| `ROOM_NOT_FOUND` | `"Room not found"` | Code sai hoặc room đã bị xóa |
| `ROOM_FULL` | `"Room is full"` | Phòng đã có 2 người |
| `ROOM_IN_GAME` | `"Game already in progress"` | Phòng đang chơi |
| `RECONNECT_ONLY` | `"Room is occupied, reconnect only"` | Join khi có người đang disconnect |
| `INVALID_NICKNAME` | `"Invalid nickname"` | Nickname không hợp lệ |

---

#### `opponent-update`

```javascript
socket.on('opponent-update', ({ board, garbageSent, linesCleared, combo }) => { ... })
```

Relay trực tiếp từ `game-update` của opponent. Client dùng để:
- Render opponent board
- Nhận garbage (`garbageSent` → thêm vào pending garbage của mình)
- Hiển thị combo animation trên opponent view

---

#### `opponent-disconnected`

```javascript
socket.on('opponent-disconnected', ({ timeoutSeconds }) => { ... })
// timeoutSeconds: 30
```

Client bắt đầu đếm ngược và hiển thị overlay "Opponent disconnected (29s...)".

---

#### `opponent-reconnected`

```javascript
socket.on('opponent-reconnected')
```

Client ẩn overlay, game tiếp tục bình thường.

---

#### `opponent-left`

```javascript
socket.on('opponent-left')
```

Opponent chủ động rời phòng (không phải disconnect). Game over ngay, người còn lại thắng.

---

#### `game-over`

```javascript
socket.on('game-over', ({ winner, loser, reason }) => { ... })
// winner: 'PlayerA'
// loser: 'PlayerB'
// reason: 'topout' | 'disconnect' | 'left'
```

Server emit cho cả hai players. Client hiển thị màn hình kết quả.

---

#### `rematch-start`

```javascript
socket.on('rematch-start')
```

Không có payload. Client reset game state và bắt đầu lại.

---

### Error Handling

Mọi event không hợp lệ từ client (payload sai, không trong room...) → server emit:

```javascript
socket.on('error', ({ message }) => { ... })
```

Client log error và có thể hiển thị toast nếu cần.

---

### Timing & Performance

| Metric | Target |
|---|---|
| `game-update` frequency | Sau mỗi piece lock (~1–2 lần/giây) |
| Message size | ~500–800 bytes |
| Server relay latency | <5ms (in-memory, same region) |
| Network round-trip VN → Render | ~80–150ms (tùy region) |

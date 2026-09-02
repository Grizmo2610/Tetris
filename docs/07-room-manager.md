# 07 — Room Manager

---

## Tổng quan

Room Manager là module in-memory duy nhất quản lý trạng thái phòng. Chạy trên single-process Node.js — không có distributed state, không có database persistence cho rooms.

**Hệ quả quan trọng:** Server restart = tất cả rooms mất. Người chơi phải tạo phòng mới. Đây là trade-off được chấp nhận.

---

## Room Data Structure

```typescript
interface Player {
  socketId: string;           // Socket.io socket ID hiện tại
  previousSocketId: string | null;  // Socket ID trước khi disconnect
  nickname: string;
  connected: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  rematchReady: boolean;
}

interface Room {
  code: string;               // "ABCD" — unique key
  status: RoomStatus;
  players: [Player, Player | null];  // [host, joiner | null]
  createdAt: Date;
  lastActivityAt: Date;       // cập nhật mỗi game-update event
}

type RoomStatus = 'waiting' | 'in-game' | 'finished';
```

---

## Room Code Generation

```
1. Generate 4 ký tự ngẫu nhiên từ alphabet: A-Z + 0-9 (36 chars)
   → 36^4 = 1,679,616 combinations
2. Check xem code đã tồn tại trong rooms map chưa
3. Nếu đã tồn tại → generate lại (loop tối đa 10 lần)
4. Nếu sau 10 lần vẫn trùng → throw error (cực kỳ hiếm)
```

**Tại sao 4 ký tự đủ cho hiện tại:** Với 5–20 rooms active đồng thời, probability trùng cực thấp (~0.001%). Khi mở public → tăng lên 6 ký tự.

---

## State Machine

```
         create-room
              │
              ▼
         ┌─────────┐
         │ waiting │ ──── TTL 10 phút ──► [DELETED]
         └────┬────┘
              │ join-room (2nd player)
              │
              ▼
         ┌──────────┐
         │ in-game  │
         └────┬─────┘
              │ game-over (top-out hoặc disconnect timeout)
              │
              ▼
         ┌──────────┐
         │ finished │
         └────┬─────┘
              │
     ┌────────┴────────┐
     │                 │
     │ rematch-start   │ leave-room / disconnect (no reconnect)
     │                 │
     ▼                 ▼
  [reset to         [DELETED]
  in-game]
```

---

## TTL Cleanup

**Cơ chế:** Global interval sweep, không phải per-room timer.

```
setInterval(cleanupRooms, 60_000)  // chạy mỗi 60 giây

function cleanupRooms():
  for each room in rooms:
    if room.status === 'waiting':
      if Date.now() - room.createdAt > 10 * 60 * 1000:  // 10 phút
        deleteRoom(room.code)
    if room.status === 'finished':
      if Date.now() - room.lastActivityAt > 5 * 60 * 1000:  // 5 phút
        deleteRoom(room.code)
```

**Lý do dùng global sweep thay vì per-room timer:**
- Dễ hiểu và debug hơn
- Không có nguy cơ memory leak do timer reference
- Scale tốt hơn — 1000 rooms chỉ cần 1 interval, không phải 1000 timers

---

## Disconnect Flow

### Khi server detect player disconnect (Socket.io `disconnect` event):

```javascript
socket.on('disconnect', (reason) => {
  const room = findRoomBySocketId(socket.id)
  if (!room) return  // player không trong phòng nào

  const player = getPlayerBySocketId(room, socket.id)
  player.connected = false
  player.previousSocketId = socket.id  // lưu để verify reconnect

  const opponent = getOpponent(room, socket.id)
  if (!opponent || !opponent.connected) {
    // Cả hai disconnect → xóa room ngay
    deleteRoom(room.code)
    return
  }

  // Notify opponent
  io.to(opponent.socketId).emit('opponent-disconnected', { timeoutSeconds: 30 })

  // Bắt đầu countdown
  player.disconnectTimer = setTimeout(() => {
    // Timer hết, opponent thắng
    io.to(opponent.socketId).emit('game-over', {
      winner: opponent.nickname,
      loser: player.nickname,
      reason: 'disconnect'
    })
    deleteRoom(room.code)
  }, 30_000)
})
```

### Khi player reconnect:

```javascript
socket.on('reconnect-room', ({ roomCode, nickname, previousSocketId }) => {
  const room = rooms.get(roomCode)
  if (!room) {
    socket.emit('room-error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' })
    return
  }

  const disconnectedPlayer = room.players.find(
    p => p.previousSocketId === previousSocketId && p.nickname === nickname
  )

  if (!disconnectedPlayer) {
    socket.emit('room-error', { code: 'RECONNECT_FAILED', message: 'Cannot reconnect' })
    return
  }

  // Clear disconnect timer
  if (disconnectedPlayer.disconnectTimer) {
    clearTimeout(disconnectedPlayer.disconnectTimer)
    disconnectedPlayer.disconnectTimer = null
  }

  // Update socket ID
  disconnectedPlayer.socketId = socket.id
  disconnectedPlayer.connected = true
  socket.join(roomCode)

  // Notify opponent
  const opponent = getOpponent(room, socket.id)
  if (opponent && opponent.connected) {
    io.to(opponent.socketId).emit('opponent-reconnected')
  }
})
```

---

## Room Operations API (Internal)

Các functions được export từ `roomManager.js`:

```typescript
createRoom(nickname: string, socketId: string): Room
// Tạo room mới, return Room object

joinRoom(code: string, nickname: string, socketId: string): Room
// Join room, throw nếu không thể join

deleteRoom(code: string): void
// Xóa room khỏi map

findRoomBySocketId(socketId: string): Room | null
// Tìm room chứa socket ID này

findRoomByCode(code: string): Room | null
// Tìm room theo code

getOpponent(room: Room, socketId: string): Player | null
// Trả về player kia trong room

setPlayerDisconnected(room: Room, socketId: string): void
// Mark player là disconnected, lưu previousSocketId

reconnectPlayer(room: Room, previousSocketId: string, newSocketId: string): boolean
// Reconnect player, return true nếu thành công

getRoomStats(): { total: number; waiting: number; inGame: number; finished: number }
// Cho /health endpoint
```

---

## Memory Estimate

| Thành phần | Size/unit | 100 rooms |
|---|---|---|
| Room object | ~500 bytes | ~50KB |
| JavaScript object overhead | ~200 bytes | ~20KB |
| Map overhead | minimal | — |
| **Total** | | **~70KB** |

100 rooms active đồng thời chỉ tốn ~70KB RAM. Hoàn toàn negligible.

---

## Edge Cases & Giải pháp

### Cả hai player disconnect cùng lúc
→ Cả hai trigger `disconnect` event. Xử lý theo thứ tự event loop.
- Player A disconnect → set timer, notify B
- Ngay sau đó B disconnect → detect B offline → xóa room ngay (không đợi timer)
- Timer của A đã set → `clearTimeout` trước khi xóa room

### Player bấm rematch rồi disconnect
→ `rematchReady` flag đã set. Nếu reconnect trong 30s → game bắt đầu nếu cả hai ready.
→ Nếu không reconnect → room xóa sau timeout.

### Join room đang trong trạng thái `finished`
→ Reject với `ROOM_IN_GAME`. Người muốn rematch dùng `rematch-ready` event, không phải `join-room`.

### Nickname trùng trong cùng phòng
→ Reject join với `INVALID_NICKNAME: 'Nickname already taken in this room'`.
→ Không enforce globally (nhiều phòng có thể có cùng nickname).

# 11 — Reliability

---

## Availability Target

**Target không chính thức:** ~99% uptime (nhóm bạn bè, không có SLA cứng).

Render free tier không có SLA. Với UptimeRobot keep-alive + Render auto-restart: thực tế ~99.5% khả thi dựa trên experience của cộng đồng.

---

## RTO / RPO

| Metric | Giá trị | Ghi chú |
|---|---|---|
| **RTO** (Recovery Time Objective) | ~1–2 phút | Render auto-restart sau crash |
| **RPO** (Recovery Point Objective) | 0 cho leaderboard | PostgreSQL persist |
| RPO cho room state | ∞ (không recover) | In-memory, không cần recover |

---

## Single Points of Failure

| SPOF | Impact | Mitigation |
|---|---|---|
| Render instance | Tất cả games ngắt, rooms mất | UptimeRobot alert + auto-restart |
| Render PostgreSQL | Score không lưu được | Retry 3×, game vẫn chạy |
| Cloudflare R2 | ONNX không load được | Fallback về Heuristic AI |
| UptimeRobot | Render có thể sleep | Frontend ping `/health` mỗi 4 phút khi tab open |

### Tại sao Frontend ping thêm

Nếu UptimeRobot down hoặc bị block, frontend của người dùng đang mở tab sẽ tự ping server mỗi 4 phút (lệch với UptimeRobot 5 phút) để đảm bảo server không sleep khi đang có người dùng.

```javascript
// Chỉ khi đang ở màn hình chính hoặc đang chơi
setInterval(async () => {
  await fetch(`${VITE_BACKEND_URL}/health`).catch(() => {})
}, 4 * 60 * 1000)
```

---

## Failure Scenarios

### 1. Render instance crash giữa ván

**Impact:** Tất cả WebSocket connections bị đứt. Tất cả rooms mất.

**Detection:**
- Client-side: Socket.io trigger `disconnect` event sau heartbeat timeout (~45s)
- UptimeRobot: detect `/health` không response, alert sau 2 failures (~10 phút)

**Recovery:**
- Render tự restart instance trong ~1 phút
- Client hiển thị: "Connection lost. Trying to reconnect..."
- Socket.io auto-reconnect với exponential backoff
- Sau reconnect: server đã restart → rooms không còn → client hiển thị "Server restarted. Please create a new room."

**Phân biệt restart vs network blip:**
- Network blip: Socket.io reconnect trong <30s, server vẫn có room state
- Restart: Reconnect thành công nhưng room không tồn tại → `reconnect-room` trả về `ROOM_NOT_FOUND`

---

### 2. PostgreSQL unavailable

**Impact:** Score không được lưu. Game vẫn chơi bình thường.

**Detection:** `pool.query()` throw error → log `ERROR: DB write failed`

**Recovery:**
```javascript
// backend/src/leaderboardRouter.js
async function saveScore(data) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await pool.query(INSERT_SQL, values)
    } catch (error) {
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1))  // 1s, 2s
      }
    }
  }
  // Vẫn fail sau 3 lần
  throw new Error('DB unavailable after 3 retries')
}
```

Client nhận 503 → hiển thị toast: "Score could not be saved. Please try again later." → không block game flow.

---

### 3. R2 unavailable (ONNX model không load)

**Impact:** Hard/Expert AI không available.

**Detection:** `fetch(modelUrl)` fail (network error hoặc 5xx)

**Recovery:** Fallback về Medium heuristic AI. Hiển thị toast: "AI model unavailable, using Medium difficulty instead."

**Không ảnh hưởng:** Solo, Local PvP, Online PvP, Easy/Medium PvAI.

---

### 4. Client disconnect giữa Online PvP

**Xử lý theo [07-room-manager.md](./07-room-manager.md):** 30s countdown, auto-reconnect nếu trong 30s, game over cho người còn lại nếu hết timer.

---

### 5. Render PostgreSQL expire (90 ngày)

**Impact:** Database bị xóa, tất cả leaderboard data mất.

**Prevention:**
- Weekly automated backup lên R2 (xem [09-data-schema.md](./09-data-schema.md))
- Calendar reminder 80 ngày sau ngày tạo database

**Recovery nếu xảy ra:**
1. Tạo Render PostgreSQL mới
2. Update `DATABASE_URL` environment variable
3. Restart backend
4. Run migration
5. Import từ CSV backup mới nhất

---

### 6. Network spike / lag giữa ván

**Impact:** Gameplay gián đoạt, board state bị lag.

**Mitigation:**
- Full board sync (không phải delta): nếu mất một update, update tiếp theo tự correct
- Client-side game loop không phụ thuộc vào server timing — chỉ dùng server data để sync opponent board
- Không có server-authoritative timing → client không block chờ server

---

### 7. Browser crash (client)

**Impact:** Người chơi mất ván. Từ server perspective: disconnect → 30s timer.

**Recovery:** Người chơi mở lại tab, try reconnect (`reconnect-room` với `previousSocketId` từ `localStorage`). Nếu trong 30s → game tiếp tục.

---

### 8. ONNX inference timeout (>2s)

**Impact:** AI không ra move trong 2 giây.

**Recovery:** Web Worker trả về fallback → main thread chọn random valid placement. Game không bị freeze.

---

## Client-Side Error Boundaries

React Error Boundary bao quanh:
- `GameScreen` component — nếu crash → hiển thị "Game error. Click to restart." thay vì blank screen
- `LeaderboardScreen` — nếu crash → hiển thị "Could not load leaderboard."

```jsx
// Ví dụ
<ErrorBoundary fallback={<GameErrorScreen />}>
  <GameScreen mode={mode} />
</ErrorBoundary>
```

---

## Retry Logic Summary

| Operation | Retries | Backoff | On final failure |
|---|---|---|---|
| POST /api/scores | 3× | 1s, 2s | Toast "Score not saved" |
| GET /api/leaderboard | 2× | 1s | Show "Could not load" |
| ONNX model load | 1× | — | Fallback to Medium AI |
| Socket.io reconnect | 10× | 1s → 5s (exponential) | Show "Connection lost" |
| DB write (server-side) | 3× | 1s, 2s | Return 503 |

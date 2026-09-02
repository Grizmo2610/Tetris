# 13 — Observability

---

## Logging

### Backend Log Format

Structured JSON logs, output ra stdout (Render capture và hiển thị trong dashboard).

```javascript
// logger.js — simple structured logger
const logger = {
  info:  (event, data = {}) => console.log(JSON.stringify({ level: 'info',  ts: new Date().toISOString(), event, ...data })),
  warn:  (event, data = {}) => console.log(JSON.stringify({ level: 'warn',  ts: new Date().toISOString(), event, ...data })),
  error: (event, data = {}) => console.log(JSON.stringify({ level: 'error', ts: new Date().toISOString(), event, ...data }))
}
```

### Events cần log

**Room lifecycle:**
```json
{"level":"info","ts":"...","event":"room.created","code":"ABCD","host":"PlayerA"}
{"level":"info","ts":"...","event":"room.joined","code":"ABCD","joiner":"PlayerB"}
{"level":"info","ts":"...","event":"room.game_over","code":"ABCD","winner":"PlayerA","reason":"topout"}
{"level":"info","ts":"...","event":"room.deleted","code":"ABCD","reason":"ttl_cleanup"}
```

**Player events:**
```json
{"level":"info","ts":"...","event":"player.connected","socketId":"abc123"}
{"level":"warn","ts":"...","event":"player.disconnected","socketId":"abc123","roomCode":"ABCD","reconnectWindowMs":30000}
{"level":"info","ts":"...","event":"player.reconnected","socketId":"new456","roomCode":"ABCD"}
```

**Leaderboard:**
```json
{"level":"info","ts":"...","event":"score.saved","mode":"solo","score":45200,"nickname":"PlayerA"}
{"level":"error","ts":"...","event":"score.save_failed","error":"connection timeout","attempt":3}
```

**Backup:**
```json
{"level":"info","ts":"...","event":"backup.success","filename":"backups/leaderboard-2024-01-15.csv","entries":342}
{"level":"error","ts":"...","event":"backup.failed","error":"R2 upload failed"}
```

**Validation errors:**
```json
{"level":"warn","ts":"...","event":"validation.failed","socketEvent":"game-update","reason":"board length != 200","socketId":"abc123"}
```

### Không log

- Board state (quá lớn, không cần thiết)
- Nickname trong validation errors (có thể chứa data nhạy cảm)
- Stack traces đầy đủ ra stdout production (chỉ log error message, stack vào stderr)

---

## Metrics (In-Memory Counter)

Không dùng metrics service (Prometheus, Datadog) — overkill và tốn tiền. Chỉ expose qua `/health`.

```javascript
// metrics.js
const metrics = {
  roomsCreated: 0,
  roomsDeleted: 0,
  gamesCompleted: 0,
  scoresSubmitted: 0,
  scoreSubmitFailures: 0,
  backupsSucceeded: 0,
  backupsFailed: 0
}

// Reset khi server restart — không persist
module.exports = { metrics }
```

---

## Health Check Endpoint

```
GET /health
```

**Response body:**

```json
{
  "status": "ok",
  "uptime": 86400,
  "rooms": {
    "total": 3,
    "waiting": 1,
    "inGame": 2,
    "finished": 0
  },
  "connections": 4,
  "metrics": {
    "roomsCreated": 15,
    "gamesCompleted": 8,
    "scoresSubmitted": 16,
    "scoreSubmitFailures": 0,
    "backupsSucceeded": 2,
    "backupsFailed": 0
  },
  "db": "connected"
}
```

**DB connectivity check:**

```javascript
// Check trong /health handler
let dbStatus = 'disconnected'
try {
  await pool.query('SELECT 1')
  dbStatus = 'connected'
} catch {
  dbStatus = 'error'
}
```

Nếu DB disconnected → vẫn return 200 (server chạy được), chỉ thay `"db": "error"`. UptimeRobot vẫn consider healthy. Log warning.

---

## Alerts

### UptimeRobot

- **Monitor:** `GET https://<app>.onrender.com/health`
- **Interval:** 5 phút
- **Alert condition:** 2 consecutive failures (= ~10 phút downtime)
- **Alert channel:** Email

**Limitation:** UptimeRobot chỉ check HTTP status code và response time, không parse JSON body. Nếu DB down nhưng server vẫn return 200 → UptimeRobot không biết.

### Khi Mở Public (Optional)

Xem xét thêm:
- **Betterstack** (Logtail): free tier collect logs, có alert khi log pattern `"level":"error"` xuất hiện nhiều
- **Render notifications:** email khi deploy fail hoặc service restart bất thường

---

## Client-Side Error Tracking

Không dùng Sentry hay error tracking service (privacy concern, overkill).

**Thay vào đó:**
- `window.onerror` và `window.addEventListener('unhandledrejection')` → log ra console
- React Error Boundaries catch render errors → log + hiển thị fallback UI

```javascript
// errorTracking.js
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
  // Nếu cần: gửi về backend /api/client-error (optional, hiện tại không cần)
})
```

---

## Performance Monitoring

Không có APM (Application Performance Monitoring) service.

**Thủ công theo dõi:**

| Metric | Cách đo | Threshold |
|---|---|---|
| Page load time | Chrome DevTools Lighthouse | <3s |
| ONNX model load | `performance.now()` trong code | <2s |
| WebSocket latency | `Date.now()` diff giữa send và nhận echo | <200ms |
| Frame rate | `requestAnimationFrame` delta tracking | >55fps |

```javascript
// FPS counter (dev mode only)
let lastTime = 0
let frames = 0
function measureFPS(timestamp) {
  frames++
  if (timestamp - lastTime >= 1000) {
    console.debug(`FPS: ${frames}`)
    frames = 0
    lastTime = timestamp
  }
  requestAnimationFrame(measureFPS)
}
if (import.meta.env.DEV) requestAnimationFrame(measureFPS)
```

---

## Debugging Online PvP

Khi cần debug sync issues:

1. **Server logs:** Render dashboard → Logs → filter `game.update` events
2. **Client console:** Trong dev mode, log mỗi `opponent-update` nhận được
3. **Board diff:** Tool nhỏ trong dev mode so sánh board A và board B để phát hiện desync

```javascript
// Dev-only debug flag
if (import.meta.env.DEV) {
  socket.onAny((event, data) => {
    console.debug('[Socket]', event, data)
  })
}
```

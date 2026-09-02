# 12 — Security

---

## Threat Model

**Đối tượng sử dụng:** Nhóm bạn bè tin tưởng nhau.

**Attacker profile hiện tại:** Không có attacker có chủ đích. Rủi ro chính là **accidental abuse** (gửi data sai format) hoặc **curious user** thử xem có thể làm gì.

**Attacker profile khi mở public:** Script kiddies, người cố tình spam leaderboard với fake scores, người cố brute-force vào phòng người khác.

Thiết kế bảo mật hiện tại phù hợp với nhóm bạn bè và đủ cơ bản để không bị embarrassing khi mở public.

---

## Attack Surfaces & Mitigations

### 1. WebSocket Events — Malformed Input

**Rủi ro:** Client gửi payload sai format, thiếu field, type sai → server crash hoặc unexpected behavior.

**Mitigation:** Validate tất cả payload trước khi xử lý. Reject silently nếu không hợp lệ.

```javascript
// socketHandlers.js
socket.on('game-update', (data) => {
  if (!isValidGameUpdate(data)) {
    socket.emit('error', { message: 'Invalid game-update payload' })
    return
  }
  // xử lý bình thường
})

function isValidGameUpdate(data) {
  return (
    Array.isArray(data.board) &&
    data.board.length === 200 &&
    data.board.every(v => Number.isInteger(v) && v >= 0 && v <= 7) &&
    Number.isInteger(data.garbageSent) && data.garbageSent >= 0 &&
    Number.isInteger(data.linesCleared) && data.linesCleared >= 0 && data.linesCleared <= 4
  )
}
```

---

### 2. REST API — Fake Score Submission

**Rủi ro:** Ai đó POST score bất kỳ lên leaderboard (không có auth).

**Hiện tại:** Chấp nhận được — nhóm bạn bè, không có incentive cheat. Nếu ai đó cheat thì cả nhóm đều biết.

**Khi mở public:**
- Thêm `express-rate-limit`: max 10 POST /api/scores per IP per phút
- Xem xét simple HMAC signature (client ký score với secret key) — không chống cheat thật sự nhưng tăng barrier
- Hoặc: chấp nhận là "honor system" và chỉ hiển thị leaderboard cho registered users

**Validation hiện tại:**
```javascript
function validateScorePayload(body) {
  const { nickname, score, mode, lines, level, result, opponent } = body
  if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) return false
  if (nickname.length > 32) return false
  if (!Number.isInteger(score) || score < 0) return false
  if (!['solo', 'pvp', 'pvai'].includes(mode)) return false
  if (!Number.isInteger(lines) || lines < 0) return false
  if (!Number.isInteger(level) || level < 1) return false
  if (result !== null && result !== undefined && !['win', 'loss'].includes(result)) return false
  return true
}
```

---

### 3. Room Code Brute Force

**Rủi ro:** Người cố join vào phòng người khác bằng cách thử nhiều codes.

**Hiện tại (4 ký tự):**
- 36^4 = 1.6M combinations
- 5–10 rooms active → probability hit: 5/1,600,000 = 0.0003%
- Không có rate limiting → có thể brute force nhanh nếu muốn

**Khi mở public:**
- Tăng lên 6 ký tự: 36^6 = 2.17 tỷ combinations
- Thêm rate limiting cho `join-room` event: max 10 attempts per IP per phút
- Thêm lockout: nếu fail 5 lần liên tiếp → block 5 phút

**Hiện tại:** Không cần — nhóm bạn bè, code được chia sẻ trực tiếp.

---

### 4. Cross-Origin Request Forgery

**Rủi ro:** Trang web khác gửi request đến backend.

**Mitigation:** CORS configuration chặt chẽ.

```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',')
  .map(origin => origin.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`Origin ${origin} not allowed by CORS`))
  },
  methods: ['GET', 'POST'],
  credentials: false
}))
```

**Không bật `credentials: true`** — không có cookie, không cần.

---

### 5. SQL Injection

**Rủi ro:** Malicious input vào PostgreSQL queries.

**Mitigation:** Luôn dùng parameterized queries. Không bao giờ string concatenation.

```javascript
// ĐÚNG
const result = await pool.query(
  'INSERT INTO leaderboard_entries (nickname, score, mode) VALUES ($1, $2, $3)',
  [nickname, score, mode]
)

// SAI — không bao giờ làm thế này
const result = await pool.query(
  `INSERT INTO leaderboard_entries (nickname) VALUES ('${nickname}')`
)
```

---

### 6. XSS qua Nickname

**Rủi ro:** Người dùng nhập nickname chứa HTML/JS tags → hiển thị trên leaderboard → XSS.

**Mitigation:**
- Server: strip/escape HTML tags khi lưu vào DB
- Client: React tự escape khi render text trong JSX (`{nickname}` là safe)
- Không dùng `dangerouslySetInnerHTML`

```javascript
// Server-side sanitization
function sanitizeNickname(nickname) {
  return nickname
    .trim()
    .slice(0, 32)
    .replace(/[<>&"']/g, '')  // strip HTML special chars
}
```

---

### 7. Denial of Service

**Rủi ro:** Ai đó gửi nhiều requests để làm server chậm/crash.

**Hiện tại:** Không có rate limiting. Chấp nhận được cho nhóm bạn bè.

**Khi mở public:**
```javascript
const rateLimit = require('express-rate-limit')

// REST API
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,  // 1 phút
  max: 30,              // 30 requests per IP per phút
  message: { error: 'Too many requests' }
}))

// POST /api/scores riêng (stricter)
app.use('/api/scores', rateLimit({
  windowMs: 60 * 1000,
  max: 10
}))
```

Socket.io rate limiting riêng cho các events quan trọng.

---

### 8. Secrets Management

**Không commit secrets vào Git:**
- `.env` files trong `.gitignore`
- Chỉ commit `.env.example` (không có values thật)

**Secrets lưu ở đâu:**
- Backend: Render dashboard → Environment Variables
- Frontend: Cloudflare Pages → Settings → Environment Variables
- R2 credentials: Render Environment Variables (chỉ backend cần)

**Rotation:** Nếu secret bị leak → rotate ngay trong dashboard của service đó, không cần redeploy code.

---

## TLS

| Surface | TLS | Cách cấu hình |
|---|---|---|
| Frontend | HTTPS tự động | Cloudflare Pages |
| Backend REST | HTTPS tự động | Render TLS termination |
| Backend WebSocket | WSS tự động | Render TLS termination |
| R2 → Browser | HTTPS | Cloudflare CDN |
| Backend → PostgreSQL | SSL required | `?sslmode=require` trong DATABASE_URL |

Không có unencrypted traffic trong production.

---

## Security Checklist khi Deploy

- [ ] `ALLOWED_ORIGINS` chỉ chứa Cloudflare Pages URL của project
- [ ] `DATABASE_URL` có `sslmode=require`
- [ ] Không có secrets trong source code
- [ ] `.env` trong `.gitignore`
- [ ] Parameterized queries cho tất cả DB operations
- [ ] Nickname sanitization hoạt động
- [ ] CORS response headers đúng trên production

## Security Improvements khi Mở Public

- [ ] Rate limiting cho REST API
- [ ] Rate limiting cho Socket.io events
- [ ] Room code tăng lên 6 ký tự
- [ ] Lockout sau failed join attempts
- [ ] Xem xét simple authentication cho leaderboard write

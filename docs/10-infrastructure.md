# 10 — Infrastructure & Deployment

---

## Environments

| Environment | Frontend | Backend | Database |
|---|---|---|---|
| **Development** | `localhost:3000` (Vite dev server) | `localhost:4000` | Local PostgreSQL hoặc Render dev DB |
| **Production** | Cloudflare Pages | Render | Render PostgreSQL |

Không có staging environment — nhóm nhỏ, không justify chi phí và complexity. Nếu cần test trước khi deploy: dùng Cloudflare Pages preview deployment (tự động tạo khi push branch).

---

## Project Repository Structure

```
tetris-platform/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Menu/
│   │   │   │   ├── MainMenu.jsx
│   │   │   │   ├── ModeSelect.jsx
│   │   │   │   └── NicknameInput.jsx
│   │   │   ├── Game/
│   │   │   │   ├── GameScreen.jsx       ← wrapper, mount canvas
│   │   │   │   ├── GameOverlay.jsx      ← score, level HUD
│   │   │   │   └── DisconnectOverlay.jsx
│   │   │   ├── Leaderboard/
│   │   │   │   └── LeaderboardScreen.jsx
│   │   │   └── Room/
│   │   │       ├── CreateRoom.jsx
│   │   │       └── JoinRoom.jsx
│   │   ├── game/
│   │   │   ├── engine/
│   │   │   │   ├── board.js             ← board state, line clear, garbage
│   │   │   │   ├── piece.js             ← tetrimino defs, SRS rotation tables
│   │   │   │   ├── physics.js           ← gravity, lock-down, collision
│   │   │   │   └── scoring.js           ← score, level, garbage calc
│   │   │   ├── renderer/
│   │   │   │   ├── boardRenderer.js     ← draw board, pieces, ghost
│   │   │   │   └── uiRenderer.js        ← score, next pieces, garbage bar
│   │   │   ├── input/
│   │   │   │   └── inputHandler.js      ← DAS/ARR, key mapping
│   │   │   └── modes/
│   │   │       ├── soloMode.js
│   │   │       ├── localPvpMode.js
│   │   │       ├── onlinePvpMode.js
│   │   │       └── pvAiMode.js
│   │   ├── ai/
│   │   │   ├── heuristic.js
│   │   │   ├── onnxWorker.js            ← Web Worker script
│   │   │   └── aiController.js          ← unified interface
│   │   ├── network/
│   │   │   └── socketClient.js
│   │   ├── hooks/
│   │   │   ├── useGame.js
│   │   │   └── useLeaderboard.js
│   │   └── utils/
│   │       └── constants.js
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── server.js                    ← Express + Socket.io setup
│   │   ├── roomManager.js
│   │   ├── socketHandlers.js
│   │   ├── leaderboardRouter.js
│   │   ├── db.js                        ← pg Pool
│   │   ├── backup.js                    ← Weekly backup cron
│   │   └── migrations/
│   │       └── 001_create_leaderboard.sql
│   ├── .env.example
│   └── package.json
│
├── ai-training/
│   ├── env/
│   │   └── tetris_env.py
│   ├── agent/
│   │   ├── dqn.py
│   │   └── replay_buffer.py
│   ├── train.py
│   ├── export_onnx.py
│   └── requirements.txt
│
├── docs/                                ← Tài liệu thiết kế (thư mục này)
│
└── README.md
```

---

## CI/CD

### Frontend — Cloudflare Pages

**Setup:**
1. Connect GitHub repo vào Cloudflare Pages
2. Build command: `cd frontend && npm run build`
3. Output directory: `frontend/dist`
4. Root directory: `/` (monorepo)

**Deploy triggers:**
- Push to `main` → auto-deploy production
- Push to feature branch → auto-create preview URL (format: `<branch>.<project>.pages.dev`)

**Build time:** ~30–60 giây.

### Backend — Render

**Setup:**
1. Connect GitHub repo vào Render
2. Root directory: `backend`
3. Build command: `npm install`
4. Start command: `node src/server.js`
5. Auto-deploy: enabled (push to `main` → deploy)

**Deploy time:** ~2–3 phút (cold build), ~1 phút (nếu có build cache).

**Zero-downtime:** Render không support zero-downtime deploy ở free tier. Có ~10–30 giây downtime khi deploy. Chấp nhận được.

---

## Environment Variables

### Backend (Render dashboard → Environment)

```bash
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
ALLOWED_ORIGINS=https://<project>.pages.dev,http://localhost:3000
PORT=4000                          # Render override tự động
NODE_ENV=production

# Cloudflare R2 (cho backup)
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=tetris-backups
```

### Frontend (Cloudflare Pages → Settings → Environment variables)

```bash
VITE_BACKEND_URL=https://<render-app>.onrender.com
VITE_R2_MODEL_URL_HARD=https://pub-<hash>.r2.dev/models/tetris-ai-hard-int8.onnx
VITE_R2_MODEL_URL_EXPERT=https://pub-<hash>.r2.dev/models/tetris-ai-expert-int8.onnx
```

### Development (`.env.local` — không commit)

```bash
# frontend/.env.local
VITE_BACKEND_URL=http://localhost:4000
VITE_R2_MODEL_URL_HARD=http://localhost:4000/models/tetris-ai-hard-int8.onnx

# backend/.env
DATABASE_URL=postgresql://localhost/tetris_dev
ALLOWED_ORIGINS=http://localhost:3000
PORT=4000
NODE_ENV=development
```

**`.env.example` có trong repo** (không có giá trị thật) để developer biết cần set gì.

---

## CORS Configuration

```javascript
// backend/src/server.js
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS.split(','),
  methods: ['GET', 'POST'],
  credentials: false
}

app.use(cors(corsOptions))

// Socket.io CORS
const io = new Server(server, {
  cors: corsOptions
})
```

**Production origins:**
- `https://<project>.pages.dev` (Cloudflare Pages)

**Development origins:**
- `http://localhost:3000`

---

## UptimeRobot Configuration

1. Create monitor → HTTP(s)
2. URL: `https://<render-app>.onrender.com/health`
3. Monitoring interval: **5 minutes**
4. Alert contacts: email của team
5. Alert after: 2 consecutive failures (~10 phút downtime)

**Tại sao 5 phút:** Render sleep sau 15 phút không activity. Với ping mỗi 5 phút, server luôn thức. Không quá aggressive để waste free tier quota.

---

## Cloudflare R2 Setup

### Buckets

| Bucket | Access | Nội dung |
|---|---|---|
| `tetris-public` | Public | ONNX model files |
| `tetris-backups` | Private (API only) | CSV leaderboard backups |

### Public bucket CORS (cho `tetris-public`)

```json
[
  {
    "AllowedOrigins": ["https://<project>.pages.dev", "http://localhost:3000"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

### Upload model files

```bash
# Dùng wrangler CLI
wrangler r2 object put tetris-public/models/tetris-ai-hard-int8.onnx \
  --file ./ai-training/exports/tetris-ai-hard-int8.onnx

wrangler r2 object put tetris-public/models/tetris-ai-expert-int8.onnx \
  --file ./ai-training/exports/tetris-ai-expert-int8.onnx
```

---

## Scaling Path

### Hiện tại → ~100 users

1. Upgrade Render free → **Render Starter ($7/tháng)**
   - Dedicated 512MB RAM
   - Không sleep
   - Better CPU share
2. Migrate PostgreSQL từ Render free → **Neon free tier**
   - Không expire
   - 10GB storage
   - Compatible API
3. Thêm rate limiting: `express-rate-limit` cho `POST /api/scores`
4. Tăng room code lên 6 ký tự

### ~100 users → ~500 users

1. Upgrade Render Starter → **Standard ($25/tháng)**
2. Hoặc migrate sang **Fly.io** (Singapore region — thấp latency hơn cho VN)
3. Thêm authentication đơn giản (JWT)
4. Cân nhắc thêm CDN cho WebSocket (Cloudflare Spectrum)

### >500 users (Architectural threshold)

Cần redesign đáng kể:
- Redis cho shared room state
- Multiple Node.js instances + Socket.io Redis Adapter
- Load balancer với sticky sessions hoặc stateless redesign

**Không design cho scale này bây giờ** — premature optimization.

---

## Rollback

### Frontend
Cloudflare Pages giữ lịch sử tất cả deployments. Rollback: dashboard → Deployments → chọn deployment cũ → "Rollback to this deployment". Tức thời.

### Backend
Render giữ lịch sử deployments. Rollback: dashboard → Events → chọn deployment cũ → "Rollback". ~1 phút.

### Database
Không có automatic rollback. Trước khi thay đổi schema:
1. Manual backup: `pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql`
2. Chạy migration
3. Nếu cần rollback: `psql $DATABASE_URL < backup_YYYYMMDD.sql` (mất data mới sau migration)

**Migrate-forward strategy:** Viết migration để backward-compatible nếu có thể (add column thay vì drop).

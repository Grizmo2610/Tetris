# 03 — Technology Stack

---

## Tổng quan

| Layer | Công nghệ | Version khuyến nghị |
|---|---|---|
| Frontend framework | React | 18.x |
| Game rendering | Canvas API (vanilla) | Web standard |
| Frontend build | Vite | 5.x |
| WebSocket client | Socket.io client | 4.x |
| ONNX inference | onnxruntime-web | 1.17+ |
| Backend runtime | Node.js | 20 LTS |
| Backend framework | Express | 4.x |
| WebSocket server | Socket.io | 4.x |
| Database client | node-postgres (pg) | 8.x |
| Database | PostgreSQL | 15 (Render managed) |
| AI training | PyTorch | 2.x |
| Model format | ONNX | opset 17+ |
| Frontend hosting | Cloudflare Pages | — |
| Backend hosting | Render | — |
| Object storage | Cloudflare R2 | — |
| Keep-alive | UptimeRobot | — |

---

## Frontend: React + Canvas API

### Lý do chọn React

React quản lý UI state (menu, màn hình chờ, leaderboard, overlay kết quả) tốt. Component model phù hợp với cấu trúc UI của game này. Ecosystem lớn, team quen thuộc.

Phần game render **không dùng React** — Canvas API được control trực tiếp bởi game loop. React chỉ mount/unmount canvas element và bridge state (score, level, next piece) từ game engine ra UI.

### Lý do chọn Canvas API thay vì DOM

- Game loop 60fps cần control hoàn toàn về khi nào render
- DOM reflow sẽ gây jank không kiểm soát được
- Tetris đủ đơn giản để implement trên Canvas 2D — không cần WebGL hay game framework

### Alternatives bị loại

- **Phaser.js / PixiJS:** overkill cho Tetris, thêm ~400KB bundle
- **Vue / Svelte:** không có lý do kỹ thuật cụ thể để ưu tiên hơn React cho project này

---

## Backend: Node.js + Express + Socket.io

### Lý do chọn Node.js

- Event loop non-blocking xử lý nhiều WebSocket connections hiệu quả ở quy mô nhỏ
- Cùng ngôn ngữ với frontend → ít context switching
- Ecosystem quen thuộc

### Lý do chọn Socket.io

Socket.io không phải chỉ là WebSocket wrapper — nó cung cấp:

- **Room abstraction** (`socket.join(roomCode)`) phù hợp hoàn toàn với Room Code system
- **Auto-reconnect** built-in với exponential backoff
- **Fallback to HTTP polling** khi WebSocket bị chặn bởi corporate firewall
- **Heartbeat** tự động (ping/pong)
- **Acknowledgements** cho events quan trọng

### Alternatives bị loại

| Alternative | Lý do loại |
|---|---|
| `ws` (raw WebSocket) | Thiếu room management, phải tự implement tất cả |
| Fastify | Marginally faster nhưng không đáng đổi ecosystem |
| Go / Rust | Performance không cần thiết, tăng complexity và onboarding cost |
| GraphQL subscriptions | Overkill, phức tạp hơn Socket.io events |

---

## Database: PostgreSQL

### Lý do chọn PostgreSQL

- Render cung cấp managed PostgreSQL free tier cùng platform → latency thấp (in-region)
- SQL phù hợp cho leaderboard queries (`ORDER BY score DESC`, filter by mode)
- 1GB storage — leaderboard entry ~150 bytes → ~6.5 triệu entries, không bao giờ đầy
- Connection pooling đơn giản với `pg-pool`

### Lưu ý quan trọng về Render free tier

**Render PostgreSQL free tier expire sau 90 ngày.** Đây là rủi ro thực, không phải lý thuyết. Xem [09-data-schema.md](./09-data-schema.md) cho backup strategy.

### Migration path khi mở public

Migrate sang **Neon** (serverless PostgreSQL, free tier không expire, compatible API) hoặc **Supabase** (PostgreSQL as a service, 500MB free, không expire). Không cần thay đổi query code vì cả hai đều là PostgreSQL-compatible.

### Alternatives bị loại

| Alternative | Lý do loại |
|---|---|
| SQLite local file | Không persist qua Render restart |
| Cloudflare D1 | Tốt nhưng latency từ Render → Cloudflare edge không đo được |
| MongoDB | Không có lý do dùng NoSQL cho leaderboard |
| Redis | Overkill, và không có free tier không expire phù hợp |

---

## AI: onnxruntime-web + Web Worker

### Lý do chọn onnxruntime-web

- Thư viện chính thức của Microsoft cho ONNX inference trên browser
- Hỗ trợ WebAssembly backend → không cần WebGL
- ONNX format portable, không lock-in vào PyTorch hay TensorFlow
- Bundle size chấp nhận được (~1.5MB gzip với WASM)

### Tại sao phải dùng Web Worker

ONNX inference cho một move có thể mất **10–80ms** tùy model size và hardware. Nếu chạy trên main thread:
- Frame budget ở 60fps = 16.67ms
- Inference vượt budget → game render bị drop frame → gameplay giật

Web Worker chạy inference trên thread riêng biệt. Main thread không bị block. Kết quả được trả về qua `postMessage` khi inference hoàn thành.

### Timeout strategy

Nếu inference > **2000ms** → Web Worker gửi fallback signal → main thread chọn random valid placement. Đảm bảo AI không làm game freeze ngay cả trên máy rất yếu.

---

## AI Training: PyTorch + Kaggle/Colab

### Lý do chọn PyTorch

- Framework phổ biến nhất cho RL research
- ONNX export từ PyTorch là workflow tiêu chuẩn (`torch.onnx.export`)
- Kaggle cung cấp T4 GPU miễn phí 30h/tuần — đủ cho project này

### Workflow

```
Train DQN (PyTorch, Kaggle T4)
    ↓
Export ONNX (torch.onnx.export, opset 17)
    ↓
Quantize INT8 (onnxruntime quantization) — giảm size ~4×
    ↓
Upload lên Cloudflare R2
    ↓
onnxruntime-web load từ browser
```

---

## Hosting

### Cloudflare Pages (Frontend)

- Static hosting + CDN global
- Auto-deploy từ GitHub push to `main`
- HTTPS tự động
- Free tier: không giới hạn bandwidth, 500 builds/tháng

### Render (Backend)

- Node.js hosting, deploy từ GitHub
- HTTPS + WSS tự động (TLS termination)
- Free tier: 512MB RAM, 0.1 vCPU shared, **sleep sau 15 phút không activity**
- **Sleep problem:** giải quyết bằng UptimeRobot ping mỗi 5 phút VÀ WebSocket keepalive khi đang có người chơi

### Cloudflare R2 (Object Storage)

- Free tier: 10GB storage, 10GB egress/tháng, 1M GET requests/tháng
- ONNX model ~500KB + CSV backups → hoàn toàn trong free tier
- Public bucket cho ONNX (serve trực tiếp đến browser)
- Private bucket cho backups

### UptimeRobot

- Ping `/health` endpoint mỗi 5 phút
- Alert qua email nếu downtime
- Free tier: 50 monitors

---

## Dependencies đầy đủ

### Frontend (`package.json`)

```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "socket.io-client": "^4.x",
    "onnxruntime-web": "^1.17.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

### Backend (`package.json`)

```json
{
  "dependencies": {
    "express": "^4.x",
    "socket.io": "^4.x",
    "pg": "^8.x",
    "cors": "^2.x",
    "dotenv": "^16.x"
  }
}
```

### AI Training (`requirements.txt`)

```
torch>=2.0
onnx>=1.14
onnxruntime>=1.17
numpy
wandb
gymnasium
```

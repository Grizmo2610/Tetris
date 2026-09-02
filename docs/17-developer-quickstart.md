# 17 — Developer Quick Start

Hướng dẫn setup môi trường development từ đầu đến lúc chạy được game.

---

## Prerequisites

| Tool | Version | Kiểm tra |
|---|---|---|
| Node.js | 20 LTS | `node --version` |
| npm | 9+ | `npm --version` |
| Git | bất kỳ | `git --version` |
| PostgreSQL | 14+ (local dev) | `psql --version` |
| Python | 3.10+ (chỉ cho AI training) | `python --version` |

---

## Setup lần đầu

### 1. Clone repo

```bash
git clone https://github.com/<org>/tetris-platform.git
cd tetris-platform
```

### 2. Setup Backend

```bash
cd backend
npm install

# Copy env file
cp .env.example .env
# Mở .env và điền giá trị (xem bên dưới)
```

**Nội dung `.env` cho local development:**

```bash
DATABASE_URL=postgresql://localhost/tetris_dev
ALLOWED_ORIGINS=http://localhost:3000
PORT=4000
NODE_ENV=development
```

**Tạo database local:**

```bash
createdb tetris_dev
psql tetris_dev -f src/migrations/001_create_leaderboard.sql
```

**Chạy backend:**

```bash
npm run dev
# → Server chạy tại http://localhost:4000
# → WebSocket available tại ws://localhost:4000
```

Verify: `curl http://localhost:4000/health` → phải trả về JSON `{"status":"ok",...}`

### 3. Setup Frontend

```bash
cd ../frontend
npm install

cp .env.example .env.local
```

**Nội dung `.env.local`:**

```bash
VITE_BACKEND_URL=http://localhost:4000
VITE_R2_MODEL_URL_HARD=http://localhost:4000/models/tetris-ai-hard-int8.onnx
VITE_R2_MODEL_URL_EXPERT=http://localhost:4000/models/tetris-ai-expert-int8.onnx
```

**Chạy frontend:**

```bash
npm run dev
# → App chạy tại http://localhost:3000
```

Mở `http://localhost:3000` trong browser → thấy main menu.

### 4. Test Online PvP local

Mở hai tab:
- Tab 1: `http://localhost:3000` → tạo phòng
- Tab 2: `http://localhost:3000` → join phòng với code

---

## Scripts

### Frontend

| Script | Lệnh | Mô tả |
|---|---|---|
| Dev server | `npm run dev` | Hot reload, localhost:3000 |
| Build | `npm run build` | Output vào `dist/` |
| Preview build | `npm run preview` | Serve `dist/` locally |
| Lint | `npm run lint` | ESLint |

### Backend

| Script | Lệnh | Mô tả |
|---|---|---|
| Dev server | `npm run dev` | nodemon với auto-restart |
| Start | `npm start` | Production start |
| Migrate | `npm run migrate` | Chạy pending migrations |

**`package.json` backend (scripts section):**

```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "migrate": "psql $DATABASE_URL -f src/migrations/001_create_leaderboard.sql"
  }
}
```

---

## Testing Scenarios

### Solo Mode

1. Mở app → Main Menu
2. Nhập nickname → chọn Solo
3. Chơi: kiểm tra gravity, rotation, DAS/ARR
4. Clear 4 dòng → kiểm tra score tăng đúng (800 × level)
5. Top Out → màn hình kết quả → score submit → xuất hiện trên Leaderboard

### Local PvP

1. Chọn Local PvP → nhập 2 nicknames
2. P1 dùng WASD + E/Q, P2 dùng Arrow keys + Numpad
3. P1 clear Tetris → P2 nhận 4 garbage lines
4. Một bên thua → màn hình kết quả → rematch

### Online PvP

1. Tab 1: Create Room → ghi nhớ code (VD: ABCD)
2. Tab 2: Join Room → nhập ABCD
3. Cả hai vào game → chơi → kiểm tra garbage sync
4. Tab 2 đóng → Tab 1 thấy countdown 30s
5. Tab 2 mở lại → reconnect trong 30s → game tiếp tục

### PvAI — Easy/Medium

1. Chọn PvAI → Easy
2. AI đặt pieces (có delay để nhìn thấy)
3. Easy: AI thỉnh thoảng sai, người chơi thắng được
4. Medium: AI chơi tốt hơn rõ ràng

### PvAI — Hard/Expert (cần model file)

1. Đặt file `.onnx` vào `backend/public/models/`
2. Chọn PvAI → Hard
3. Thấy loading indicator "Loading AI model..."
4. AI load xong → chơi với independent thread (không giật)

---

## Cấu trúc file quan trọng

```
frontend/src/utils/constants.js     ← Mọi magic numbers ở đây
frontend/src/game/engine/piece.js   ← SRS rotation tables
frontend/src/game/engine/scoring.js ← Garbage conversion table
backend/src/roomManager.js          ← Room lifecycle logic
backend/src/socketHandlers.js       ← Tất cả WebSocket event handlers
```

---

## Common Issues

### Backend không connect được database

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

→ PostgreSQL không chạy. `brew services start postgresql` (macOS) hoặc `sudo service postgresql start` (Linux).

### CORS error khi frontend gọi backend

```
Access to fetch at 'http://localhost:4000' from origin 'http://localhost:3000' has been blocked by CORS
```

→ `ALLOWED_ORIGINS` trong `backend/.env` chưa có `http://localhost:3000`.

### Socket.io không connect

→ Kiểm tra `VITE_BACKEND_URL` trong `frontend/.env.local` phải là `http://localhost:4000` (không phải `ws://`). Socket.io client tự handle WebSocket upgrade.

### ONNX model không load (local)

→ File `.onnx` chưa được đặt vào đúng chỗ, hoặc URL trong `.env.local` sai. Hard/Expert sẽ fallback về Medium và hiển thị toast.

---

## Conventions

### Code Style

- JavaScript (không TypeScript) cho cả frontend và backend
- ESLint với config Airbnb-base
- Semicolons: yes
- Quotes: single
- Indent: 2 spaces

### Git Workflow

```
main          ← production deployments
feature/*     ← feature branches, merge vào main khi done
fix/*         ← hotfix branches
```

Không có develop branch — nhóm nhỏ, không cần GitFlow complexity.

### Commit message format

```
feat: add garbage counter mechanic
fix: correct T-Spin detection for Mini T-Spin
refactor: extract board rendering to separate module
docs: update API spec for reconnect-room event
```

---

## AI Training Setup (Optional)

Chỉ cần khi implement Phase 6.

```bash
cd ai-training

# Tạo virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
# hoặc: venv\Scripts\activate  # Windows

pip install -r requirements.txt

# Train (local CPU — chậm, chỉ để test)
python train.py --episodes 100 --device cpu

# Train trên Kaggle (upload notebook, dùng T4 GPU)
# Xem: ai-training/kaggle_notebook.ipynb

# Export sau khi train
python export_onnx.py --checkpoint checkpoints/ep30000.pt --output exports/
```

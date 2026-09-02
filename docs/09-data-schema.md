# 09 — Data Schema

---

## PostgreSQL Schema

### Table: `leaderboard_entries`

```sql
CREATE TABLE leaderboard_entries (
  id          SERIAL PRIMARY KEY,
  nickname    VARCHAR(32)  NOT NULL,
  score       INTEGER      NOT NULL CHECK (score >= 0),
  mode        VARCHAR(8)   NOT NULL CHECK (mode IN ('solo', 'pvp', 'pvai')),
  lines       INTEGER      NOT NULL CHECK (lines >= 0),
  level       INTEGER      NOT NULL CHECK (level >= 1),
  result      VARCHAR(8)       NULL CHECK (result IN ('win', 'loss') OR result IS NULL),
  opponent    VARCHAR(32)      NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

**Giải thích từng column:**

| Column | Type | Mô tả |
|---|---|---|
| `id` | SERIAL | Auto-increment primary key |
| `nickname` | VARCHAR(32) | Tên người chơi, không unique |
| `score` | INTEGER | Điểm số cuối ván |
| `mode` | VARCHAR(8) | `solo`, `pvp`, `pvai` |
| `lines` | INTEGER | Tổng số dòng đã xóa |
| `level` | INTEGER | Level khi game kết thúc |
| `result` | VARCHAR(8) | `win`/`loss` cho PvP/PvAI, NULL cho Solo |
| `opponent` | VARCHAR(32) | Nickname đối thủ, NULL cho Solo |
| `created_at` | TIMESTAMPTZ | Timestamp UTC khi insert |

---

### Indexes

```sql
-- Index chính: leaderboard queries (ORDER BY score trong một mode)
CREATE INDEX idx_leaderboard_mode_score
ON leaderboard_entries(mode, score DESC);

-- Index phụ: query theo nickname (xem lịch sử một người)
CREATE INDEX idx_leaderboard_nickname
ON leaderboard_entries(nickname);

-- Index thời gian (nếu cần filter "this week")
CREATE INDEX idx_leaderboard_created_at
ON leaderboard_entries(created_at DESC);
```

---

### Migration Files

Đặt trong `backend/src/migrations/`. Đánh số thứ tự, chạy manual.

```
migrations/
├── 001_create_leaderboard.sql   ← Schema ban đầu
├── 002_add_created_at_index.sql ← Thêm index nếu cần sau
└── ...
```

**Chạy migration:**

```bash
psql $DATABASE_URL -f migrations/001_create_leaderboard.sql
```

Không dùng migration framework (Flyway, Liquibase, node-migrate) ở quy mô này — overkill.

---

### Queries

**Top 20 Solo scores:**

```sql
SELECT
  ROW_NUMBER() OVER (ORDER BY score DESC) AS rank,
  nickname,
  score,
  lines,
  level,
  created_at
FROM leaderboard_entries
WHERE mode = 'solo'
ORDER BY score DESC
LIMIT 20;
```

**Top 20 PvP scores (chỉ wins):**

```sql
SELECT
  ROW_NUMBER() OVER (ORDER BY score DESC) AS rank,
  nickname,
  score,
  lines,
  level,
  opponent,
  created_at
FROM leaderboard_entries
WHERE mode = 'pvp' AND result = 'win'
ORDER BY score DESC
LIMIT 20;
```

**Insert score:**

```sql
INSERT INTO leaderboard_entries
  (nickname, score, mode, lines, level, result, opponent)
VALUES
  ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, created_at;
```

Dùng parameterized queries — không bao giờ string concatenation.

---

### Storage Estimate

| Metric | Giá trị |
|---|---|
| Row size | ~150 bytes (bao gồm overhead) |
| 1000 entries | ~150KB |
| 100,000 entries | ~15MB |
| Render free limit | 1GB |

Với nhóm bạn bè chơi vài ván mỗi ngày: ~50 entries/ngày → 1 năm = ~18,000 entries = ~3MB. Không bao giờ đầy.

---

### Connection Pooling

```javascript
// backend/src/db.js
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },  // Render requires SSL
  max: 5,           // Max connections trong pool
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
})

module.exports = { pool }
```

**Tại sao pool size = 5:** Render PostgreSQL free tier giới hạn ~10 connections. Single Node.js instance chỉ cần 3–5 concurrent DB connections tối đa. Giữ dự phòng cho monitoring tools.

---

## Backup Strategy

### Vấn đề

Render PostgreSQL free tier **expire và bị xóa sau 90 ngày** kể từ ngày tạo. Đây không phải warning — database bị xóa hoàn toàn.

### Giải pháp: Automated Weekly Backup

Một script Node.js chạy trong cùng backend, schedule bằng `node-cron`:

```javascript
// backend/src/backup.js
const cron = require('node-cron')
const { pool } = require('./db')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

// Chạy mỗi Chủ nhật 03:00 UTC
cron.schedule('0 3 * * 0', async () => {
  console.log('[Backup] Starting weekly leaderboard backup...')

  try {
    // Export CSV
    const result = await pool.query(`
      SELECT nickname, score, mode, lines, level, result, opponent, created_at
      FROM leaderboard_entries
      ORDER BY created_at DESC
    `)

    const csv = convertToCSV(result.rows)
    const filename = `backups/leaderboard-${formatDate(new Date())}.csv`

    // Upload lên Cloudflare R2
    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    })

    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: csv,
      ContentType: 'text/csv'
    }))

    console.log(`[Backup] Success: ${filename} (${result.rows.length} entries)`)
  } catch (error) {
    console.error('[Backup] Failed:', error)
    // TODO: alert via email hoặc webhook
  }
})
```

**Dependencies:** `node-cron`, `@aws-sdk/client-s3` (R2 dùng S3-compatible API)

### Backup Retention

Giữ tất cả backups trong R2 (không tự xóa). Với ~50 entries/ngày × 52 tuần = ~2600 entries/năm → CSV file <1MB/năm. Trong free tier mãi mãi.

### Restore Procedure

Khi cần restore (sau khi database expire):

```bash
# 1. Tạo database mới trên Render
# 2. Run migration
psql $NEW_DATABASE_URL -f migrations/001_create_leaderboard.sql

# 3. Download CSV backup mới nhất từ R2
# 4. Import CSV
psql $NEW_DATABASE_URL -c "\COPY leaderboard_entries(nickname,score,mode,lines,level,result,opponent,created_at) FROM 'backup.csv' CSV HEADER"
```

### Calendar Reminder

Thêm reminder vào calendar 80 ngày sau khi tạo database: "Backup leaderboard / Renew Render PostgreSQL".

---

## In-Memory Room State

Rooms **không persist** — chỉ tồn tại trong RAM khi server chạy. Không có schema database cho rooms. Xem cấu trúc data trong [07-room-manager.md](./07-room-manager.md).

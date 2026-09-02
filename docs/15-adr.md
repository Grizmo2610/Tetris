# 15 — Architecture Decision Records

ADR ghi lại các quyết định kiến trúc quan trọng — tại sao chọn cái này, tại sao bỏ cái kia. Đọc khi cần hiểu lý do đằng sau một thiết kế, hoặc trước khi đề xuất thay đổi.

---

## ADR-001: Client-side AI inference

**Ngày:** Phase 3  
**Status:** Accepted  
**Deciders:** Toàn team

### Context

PvAI mode cần AI đánh Tetris. Có hai lựa chọn: chạy inference trên server hoặc trên browser.

### Decision

AI chạy hoàn toàn trên browser — cả Heuristic và ONNX.

### Alternatives xem xét

| Alternative | Lý do loại |
|---|---|
| Server-side inference (Node.js + onnxruntime-node) | Tốn server CPU/RAM, thêm latency (~50–150ms network), phức tạp hơn, không scale với free tier |
| Server-side inference (Python Flask/FastAPI) | Thêm một service nữa → $0 budget bị vi phạm |
| WebAssembly + WASM-compiled model | onnxruntime-web đã dùng WASM, không cần tự làm |

### Consequences

**Tích cực:**
- Zero server resource cho PvAI
- Không có network latency cho AI decision
- AI hoạt động offline hoàn toàn sau khi load model
- Có thể update model mà không redeploy backend

**Tiêu cực:**
- Performance phụ thuộc vào hardware người dùng
- Model file phải download về browser (~300–500KB, one-time)
- Cần Web Worker để không block UI

**Mitigation:** Web Worker + timeout fallback đảm bảo trải nghiệm không bị ảnh hưởng ngay cả trên máy yếu.

---

## ADR-002: Full board sync thay vì delta sync

**Ngày:** Phase 3  
**Status:** Accepted

### Context

Khi relay game state giữa hai players trong Online PvP, cần quyết định gửi toàn bộ board hay chỉ gửi thay đổi (delta).

### Decision

Gửi toàn bộ board state (200 integers) sau mỗi piece lock.

### Alternatives xem xét

**Delta sync:** Chỉ gửi cells thay đổi so với lần trước.

| Tiêu chí | Full sync | Delta sync |
|---|---|---|
| Message size | ~500–800 bytes | ~50–200 bytes |
| Complexity | Rất đơn giản | Cần diff algorithm, sequence numbers |
| Error recovery | Tự sửa ở message tiếp theo | Cần resync mechanism nếu mất message |
| Bandwidth | ~40KB/s cho 10 rooms | ~8KB/s cho 10 rooms |

### Consequences

Bandwidth tăng ~5× so với delta sync. Ở quy mô 5–20 users: tổng bandwidth ~40KB/s — hoàn toàn negligible. Với Render free tier có shared bandwidth, đây không phải bottleneck.

Nếu scale lên 1000+ rooms: delta sync sẽ quan trọng hơn. Hiện tại: full sync là đúng đắn.

---

## ADR-003: In-memory room state, không persist

**Ngày:** Phase 3  
**Status:** Accepted

### Context

Room state (phòng nào đang active, ai trong phòng, trạng thái game) cần được lưu ở đâu đó.

### Decision

Lưu in-memory trong Node.js process. Không persist vào database hay Redis.

### Alternatives xem xét

| Alternative | Lý do loại |
|---|---|
| PostgreSQL | Overkill, room có lifecycle ngắn (<1 giờ), write/read nhiều sẽ tốn connection |
| Redis | Cần thêm service, không có free tier không expire phù hợp |
| SQLite local | Không persist qua Render restart vì ephemeral filesystem |

### Consequences

**Server restart = tất cả rooms mất.** Người chơi bị disconnect và phải tạo phòng mới.

Render free tier restart rất hiếm trong thực tế (~1 lần/tuần hoặc ít hơn). UptimeRobot giữ server alive và alert khi có downtime. Với nhóm bạn bè chơi theo session: chấp nhận được hoàn toàn.

**Khi cần thay đổi:** Nếu scale lên multiple instances → cần Redis. Room Manager được thiết kế với interface rõ ràng để migrate dễ dàng (xem [07-room-manager.md](./07-room-manager.md)).

---

## ADR-004: Render free tier + UptimeRobot thay vì paid hosting

**Ngày:** Phase 3  
**Status:** Accepted

### Context

Backend cần chạy liên tục. Render free tier sleep sau 15 phút không activity.

### Decision

Dùng Render free tier với UptimeRobot ping mỗi 5 phút để keep-alive. Frontend cũng tự ping mỗi 4 phút khi tab mở.

### Alternatives xem xét

| Alternative | Cost | Trade-off |
|---|---|---|
| Render Starter | $7/tháng | Reliable, dedicated resources |
| Railway | $5 credit/tháng | Free nhưng limited, hết credit là mất |
| Fly.io free tier | $0 | Always-on, nhưng setup phức tạp hơn |
| Vercel serverless | $0 | WebSocket không support |
| Supabase Edge Functions | $0 | WebSocket không support tốt |

### Consequences

Render free tier có nguy cơ:
- Restart bất ngờ (không có SLA)
- Shared CPU → có thể slow khi host cùng lúc nhiều apps
- Cold start nếu UptimeRobot bị chặn (~30s delay khi ping đầu)

Với nhóm bạn bè: chấp nhận được. Migration path rõ ràng sang Render Starter khi cần.

---

## ADR-005: Socket.io thay vì raw WebSocket

**Ngày:** Phase 3  
**Status:** Accepted

### Context

Cần WebSocket layer cho realtime communication giữa clients.

### Decision

Dùng Socket.io (client + server) thay vì raw `ws` library.

### So sánh

| Feature | Socket.io | raw ws |
|---|---|---|
| Room abstraction | ✓ Built-in | ✗ Tự implement |
| Auto-reconnect | ✓ Built-in | ✗ Tự implement |
| Polling fallback | ✓ Automatic | ✗ Không có |
| Heartbeat | ✓ Automatic | Tự implement |
| Bundle size | ~45KB gzip | ~10KB |
| Acknowledgements | ✓ Built-in | ✗ Tự implement |

### Consequences

Bundle size frontend tăng ~45KB. Không đáng kể so với onnxruntime-web (~1.5MB).

Socket.io version phải khớp giữa client và server (cùng major version). Documented trong README.

---

## ADR-006: Global interval sweep cho room cleanup thay vì per-room timer

**Ngày:** Phase 3 (sau Architecture Review)  
**Status:** Accepted

### Context

Rooms cần bị cleanup sau TTL để tránh memory leak.

### Decision

Một `setInterval` global chạy mỗi 60 giây, quét toàn bộ rooms map.

### Alternatives xem xét

**Per-room timer:** Mỗi room khi tạo ra sẽ `setTimeout` cleanup cho chính nó.

| Tiêu chí | Global sweep | Per-room timer |
|---|---|---|
| Code complexity | Thấp | Trung bình |
| Memory (1000 rooms) | 1 interval | 1000 pending timers |
| Accuracy | ±60s | Chính xác |
| Risk of leak | Thấp | Cao hơn (nếu clear timer bị miss) |

### Consequences

Room có thể tồn tại thêm tối đa 60 giây sau khi hết TTL. Không quan trọng — đây là cleanup, không phải security critical.

---

## ADR-007: Reconnect identification qua previousSocketId

**Ngày:** Phase 3 (sau Architecture Review)  
**Status:** Accepted

### Context

Khi player disconnect và reconnect, server cần nhận ra đây là cùng một người (không phải người mới join).

### Decision

Client lưu `socketId` của session hiện tại vào `localStorage`. Khi reconnect, gửi `previousSocketId` kèm theo. Server verify `previousSocketId` tồn tại trong room state.

### Alternatives xem xét

| Alternative | Vấn đề |
|---|---|
| Chỉ dùng nickname | Người khác có thể dùng cùng nickname để "steal" slot |
| Session token (UUID) | Phức tạp hơn, nhưng tốt hơn. Xem xét cho v2 |
| Cookie-based session | Cần HTTPS cors credentials, phức tạp |

### Consequences

`previousSocketId` là Socket.io generated string — khó đoán nhưng không phải cryptographically secure token. Với threat model hiện tại (nhóm bạn bè, không có adversarial user): đủ.

**Edge case còn lại:** Nếu một người biết `previousSocketId` của người khác (ví dụ qua network sniffing) thì có thể impersonate. Với WSS (TLS encrypted): không thể sniff. Đủ an toàn.

---

## ADR-008: Automated weekly backup lên Cloudflare R2

**Ngày:** Phase 4 (sau Architecture Review)  
**Status:** Accepted

### Context

Render PostgreSQL free tier expire sau 90 ngày. Calendar reminder không đủ reliable.

### Decision

Script Node.js chạy trong cùng backend process, dùng `node-cron` schedule mỗi Chủ nhật 03:00 UTC. Export CSV, upload lên R2 private bucket.

### Alternatives xem xét

| Alternative | Vấn đề |
|---|---|
| Calendar reminder thủ công | Unreliable, phụ thuộc vào người nhớ |
| Render Cron Job (paid feature) | Tốn tiền |
| GitHub Actions scheduled workflow | Free, nhưng cần store DATABASE_URL trong GitHub secrets, thêm surface area |
| Migrate sang Neon ngay | Giải quyết tận gốc, nhưng thêm setup time bây giờ |

### Consequences

Script chạy trong cùng process → nếu backend down đúng lúc cron chạy thì không backup được. Với UptimeRobot keep-alive: xác suất này thấp.

**Kế hoạch dài hạn:** Khi mở public, migrate sang Neon/Supabase (không expire) → bỏ cron backup.

---

## ADR-009: Không dùng game framework (Phaser.js, PixiJS)

**Ngày:** Phase 1  
**Status:** Accepted

### Context

Tetris cần Canvas rendering. Có thể dùng game framework để đơn giản hóa.

### Decision

Dùng Canvas 2D API trực tiếp, không dùng game framework.

### Lý do

- Tetris là game 2D cực kỳ đơn giản về rendering — không cần scene graph, sprite batching, hay physics engine
- Phaser.js bundle: ~1MB gzip. Không justify cho game chỉ cần vẽ rectangles
- Canvas 2D API đủ mạnh: `fillRect`, `clearRect`, `fillStyle` — đây là tất cả những gì cần
- Không có vendor lock-in với game framework API

### Consequences

Phải tự implement game loop, input handling, DAS/ARR. Đây là khoảng 200–300 dòng code chuẩn, không phức tạp.

---

## ADR-010: Không có authentication ở v1

**Ngày:** Phase 1  
**Status:** Accepted (với kế hoạch thêm khi mở public)

### Context

Leaderboard dùng nickname tự nhập. Không có account system.

### Decision

Không implement authentication trong v1.

### Lý do

- Nhóm bạn bè tin tưởng nhau — không cần enforce identity
- Auth system thêm complexity đáng kể (JWT, password hashing, forgot password flow...)
- Time-to-market quan trọng hơn

### Consequences

Leaderboard có thể bị spam với fake names/scores (khi mở public). Giải quyết bằng rate limiting trước, auth sau nếu cần.

Thiết kế database và API không block việc thêm auth sau này — chỉ cần thêm `user_id` column vào `leaderboard_entries` và thêm auth middleware.

---

## ADR-011: Không có staging environment

**Ngày:** Phase 7  
**Status:** Accepted

### Context

Thường cần staging environment để test trước khi deploy production.

### Decision

Không có staging. Dùng Cloudflare Pages preview deployments cho frontend (tự động khi push branch). Backend deploy thẳng production từ `main`.

### Lý do

- Nhóm nhỏ, không có complex release process
- Staging Render instance tốn thêm resource (free tier chỉ cho 1 service)
- Cloudflare Pages preview đủ để test frontend changes
- Backend changes nhỏ, low-risk ở quy mô này

### Consequences

Backend changes không được test trên production-like environment trước khi deploy. Mitigation: test local kỹ, rollback nhanh nếu cần (Render 1-click rollback).

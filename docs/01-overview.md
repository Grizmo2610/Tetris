# 01 — System Overview

---

## Vấn đề cần giải quyết

Nhóm bạn bè muốn chơi Tetris cùng nhau qua internet, với nhiều chế độ chơi, bảng xếp hạng chung, và AI bot nhiều cấp độ. Không có sản phẩm sẵn có nào đáp ứng đủ các yêu cầu này trong một nền tảng duy nhất với chi phí $0/tháng.

---

## Mục tiêu hệ thống

| # | Mục tiêu | Ghi chú |
|---|---|---|
| 1 | Trải nghiệm Tetris mượt mà trên trình duyệt | 60fps, input chuẩn DAS/ARR |
| 2 | Online PvP real-time với garbage mechanic đầy đủ | Combo, T-Spin, All Clear, Counter |
| 3 | AI bot hoàn toàn client-side | Không tốn server resource |
| 4 | Leaderboard persistent cho mọi người | PostgreSQL server-side |
| 5 | Chi phí vận hành $0/tháng | Free tier toàn bộ |
| 6 | Có thể mở rộng đến ~100 concurrent users | Không cần rewrite |

---

## Scope

### Trong scope

- **4 chế độ chơi:** Solo, Local PvP, Online PvP, PvAI
- **Garbage mechanic đầy đủ:** conversion table, combo, T-Spin bonus, All Clear bonus, counter mechanic
- **Room Code system:** tạo và join phòng Online PvP bằng code 4 ký tự
- **AI bot 4 cấp độ:** Easy (Heuristic), Medium (Heuristic), Hard (ONNX DQN), Expert (ONNX DQN)
- **Leaderboard server-side:** top scores theo từng mode
- **Disconnect handling:** 30 giây countdown, sau đó game over cho người còn lại
- **Rematch:** trong cùng phòng sau khi ván kết thúc

### Ngoài scope (không làm, không block)

| Feature | Lý do bỏ qua | Thiết kế có block không? |
|---|---|---|
| Authentication / User accounts | Không cần cho nhóm bạn bè | Không — có thể thêm sau |
| Spectator mode | Ưu tiên thấp | Không — thiết kế để trống slot |
| Tournament / bracket system | Quá phức tạp cho v1 | Không |
| Mobile native app | Out of scope | Không — web responsive |
| Anti-cheat | Không cần cho nhóm nhỏ | Không |
| Chat trong phòng | Dùng Discord/Zalo sẵn có | Không |

---

## Nguyên tắc kiến trúc

### 1. Simplicity first
Không introduce infrastructure không cần thiết ở quy mô hiện tại. Mỗi thành phần thêm vào phải có lý do rõ ràng.

### 2. Client-heavy
Game logic và AI chạy hoàn toàn trên client. Server chỉ là relay và data store. Không có server-authoritative game physics.

### 3. Stateless server (về game state)
Room state lưu in-memory. Server restart = ván hủy. Chấp nhận được vì restart rất hiếm và không có SLA cần đảm bảo.

### 4. Progressive scalability
Thiết kế đủ để scale lên 100 users (single instance upgrade) mà không cần rewrite. Vượt 100 users mới cần redesign đáng kể (Redis, horizontal scaling).

### 5. Zero cost
Mọi quyết định infrastructure ưu tiên free tier. Khi không thể $0, chọn giải pháp rẻ nhất đáp ứng yêu cầu.

---

## Users

**Primary users:** nhóm bạn bè (~5–20 người), chơi theo session, không phải random internet users.

**Assumed environment:**
- Laptop/desktop hiện đại
- Chrome, Firefox, hoặc Edge phiên bản gần đây
- Kết nối internet ổn định (không phải mobile 3G)
- Keyboard (không hỗ trợ touch cho gameplay)

---

## Constraints

| Constraint | Giá trị | Nguồn gốc |
|---|---|---|
| Chi phí | $0/tháng | Yêu cầu cứng |
| Thời gian deploy đầu tiên | ~9 tuần | Ước tính nhóm nhỏ |
| Concurrent users ban đầu | 5–20 | Nhóm bạn bè |
| Latency chấp nhận được | <200ms round-trip | Tetris piece lock ~500ms |
| Browser support | Chrome/Firefox/Edge 90+ | WebAssembly cần cho ONNX |

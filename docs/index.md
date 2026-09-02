# Tetris Platform — Final Design Specification

**Version:** 1.0  
**Status:** Final  
**Cập nhật lần cuối:** Phase 5

---

## Mục lục tài liệu

Tài liệu được chia thành các file theo chủ đề. Đọc theo thứ tự khi onboard lần đầu, hoặc tra cứu file cụ thể khi cần.

---

### Tổng quan & Kiến trúc

| File | Nội dung |
|---|---|
| [01-overview.md](./01-overview.md) | Mục tiêu hệ thống, scope, nguyên tắc kiến trúc |
| [02-architecture.md](./02-architecture.md) | Sơ đồ hệ thống, thành phần, communication patterns |
| [03-tech-stack.md](./03-tech-stack.md) | Quyết định công nghệ và lý do |

### Game Design

| File | Nội dung |
|---|---|
| [04-game-engine.md](./04-game-engine.md) | Cơ chế Tetris: physics, rotation, garbage, scoring |
| [05-game-modes.md](./05-game-modes.md) | Solo, Local PvP, Online PvP, PvAI — luồng xử lý từng mode |

### Backend & API

| File | Nội dung |
|---|---|
| [06-api-spec.md](./06-api-spec.md) | REST API và WebSocket events — contract đầy đủ |
| [07-room-manager.md](./07-room-manager.md) | Room lifecycle, disconnect handling, reconnect |

### AI

| File | Nội dung |
|---|---|
| [08-ai-design.md](./08-ai-design.md) | Heuristic AI, ONNX DQN, Web Worker architecture |

### Data & Infrastructure

| File | Nội dung |
|---|---|
| [09-data-schema.md](./09-data-schema.md) | Database schema, index, backup strategy |
| [10-infrastructure.md](./10-infrastructure.md) | Hosting, deployment, CI/CD, secrets, scaling |

### Operations

| File | Nội dung |
|---|---|
| [11-reliability.md](./11-reliability.md) | Failure modes, recovery, availability targets |
| [12-security.md](./12-security.md) | Threat model, CORS, validation, rate limiting |
| [13-observability.md](./13-observability.md) | Logs, metrics, health check, alerts |

### Kế hoạch

| File | Nội dung |
|---|---|
| [14-development-plan.md](./14-development-plan.md) | 7 phases, dependencies, validation criteria |
| [15-adr.md](./15-adr.md) | Architecture Decision Records |
| [16-performance.md](./16-performance.md) | Targets, game loop budget, Canvas và ONNX optimization |
| [17-developer-quickstart.md](./17-developer-quickstart.md) | Setup local, scripts, common issues, conventions |

---

## Tóm tắt nhanh

**Stack:** React + Canvas / Node.js + Socket.io / PostgreSQL / Cloudflare Pages + Render  
**AI:** Heuristic (Easy/Medium) + ONNX DQN trong Web Worker (Hard/Expert)  
**Hosting:** $0/tháng hiện tại, ~$7/tháng khi mở public  
**Concurrency target:** 5–20 users hiện tại → ~100 users khi scale  

---

## Glossary

| Thuật ngữ | Định nghĩa |
|---|---|
| **Piece lock** | Thời điểm một tetrimino chạm đất và được cố định vào board |
| **Garbage line** | Dòng rác gửi sang đối thủ khi clear lines hoặc T-Spin |
| **Pending garbage** | Garbage đã được gửi đến nhưng chưa thực sự xuất hiện trên board |
| **Counter** | Cơ chế dùng garbage mình gây ra để hủy bớt pending garbage đến |
| **DAS** | Delayed Auto Shift — độ trễ trước khi piece tự di chuyển liên tục |
| **ARR** | Auto Repeat Rate — tốc độ di chuyển liên tục sau DAS |
| **T-Spin** | Đặt T-piece vào khe hẹp bằng rotation, tính điểm và garbage cao hơn |
| **All Clear** | Xóa toàn bộ board — bonus garbage lớn |
| **Room Code** | Mã 4 ký tự (6 khi public) để join Online PvP room |
| **TTL** | Time-to-live — thời gian tối đa một room/resource tồn tại |
| **ONNX** | Open Neural Network Exchange — format model AI portable |
| **DQN** | Deep Q-Network — thuật toán RL dùng để train AI bot |

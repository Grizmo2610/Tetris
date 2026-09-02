# 16 — Performance

---

## Targets

| Metric | Target | Đo bằng |
|---|---|---|
| Canvas render | 60fps (16.67ms/frame) | `requestAnimationFrame` delta |
| Input latency | <16ms (1 frame) | Event handler → game state update |
| Heuristic AI (Easy) | <1ms/move | `performance.now()` |
| Heuristic AI (Medium) | <5ms/move | `performance.now()` |
| ONNX inference (Hard) | <50ms (Web Worker, không block) | Worker postMessage timing |
| ONNX inference (Expert) | <100ms (Web Worker) | Worker postMessage timing |
| ONNX model load | <2s | Network + parse time |
| WebSocket round-trip | p50 <100ms, p95 <200ms | Client timestamp diff |
| Page load (first visit) | <3s | Lighthouse |
| Page load (cached) | <1s | Lighthouse |
| Leaderboard API | p50 <300ms | Network tab |

---

## Game Loop Budget (60fps = 16.67ms/frame)

```
Input processing:     ~0.5ms
Physics update:       ~1ms   (gravity, collision)
Line clear check:     ~0.5ms
Canvas clear:         ~0.5ms
Board render:         ~2ms   (200 fillRect calls)
Piece render:         ~0.5ms
Ghost render:         ~0.5ms
UI render:            ~1ms   (score, next pieces, garbage bar)
Buffer:               ~9ms   (headroom)
─────────────────────────────
Total:                ~6ms   → 60fps dễ đạt được
```

Bottleneck tiềm năng duy nhất: nếu dùng DOM thay vì Canvas → layout thrashing. Canvas API tránh được vấn đề này.

---

## Canvas Rendering Optimization

### Tránh clearRect toàn bộ nếu không cần

Với game Tetris, board ít thay đổi (chỉ khi piece lock hoặc line clear). Tuy nhiên, ghost piece và active piece di chuyển mỗi frame.

**Strategy:** Clear và redraw toàn bộ canvas mỗi frame. Đơn giản, đủ performant cho Tetris ở 60fps.

Không cần dirty region tracking — Tetris không đủ phức tạp để justify.

### Batch fillRect

Thay vì 200 individual `fillRect` calls, group theo màu:

```javascript
function renderBoard(ctx, board) {
  // Group cells by color
  const colorGroups = {}
  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 10; col++) {
      const color = board[row][col]
      if (color === 0) continue
      if (!colorGroups[color]) colorGroups[color] = []
      colorGroups[color].push([col, row])
    }
  }

  // Draw each color group
  for (const [color, cells] of Object.entries(colorGroups)) {
    ctx.fillStyle = COLORS[color]
    for (const [col, row] of cells) {
      ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1)
    }
  }
}
```

Giảm số lần thay đổi `fillStyle` (expensive) từ 200 xuống tối đa 7.

### Off-screen canvas cho static elements

Board background (grid lines) không thay đổi → render một lần vào off-screen canvas, composite mỗi frame:

```javascript
// Khởi tạo một lần
const bgCanvas = document.createElement('canvas')
const bgCtx = bgCanvas.getContext('2d')
drawGridLines(bgCtx)

// Mỗi frame
ctx.drawImage(bgCanvas, 0, 0)  // Rất nhanh
// Sau đó vẽ pieces lên trên
```

---

## Memory Management

### Avoid GC pressure trong game loop

Garbage collector pause có thể gây frame drop. Tránh tạo objects mới trong game loop:

```javascript
// BAD — tạo array mới mỗi frame
function getNextPieces() {
  return [...queue].slice(0, 5)  // new array every call
}

// GOOD — reuse buffer
const nextPiecesBuffer = new Array(5)
function getNextPieces(buffer) {
  for (let i = 0; i < 5; i++) buffer[i] = queue[i]
  return buffer
}
```

Board state: dùng `Int8Array` thay vì regular Array để giảm memory và GC pressure:

```javascript
// Board as typed array
const board = new Int8Array(200)  // 200 bytes thay vì ~1.6KB regular array
```

### ONNX model memory

Model được load một lần và giữ trong Web Worker memory. Không load lại khi start game mới — Worker persistent suốt session.

---

## Network Optimization

### WebSocket message size

Board 20×10 = 200 cells, mỗi cell 0–7 (3 bits, fit trong 1 byte).

**Hiện tại:** JSON array `[0,1,0,2,...]` ≈ 600 bytes

**Optional optimization (không cần bây giờ):** Pack vào `Uint8Array` + gửi binary frame ≈ 200 bytes. Tiết kiệm ~66% bandwidth nhưng phức tạp hơn. Chỉ cần khi bandwidth là bottleneck thực sự.

### Batching không cần thiết

Piece lock xảy ra ~1–2 lần/giây. Không cần batching — mỗi lock emit ngay lập tức.

---

## ONNX Performance

### Model size vs inference speed tradeoff

| Model | Size (INT8) | Inference time (est.) |
|---|---|---|
| Tiny (64-64) | ~50KB | ~5ms |
| Small (256-128-64) | ~300KB | ~20ms |
| Medium (512-256-128) | ~800KB | ~50ms |

**Recommendation:** Bắt đầu với Small model. Benchmark thực tế trên máy target sau khi có model. Nếu quá chậm → giảm xuống Tiny.

### WASM backend vs WebGL backend

`onnxruntime-web` hỗ trợ cả WASM và WebGL backend.

- **WASM:** CPU inference, predictable, hoạt động trên mọi browser
- **WebGL:** GPU inference, nhanh hơn ~3–10× trên GPU mạnh, nhưng không stable trên mọi hardware

**Decision:** Dùng WASM backend mặc định. Không optimize premature cho WebGL.

```javascript
// onnxWorker.js
const session = await ort.InferenceSession.create(modelBuffer, {
  executionProviders: ['wasm'],  // explicit WASM
  graphOptimizationLevel: 'all'
})
```

---

## Lighthouse Targets

| Metric | Target |
|---|---|
| Performance | >90 |
| First Contentful Paint | <1.5s |
| Time to Interactive | <3s |
| Total Bundle Size | <500KB gzip (không kể ONNX) |

### Bundle size breakdown (estimate)

| Package | Size (gzip) |
|---|---|
| React + ReactDOM | ~45KB |
| Socket.io client | ~45KB |
| onnxruntime-web (WASM) | ~1.5MB (lazy loaded) |
| App code | ~30KB |
| **Total (initial)** | **~120KB** |
| **Total (sau ONNX load)** | **~1.6MB** |

ONNX runtime lazy loaded → không affect initial page load. Chỉ load khi người dùng chọn Hard/Expert.

### Code splitting với Vite

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'onnx': ['onnxruntime-web'],  // separate chunk, lazy loaded
          'socket': ['socket.io-client']
        }
      }
    }
  }
}
```

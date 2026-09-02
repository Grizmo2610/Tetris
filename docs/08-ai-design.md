# 08 — AI Design

---

## Tổng quan

AI hoàn toàn client-side. Không có server inference, không có network call (sau khi model đã load). Hai hệ thống riêng biệt:

1. **Heuristic AI** — Easy/Medium, pure JavaScript, không cần model file
2. **ONNX DQN** — Hard/Expert, cần download model từ Cloudflare R2

---

## Heuristic AI (Easy / Medium)

### Thuật toán: Beam Search với Heuristic Scoring

Với mỗi piece (và piece tiếp theo cho lookahead), enumerate tất cả possible placements, score mỗi placement, chọn tốt nhất.

### Placement Enumeration

Với piece hiện tại:
1. Thử tất cả 4 rotation states
2. Với mỗi rotation, thử tất cả column positions có thể
3. Hard drop piece xuống → đây là một possible placement
4. Với mỗi placement, tính heuristic score

Tổng số placements: ~30–50 per piece (tùy piece type).

**Medium lookahead:** Sau khi chọn placement cho piece hiện tại, với mỗi candidate, simulate tiếp với piece tiếp theo và lấy average score. Chọn current placement có best average future score.

### Heuristic Scoring Function

```javascript
function scoreBoard(board) {
  const aggregateHeight = calculateAggregateHeight(board)
  const holes = countHoles(board)
  const bumpiness = calculateBumpiness(board)
  const linesCleared = countCompleteLines(board)

  return (
    -0.510066 * aggregateHeight +
    +0.760666 * linesCleared +
    -0.35663  * holes +
    -0.184483 * bumpiness
  )
}
```

**Giải thích các features:**

| Feature | Công thức | Ý nghĩa |
|---|---|---|
| `aggregateHeight` | Tổng chiều cao mỗi column | Thấp = tốt |
| `holes` | Số ô rỗng có cell đặc phía trên | Càng ít càng tốt |
| `bumpiness` | Tổng `abs(height[i] - height[i+1])` | Surface phẳng = tốt |
| `linesCleared` | Số dòng bị xóa sau placement | Nhiều = tốt |

Weights (`-0.510066`, `+0.760666`, ...) là giá trị đã được research và tune cho Tetris heuristic AI (từ Thiery & Scherrer 2009). Có thể fine-tune thêm.

### Error Injection (Easy/Medium)

Để tạo cảm giác "không hoàn hảo":

```javascript
function chooseMove(candidates) {
  const errorRate = { easy: 0.30, medium: 0.10 }[difficulty]

  if (Math.random() < errorRate) {
    // Chọn random từ top 5 placements thay vì top 1
    const topN = candidates.slice(0, 5)
    return topN[Math.floor(Math.random() * topN.length)]
  }

  return candidates[0]  // Best placement
}
```

### Complexity

- **Easy (1-piece lookahead):** ~50 placements × scoring = O(50) per move. <1ms.
- **Medium (2-piece lookahead):** ~50 × 50 = O(2500) per move. ~2–5ms.

Cả hai đều đủ nhanh để chạy trên main thread, nhưng sẽ chạy trong game loop nên cần giữ dưới 5ms.

---

## ONNX DQN AI (Hard / Expert)

### Model Architecture

**DQN (Deep Q-Network)** — classic RL algorithm phù hợp cho Tetris vì:
- State space lớn nhưng action space nhỏ và rõ ràng
- Reward signal rõ ràng (lines cleared, garbage sent, game over)
- Không cần real-time interaction với environment

### Input Representation

```
State vector (cho một timestep):
- Board: 10×20 = 200 values (0/1, binary: occupied/empty)
- Current piece: one-hot 7 values
- Next piece: one-hot 7 values
- Hold piece: one-hot 7 values + 1 (null flag)
- Combo count: 1 value (normalized)
- Pending garbage: 1 value (normalized, max 20)
Total input size: 200 + 7 + 7 + 8 + 1 + 1 = 224 values
```

### Output Representation

Model output: Q-values cho tất cả possible (rotation, column) pairs.

```
Output: 40 values
- 4 rotations × 10 columns = 40 Q-values
- Agent chọn action có Q-value cao nhất
- Actions không hợp lệ (piece không vào được column đó) → mask với -infinity trước argmax
```

### Network Architecture

```
Input: 224 → Dense(256) → ReLU → Dense(128) → ReLU → Dense(64) → ReLU → Output: 40
```

Model nhỏ (~100K parameters) để inference nhanh trên browser.

### Reward Function (Training)

```python
def calculate_reward(board_before, board_after, lines_cleared, game_over):
  if game_over:
    return -10.0

  reward = 0.0
  reward += lines_cleared * 1.0          # Clear lines
  reward += lines_cleared ** 2 * 0.5    # Bonus cho multiple clears
  reward -= count_holes(board_after) * 0.3    # Penalize holes
  reward -= aggregate_height(board_after) * 0.1  # Penalize height
  reward -= bumpiness(board_after) * 0.05   # Penalize bumpiness

  # Garbage bonus (chỉ trong training với opponent)
  reward += garbage_sent * 0.5

  return reward
```

### Training Setup

```python
# Hyperparameters
EPISODES = 50_000
BATCH_SIZE = 64
GAMMA = 0.99              # Discount factor
LR = 0.001
EPSILON_START = 1.0       # Exploration rate ban đầu
EPSILON_MIN = 0.01
EPSILON_DECAY = 0.995     # Decay mỗi episode
REPLAY_BUFFER_SIZE = 50_000
TARGET_UPDATE_FREQ = 100  # episodes

# Training environment: custom Tetris Gym environment
# Kaggle T4 GPU, ~20–30 episodes/phút → 50k episodes ≈ 30–40 giờ
```

### Training Phases

| Phase | Episodes | Mục tiêu |
|---|---|---|
| Phase 1 | 0–10k | Học cơ bản: không thua sớm, clear lines |
| Phase 2 | 10k–30k | Học intermediate: maintain height thấp |
| Phase 3 | 30k–50k | Fine-tune: aggressive garbage send |

**Hard model:** Save checkpoint ở ~30k episodes.  
**Expert model:** Save checkpoint ở ~50k episodes (hoặc train thêm với self-play).

### ONNX Export

```python
# Sau khi train xong
import torch
import torch.onnx

model.eval()
dummy_input = torch.zeros(1, 224)

torch.onnx.export(
  model,
  dummy_input,
  'tetris-ai-hard.onnx',
  opset_version=17,
  input_names=['state'],
  output_names=['q_values'],
  dynamic_axes={'state': {0: 'batch_size'}}
)

# Quantize để giảm size
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic('tetris-ai-hard.onnx', 'tetris-ai-hard-int8.onnx', weight_type=QuantType.QInt8)
```

Expected file size: ~300–500KB sau quantization.

---

## Web Worker Architecture

### Tại sao cần Web Worker

Inference time ước tính:
- Hard model (~100K params, INT8): 10–30ms trên CPU hiện đại
- Expert model (nếu lớn hơn): 30–80ms

Frame budget ở 60fps = 16.67ms. Inference trên main thread → drop frames → game giật.

Web Worker chạy inference trên thread riêng, không block render loop.

### Worker Communication Protocol

```javascript
// main thread → worker
worker.postMessage({
  type: 'INIT',
  modelBuffer: ArrayBuffer  // ONNX model bytes
})

worker.postMessage({
  type: 'INFER',
  requestId: 'req_001',
  state: Float32Array(224)   // game state
})

// worker → main thread
worker.onmessage = ({ data }) => {
  if (data.type === 'READY') {
    // Model đã load xong
  }
  if (data.type === 'RESULT') {
    // data.requestId, data.action: number (0-39)
  }
  if (data.type === 'ERROR') {
    // data.message
  }
}
```

### Timeout Handling

```javascript
// Main thread
function requestAIMove(state) {
  return new Promise((resolve) => {
    const requestId = generateId()
    const timeout = setTimeout(() => {
      // Inference quá chậm → fallback
      resolve(getRandomValidPlacement(state))
    }, 2000)

    pendingRequests.set(requestId, { resolve, timeout })
    worker.postMessage({ type: 'INFER', requestId, state })
  })
}

// Khi worker trả về
worker.onmessage = ({ data }) => {
  if (data.type === 'RESULT') {
    const pending = pendingRequests.get(data.requestId)
    if (pending) {
      clearTimeout(pending.timeout)
      pending.resolve(data.action)
      pendingRequests.delete(data.requestId)
    }
  }
}
```

### Lazy Loading

```javascript
// Chỉ load khi người dùng chọn Hard/Expert
async function initializeAI(level) {
  if (level === 'easy' || level === 'medium') {
    return new HeuristicAI(level)
  }

  // Hard hoặc Expert
  showLoadingIndicator('Loading AI model...')
  try {
    const modelUrl = level === 'hard' ? HARD_MODEL_URL : EXPERT_MODEL_URL
    const response = await fetch(modelUrl)
    if (!response.ok) throw new Error('Model fetch failed')

    const modelBuffer = await response.arrayBuffer()
    const worker = new Worker('/ai/onnxWorker.js')

    await new Promise((resolve, reject) => {
      worker.postMessage({ type: 'INIT', modelBuffer })
      worker.onmessage = ({ data }) => {
        if (data.type === 'READY') resolve()
        if (data.type === 'ERROR') reject(new Error(data.message))
      }
      setTimeout(() => reject(new Error('Init timeout')), 10_000)
    })

    hideLoadingIndicator()
    return new ONNXAIController(worker)
  } catch (error) {
    hideLoadingIndicator()
    showToast('AI model unavailable, falling back to Medium difficulty')
    return new HeuristicAI('medium')
  }
}
```

---

## AI Controller Interface

Cả Heuristic và ONNX AI đều implement cùng interface để mode code không cần biết loại AI nào:

```typescript
interface AIController {
  // Yêu cầu AI chọn move tiếp theo
  // Returns: Promise<Placement>
  getNextMove(gameState: GameState): Promise<Placement>

  // Cleanup khi game kết thúc
  destroy(): void
}

interface Placement {
  rotation: 0 | 1 | 2 | 3
  column: number   // 0–9, target column cho left edge của piece
}
```

---

## Monitoring Training (W&B)

Metrics cần track trong training:

| Metric | Ý nghĩa |
|---|---|
| `episode_score` | Score trung bình mỗi episode |
| `episode_lines` | Lines cleared trung bình |
| `episode_length` | Số piece đã đặt trước khi thua |
| `epsilon` | Exploration rate hiện tại |
| `loss` | TD loss |
| `q_value_mean` | Q-value trung bình |

Log mỗi 100 episodes. Save checkpoint mỗi 5000 episodes.

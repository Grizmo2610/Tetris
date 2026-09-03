# ai-training — Tetris DQN Training

## Cấu trúc

```
ai-training/
├── env/
│   └── tetris_env.py      ← Gymnasium environment (port từ JS engine)
├── agent/
│   ├── dqn.py             ← DQN agent + Double DQN + network
│   └── replay_buffer.py   ← Experience replay buffer
├── train.py               ← Training loop chính
├── export_onnx.py         ← Export checkpoint → ONNX INT8
├── requirements.txt
└── checkpoints/           ← Auto-created khi train
└── exports/               ← Auto-created khi export
```

## Setup

```bash
cd ai-training

python -m venv venv
source venv/bin/activate     # macOS/Linux
# hoặc: venv\Scripts\activate   # Windows

pip install -r requirements.txt
```

## Train

```bash
# Train đầy đủ 50k episodes (Hard + Expert)
python train.py

# Train với W&B logging
python train.py --wandb

# Resume từ checkpoint
python train.py --resume checkpoints/ep20000.pt

# Test nhanh local (CPU, 500 episodes)
python train.py --episodes 500 --device cpu
```

**Trên Kaggle T4 GPU:**
- Upload folder này lên Kaggle Dataset
- Tạo notebook, chạy `python train.py --wandb`
- ~20–30 episodes/phút → 50k episodes ≈ 30–40 giờ
- Checkpoints tự động save mỗi 5000 episodes

## Checkpoints

| File | Dùng cho |
|---|---|
| `checkpoints/ep30000.pt` | Hard model |
| `checkpoints/ep50000.pt` | Expert model |

## Export sang ONNX

```bash
# Hard model
python export_onnx.py \
  --checkpoint checkpoints/ep30000.pt \
  --name tetris-ai-hard

# Expert model
python export_onnx.py \
  --checkpoint checkpoints/ep50000.pt \
  --name tetris-ai-expert
```

Output: `exports/tetris-ai-hard-int8.onnx` và `exports/tetris-ai-expert-int8.onnx`

Upload các file này lên Cloudflare R2 public bucket.

## Upload lên R2

```bash
wrangler r2 object put tetris-public/models/tetris-ai-hard-int8.onnx \
  --file exports/tetris-ai-hard-int8.onnx

wrangler r2 object put tetris-public/models/tetris-ai-expert-int8.onnx \
  --file exports/tetris-ai-expert-int8.onnx
```

Sau đó cập nhật env variables trong Cloudflare Pages:
```
VITE_R2_MODEL_URL_HARD=https://pub-<hash>.r2.dev/models/tetris-ai-hard-int8.onnx
VITE_R2_MODEL_URL_EXPERT=https://pub-<hash>.r2.dev/models/tetris-ai-expert-int8.onnx
```

## Hyperparameters mặc định

| Param | Giá trị |
|---|---|
| Episodes | 50,000 |
| Batch size | 64 |
| Learning rate | 0.001 |
| Gamma | 0.99 |
| Epsilon start | 1.0 |
| Epsilon min | 0.01 |
| Epsilon decay | 0.995 |
| Buffer capacity | 50,000 |
| Target update | every 100 episodes |
| Checkpoint | every 5,000 episodes |

## Kiến trúc model

```
Input: 224 → Dense(256) → ReLU → Dense(128) → ReLU → Dense(64) → ReLU → Output: 40
```

Input 224 dims:
- `[0:200]`   Board binary (20×10 visible rows)
- `[200:207]` Current piece one-hot (7 types)
- `[207:214]` Next piece one-hot
- `[214:221]` Hold piece one-hot
- `[221]`     Hold-is-null flag
- `[222]`     Combo normalized (/12)
- `[223]`     Pending garbage normalized (/20)

Output 40 = 4 rotations × 10 columns → Q-value mỗi placement.

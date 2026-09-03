"""
export_onnx.py — Export a trained DQN checkpoint to ONNX and quantize to INT8.

Usage:
  # Export Hard model (ep30000 checkpoint)
  python export_onnx.py --checkpoint checkpoints/ep30000.pt --name tetris-ai-hard

  # Export Expert model (ep50000 checkpoint)
  python export_onnx.py --checkpoint checkpoints/ep50000.pt --name tetris-ai-expert

Output:
  exports/tetris-ai-hard.onnx          ← full precision
  exports/tetris-ai-hard-int8.onnx     ← quantized (~4× smaller)

Upload the *-int8.onnx files to Cloudflare R2.
"""

import argparse
import os
import torch
from onnxruntime.quantization import quantize_dynamic, QuantType

from agent.dqn import DQNAgent, DQNNetwork


def export(checkpoint_path: str, output_name: str, output_dir: str = 'exports'):
    os.makedirs(output_dir, exist_ok=True)

    # ── Load checkpoint ───────────────────────────────────────────────────────
    device = torch.device('cpu')  # export on CPU for portability
    agent  = DQNAgent(device='cpu')
    agent.load(checkpoint_path)
    agent.online.eval()

    # ── Export to ONNX ────────────────────────────────────────────────────────
    dummy_input  = torch.zeros(1, 224)
    onnx_path    = os.path.join(output_dir, f"{output_name}.onnx")

    torch.onnx.export(
        agent.online,
        dummy_input,
        onnx_path,
        opset_version=17,
        input_names=['state'],
        output_names=['q_values'],
        dynamic_axes={
            'state':    {0: 'batch_size'},
            'q_values': {0: 'batch_size'},
        },
        do_constant_folding=True,
    )
    size_mb = os.path.getsize(onnx_path) / 1024 / 1024
    print(f"[Export] ONNX → {onnx_path}  ({size_mb:.2f} MB)")

    # ── Quantize INT8 ─────────────────────────────────────────────────────────
    int8_path = os.path.join(output_dir, f"{output_name}-int8.onnx")
    quantize_dynamic(
        onnx_path,
        int8_path,
        weight_type=QuantType.QInt8,
    )
    size_int8 = os.path.getsize(int8_path) / 1024 / 1024
    print(f"[Export] INT8 → {int8_path}  ({size_int8:.2f} MB)")
    print(f"[Export] Compression: {size_mb/size_int8:.1f}× smaller")

    # ── Verify ONNX output ────────────────────────────────────────────────────
    import onnxruntime as ort
    import numpy as np

    sess   = ort.InferenceSession(int8_path, providers=['CPUExecutionProvider'])
    dummy  = np.zeros((1, 224), dtype=np.float32)
    output = sess.run(['q_values'], {'state': dummy})[0]
    assert output.shape == (1, 40), f"Unexpected output shape: {output.shape}"
    print(f"[Verify] Output shape: {output.shape} ✓")
    print(f"[Verify] Q-value range: [{output.min():.3f}, {output.max():.3f}]")

    print(f"\nDone! Upload {int8_path} to Cloudflare R2.")
    return int8_path


def parse_args():
    p = argparse.ArgumentParser(description='Export Tetris DQN to ONNX')
    p.add_argument('--checkpoint', required=True,
                   help='Path to .pt checkpoint file')
    p.add_argument('--name',       default='tetris-ai',
                   help='Output filename prefix (default: tetris-ai)')
    p.add_argument('--output-dir', default='exports',
                   help='Directory for ONNX files (default: exports/)')
    return p.parse_args()


if __name__ == '__main__':
    args = parse_args()
    export(args.checkpoint, args.name, args.output_dir)
